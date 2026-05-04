import { Controller, Get, HttpStatus, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiErrorCode } from '@smartseat/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module.js';
import { setupApiPlatform } from '../app.setup.js';
import { AppHttpException } from '../common/errors/app-http.exception.js';
import {
  MQTT_CONNECT_FACTORY,
  type MqttClientHandle
} from '../modules/mqtt/mqtt-broker.service.js';

@Controller('platform-test')
class PlatformTestController {
  @Get('business-error')
  getBusinessError(): never {
    throw new AppHttpException(HttpStatus.CONFLICT, ApiErrorCode.STATE_CONFLICT, 'State conflict', {
      reason: 'test'
    });
  }

  @Get('unknown-error')
  getUnknownError(): never {
    throw new Error('sensitive stack source');
  }
}

class FakeMqttClient implements MqttClientHandle {
  connected = true;

  on(): this {
    return this;
  }

  subscribe(
    _topic: string,
    _options: { qos: 0 | 1 | 2 },
    callback: (error: Error | null) => void
  ): void {
    callback(null);
  }

  publish(
    _topic: string,
    _payload: string | Buffer,
    _options: Record<string, unknown>,
    callback: (error?: Error | null) => void
  ): void {
    callback(null);
  }

  end(_force: boolean, callback: () => void): void {
    callback();
  }
}

describe('API platform', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [PlatformTestController]
    })
      .overrideProvider(MQTT_CONNECT_FACTORY)
      .useValue(() => new FakeMqttClient())
      .compile();

    app = moduleRef.createNestApplication();
    setupApiPlatform(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves enhanced health status', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'smartseat-api',
      environment: 'test',
      dependencies: {
        database: {
          checked: true
        },
        mqtt: {
          status: 'not_configured',
          checked: false
        }
      }
    });
    expect(['available', 'unavailable']).toContain(response.body.dependencies.database.status);
    expect(response.body.timestamp).toEqual(expect.any(String));
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('normalizes business exceptions to the contracts error model', async () => {
    const response = await request(app.getHttpServer())
      .get('/platform-test/business-error')
      .set('x-request-id', 'api-platform-test-request')
      .expect(409);

    expect(response.headers['x-request-id']).toBe('api-platform-test-request');
    expect(response.body).toEqual({
      code: ApiErrorCode.STATE_CONFLICT,
      message: 'State conflict',
      request_id: 'api-platform-test-request',
      details: {
        reason: 'test'
      }
    });
  });

  it('normalizes unknown exceptions without leaking stack details', async () => {
    const response = await request(app.getHttpServer())
      .get('/platform-test/unknown-error')
      .set('x-request-id', 'api-platform-unknown-request')
      .expect(500);

    expect(response.body).toEqual({
      code: ApiErrorCode.INTERNAL_ERROR,
      message: 'Internal server error',
      request_id: 'api-platform-unknown-request'
    });
    expect(JSON.stringify(response.body)).not.toContain('sensitive stack source');
  });

  it('serves OpenAPI JSON at the fixed path', async () => {
    const response = await request(app.getHttpServer()).get('/openapi.json').expect(200);

    expect(response.body.openapi).toEqual(expect.any(String));
    expect(response.body.paths).toHaveProperty('/health');
    expect(response.body.paths).toHaveProperty('/checkin');
    expect(response.body.paths).toHaveProperty('/admin/dashboard');
    expect(response.body.paths).toHaveProperty('/admin/seats/release');
    expect(response.body.paths).toHaveProperty('/admin/seats/maintenance');
    expect(response.body.paths).toHaveProperty('/admin/devices/maintenance');
    expect(response.body.paths).toHaveProperty('/admin/anomalies/handle');
    expect(response.body.paths).toHaveProperty('/admin/config');
    expect(response.body.paths['/checkin']).toHaveProperty('post');
    expect(response.body.paths['/auth/wechat/login'].post.requestBody.content).toMatchObject({
      'application/json': {
        schema: {
          required: expect.arrayContaining(['code']),
          properties: {
            code: expect.objectContaining({ type: 'string' })
          }
        }
      }
    });
    expect(response.body.paths['/checkin'].post.requestBody.content).toMatchObject({
      'application/json': {
        schema: {
          required: expect.arrayContaining(['seat_id', 'device_id', 'token', 'timestamp']),
          properties: {
            token: expect.objectContaining({ type: 'string' })
          }
        }
      }
    });
    expect(response.body.paths['/me'].get.responses['200'].content).toMatchObject({
      'application/json': {
        schema: {
          properties: {
            user_id: expect.objectContaining({ type: 'string' }),
            user: expect.objectContaining({ type: 'object' })
          }
        }
      }
    });
    expect(response.body.paths['/admin/seats/release'].post.requestBody.content).toMatchObject({
      'application/json': {
        schema: {
          required: expect.arrayContaining(['seat_id', 'reason', 'restore_availability']),
          properties: {
            reason: expect.objectContaining({ type: 'string' })
          }
        }
      }
    });
    expect(response.body.paths['/admin/anomalies/handle'].post.requestBody.content).toMatchObject({
      'application/json': {
        schema: {
          required: expect.arrayContaining(['event_id', 'status', 'handle_note']),
          properties: {
            handle_note: expect.objectContaining({ type: 'string' })
          }
        }
      }
    });
    const configSchema =
      response.body.paths['/admin/config'].get.responses['200'].content['application/json'].schema;
    expect(configSchema.properties.auth.properties).not.toHaveProperty('oidc_client_secret');
    expect(configSchema.properties.auth.properties).not.toHaveProperty('wechat_secret');
    expect(configSchema.properties.auth.properties).not.toHaveProperty('token');
  });
});

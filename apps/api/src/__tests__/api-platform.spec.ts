import { Controller, Get, HttpStatus, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiErrorCode } from '@smartseat/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module.js';
import { setupApiPlatform } from '../app.setup.js';
import { AppHttpException } from '../common/errors/app-http.exception.js';

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

describe('API platform', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [PlatformTestController]
    }).compile();

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
          status: 'configured',
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
  });
});

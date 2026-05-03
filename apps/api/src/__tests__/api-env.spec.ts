import { describe, expect, it } from 'vitest';

import { validateApiEnv } from '../common/config/api-env.js';

const baseEnv = {
  NODE_ENV: 'development',
  API_HOST: '0.0.0.0',
  API_PORT: '3000',
  POSTGRES_HOST: 'localhost',
  POSTGRES_PORT: '5432',
  POSTGRES_DB: 'smartseat_dev',
  POSTGRES_USER: 'smartseat_dev',
  POSTGRES_PASSWORD: 'replace-with-local-placeholder',
  DATABASE_URL:
    'postgresql://smartseat_dev:replace-with-local-placeholder@localhost:5432/smartseat_dev',
  MQTT_HOST: 'localhost',
  MQTT_PORT: '1883',
  MQTT_USERNAME: 'placeholder',
  MQTT_PASSWORD: 'replace-with-local-placeholder',
  WECHAT_APP_ID: 'replace-with-placeholder',
  WECHAT_APP_SECRET: 'replace-with-placeholder',
  WECHAT_AUTH_PROVIDER_MODE: 'mock',
  OIDC_CLIENT_ID: 'replace-with-placeholder',
  OIDC_CLIENT_SECRET: 'replace-with-placeholder',
  AUTH_TOKEN_SECRET: 'replace-with-local-placeholder',
  AUTH_TOKEN_TTL_SECONDS: '3600',
  DEFAULT_AUTH_MODE: 'WECHAT'
} satisfies Record<string, string>;

describe('validateApiEnv', () => {
  it('normalizes configured development environment values', () => {
    expect(validateApiEnv(baseEnv)).toMatchObject({
      NODE_ENV: 'development',
      API_HOST: '0.0.0.0',
      API_PORT: 3000,
      POSTGRES_PORT: 5432,
      MQTT_PORT: 1883,
      WECHAT_AUTH_PROVIDER_MODE: 'mock',
      AUTH_TOKEN_TTL_SECONDS: 3600,
      DEFAULT_AUTH_MODE: 'WECHAT'
    });
  });

  it('fails when a required environment variable is missing', () => {
    const missingApiPort: Record<string, string> = { ...baseEnv };
    delete missingApiPort.API_PORT;

    expect(() => validateApiEnv(missingApiPort)).toThrow(
      'Missing required API environment variable: API_PORT'
    );
  });

  it('rejects placeholder secret values in production', () => {
    expect(() =>
      validateApiEnv({
        ...baseEnv,
        POSTGRES_PASSWORD: 'production-postgres-password',
        DATABASE_URL:
          'postgresql://smartseat_prod:production-postgres-password@localhost:5432/smartseat_prod',
        MQTT_USERNAME: 'smartseat-prod-mqtt',
        MQTT_PASSWORD: 'production-mqtt-password',
        WECHAT_APP_ID: 'wx-production-appid',
        WECHAT_APP_SECRET: 'production-wechat-secret',
        OIDC_CLIENT_ID: 'production-oidc-client',
        OIDC_CLIENT_SECRET: 'production-oidc-secret',
        NODE_ENV: 'production'
      })
    ).toThrow(
      'Production API environment variable cannot use placeholder value: AUTH_TOKEN_SECRET'
    );
  });

  it('rejects invalid default auth mode values', () => {
    expect(() =>
      validateApiEnv({
        ...baseEnv,
        DEFAULT_AUTH_MODE: 'PASSWORD'
      })
    ).toThrow('Invalid auth mode in API environment variable: DEFAULT_AUTH_MODE');
  });

  it('accepts real WeChat provider mode', () => {
    expect(
      validateApiEnv({
        ...baseEnv,
        WECHAT_AUTH_PROVIDER_MODE: 'real'
      })
    ).toMatchObject({
      WECHAT_AUTH_PROVIDER_MODE: 'real'
    });
  });

  it('rejects invalid WeChat provider mode values', () => {
    expect(() =>
      validateApiEnv({
        ...baseEnv,
        WECHAT_AUTH_PROVIDER_MODE: 'fixture'
      })
    ).toThrow(
      'Invalid WeChat auth provider mode in API environment variable: WECHAT_AUTH_PROVIDER_MODE'
    );
  });
});

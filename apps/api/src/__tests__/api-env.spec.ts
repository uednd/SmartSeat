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
  OIDC_CLIENT_ID: 'replace-with-placeholder',
  OIDC_CLIENT_SECRET: 'replace-with-placeholder'
} satisfies Record<string, string>;

describe('validateApiEnv', () => {
  it('normalizes configured development environment values', () => {
    expect(validateApiEnv(baseEnv)).toMatchObject({
      NODE_ENV: 'development',
      API_HOST: '0.0.0.0',
      API_PORT: 3000,
      POSTGRES_PORT: 5432,
      MQTT_PORT: 1883
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
        NODE_ENV: 'production'
      })
    ).toThrow(
      'Production API environment variable cannot use placeholder value: POSTGRES_PASSWORD'
    );
  });
});

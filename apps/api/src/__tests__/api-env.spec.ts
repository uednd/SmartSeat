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
  MQTT_ENABLED: 'true',
  MQTT_BROKER_URL: 'mqtt://localhost:1883',
  MQTT_CLIENT_ID: 'smartseat-api-test',
  MQTT_HEARTBEAT_OFFLINE_THRESHOLD_SECONDS: '75',
  WECHAT_APP_ID: 'replace-with-placeholder',
  WECHAT_APP_SECRET: 'replace-with-placeholder',
  WECHAT_AUTH_PROVIDER_MODE: 'mock',
  OIDC_ISSUER: 'https://placeholder-idp.example.test',
  OIDC_CLIENT_ID: 'replace-with-placeholder',
  OIDC_CLIENT_SECRET: 'replace-with-placeholder',
  OIDC_REDIRECT_URI: 'https://placeholder-api.example.test/auth/oidc/callback',
  OIDC_AUTH_PROVIDER_MODE: 'mock',
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
      MQTT_ENABLED: true,
      MQTT_BROKER_URL: 'mqtt://localhost:1883',
      MQTT_CLIENT_ID: 'smartseat-api-test',
      MQTT_HEARTBEAT_OFFLINE_THRESHOLD_SECONDS: 75,
      WECHAT_AUTH_PROVIDER_MODE: 'mock',
      OIDC_AUTH_PROVIDER_MODE: 'mock',
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
        OIDC_ISSUER: 'https://idp.smartseat-prod.invalid',
        OIDC_CLIENT_ID: 'production-oidc-client',
        OIDC_CLIENT_SECRET: 'production-oidc-secret',
        OIDC_REDIRECT_URI: 'https://api.smartseat-prod.invalid/auth/oidc/callback',
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

  it('derives MQTT broker URL and client id defaults from legacy host and port values', () => {
    const legacyMqttEnv: Record<string, string> = { ...baseEnv };
    delete legacyMqttEnv.MQTT_BROKER_URL;
    delete legacyMqttEnv.MQTT_CLIENT_ID;
    delete legacyMqttEnv.MQTT_HEARTBEAT_OFFLINE_THRESHOLD_SECONDS;
    delete legacyMqttEnv.MQTT_ENABLED;

    expect(validateApiEnv(legacyMqttEnv)).toMatchObject({
      MQTT_ENABLED: true,
      MQTT_BROKER_URL: 'mqtt://localhost:1883',
      MQTT_CLIENT_ID: 'smartseat-api',
      MQTT_HEARTBEAT_OFFLINE_THRESHOLD_SECONDS: 75
    });
  });

  it('accepts MQTT disabled mode', () => {
    expect(
      validateApiEnv({
        ...baseEnv,
        MQTT_ENABLED: 'false'
      })
    ).toMatchObject({
      MQTT_ENABLED: false
    });
  });

  it('rejects invalid MQTT heartbeat threshold values', () => {
    expect(() =>
      validateApiEnv({
        ...baseEnv,
        MQTT_HEARTBEAT_OFFLINE_THRESHOLD_SECONDS: '0'
      })
    ).toThrow(
      'Invalid positive integer in API environment variable: MQTT_HEARTBEAT_OFFLINE_THRESHOLD_SECONDS'
    );
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

  it('accepts real OIDC provider mode', () => {
    expect(
      validateApiEnv({
        ...baseEnv,
        OIDC_AUTH_PROVIDER_MODE: 'real'
      })
    ).toMatchObject({
      OIDC_AUTH_PROVIDER_MODE: 'real'
    });
  });

  it('rejects invalid OIDC provider mode values', () => {
    expect(() =>
      validateApiEnv({
        ...baseEnv,
        OIDC_AUTH_PROVIDER_MODE: 'fixture'
      })
    ).toThrow(
      'Invalid OIDC auth provider mode in API environment variable: OIDC_AUTH_PROVIDER_MODE'
    );
  });

  it('requires OIDC issuer and redirect URI', () => {
    const missingIssuer: Record<string, string> = { ...baseEnv };
    delete missingIssuer.OIDC_ISSUER;

    expect(() => validateApiEnv(missingIssuer)).toThrow(
      'Missing required API environment variable: OIDC_ISSUER'
    );

    const missingRedirectUri: Record<string, string> = { ...baseEnv };
    delete missingRedirectUri.OIDC_REDIRECT_URI;

    expect(() => validateApiEnv(missingRedirectUri)).toThrow(
      'Missing required API environment variable: OIDC_REDIRECT_URI'
    );
  });
});

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AuthMode } from '@smartseat/contracts';

export type ApiNodeEnv = 'development' | 'test' | 'production';
export type WeChatAuthProviderMode = 'mock' | 'real';
export type OidcAuthProviderMode = 'mock' | 'real';

export interface ApiEnv {
  NODE_ENV: ApiNodeEnv;
  API_HOST: string;
  API_PORT: number;
  POSTGRES_HOST: string;
  POSTGRES_PORT: number;
  POSTGRES_DB: string;
  POSTGRES_USER: string;
  POSTGRES_PASSWORD: string;
  DATABASE_URL: string;
  MQTT_HOST: string;
  MQTT_PORT: number;
  MQTT_USERNAME: string;
  MQTT_PASSWORD: string;
  WECHAT_APP_ID: string;
  WECHAT_APP_SECRET: string;
  WECHAT_AUTH_PROVIDER_MODE: WeChatAuthProviderMode;
  OIDC_ISSUER: string;
  OIDC_CLIENT_ID: string;
  OIDC_CLIENT_SECRET: string;
  OIDC_REDIRECT_URI: string;
  OIDC_AUTH_PROVIDER_MODE: OidcAuthProviderMode;
  AUTH_TOKEN_SECRET: string;
  AUTH_TOKEN_TTL_SECONDS: number;
  DEFAULT_AUTH_MODE: AuthMode;
}

type ApiEnvKey = keyof ApiEnv;

const PRODUCTION_PLACEHOLDER_KEYS = [
  'POSTGRES_PASSWORD',
  'DATABASE_URL',
  'MQTT_USERNAME',
  'MQTT_PASSWORD',
  'WECHAT_APP_ID',
  'WECHAT_APP_SECRET',
  'OIDC_ISSUER',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'OIDC_REDIRECT_URI',
  'AUTH_TOKEN_SECRET'
] as const;

const VALID_NODE_ENVS = new Set<ApiNodeEnv>(['development', 'test', 'production']);
const VALID_AUTH_MODES = new Set<AuthMode>([AuthMode.WECHAT, AuthMode.OIDC]);
const VALID_WECHAT_AUTH_PROVIDER_MODES = new Set<WeChatAuthProviderMode>(['mock', 'real']);
const VALID_OIDC_AUTH_PROVIDER_MODES = new Set<OidcAuthProviderMode>(['mock', 'real']);

export const getApiEnvFilePaths = (): string[] => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(currentDir, '../../../../../');

  return [resolve(repoRoot, '.env'), resolve(repoRoot, '.env.example')];
};

const readRequiredString = (config: Record<string, unknown>, key: ApiEnvKey): string => {
  const value = config[key];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required API environment variable: ${key}`);
  }

  return value.trim();
};

const readPort = (
  config: Record<string, unknown>,
  key: 'API_PORT' | 'POSTGRES_PORT' | 'MQTT_PORT'
): number => {
  const rawValue = readRequiredString(config, key);
  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535 || String(parsed) !== rawValue) {
    throw new Error(`Invalid port in API environment variable: ${key}`);
  }

  return parsed;
};

const readPositiveInteger = (
  config: Record<string, unknown>,
  key: 'AUTH_TOKEN_TTL_SECONDS'
): number => {
  const rawValue = readRequiredString(config, key);
  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(parsed) || parsed < 1 || String(parsed) !== rawValue) {
    throw new Error(`Invalid positive integer in API environment variable: ${key}`);
  }

  return parsed;
};

const readAuthMode = (config: Record<string, unknown>, key: 'DEFAULT_AUTH_MODE'): AuthMode => {
  const value = readRequiredString(config, key);

  if (!VALID_AUTH_MODES.has(value as AuthMode)) {
    throw new Error(`Invalid auth mode in API environment variable: ${key}`);
  }

  return value as AuthMode;
};

const readWeChatAuthProviderMode = (
  config: Record<string, unknown>,
  key: 'WECHAT_AUTH_PROVIDER_MODE'
): WeChatAuthProviderMode => {
  const value = readRequiredString(config, key);

  if (!VALID_WECHAT_AUTH_PROVIDER_MODES.has(value as WeChatAuthProviderMode)) {
    throw new Error(`Invalid WeChat auth provider mode in API environment variable: ${key}`);
  }

  return value as WeChatAuthProviderMode;
};

const readOidcAuthProviderMode = (
  config: Record<string, unknown>,
  key: 'OIDC_AUTH_PROVIDER_MODE'
): OidcAuthProviderMode => {
  const value = readRequiredString(config, key);

  if (!VALID_OIDC_AUTH_PROVIDER_MODES.has(value as OidcAuthProviderMode)) {
    throw new Error(`Invalid OIDC auth provider mode in API environment variable: ${key}`);
  }

  return value as OidcAuthProviderMode;
};

const assertNoProductionPlaceholder = (env: ApiNodeEnv, config: Record<string, unknown>): void => {
  if (env !== 'production') {
    return;
  }

  for (const key of PRODUCTION_PLACEHOLDER_KEYS) {
    const value = readRequiredString(config, key).toLowerCase();
    const isPlaceholder =
      value === 'placeholder' ||
      value.includes('replace-with-') ||
      value.includes('example') ||
      value.includes('changeme');

    if (isPlaceholder) {
      throw new Error(`Production API environment variable cannot use placeholder value: ${key}`);
    }
  }
};

export const validateApiEnv = (config: Record<string, unknown>): ApiEnv => {
  const nodeEnv = readRequiredString(config, 'NODE_ENV');

  if (!VALID_NODE_ENVS.has(nodeEnv as ApiNodeEnv)) {
    throw new Error(`Invalid NODE_ENV for API: ${nodeEnv}`);
  }

  const env = nodeEnv as ApiNodeEnv;
  assertNoProductionPlaceholder(env, config);

  return {
    NODE_ENV: env,
    API_HOST: readRequiredString(config, 'API_HOST'),
    API_PORT: readPort(config, 'API_PORT'),
    POSTGRES_HOST: readRequiredString(config, 'POSTGRES_HOST'),
    POSTGRES_PORT: readPort(config, 'POSTGRES_PORT'),
    POSTGRES_DB: readRequiredString(config, 'POSTGRES_DB'),
    POSTGRES_USER: readRequiredString(config, 'POSTGRES_USER'),
    POSTGRES_PASSWORD: readRequiredString(config, 'POSTGRES_PASSWORD'),
    DATABASE_URL: readRequiredString(config, 'DATABASE_URL'),
    MQTT_HOST: readRequiredString(config, 'MQTT_HOST'),
    MQTT_PORT: readPort(config, 'MQTT_PORT'),
    MQTT_USERNAME: readRequiredString(config, 'MQTT_USERNAME'),
    MQTT_PASSWORD: readRequiredString(config, 'MQTT_PASSWORD'),
    WECHAT_APP_ID: readRequiredString(config, 'WECHAT_APP_ID'),
    WECHAT_APP_SECRET: readRequiredString(config, 'WECHAT_APP_SECRET'),
    WECHAT_AUTH_PROVIDER_MODE: readWeChatAuthProviderMode(config, 'WECHAT_AUTH_PROVIDER_MODE'),
    OIDC_ISSUER: readRequiredString(config, 'OIDC_ISSUER'),
    OIDC_CLIENT_ID: readRequiredString(config, 'OIDC_CLIENT_ID'),
    OIDC_CLIENT_SECRET: readRequiredString(config, 'OIDC_CLIENT_SECRET'),
    OIDC_REDIRECT_URI: readRequiredString(config, 'OIDC_REDIRECT_URI'),
    OIDC_AUTH_PROVIDER_MODE: readOidcAuthProviderMode(config, 'OIDC_AUTH_PROVIDER_MODE'),
    AUTH_TOKEN_SECRET: readRequiredString(config, 'AUTH_TOKEN_SECRET'),
    AUTH_TOKEN_TTL_SECONDS: readPositiveInteger(config, 'AUTH_TOKEN_TTL_SECONDS'),
    DEFAULT_AUTH_MODE: readAuthMode(config, 'DEFAULT_AUTH_MODE')
  };
};

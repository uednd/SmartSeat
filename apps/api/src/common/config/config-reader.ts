import type { ConfigService } from '@nestjs/config';

export const getConfigString = (config: ConfigService, key: string): string => {
  const value = config.get<string>(key);

  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing API configuration value: ${key}`);
  }

  return value;
};

export const getConfigNumber = (config: ConfigService, key: string): number => {
  const value = config.get<number>(key);

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Missing API numeric configuration value: ${key}`);
  }

  return value;
};

export const getConfigBoolean = (config: ConfigService, key: string): boolean => {
  const value = config.get<boolean>(key);

  if (typeof value !== 'boolean') {
    throw new Error(`Missing API boolean configuration value: ${key}`);
  }

  return value;
};

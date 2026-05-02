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

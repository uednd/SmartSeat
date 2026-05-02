import 'reflect-metadata';

import { Logger, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { setupApiPlatform } from './app.setup.js';
import { getConfigNumber, getConfigString } from './common/config/config-reader.js';

const logger = new Logger('Bootstrap');

const registerShutdownHandlers = (app: INestApplication): void => {
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    logger.log(`Stopping SmartSeat API on ${signal}`);
    await app.close();
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
};

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = getConfigNumber(configService, 'API_PORT');
  const host = getConfigString(configService, 'API_HOST');

  app.enableShutdownHooks();
  setupApiPlatform(app);
  registerShutdownHandlers(app);

  await app.listen(port, host);
  logger.log(`SmartSeat API listening on http://${host}:${port}`);
};

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown bootstrap error';
  const stack = error instanceof Error ? error.stack : undefined;

  logger.error(`Failed to start SmartSeat API: ${message}`, stack);
  process.exit(1);
});

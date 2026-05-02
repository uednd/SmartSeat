import 'reflect-metadata';

import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 3000;
const logger = new Logger('Bootstrap');

const registerShutdownHandlers = (app: INestApplication): void => {
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    logger.log(`Stopping SmartSeat NestJS placeholder on ${signal}`);
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
  const port = Number.parseInt(process.env.API_PORT ?? String(DEFAULT_PORT), 10);
  const host = process.env.API_HOST ?? DEFAULT_HOST;
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();
  registerShutdownHandlers(app);

  await app.listen(port, host);
  logger.log(`SmartSeat NestJS placeholder listening on http://${host}:${port}`);
};

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown bootstrap error';
  const stack = error instanceof Error ? error.stack : undefined;

  logger.error(`Failed to start SmartSeat NestJS placeholder: ${message}`, stack);
  process.exit(1);
});

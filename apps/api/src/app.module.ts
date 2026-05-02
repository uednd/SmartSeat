import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { AppController } from './app.controller.js';
import { ApiConfigModule } from './common/config/api-config.module.js';
import { RequestLoggingMiddleware } from './common/request/request-logging.middleware.js';

@Module({
  imports: [ApiConfigModule, ScheduleModule.forRoot()],
  controllers: [AppController]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}

import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { AppController } from './app.controller.js';
import { ApiConfigModule } from './common/config/api-config.module.js';
import { DatabaseModule } from './common/database/database.module.js';
import { RequestLoggingMiddleware } from './common/request/request-logging.middleware.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { DatabaseBaselineModule } from './modules/database-baseline/database-baseline.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    ApiConfigModule,
    DatabaseModule,
    DatabaseBaselineModule,
    UsersModule,
    AuthModule,
    ScheduleModule.forRoot()
  ],
  controllers: [AppController]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}

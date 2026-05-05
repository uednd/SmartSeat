import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { AppController } from './app.controller.js';
import { ApiConfigModule } from './common/config/api-config.module.js';
import { DatabaseModule } from './common/database/database.module.js';
import { AutoRulesModule } from './jobs/auto-rules.module.js';
import { AnomaliesModule } from './modules/anomalies/anomalies.module.js';
import { RequestLoggingMiddleware } from './common/request/request-logging.middleware.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { DatabaseBaselineModule } from './modules/database-baseline/database-baseline.module.js';
import { DevicesModule } from './modules/devices/devices.module.js';
import { LeaderboardModule } from './modules/leaderboard/leaderboard.module.js';
import { MqttModule } from './modules/mqtt/mqtt.module.js';
import { ReservationsModule } from './modules/reservations/reservations.module.js';
import { SeatsModule } from './modules/seats/seats.module.js';
import { SensorsModule } from './modules/sensors/sensors.module.js';
import { StudyRecordsModule } from './modules/study-records/study-records.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    ApiConfigModule,
    DatabaseModule,
    DatabaseBaselineModule,
    UsersModule,
    AuthModule,
    AdminModule,
    AnomaliesModule,
    SeatsModule,
    ReservationsModule,
    DevicesModule,
    SensorsModule,
    StudyRecordsModule,
    LeaderboardModule,
    AutoRulesModule,
    MqttModule,
    ScheduleModule.forRoot()
  ],
  controllers: [AppController]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}

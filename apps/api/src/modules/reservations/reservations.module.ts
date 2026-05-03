import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../common/database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { MqttModule } from '../mqtt/mqtt.module.js';
import { UsersModule } from '../users/users.module.js';
import {
  AdminReservationsController,
  CheckinController,
  CurrentUsageController,
  ReservationsController
} from './reservations.controller.js';
import { ReservationsService } from './reservations.service.js';

@Module({
  imports: [DatabaseModule, AuthModule, UsersModule, MqttModule],
  controllers: [
    ReservationsController,
    CurrentUsageController,
    CheckinController,
    AdminReservationsController
  ],
  providers: [ReservationsService],
  exports: [ReservationsService]
})
export class ReservationsModule {}

import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../common/database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import {
  AdminReservationsController,
  CurrentUsageController,
  ReservationsController
} from './reservations.controller.js';
import { ReservationsService } from './reservations.service.js';

@Module({
  imports: [DatabaseModule, AuthModule, UsersModule],
  controllers: [ReservationsController, CurrentUsageController, AdminReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService]
})
export class ReservationsModule {}

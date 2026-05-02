import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../common/database/database.module.js';
import { ReservationRepository } from './reservation.repository.js';
import { SeatDeviceRepository } from './seat-device.repository.js';
import { SeedBaselineService } from './seed-baseline.service.js';
import { UserRepository } from './user.repository.js';

@Module({
  imports: [DatabaseModule],
  providers: [UserRepository, SeatDeviceRepository, ReservationRepository, SeedBaselineService],
  exports: [UserRepository, SeatDeviceRepository, ReservationRepository, SeedBaselineService]
})
export class DatabaseBaselineModule {}

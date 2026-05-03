import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { DatabaseModule } from '../../common/database/database.module.js';
import { AdminSeatsController, SeatsController } from './seats.controller.js';
import { SeatsService } from './seats.service.js';

@Module({
  imports: [DatabaseModule, AuthModule, UsersModule],
  controllers: [SeatsController, AdminSeatsController],
  providers: [SeatsService],
  exports: [SeatsService]
})
export class SeatsModule {}

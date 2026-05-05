import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { DatabaseModule } from '../../common/database/database.module.js';
import { StatsController } from './stats.controller.js';
import { StudyRecordsService } from './study-records.service.js';

@Module({
  imports: [DatabaseModule, AuthModule, UsersModule],
  controllers: [StatsController],
  providers: [StudyRecordsService],
  exports: [StudyRecordsService]
})
export class StudyRecordsModule {}

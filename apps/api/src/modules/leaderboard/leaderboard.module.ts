import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { StudyRecordsModule } from '../study-records/study-records.module.js';
import { UsersModule } from '../users/users.module.js';
import { LeaderboardController } from './leaderboard.controller.js';

@Module({
  imports: [AuthModule, UsersModule, StudyRecordsModule],
  controllers: [LeaderboardController]
})
export class LeaderboardModule {}

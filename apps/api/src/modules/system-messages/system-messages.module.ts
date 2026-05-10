import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../common/database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { StudyRecordsModule } from '../study-records/study-records.module.js';
import { SystemMessagesService } from './system-messages.service.js';
import { WeeklyReportService } from './weekly-report.service.js';
import { AdminSystemMessagesController } from './admin-system-messages.controller.js';
import { UserSystemMessagesController } from './user-system-messages.controller.js';

@Module({
  imports: [DatabaseModule, AuthModule, UsersModule, StudyRecordsModule],
  controllers: [AdminSystemMessagesController, UserSystemMessagesController],
  providers: [SystemMessagesService, WeeklyReportService],
  exports: [SystemMessagesService],
})
export class SystemMessagesModule {}

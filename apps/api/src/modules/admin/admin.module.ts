import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { MqttModule } from '../mqtt/mqtt.module.js';
import { UsersModule } from '../users/users.module.js';
import { DatabaseModule } from '../../common/database/database.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

@Module({
  imports: [DatabaseModule, AuthModule, UsersModule, MqttModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService]
})
export class AdminModule {}

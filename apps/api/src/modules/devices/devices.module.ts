import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../common/database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { AdminDevicesController, DevicesController } from './devices.controller.js';
import { DevicesService } from './devices.service.js';

@Module({
  imports: [DatabaseModule, AuthModule, UsersModule],
  controllers: [DevicesController, AdminDevicesController],
  providers: [DevicesService],
  exports: [DevicesService]
})
export class DevicesModule {}

import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../common/database/database.module.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [DatabaseModule],
  providers: [UsersService],
  exports: [UsersService]
})
export class UsersModule {}

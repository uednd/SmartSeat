import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SystemMessageDto } from '@smartseat/contracts';

import { BearerAuthGuard } from '../../common/auth/bearer-auth.guard.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import type { RequestUser } from '../../common/auth/request-user.js';
import { SystemMessagesService } from './system-messages.service.js';

@ApiTags('me/system-messages')
@ApiBearerAuth()
@Controller('me/system-messages')
@UseGuards(BearerAuthGuard)
export class UserSystemMessagesController {
  constructor(@Inject(SystemMessagesService) private readonly service: SystemMessagesService) {}

  @Get()
  @ApiOperation({ summary: 'List all messages for the current user (personal + broadcast)' })
  async list(@CurrentUser() user: RequestUser): Promise<SystemMessageDto[]> {
    return this.service.listForUser(user.user_id);
  }

  @Get('latest')
  @ApiOperation({ summary: 'Get the latest undismissed system message for the current user' })
  async getLatest(@CurrentUser() user: RequestUser): Promise<SystemMessageDto | null> {
    return this.service.getLatestUndismissed(user.user_id);
  }
}

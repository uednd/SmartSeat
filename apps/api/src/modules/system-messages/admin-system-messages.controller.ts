import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SystemMessageDto, CreateSystemMessageRequest } from '@smartseat/contracts';

import { AdminGuard } from '../../common/auth/admin.guard.js';
import { BearerAuthGuard } from '../../common/auth/bearer-auth.guard.js';
import { SystemMessagesService } from './system-messages.service.js';

@ApiTags('admin/system-messages')
@ApiBearerAuth()
@Controller('admin/system-messages')
@UseGuards(BearerAuthGuard, AdminGuard)
export class AdminSystemMessagesController {
  constructor(@Inject(SystemMessagesService) private readonly service: SystemMessagesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a system message (broadcast or personal)' })
  async create(@Body() request: CreateSystemMessageRequest): Promise<SystemMessageDto> {
    return this.service.create(request);
  }
}

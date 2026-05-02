import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type MeResponse } from '@smartseat/contracts';

import { BearerAuthGuard } from '../../common/auth/bearer-auth.guard.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { type RequestUser } from '../../common/auth/request-user.js';
import { UsersService } from '../users/users.service.js';
import { AuthConfigService } from './auth-config.service.js';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
@UseGuards(BearerAuthGuard)
export class MeController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authConfigService: AuthConfigService
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get current user identity and miniapp route hints' })
  async getMe(@CurrentUser() user: RequestUser): Promise<MeResponse> {
    const loginMode = await this.authConfigService.getLoginMode();
    return await this.usersService.getMe(user.user_id, loginMode.auth_mode);
  }
}

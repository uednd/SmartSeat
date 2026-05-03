import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AuthSessionResponse,
  type AuthConfigPublicDto,
  type LoginModeResponse,
  type UpdateAuthConfigRequest,
  type WechatLoginRequest
} from '@smartseat/contracts';

import { AdminGuard } from '../../common/auth/admin.guard.js';
import { BearerAuthGuard } from '../../common/auth/bearer-auth.guard.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { type RequestUser } from '../../common/auth/request-user.js';
import { AuthConfigService } from './auth-config.service.js';
import { WeChatAuthService } from './wechat-auth.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authConfigService: AuthConfigService,
    private readonly weChatAuthService: WeChatAuthService
  ) {}

  @Get('mode')
  @ApiOperation({ summary: 'Get current login mode and public auth configuration' })
  async getLoginMode(): Promise<LoginModeResponse> {
    return await this.authConfigService.getLoginMode();
  }

  @Post('wechat/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with WeChat miniapp wx.login code' })
  async loginWithWeChat(@Body() request: WechatLoginRequest): Promise<AuthSessionResponse> {
    return await this.weChatAuthService.login(request);
  }
}

@ApiTags('admin-auth')
@ApiBearerAuth()
@Controller('admin/auth')
@UseGuards(BearerAuthGuard, AdminGuard)
export class AdminAuthController {
  constructor(private readonly authConfigService: AuthConfigService) {}

  @Put('mode')
  @ApiOperation({ summary: 'Update current login mode and auth configuration' })
  async updateLoginMode(
    @CurrentUser() user: RequestUser,
    @Body() request: UpdateAuthConfigRequest
  ): Promise<AuthConfigPublicDto> {
    return await this.authConfigService.updateLoginMode(user.user_id, request);
  }
}

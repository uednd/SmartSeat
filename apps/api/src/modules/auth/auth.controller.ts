import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AuthSessionResponse,
  type AuthConfigPublicDto,
  type LoginModeResponse,
  type OidcAuthorizeUrlResponse,
  type OidcCallbackRequest,
  type UpdateAuthConfigRequest,
  type WechatLoginRequest
} from '@smartseat/contracts';

import { AdminGuard } from '../../common/auth/admin.guard.js';
import { BearerAuthGuard } from '../../common/auth/bearer-auth.guard.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { type RequestUser } from '../../common/auth/request-user.js';
import {
  authConfigPublicSchema,
  authSessionResponseSchema,
  loginModeResponseSchema,
  oidcAuthorizeUrlResponseSchema,
  oidcCallbackRequestSchema,
  updateAuthConfigRequestSchema,
  wechatLoginRequestSchema
} from '../../common/openapi/schemas.js';
import { AuthConfigService } from './auth-config.service.js';
import { OidcAuthService } from './oidc-auth.service.js';
import { WeChatAuthService } from './wechat-auth.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authConfigService: AuthConfigService,
    private readonly oidcAuthService: OidcAuthService,
    private readonly weChatAuthService: WeChatAuthService
  ) {}

  @Get('mode')
  @ApiOperation({ summary: 'Get current login mode and public auth configuration' })
  @ApiOkResponse({ schema: loginModeResponseSchema })
  async getLoginMode(): Promise<LoginModeResponse> {
    return await this.authConfigService.getLoginMode();
  }

  @Post('wechat/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with WeChat miniapp wx.login code' })
  @ApiBody({ schema: wechatLoginRequestSchema })
  @ApiOkResponse({ schema: authSessionResponseSchema })
  async loginWithWeChat(@Body() request: WechatLoginRequest): Promise<AuthSessionResponse> {
    return await this.weChatAuthService.login(request);
  }

  @Get('oidc/authorize-url')
  @ApiOperation({ summary: 'Get OIDC authorization URL and state' })
  @ApiOkResponse({ schema: oidcAuthorizeUrlResponseSchema })
  async getOidcAuthorizeUrl(): Promise<OidcAuthorizeUrlResponse> {
    return await this.oidcAuthService.getAuthorizeUrl();
  }

  @Post('oidc/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete OIDC authorization code login' })
  @ApiBody({ schema: oidcCallbackRequestSchema })
  @ApiOkResponse({ schema: authSessionResponseSchema })
  async oidcCallback(@Body() request: OidcCallbackRequest): Promise<AuthSessionResponse> {
    return await this.oidcAuthService.callback(request);
  }
}

@ApiTags('admin-auth')
@ApiBearerAuth()
@Controller('admin/auth')
@UseGuards(BearerAuthGuard, AdminGuard)
export class AdminAuthController {
  constructor(private readonly authConfigService: AuthConfigService) {}

  @Get('mode')
  @ApiOperation({ summary: 'Get current auth configuration for administrators' })
  @ApiOkResponse({ schema: authConfigPublicSchema })
  async getLoginMode(): Promise<AuthConfigPublicDto> {
    const loginMode = await this.authConfigService.getLoginMode();
    return loginMode.config;
  }

  @Put('mode')
  @ApiOperation({ summary: 'Update current login mode and auth configuration' })
  @ApiBody({ schema: updateAuthConfigRequestSchema })
  @ApiOkResponse({ schema: authConfigPublicSchema })
  async updateLoginMode(
    @CurrentUser() user: RequestUser,
    @Body() request: UpdateAuthConfigRequest
  ): Promise<AuthConfigPublicDto> {
    return await this.authConfigService.updateLoginMode(user.user_id, request);
  }
}

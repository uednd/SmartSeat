import { Module } from '@nestjs/common';

import { AdminGuard } from '../../common/auth/admin.guard.js';
import { BearerAuthGuard } from '../../common/auth/bearer-auth.guard.js';
import { DatabaseModule } from '../../common/database/database.module.js';
import { UsersModule } from '../users/users.module.js';
import { AdminAuthController, AuthController } from './auth.controller.js';
import { AuthConfigService } from './auth-config.service.js';
import { MeController } from './me.controller.js';
import { TokenService } from './token.service.js';
import {
  MockWeChatAuthProvider,
  RealWeChatAuthProvider,
  WeChatAuthProviderSelector
} from './wechat-auth.provider.js';
import { WeChatAuthService } from './wechat-auth.service.js';

@Module({
  imports: [DatabaseModule, UsersModule],
  controllers: [AuthController, AdminAuthController, MeController],
  providers: [
    AuthConfigService,
    TokenService,
    WeChatAuthService,
    MockWeChatAuthProvider,
    RealWeChatAuthProvider,
    WeChatAuthProviderSelector,
    BearerAuthGuard,
    AdminGuard
  ],
  exports: [AuthConfigService, TokenService, BearerAuthGuard, AdminGuard]
})
export class AuthModule {}

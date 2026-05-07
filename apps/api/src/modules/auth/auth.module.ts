import { Module } from '@nestjs/common';

import { AdminGuard } from '../../common/auth/admin.guard.js';
import { BearerAuthGuard } from '../../common/auth/bearer-auth.guard.js';
import { DatabaseModule } from '../../common/database/database.module.js';
import { UsersModule } from '../users/users.module.js';
import { AdminAuthController, AuthController } from './auth.controller.js';
import { AuthConfigService } from './auth-config.service.js';
import { MeController } from './me.controller.js';
import {
  MockOidcAuthProvider,
  OidcAuthProviderSelector,
  RealOidcAuthProvider
} from './oidc-auth.provider.js';
import { OidcAuthService } from './oidc-auth.service.js';
import { OidcStateService } from './oidc-state.service.js';
import {
  MockPasswordAuthProvider,
  PasswordAuthProviderSelector,
  RealPasswordAuthProvider
} from './password-auth.provider.js';
import { PasswordAuthService } from './password-auth.service.js';
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
    OidcAuthService,
    OidcStateService,
    PasswordAuthService,
    MockPasswordAuthProvider,
    RealPasswordAuthProvider,
    PasswordAuthProviderSelector,
    MockOidcAuthProvider,
    RealOidcAuthProvider,
    OidcAuthProviderSelector,
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

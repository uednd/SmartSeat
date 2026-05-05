import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthProvider } from '@prisma/client';
import {
  ApiErrorCode,
  AuthMode,
  type AuthSessionResponse,
  type OidcAuthorizeUrlResponse,
  type OidcCallbackRequest,
  UserRole
} from '@smartseat/contracts';

import { getConfigString } from '../../common/config/config-reader.js';
import { AppHttpException } from '../../common/errors/app-http.exception.js';
import {
  type InitializeUserFromIdentityInput,
  type UpdateUserProfileInput,
  UsersService
} from '../users/users.service.js';
import { AuthConfigService } from './auth-config.service.js';
import {
  type OidcIdentity,
  type OidcRuntimeConfig,
  OidcAuthProviderSelector,
  OidcInvalidCodeError,
  OidcMissingIdentityError,
  OidcProviderUnavailableError
} from './oidc-auth.provider.js';
import { OidcStateService } from './oidc-state.service.js';
import { TokenService } from './token.service.js';

interface NormalizedOidcCallbackRequest {
  code: string;
  state: string;
}

@Injectable()
export class OidcAuthService {
  constructor(
    @Inject(AuthConfigService) private readonly authConfigService: AuthConfigService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(OidcStateService) private readonly oidcStateService: OidcStateService,
    @Inject(OidcAuthProviderSelector) private readonly provider: OidcAuthProviderSelector,
    @Inject(TokenService) private readonly tokenService: TokenService,
    @Inject(UsersService) private readonly usersService: UsersService
  ) {}

  async getAuthorizeUrl(): Promise<OidcAuthorizeUrlResponse> {
    await this.assertOidcMode();
    const config = await this.resolveRuntimeConfig();
    const nonce = randomUUID();
    const state = await this.oidcStateService.signState({
      nonce,
      redirectUri: config.redirectUri
    });
    const authorizationUrl = await this.provider.buildAuthorizationUrl({
      config,
      state,
      nonce
    });

    return {
      authorization_url: authorizationUrl,
      state
    };
  }

  async callback(request: OidcCallbackRequest): Promise<AuthSessionResponse> {
    const normalizedRequest = this.normalizeCallbackRequest(request);
    await this.assertOidcMode();
    const config = await this.resolveRuntimeConfig();
    const state = await this.oidcStateService.consumeState(normalizedRequest.state, {
      expectedRedirectUri: config.redirectUri
    });
    const identity = await this.exchangeCode({
      code: normalizedRequest.code,
      state: normalizedRequest.state,
      nonce: state.nonce,
      config
    });
    const userInput: InitializeUserFromIdentityInput = {
      authProvider: AuthProvider.OIDC,
      oidcSub: this.createStableOidcSubject(config.issuer, identity.subject)
    };
    const profileInput: UpdateUserProfileInput = {};

    if (identity.externalUserNo !== undefined) {
      userInput.externalUserNo = identity.externalUserNo;
    }

    if (identity.displayName !== undefined) {
      userInput.displayName = identity.displayName;
      profileInput.displayName = identity.displayName;
    }

    if (identity.avatarUrl !== undefined) {
      userInput.avatarUrl = identity.avatarUrl;
      profileInput.avatarUrl = identity.avatarUrl;
    }

    const user = await this.usersService.initializeUserFromIdentity(userInput);
    const profiledUser = await this.usersService.updateUserProfile(user.userId, profileInput);
    const userDto = this.usersService.toUserDto(profiledUser);
    const roles = userDto.roles;
    const role = this.usersService.getPrimaryRole(roles);
    const token = await this.tokenService.signUserToken({
      user_id: profiledUser.userId,
      roles
    });

    return {
      ...token,
      user: userDto,
      role,
      roles,
      next_route: role === UserRole.ADMIN ? 'admin' : 'student'
    };
  }

  private normalizeCallbackRequest(request: OidcCallbackRequest): NormalizedOidcCallbackRequest {
    if (typeof request !== 'object' || request === null || Array.isArray(request)) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_FAILED,
        'OIDC callback payload must be an object.'
      );
    }

    if (typeof request.code !== 'string' || request.code.trim().length === 0) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_FAILED,
        'OIDC callback code is required.'
      );
    }

    if (typeof request.state !== 'string' || request.state.trim().length === 0) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_FAILED,
        'OIDC callback state is required.'
      );
    }

    return {
      code: request.code.trim(),
      state: request.state.trim()
    };
  }

  private async assertOidcMode(): Promise<void> {
    const loginMode = await this.authConfigService.getLoginMode();

    if (loginMode.auth_mode !== AuthMode.OIDC) {
      throw new AppHttpException(
        HttpStatus.CONFLICT,
        ApiErrorCode.AUTH_LOGIN_MODE_MISMATCH,
        'OIDC login is not enabled for the current auth mode.'
      );
    }
  }

  private async resolveRuntimeConfig(): Promise<OidcRuntimeConfig> {
    const config = await this.authConfigService.ensureConfig();

    return {
      issuer: this.resolveConfigString(config.oidcIssuer, 'OIDC_ISSUER'),
      clientId: this.resolveConfigString(config.oidcClientId, 'OIDC_CLIENT_ID'),
      clientSecret: this.resolveConfigString(config.oidcClientSecret, 'OIDC_CLIENT_SECRET'),
      redirectUri: this.resolveConfigString(config.oidcRedirectUri, 'OIDC_REDIRECT_URI')
    };
  }

  private resolveConfigString(value: string | null, envKey: string): string {
    const configured = value?.trim();

    if (configured !== undefined && configured.length > 0) {
      return configured;
    }

    const fallback = getConfigString(this.configService, envKey);

    if (fallback.length === 0) {
      throw new AppHttpException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ApiErrorCode.SECRET_NOT_CONFIGURED,
        'OIDC provider configuration is not configured.'
      );
    }

    return fallback;
  }

  private async exchangeCode(
    input: Parameters<OidcAuthProviderSelector['exchangeCode']>[0]
  ): Promise<OidcIdentity> {
    try {
      return await this.provider.exchangeCode(input);
    } catch (error) {
      if (error instanceof OidcInvalidCodeError) {
        throw new AppHttpException(
          HttpStatus.UNAUTHORIZED,
          ApiErrorCode.AUTH_PROVIDER_FAILED,
          'OIDC login code is invalid.'
        );
      }

      if (
        error instanceof OidcProviderUnavailableError ||
        error instanceof OidcMissingIdentityError
      ) {
        throw new AppHttpException(
          HttpStatus.BAD_GATEWAY,
          ApiErrorCode.AUTH_PROVIDER_FAILED,
          'OIDC authentication provider failed.'
        );
      }

      throw error;
    }
  }

  private createStableOidcSubject(issuer: string, subject: string): string {
    const issuerUrl = new URL(issuer);
    issuerUrl.hash = '';
    issuerUrl.search = '';
    const normalizedIssuer = issuerUrl.href.replace(/\/$/, '');
    return `${normalizedIssuer}#${subject}`;
  }
}

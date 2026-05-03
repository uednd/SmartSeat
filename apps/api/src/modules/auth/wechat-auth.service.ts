import { HttpStatus, Injectable } from '@nestjs/common';
import { AuthProvider } from '@prisma/client';
import {
  ApiErrorCode,
  AuthMode,
  type AuthSessionResponse,
  type WechatLoginRequest
} from '@smartseat/contracts';

import { AppHttpException } from '../../common/errors/app-http.exception.js';
import {
  type InitializeUserFromIdentityInput,
  type UpdateUserProfileInput,
  UsersService
} from '../users/users.service.js';
import { AuthConfigService } from './auth-config.service.js';
import { TokenService } from './token.service.js';
import {
  WeChatAuthProviderSelector,
  WeChatInvalidCodeError,
  WeChatProviderUnavailableError
} from './wechat-auth.provider.js';

interface NormalizedWeChatLoginRequest {
  code: string;
  displayName?: string;
  avatarUrl?: string;
}

@Injectable()
export class WeChatAuthService {
  constructor(
    private readonly authConfigService: AuthConfigService,
    private readonly tokenService: TokenService,
    private readonly usersService: UsersService,
    private readonly provider: WeChatAuthProviderSelector
  ) {}

  async login(request: WechatLoginRequest): Promise<AuthSessionResponse> {
    const normalizedRequest = this.normalizeRequest(request);
    const loginMode = await this.authConfigService.getLoginMode();

    if (loginMode.auth_mode !== AuthMode.WECHAT) {
      throw new AppHttpException(
        HttpStatus.CONFLICT,
        ApiErrorCode.AUTH_LOGIN_MODE_MISMATCH,
        'WeChat login is not enabled for the current auth mode.'
      );
    }

    const session = await this.exchangeCode(normalizedRequest.code);
    const userInput: InitializeUserFromIdentityInput = {
      authProvider: AuthProvider.WECHAT,
      openid: session.openid
    };
    const profileInput: UpdateUserProfileInput = {};

    if (session.unionid !== undefined) {
      userInput.unionid = session.unionid;
    }

    if (normalizedRequest.displayName !== undefined) {
      userInput.displayName = normalizedRequest.displayName;
      profileInput.displayName = normalizedRequest.displayName;
    }

    if (normalizedRequest.avatarUrl !== undefined) {
      userInput.avatarUrl = normalizedRequest.avatarUrl;
      profileInput.avatarUrl = normalizedRequest.avatarUrl;
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
      next_route: role === 'ADMIN' ? 'admin' : 'student'
    };
  }

  private normalizeRequest(request: WechatLoginRequest): NormalizedWeChatLoginRequest {
    if (typeof request !== 'object' || request === null || Array.isArray(request)) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_FAILED,
        'WeChat login payload must be an object.'
      );
    }

    if (typeof request.code !== 'string' || request.code.trim().length === 0) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_FAILED,
        'WeChat login code is required.'
      );
    }

    const normalized: NormalizedWeChatLoginRequest = {
      code: request.code.trim()
    };

    const displayName = this.normalizeOptionalString(request.displayName, 'displayName');
    const avatarUrl = this.normalizeOptionalString(request.avatarUrl, 'avatarUrl');

    if (displayName !== undefined) {
      normalized.displayName = displayName;
    }

    if (avatarUrl !== undefined) {
      normalized.avatarUrl = avatarUrl;
    }

    return normalized;
  }

  private normalizeOptionalString(value: unknown, field: string): string | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== 'string') {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_FAILED,
        `Invalid WeChat login field: ${field}.`
      );
    }

    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }

  private async exchangeCode(code: string) {
    try {
      return await this.provider.exchangeCode(code);
    } catch (error) {
      if (error instanceof WeChatProviderUnavailableError) {
        throw new AppHttpException(
          HttpStatus.BAD_GATEWAY,
          ApiErrorCode.AUTH_PROVIDER_FAILED,
          'WeChat authentication provider is unavailable.'
        );
      }

      if (error instanceof WeChatInvalidCodeError) {
        throw new AppHttpException(
          HttpStatus.UNAUTHORIZED,
          ApiErrorCode.AUTH_PROVIDER_FAILED,
          'WeChat login code is invalid.'
        );
      }

      throw error;
    }
  }
}

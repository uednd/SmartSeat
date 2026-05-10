import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AuthProvider, User } from '@prisma/client';
import {
  ApiErrorCode,
  AuthMode,
  type AuthSessionResponse,
  type PasswordLoginRequest,
  type RegisterRequest
} from '@smartseat/contracts';

import { AppHttpException } from '../../common/errors/app-http.exception.js';
import { UsersService } from '../users/users.service.js';
import { AuthConfigService } from './auth-config.service.js';
import { TokenService } from './token.service.js';
import {
  PasswordAuthProviderSelector,
  PasswordAuthInvalidCredentialsError,
  PasswordAuthNotRegisteredError,
  hashPassword
} from './password-auth.provider.js';

@Injectable()
export class PasswordAuthService {
  constructor(
    @Inject(AuthConfigService) private readonly authConfigService: AuthConfigService,
    @Inject(TokenService) private readonly tokenService: TokenService,
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(PasswordAuthProviderSelector) private readonly provider: PasswordAuthProviderSelector
  ) {}

  async login(request: PasswordLoginRequest): Promise<AuthSessionResponse> {
    this.validateCredentials(request);
    await this.assertLocalMode();

    const username = request.username.trim().toLowerCase();

    try {
      await this.provider.authenticate(request.username, request.password);
    } catch (error) {
      if (error instanceof PasswordAuthInvalidCredentialsError) {
        throw new AppHttpException(
          HttpStatus.UNAUTHORIZED,
          ApiErrorCode.AUTH_PROVIDER_FAILED,
          error.message
        );
      }
      throw error;
    }

    const user = await this.usersService.findByLocalSub(username);
    if (user === null) {
      throw new AppHttpException(
        HttpStatus.UNAUTHORIZED,
        ApiErrorCode.AUTH_NOT_REGISTERED,
        '该账号尚未注册，请先注册。'
      );
    }

    return await this.buildSessionResponse(user);
  }

  async register(request: RegisterRequest): Promise<AuthSessionResponse> {
    if (typeof request !== 'object' || request === null || Array.isArray(request)) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_FAILED,
        'Register payload must be an object.'
      );
    }

    if (typeof request.username !== 'string' || request.username.trim().length === 0) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_FAILED,
        'Username is required.'
      );
    }

    if (typeof request.password !== 'string' || request.password.trim().length === 0) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_FAILED,
        'Password is required.'
      );
    }

    if (typeof request.display_name !== 'string' || request.display_name.trim().length === 0) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_FAILED,
        'Nickname is required.'
      );
    }

    const validGenders = ['MALE', 'FEMALE', 'OTHER'];
    if (request.gender !== undefined && (typeof request.gender !== 'string' || !validGenders.includes(request.gender))) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_FAILED,
        'Gender must be MALE, FEMALE, or OTHER.'
      );
    }

    await this.assertLocalMode();

    const username = request.username.trim().toLowerCase();

    const existingUser = await this.usersService.findByLocalSub(username);
    if (existingUser !== null) {
      throw new AppHttpException(
        HttpStatus.CONFLICT,
        ApiErrorCode.VALIDATION_FAILED,
        '该账号已被注册，请直接登录。'
      );
    }

    const passwordHash = await hashPassword(request.password);

    const user = await this.usersService.initializeUserFromIdentity({
      authProvider: AuthProvider.LOCAL,
      localSub: username,
      displayName: request.display_name.trim(),
      passwordHash,
      gender: request.gender
    });

    return await this.buildSessionResponse(user);
  }

  private validateCredentials(request: PasswordLoginRequest): void {
    if (typeof request !== 'object' || request === null || Array.isArray(request)) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_FAILED,
        'Password login payload must be an object.'
      );
    }

    if (typeof request.username !== 'string' || request.username.trim().length === 0) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_FAILED,
        'Username is required.'
      );
    }

    if (typeof request.password !== 'string' || request.password.trim().length === 0) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_FAILED,
        'Password is required.'
      );
    }
  }

  private async buildSessionResponse(user: User): Promise<AuthSessionResponse> {
    const userDto = this.usersService.toUserDto(user);
    const roles = userDto.roles;
    const role = this.usersService.getPrimaryRole(roles);
    const token = await this.tokenService.signUserToken({
      user_id: user.userId,
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

  private async assertLocalMode(): Promise<void> {
    const { auth_mode } = await this.authConfigService.getLoginMode();

    if (auth_mode !== AuthMode.LOCAL) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.AUTH_LOGIN_MODE_MISMATCH,
        'Password login is not available in the current authentication mode.'
      );
    }
  }
}

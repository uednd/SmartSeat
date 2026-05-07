import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AuthProvider } from '@prisma/client';
import {
  ApiErrorCode,
  AuthMode,
  type AuthSessionResponse,
  type PasswordLoginRequest
} from '@smartseat/contracts';

import { AppHttpException } from '../../common/errors/app-http.exception.js';
import {
  type InitializeUserFromIdentityInput,
  UsersService
} from '../users/users.service.js';
import { AuthConfigService } from './auth-config.service.js';
import { TokenService } from './token.service.js';
import {
  MockPasswordAuthProvider,
  PasswordAuthInvalidCredentialsError
} from './password-auth.provider.js';

@Injectable()
export class PasswordAuthService {
  constructor(
    @Inject(AuthConfigService) private readonly authConfigService: AuthConfigService,
    @Inject(TokenService) private readonly tokenService: TokenService,
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(MockPasswordAuthProvider) private readonly provider: MockPasswordAuthProvider
  ) {}

  async login(request: PasswordLoginRequest): Promise<AuthSessionResponse> {
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

    try {
      const identity = await this.provider.authenticate(request.username, request.password);

      const userInput: InitializeUserFromIdentityInput = {
        authProvider: AuthProvider.OIDC,
        oidcSub: `password:${identity.username}`
      };

      const user = await this.usersService.initializeUserFromIdentity(userInput);
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
  }
}

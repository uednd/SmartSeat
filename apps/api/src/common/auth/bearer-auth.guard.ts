import { CanActivate, ExecutionContext, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ApiErrorCode } from '@smartseat/contracts';

import { RequestWithContext } from '../request/request-context.js';
import { AppHttpException } from '../errors/app-http.exception.js';
import { TokenService } from '../../modules/auth/token.service.js';
import { UsersService } from '../../modules/users/users.service.js';

@Injectable()
export class BearerAuthGuard implements CanActivate {
  constructor(
    @Inject(TokenService) private readonly tokenService: TokenService,
    @Inject(UsersService) private readonly usersService: UsersService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const token = this.extractBearerToken(request);

    if (token === undefined) {
      throw new AppHttpException(
        HttpStatus.UNAUTHORIZED,
        ApiErrorCode.AUTH_REQUIRED,
        'Authentication is required.'
      );
    }

    const claims = await this.tokenService.verifyToken(token);
    const user = await this.usersService.findById(claims.user_id);

    if (user === null) {
      throw new AppHttpException(
        HttpStatus.UNAUTHORIZED,
        ApiErrorCode.AUTH_INVALID_TOKEN,
        'Authentication token is invalid.'
      );
    }

    request.user = {
      user_id: user.userId,
      roles: user.roles
    };

    return true;
  }

  private extractBearerToken(request: RequestWithContext): string | undefined {
    const header = request.headers.authorization;
    const authorization = Array.isArray(header) ? header[0] : header;

    if (authorization === undefined) {
      return undefined;
    }

    const [scheme, token] = authorization.split(' ');

    if (scheme !== 'Bearer' || token === undefined || token.length === 0) {
      return undefined;
    }

    return token;
  }
}

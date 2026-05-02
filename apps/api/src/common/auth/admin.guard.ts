import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ApiErrorCode, UserRole } from '@smartseat/contracts';

import { AppHttpException } from '../errors/app-http.exception.js';
import { RequestWithContext } from '../request/request-context.js';
import { RequestUser } from './request-user.js';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const user = request.user as RequestUser | undefined;

    if (user === undefined) {
      throw new AppHttpException(
        HttpStatus.UNAUTHORIZED,
        ApiErrorCode.AUTH_REQUIRED,
        'Authentication is required.'
      );
    }

    if (!user.roles.includes(UserRole.ADMIN)) {
      throw new AppHttpException(
        HttpStatus.FORBIDDEN,
        ApiErrorCode.FORBIDDEN,
        'Administrator role is required.'
      );
    }

    return true;
  }
}

import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { RequestUser } from './request-user.js';
import type { RequestWithContext } from '../request/request-context.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestUser | undefined => {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    return request.user as RequestUser | undefined;
  }
);

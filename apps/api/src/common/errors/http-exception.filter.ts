import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter
} from '@nestjs/common';
import { ApiErrorCode, type ApiErrorResponse } from '@smartseat/contracts';

import { AppHttpException } from './app-http.exception.js';
import { getRequestId, type RequestWithContext } from '../request/request-context.js';

interface ResponseLike {
  status(statusCode: number): ResponseLike;
  json(body: ApiErrorResponse): void;
}

const httpStatusToErrorCode = (status: number): ApiErrorCode => {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ApiErrorCode.VALIDATION_FAILED;
    case HttpStatus.UNAUTHORIZED:
      return ApiErrorCode.AUTH_REQUIRED;
    case HttpStatus.FORBIDDEN:
      return ApiErrorCode.FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return ApiErrorCode.RESOURCE_NOT_FOUND;
    case HttpStatus.CONFLICT:
      return ApiErrorCode.STATE_CONFLICT;
    default:
      return status >= 500 ? ApiErrorCode.INTERNAL_ERROR : ApiErrorCode.PAYLOAD_INVALID;
  }
};

const getMessageFromHttpException = (exception: HttpException): string => {
  const response = exception.getResponse();

  if (typeof response === 'string') {
    return response;
  }

  if (typeof response === 'object' && response !== null && 'message' in response) {
    const message = (response as { message?: unknown }).message;

    if (Array.isArray(message)) {
      return message.join('; ');
    }

    if (typeof message === 'string') {
      return message;
    }
  }

  return exception.message;
};

const getDetailsFromHttpException = (
  exception: HttpException
): Record<string, unknown> | undefined => {
  const response = exception.getResponse();

  if (typeof response !== 'object' || response === null || !('details' in response)) {
    return undefined;
  }

  const details = (response as { details?: unknown }).details;
  return typeof details === 'object' && details !== null && !Array.isArray(details)
    ? (details as Record<string, unknown>)
    : undefined;
};

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithContext>();
    const response = context.getResponse<ResponseLike>();
    const requestId = getRequestId(request);

    if (exception instanceof AppHttpException) {
      const error: ApiErrorResponse = {
        code: exception.errorCode,
        message: exception.message
      };

      if (exception.errorDetails !== undefined) {
        error.details = exception.errorDetails;
      }

      response.status(exception.statusCode).json(this.withRequestId(error, requestId));
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const details = getDetailsFromHttpException(exception);
      const error: ApiErrorResponse = {
        code: httpStatusToErrorCode(status),
        message: getMessageFromHttpException(exception)
      };

      if (details !== undefined) {
        error.details = details;
      }

      response.status(status).json(this.withRequestId(error, requestId));
      return;
    }

    this.logger.error(
      JSON.stringify({
        request_id: requestId,
        code: ApiErrorCode.INTERNAL_ERROR,
        category: 'unhandled_exception'
      })
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
      this.withRequestId(
        {
          code: ApiErrorCode.INTERNAL_ERROR,
          message: 'Internal server error'
        },
        requestId
      )
    );
  }

  private withRequestId(error: ApiErrorResponse, requestId: string): ApiErrorResponse {
    const response: ApiErrorResponse = {
      code: error.code,
      message: error.message,
      request_id: requestId
    };

    if (error.details !== undefined) {
      response.details = error.details;
    }

    return response;
  }
}

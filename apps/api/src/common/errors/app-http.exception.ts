import { HttpException, type HttpStatus } from '@nestjs/common';
import { type ApiErrorCode, type ApiErrorResponse } from '@smartseat/contracts';

export class AppHttpException extends HttpException {
  constructor(
    public readonly statusCode: HttpStatus,
    public readonly errorCode: ApiErrorCode,
    message: string,
    public readonly errorDetails?: Record<string, unknown>
  ) {
    const response: ApiErrorResponse = {
      code: errorCode,
      message
    };

    if (errorDetails !== undefined) {
      response.details = errorDetails;
    }

    super(response, statusCode);
  }
}

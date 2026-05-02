import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { ServerResponse } from 'node:http';

import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';

import { getHeaderValue, type RequestWithContext } from './request-context.js';

const REQUEST_ID_HEADER = 'x-request-id';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HttpRequest');

  use(request: RequestWithContext, response: ServerResponse, next: () => void): void {
    const requestId = getHeaderValue(request.headers, REQUEST_ID_HEADER) ?? randomUUID();
    const startedAt = performance.now();

    request.requestId = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);

    response.on('finish', () => {
      const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
      const path = request.originalUrl ?? request.url ?? 'unknown';

      this.logger.log(
        JSON.stringify({
          request_id: requestId,
          method: request.method ?? 'UNKNOWN',
          path,
          status: response.statusCode,
          duration_ms: durationMs
        })
      );
    });

    next();
  }
}

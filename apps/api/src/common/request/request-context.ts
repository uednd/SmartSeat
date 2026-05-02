import type { IncomingHttpHeaders } from 'node:http';

export interface RequestWithContext {
  headers: IncomingHttpHeaders;
  method?: string;
  originalUrl?: string;
  url?: string;
  requestId?: string;
  user?: unknown;
}

const REQUEST_ID_HEADER = 'x-request-id';

export const getHeaderValue = (
  headers: IncomingHttpHeaders,
  name: typeof REQUEST_ID_HEADER
): string | undefined => {
  const value = headers[name];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
};

export const getRequestId = (request: RequestWithContext): string => {
  const requestId = request.requestId ?? getHeaderValue(request.headers, REQUEST_ID_HEADER);
  return requestId ?? 'unknown';
};

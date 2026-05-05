import {
  ApiClientError,
  ApiErrorCode,
  isApiErrorResponse,
  type ApiErrorResponse,
  type ApiHttpMethod,
  type ApiTransport,
  type ApiTransportRequest
} from '@smartseat/api-client';

export interface UniTransportOptions {
  baseUrl: string;
  token?: () => string | undefined;
  timeout_ms?: number;
}

export class MiniappNetworkError extends Error {
  readonly url: string;
  readonly reason: string;

  constructor(url: string, reason: string) {
    super(`无法连接 SmartSeat API（${url}）：${reason}`);
    this.name = 'MiniappNetworkError';
    this.url = url;
    this.reason = reason;
  }
}

type UniRequestOptions = Omit<UniNamespace.RequestOptions, 'method'> & {
  method?: ApiHttpMethod;
};

function normalizeHeaders(headers: unknown): Record<string, string> {
  if (typeof headers !== 'object' || headers === null) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)])
  );
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function buildUrl(baseUrl: string, path: string, query: unknown): string {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const search = buildQueryString(query);

  return `${normalizedBaseUrl}${normalizedPath}${search}`;
}

function buildQueryString(query: unknown): string {
  if (query === undefined || typeof query !== 'object' || query === null) {
    return '';
  }

  const params: string[] = [];

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        params.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
      }
      continue;
    }

    params.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }

  return params.length > 0 ? `?${params.join('&')}` : '';
}

function buildHeaders(
  options: UniTransportOptions,
  requestHeaders: Record<string, string> | undefined,
  body: unknown
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...requestHeaders
  };

  if (body !== undefined && headers['Content-Type'] === undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const token = options.token?.();

  if (token !== undefined && token.length > 0) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function parsePayload(data: unknown): unknown {
  if (typeof data !== 'string') {
    return data;
  }

  if (data.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(data) as unknown;
  } catch {
    return {
      code: ApiErrorCode.INTERNAL_ERROR,
      message: 'SmartSeat API returned invalid JSON.'
    } satisfies ApiErrorResponse;
  }
}

function normalizeErrorResponse(payload: unknown): ApiErrorResponse {
  if (isApiErrorResponse(payload)) {
    return payload;
  }

  return {
    code: ApiErrorCode.INTERNAL_ERROR,
    message: 'SmartSeat API request failed.',
    details: {
      payload
    }
  };
}

export function createUniTransport(options: UniTransportOptions): ApiTransport {
  return {
    async request<TResponse, TBody = unknown, TQuery = unknown>(
      request: ApiTransportRequest<TBody, TQuery>
    ): Promise<TResponse> {
      if (request.method === undefined || request.path === undefined) {
        throw new ApiClientError({
          code: ApiErrorCode.INTERNAL_ERROR,
          message: `No HTTP path is bound for operation "${request.operation_id}".`
        });
      }

      return await uniRequest<TResponse>({
        url: buildUrl(options.baseUrl, request.path, request.query),
        method: request.method,
        headers: buildHeaders(options, request.headers, request.body),
        body: request.body,
        timeout_ms: options.timeout_ms
      });
    }
  };
}

function uniRequest<TResponse>(request: {
  url: string;
  method: ApiHttpMethod;
  headers: Record<string, string>;
  body: unknown;
  timeout_ms: number | undefined;
}): Promise<TResponse> {
  return new Promise<TResponse>((resolve, reject) => {
    const options: UniRequestOptions = {
      url: request.url,
      method: request.method,
      header: request.headers,
      data: request.body === undefined ? undefined : JSON.stringify(request.body),
      dataType: 'text',
      responseType: 'text',
      timeout: request.timeout_ms,
      success(response) {
        normalizeHeaders(response.header);
        const payload = parsePayload(response.data);

        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new ApiClientError(normalizeErrorResponse(payload), response.statusCode));
          return;
        }

        resolve(payload as TResponse);
      },
      fail(error) {
        reject(new MiniappNetworkError(request.url, error.errMsg || 'uni.request failed'));
      }
    };

    uni.request(options as UniNamespace.RequestOptions);
  });
}

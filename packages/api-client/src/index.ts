import {
  ApiErrorCode,
  type AdminActionLogDto,
  type AdminDashboardDto,
  type AdminReleaseSeatRequest,
  type AdminSeatOverviewDto,
  type AnomalyEventDto,
  type AnomalyListRequest,
  type ApiErrorResponse,
  type AuthConfigPublicDto,
  type AuthSessionResponse,
  type CancelReservationRequest,
  type CheckinRequest,
  type CheckinResponse,
  type CreateReservationRequest,
  type DeviceDto,
  type DeviceListRequest,
  type ExtendReservationRequest,
  type HandleAnomalyRequest,
  type LeaderboardRequest,
  type LeaderboardResponse,
  type LoginModeResponse,
  type MeResponse,
  type NoShowRecordDto,
  type OidcCallbackRequest,
  type OidcAuthorizeUrlResponse,
  type PageRequest,
  type PageResponse,
  type ReservationDto,
  type SeatDetailDto,
  type SeatDto,
  type SeatListRequest,
  type StudyStatsDto,
  type UpdateAuthConfigRequest,
  type UpdateLeaderboardPreferenceRequest,
  type UpdateSeatMaintenanceRequest,
  type UserReleaseReservationRequest,
  type WechatLoginRequest
} from '@smartseat/contracts';

export { ApiErrorCode } from '@smartseat/contracts';
export type { ApiErrorResponse } from '@smartseat/contracts';

export type ApiHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type TokenProvider = string | (() => string | undefined | Promise<string | undefined>);

export interface ApiTransportRequest<TBody = unknown, TQuery = unknown> {
  operation_id: string;
  method?: ApiHttpMethod;
  path?: string;
  query?: TQuery;
  body?: TBody;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface ApiTransport {
  request<TResponse, TBody = unknown, TQuery = unknown>(
    request: ApiTransportRequest<TBody, TQuery>
  ): Promise<TResponse>;
}

export interface HttpOperation {
  method: ApiHttpMethod;
  path: string;
}

export type OperationResolver = (request: ApiTransportRequest) => HttpOperation | undefined;

export interface FetchLikeResponse {
  ok: boolean;
  status: number;
  headers: {
    get(name: string): string | null;
  };
  text(): Promise<string>;
}

export type FetchLike = (
  input: string,
  init: {
    method: ApiHttpMethod;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }
) => Promise<FetchLikeResponse>;

export interface HttpTransportOptions {
  baseUrl: string;
  token?: TokenProvider;
  headers?: Record<string, string>;
  fetch?: FetchLike;
  operationResolver?: OperationResolver;
  timeout_ms?: number;
}

export class ApiClientError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;
  readonly response: ApiErrorResponse;

  constructor(response: ApiErrorResponse, status?: number) {
    super(response.message);
    this.name = 'ApiClientError';
    this.code = response.code;
    this.response = response;

    if (status !== undefined) {
      this.status = status;
    }
  }
}

export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<ApiErrorResponse>;
  return typeof candidate.code === 'string' && typeof candidate.message === 'string';
}

export function createHttpTransport(options: HttpTransportOptions): ApiTransport {
  const fetchImpl = options.fetch ?? globalThis.fetch;

  if (fetchImpl === undefined) {
    throw new ApiClientError({
      code: ApiErrorCode.INTERNAL_ERROR,
      message: 'No fetch implementation is available for SmartSeat API client.'
    });
  }

  return {
    async request<TResponse, TBody = unknown, TQuery = unknown>(
      request: ApiTransportRequest<TBody, TQuery>
    ): Promise<TResponse> {
      const operation = resolveOperation(request, options.operationResolver);
      const url = buildUrl(options.baseUrl, operation.path, request.query);
      const headers = await buildHeaders(options, request.headers, request.body);
      const controller = options.timeout_ms === undefined ? undefined : new AbortController();
      const timeout = createTimeout(controller, options.timeout_ms);
      const signal = request.signal ?? controller?.signal;

      try {
        const init: {
          method: ApiHttpMethod;
          headers: Record<string, string>;
          body?: string;
          signal?: AbortSignal;
        } = {
          method: operation.method,
          headers
        };

        if (request.body !== undefined) {
          init.body = JSON.stringify(request.body);
        }

        if (signal !== undefined) {
          init.signal = signal;
        }

        const response = await fetchImpl(url, init);

        return await parseResponse<TResponse>(response);
      } catch (error) {
        if (error instanceof ApiClientError) {
          throw error;
        }

        throw new ApiClientError({
          code: ApiErrorCode.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : 'SmartSeat API request failed.'
        });
      } finally {
        if (timeout !== undefined) {
          clearTimeout(timeout);
        }
      }
    }
  };
}

function resolveOperation(
  request: ApiTransportRequest,
  operationResolver: OperationResolver | undefined
): HttpOperation {
  const resolved = operationResolver?.(request);

  if (resolved !== undefined) {
    return resolved;
  }

  if (request.path !== undefined && request.method !== undefined) {
    return {
      method: request.method,
      path: request.path
    };
  }

  throw new ApiClientError({
    code: ApiErrorCode.INTERNAL_ERROR,
    message: `No HTTP path is bound for operation "${request.operation_id}". Generate or provide an operation resolver from OpenAPI before using the HTTP transport.`
  });
}

async function buildHeaders(
  options: HttpTransportOptions,
  requestHeaders: Record<string, string> | undefined,
  body: unknown
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
    ...requestHeaders
  };

  if (body !== undefined && headers['Content-Type'] === undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const token = await resolveToken(options.token);

  if (token !== undefined && token.length > 0) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function resolveToken(token: TokenProvider | undefined): Promise<string | undefined> {
  if (typeof token === 'function') {
    return await token();
  }

  return token;
}

function buildUrl(baseUrl: string, path: string, query: unknown): string {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  const url = new URL(normalizedPath, normalizedBaseUrl);

  if (query !== undefined && typeof query === 'object' && query !== null) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) {
        continue;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(key, String(item));
        }
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

function createTimeout(
  controller: AbortController | undefined,
  timeout_ms: number | undefined
): ReturnType<typeof setTimeout> | undefined {
  if (controller === undefined || timeout_ms === undefined) {
    return undefined;
  }

  return setTimeout(() => {
    controller.abort();
  }, timeout_ms);
}

async function parseResponse<TResponse>(response: FetchLikeResponse): Promise<TResponse> {
  const payload = await parseJson(response);

  if (!response.ok) {
    throw new ApiClientError(normalizeErrorResponse(payload), response.status);
  }

  return payload as TResponse;
}

async function parseJson(response: FetchLikeResponse): Promise<unknown> {
  const text = await response.text();

  if (text.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
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

export interface AuthApi {
  getLoginMode(): Promise<LoginModeResponse>;
  loginWechat(request: WechatLoginRequest): Promise<AuthSessionResponse>;
  getOidcAuthorizeUrl(): Promise<OidcAuthorizeUrlResponse>;
  startOidc(): Promise<OidcAuthorizeUrlResponse>;
  completeOidc(request: OidcCallbackRequest): Promise<AuthSessionResponse>;
}

export interface MeApi {
  get(): Promise<MeResponse>;
  updateLeaderboardPreference(request: UpdateLeaderboardPreferenceRequest): Promise<MeResponse>;
}

export interface SeatsApi {
  list(request?: SeatListRequest): Promise<PageResponse<SeatDto>>;
  get(seat_id: string): Promise<SeatDetailDto>;
}

export interface DevicesApi {
  list(request?: DeviceListRequest): Promise<PageResponse<DeviceDto>>;
  get(device_id: string): Promise<DeviceDto>;
}

export interface ReservationsApi {
  create(request: CreateReservationRequest): Promise<ReservationDto>;
  cancel(request: CancelReservationRequest): Promise<ReservationDto>;
  extend(request: ExtendReservationRequest): Promise<ReservationDto>;
  releaseByUser(request: UserReleaseReservationRequest): Promise<ReservationDto>;
  current(): Promise<ReservationDto | undefined>;
}

export interface CheckinApi {
  submit(request: CheckinRequest): Promise<CheckinResponse>;
}

export interface AnomaliesApi {
  list(request?: AnomalyListRequest): Promise<PageResponse<AnomalyEventDto>>;
  handle(request: HandleAnomalyRequest): Promise<AnomalyEventDto>;
}

export interface StatsApi {
  me(): Promise<StudyStatsDto>;
}

export interface LeaderboardApi {
  list(request: LeaderboardRequest): Promise<LeaderboardResponse>;
}

export interface AdminApi {
  dashboard(): Promise<AdminDashboardDto>;
  seats(request?: PageRequest): Promise<PageResponse<AdminSeatOverviewDto>>;
  releaseSeat(request: AdminReleaseSeatRequest): Promise<SeatDetailDto>;
  setSeatMaintenance(request: UpdateSeatMaintenanceRequest): Promise<SeatDetailDto>;
  noShows(request?: PageRequest): Promise<PageResponse<NoShowRecordDto>>;
  anomalies(request?: AnomalyListRequest): Promise<PageResponse<AnomalyEventDto>>;
  handleAnomaly(request: HandleAnomalyRequest): Promise<AnomalyEventDto>;
  getAuthConfig(): Promise<AuthConfigPublicDto>;
  updateAuthConfig(request: UpdateAuthConfigRequest): Promise<AuthConfigPublicDto>;
  actionLogs(request?: PageRequest): Promise<PageResponse<AdminActionLogDto>>;
}

export interface SmartSeatApiClient {
  auth: AuthApi;
  me: MeApi;
  seats: SeatsApi;
  devices: DevicesApi;
  reservations: ReservationsApi;
  checkin: CheckinApi;
  anomalies: AnomaliesApi;
  stats: StatsApi;
  leaderboard: LeaderboardApi;
  admin: AdminApi;
}

export function createSmartSeatApiClient(transport: ApiTransport): SmartSeatApiClient {
  return {
    auth: {
      getLoginMode: () => transport.request({ operation_id: 'auth.getLoginMode', method: 'GET' }),
      loginWechat: (request) =>
        transport.request({ operation_id: 'auth.loginWechat', method: 'POST', body: request }),
      getOidcAuthorizeUrl: () =>
        transport.request({ operation_id: 'auth.getOidcAuthorizeUrl', method: 'GET' }),
      startOidc: () =>
        transport.request({ operation_id: 'auth.getOidcAuthorizeUrl', method: 'GET' }),
      completeOidc: (request) =>
        transport.request({ operation_id: 'auth.completeOidc', method: 'POST', body: request })
    },
    me: {
      get: () => transport.request({ operation_id: 'me.get', method: 'GET' }),
      updateLeaderboardPreference: (request) =>
        transport.request({
          operation_id: 'me.updateLeaderboardPreference',
          method: 'PATCH',
          body: request
        })
    },
    seats: {
      list: (request) =>
        transport.request({ operation_id: 'seats.list', method: 'GET', query: request }),
      get: (seat_id) =>
        transport.request({ operation_id: 'seats.get', method: 'GET', query: { seat_id } })
    },
    devices: {
      list: (request) =>
        transport.request({ operation_id: 'devices.list', method: 'GET', query: request }),
      get: (device_id) =>
        transport.request({ operation_id: 'devices.get', method: 'GET', query: { device_id } })
    },
    reservations: {
      create: (request) =>
        transport.request({ operation_id: 'reservations.create', method: 'POST', body: request }),
      cancel: (request) =>
        transport.request({ operation_id: 'reservations.cancel', method: 'POST', body: request }),
      extend: (request) =>
        transport.request({ operation_id: 'reservations.extend', method: 'POST', body: request }),
      releaseByUser: (request) =>
        transport.request({
          operation_id: 'reservations.releaseByUser',
          method: 'POST',
          body: request
        }),
      current: () => transport.request({ operation_id: 'reservations.current', method: 'GET' })
    },
    checkin: {
      submit: (request) =>
        transport.request({ operation_id: 'checkin.submit', method: 'POST', body: request })
    },
    anomalies: {
      list: (request) =>
        transport.request({ operation_id: 'anomalies.list', method: 'GET', query: request }),
      handle: (request) =>
        transport.request({ operation_id: 'anomalies.handle', method: 'POST', body: request })
    },
    stats: {
      me: () => transport.request({ operation_id: 'stats.me', method: 'GET' })
    },
    leaderboard: {
      list: (request) =>
        transport.request({ operation_id: 'leaderboard.list', method: 'GET', query: request })
    },
    admin: {
      dashboard: () => transport.request({ operation_id: 'admin.dashboard', method: 'GET' }),
      seats: (request) =>
        transport.request({ operation_id: 'admin.seats', method: 'GET', query: request }),
      releaseSeat: (request) =>
        transport.request({ operation_id: 'admin.releaseSeat', method: 'POST', body: request }),
      setSeatMaintenance: (request) =>
        transport.request({
          operation_id: 'admin.setSeatMaintenance',
          method: 'POST',
          body: request
        }),
      noShows: (request) =>
        transport.request({ operation_id: 'admin.noShows', method: 'GET', query: request }),
      anomalies: (request) =>
        transport.request({ operation_id: 'admin.anomalies', method: 'GET', query: request }),
      handleAnomaly: (request) =>
        transport.request({ operation_id: 'admin.handleAnomaly', method: 'POST', body: request }),
      getAuthConfig: () =>
        transport.request({ operation_id: 'admin.getAuthConfig', method: 'GET' }),
      updateAuthConfig: (request) =>
        transport.request({ operation_id: 'admin.updateAuthConfig', method: 'PUT', body: request }),
      actionLogs: (request) =>
        transport.request({ operation_id: 'admin.actionLogs', method: 'GET', query: request })
    }
  };
}

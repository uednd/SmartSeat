import {
  ApiErrorCode,
  type AdminActionLogDto,
  type AdminDeviceDto,
  type AdminDashboardDto,
  type AdminReleaseSeatRequest,
  type AdminReservationListRequest,
  type AdminSeatDetailDto,
  type AdminSeatOverviewDto,
  type AdminSystemConfigDto,
  type AnomalyEventDto,
  type AnomalyListRequest,
  type ApiErrorResponse,
  type AuthConfigPublicDto,
  type AuthSessionResponse,
  type BindDeviceSeatRequest,
  type CancelReservationRequest,
  type CheckinRequest,
  type CheckinResponse,
  type CreateDeviceRequest,
  type CreateReservationRequest,
  type CreateSeatRequest,
  type CurrentUsageResponse,
  type DeviceDto,
  type DeviceListRequest,
  type ExtendReservationRequest,
  type HandleAnomalyRequest,
  type LoginModeResponse,
  type LeaderboardRequest,
  type LeaderboardResponse,
  type MeResponse,
  type NoShowRecordDto,
  type OidcCallbackRequest,
  type OidcAuthorizeUrlResponse,
  type PageRequest,
  type PageResponse,
  type ReservationDto,
  type ReservationHistoryRequest,
  type SeatDetailDto,
  type SeatDto,
  type SeatListRequest,
  type SetSeatEnabledRequest,
  type StudyStatsDto,
  type UnbindDeviceSeatRequest,
  type UpdateAuthConfigRequest,
  type UpdateDeviceMaintenanceRequest,
  type UpdateDeviceRequest,
  type UpdateLeaderboardPreferenceRequest,
  type UpdateSeatRequest,
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
  cancel(
    reservation_id: string,
    request?: Omit<CancelReservationRequest, 'reservation_id'>
  ): Promise<ReservationDto>;
  cancel(request: CancelReservationRequest): Promise<ReservationDto>;
  extend(request: ExtendReservationRequest): Promise<ReservationDto>;
  releaseByUser(request: UserReleaseReservationRequest): Promise<ReservationDto>;
  current(): Promise<ReservationDto | undefined>;
  currentUsage(): Promise<CurrentUsageResponse | undefined>;
  history(request?: ReservationHistoryRequest): Promise<PageResponse<ReservationDto>>;
}

export interface CheckinApi {
  submit(request: CheckinRequest): Promise<CheckinResponse>;
}

export interface AnomaliesApi {
  list(request?: AnomalyListRequest): Promise<PageResponse<AnomalyEventDto>>;
  handle(request: HandleAnomalyRequest): Promise<AnomalyEventDto>;
}

export interface StatsApi {
  getMe(): Promise<StudyStatsDto>;
}

export interface LeaderboardApi {
  get(request: LeaderboardRequest): Promise<LeaderboardResponse>;
}

export interface AdminApi {
  dashboard(): Promise<AdminDashboardDto>;
  listSeats(request?: PageRequest): Promise<PageResponse<AdminSeatOverviewDto>>;
  getSeat(seat_id: string): Promise<AdminSeatDetailDto>;
  createSeat(request: CreateSeatRequest): Promise<AdminSeatDetailDto>;
  updateSeat(seat_id: string, request: UpdateSeatRequest): Promise<AdminSeatDetailDto>;
  setSeatEnabled(seat_id: string, request: SetSeatEnabledRequest): Promise<AdminSeatDetailDto>;
  listDevices(request?: DeviceListRequest): Promise<PageResponse<AdminDeviceDto>>;
  getDevice(device_id: string): Promise<AdminDeviceDto>;
  createDevice(request: CreateDeviceRequest): Promise<AdminDeviceDto>;
  updateDevice(device_id: string, request: UpdateDeviceRequest): Promise<AdminDeviceDto>;
  bindDeviceSeat(device_id: string, request: BindDeviceSeatRequest): Promise<AdminDeviceDto>;
  unbindDeviceSeat(device_id: string, request?: UnbindDeviceSeatRequest): Promise<AdminDeviceDto>;
  listCurrentReservations(
    request?: AdminReservationListRequest
  ): Promise<PageResponse<ReservationDto>>;
  getSeatReservation(seat_id: string): Promise<ReservationDto | undefined>;
  seats(request?: PageRequest): Promise<PageResponse<AdminSeatOverviewDto>>;
  releaseSeat(request: AdminReleaseSeatRequest): Promise<SeatDetailDto>;
  setSeatMaintenance(request: UpdateSeatMaintenanceRequest): Promise<AdminSeatDetailDto>;
  setDeviceMaintenance(request: UpdateDeviceMaintenanceRequest): Promise<AdminDeviceDto>;
  noShows(request?: PageRequest): Promise<PageResponse<NoShowRecordDto>>;
  anomalies(request?: AnomalyListRequest): Promise<PageResponse<AnomalyEventDto>>;
  getAnomaly(event_id: string): Promise<AnomalyEventDto>;
  handleAnomaly(request: HandleAnomalyRequest): Promise<AnomalyEventDto>;
  getSystemConfig(): Promise<AdminSystemConfigDto>;
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

function createCancelReservationMethod(transport: ApiTransport): ReservationsApi['cancel'] {
  const cancel = (
    reservationOrRequest: string | CancelReservationRequest,
    request?: Omit<CancelReservationRequest, 'reservation_id'>
  ): Promise<ReservationDto> => {
    const reservationId =
      typeof reservationOrRequest === 'string'
        ? reservationOrRequest
        : reservationOrRequest.reservation_id;
    const body =
      typeof reservationOrRequest === 'string' ? request : { reason: reservationOrRequest.reason };

    return transport.request({
      operation_id: 'reservations.cancel',
      method: 'DELETE',
      path: `/reservations/${encodeURIComponent(reservationId)}`,
      body
    });
  };

  return cancel as ReservationsApi['cancel'];
}

export function createSmartSeatApiClient(transport: ApiTransport): SmartSeatApiClient {
  return {
    auth: {
      getLoginMode: () =>
        transport.request({
          operation_id: 'auth.getLoginMode',
          method: 'GET',
          path: '/auth/mode'
        }),
      loginWechat: (request) =>
        transport.request({
          operation_id: 'auth.loginWechat',
          method: 'POST',
          path: '/auth/wechat/login',
          body: request
        }),
      getOidcAuthorizeUrl: () =>
        transport.request({
          operation_id: 'auth.getOidcAuthorizeUrl',
          method: 'GET',
          path: '/auth/oidc/authorize-url'
        }),
      startOidc: () =>
        transport.request({
          operation_id: 'auth.getOidcAuthorizeUrl',
          method: 'GET',
          path: '/auth/oidc/authorize-url'
        }),
      completeOidc: (request) =>
        transport.request({
          operation_id: 'auth.completeOidc',
          method: 'POST',
          path: '/auth/oidc/callback',
          body: request
        })
    },
    me: {
      get: () =>
        transport.request({
          operation_id: 'me.get',
          method: 'GET',
          path: '/me'
        }),
      updateLeaderboardPreference: (request) =>
        transport.request({
          operation_id: 'me.updateLeaderboardPreference',
          method: 'PATCH',
          path: '/me/leaderboard-preference',
          body: request
        })
    },
    seats: {
      list: (request) =>
        transport.request({
          operation_id: 'seats.list',
          method: 'GET',
          path: '/seats',
          query: request
        }),
      get: (seat_id) =>
        transport.request({
          operation_id: 'seats.get',
          method: 'GET',
          path: `/seats/${encodeURIComponent(seat_id)}`
        })
    },
    devices: {
      list: (request) =>
        transport.request({
          operation_id: 'devices.list',
          method: 'GET',
          path: '/devices',
          query: request
        }),
      get: (device_id) =>
        transport.request({
          operation_id: 'devices.get',
          method: 'GET',
          path: `/devices/${encodeURIComponent(device_id)}`
        })
    },
    reservations: {
      create: (request) =>
        transport.request({
          operation_id: 'reservations.create',
          method: 'POST',
          path: '/reservations',
          body: request
        }),
      cancel: createCancelReservationMethod(transport),
      extend: (request) =>
        transport.request({
          operation_id: 'reservations.extend',
          method: 'POST',
          path: `/reservations/${encodeURIComponent(request.reservation_id)}/extend`,
          body: request
        }),
      releaseByUser: (request) =>
        transport.request({
          operation_id: 'reservations.releaseByUser',
          method: 'POST',
          path: '/current-usage/release',
          body: request
        }),
      current: () =>
        transport.request({
          operation_id: 'reservations.current',
          method: 'GET',
          path: '/reservations/current'
        }),
      currentUsage: () =>
        transport.request({
          operation_id: 'reservations.currentUsage',
          method: 'GET',
          path: '/current-usage'
        }),
      history: (request) =>
        transport.request({
          operation_id: 'reservations.history',
          method: 'GET',
          path: '/reservations/history',
          query: request
        })
    },
    checkin: {
      submit: (request) =>
        transport.request({
          operation_id: 'checkin.submit',
          method: 'POST',
          path: '/checkin',
          body: request
        })
    },
    anomalies: {
      list: (request) =>
        transport.request({
          operation_id: 'anomalies.list',
          method: 'GET',
          path: '/admin/anomalies',
          query: request
        }),
      handle: (request) =>
        transport.request({
          operation_id: 'anomalies.handle',
          method: 'POST',
          path: '/admin/anomalies/handle',
          body: request
        })
    },
    stats: {
      getMe: () =>
        transport.request({
          operation_id: 'stats.getMe',
          method: 'GET',
          path: '/stats/me'
        })
    },
    leaderboard: {
      get: (request) =>
        transport.request({
          operation_id: 'leaderboard.get',
          method: 'GET',
          path: '/leaderboard',
          query: request
        })
    },
    admin: {
      dashboard: () =>
        transport.request({
          operation_id: 'admin.dashboard',
          method: 'GET',
          path: '/admin/dashboard'
        }),
      listSeats: (request) =>
        transport.request({
          operation_id: 'admin.listSeats',
          method: 'GET',
          path: '/admin/seats',
          query: request
        }),
      getSeat: (seat_id) =>
        transport.request({
          operation_id: 'admin.getSeat',
          method: 'GET',
          path: `/admin/seats/${encodeURIComponent(seat_id)}`
        }),
      createSeat: (request) =>
        transport.request({
          operation_id: 'admin.createSeat',
          method: 'POST',
          path: '/admin/seats',
          body: request
        }),
      updateSeat: (seat_id, request) =>
        transport.request({
          operation_id: 'admin.updateSeat',
          method: 'PATCH',
          path: `/admin/seats/${encodeURIComponent(seat_id)}`,
          body: request
        }),
      setSeatEnabled: (seat_id, request) =>
        transport.request({
          operation_id: 'admin.setSeatEnabled',
          method: 'PATCH',
          path: `/admin/seats/${encodeURIComponent(seat_id)}/enabled`,
          body: request
        }),
      listDevices: (request) =>
        transport.request({
          operation_id: 'admin.listDevices',
          method: 'GET',
          path: '/admin/devices',
          query: request
        }),
      getDevice: (device_id) =>
        transport.request({
          operation_id: 'admin.getDevice',
          method: 'GET',
          path: `/admin/devices/${encodeURIComponent(device_id)}`
        }),
      createDevice: (request) =>
        transport.request({
          operation_id: 'admin.createDevice',
          method: 'POST',
          path: '/admin/devices',
          body: request
        }),
      updateDevice: (device_id, request) =>
        transport.request({
          operation_id: 'admin.updateDevice',
          method: 'PATCH',
          path: `/admin/devices/${encodeURIComponent(device_id)}`,
          body: request
        }),
      bindDeviceSeat: (device_id, request) =>
        transport.request({
          operation_id: 'admin.bindDeviceSeat',
          method: 'PUT',
          path: `/admin/devices/${encodeURIComponent(device_id)}/binding`,
          body: request
        }),
      unbindDeviceSeat: (device_id, request) =>
        transport.request({
          operation_id: 'admin.unbindDeviceSeat',
          method: 'POST',
          path: `/admin/devices/${encodeURIComponent(device_id)}/unbind`,
          body: request
        }),
      listCurrentReservations: (request) =>
        transport.request({
          operation_id: 'admin.listCurrentReservations',
          method: 'GET',
          path: '/admin/reservations/current',
          query: request
        }),
      getSeatReservation: (seat_id) =>
        transport.request({
          operation_id: 'admin.getSeatReservation',
          method: 'GET',
          path: `/admin/reservations/seats/${encodeURIComponent(seat_id)}`
        }),
      seats: (request) =>
        transport.request({
          operation_id: 'admin.listSeats',
          method: 'GET',
          path: '/admin/seats',
          query: request
        }),
      releaseSeat: (request) =>
        transport.request({
          operation_id: 'admin.releaseSeat',
          method: 'POST',
          path: '/admin/seats/release',
          body: request
        }),
      setSeatMaintenance: (request) =>
        transport.request({
          operation_id: 'admin.setSeatMaintenance',
          method: 'POST',
          path: '/admin/seats/maintenance',
          body: request
        }),
      setDeviceMaintenance: (request) =>
        transport.request({
          operation_id: 'admin.setDeviceMaintenance',
          method: 'POST',
          path: '/admin/devices/maintenance',
          body: request
        }),
      noShows: (request) =>
        transport.request({
          operation_id: 'admin.noShows',
          method: 'GET',
          path: '/admin/no-shows',
          query: request
        }),
      anomalies: (request) =>
        transport.request({
          operation_id: 'admin.anomalies',
          method: 'GET',
          path: '/admin/anomalies',
          query: request
        }),
      getAnomaly: (event_id) =>
        transport.request({
          operation_id: 'admin.getAnomaly',
          method: 'GET',
          path: `/admin/anomalies/${encodeURIComponent(event_id)}`
        }),
      handleAnomaly: (request) =>
        transport.request({
          operation_id: 'admin.handleAnomaly',
          method: 'POST',
          path: '/admin/anomalies/handle',
          body: request
        }),
      getSystemConfig: () =>
        transport.request({
          operation_id: 'admin.getSystemConfig',
          method: 'GET',
          path: '/admin/config'
        }),
      getAuthConfig: () =>
        transport.request({
          operation_id: 'admin.getAuthConfig',
          method: 'GET',
          path: '/admin/auth/mode'
        }),
      updateAuthConfig: (request) =>
        transport.request({
          operation_id: 'admin.updateAuthConfig',
          method: 'PUT',
          path: '/admin/auth/mode',
          body: request
        }),
      actionLogs: (request) =>
        transport.request({
          operation_id: 'admin.actionLogs',
          method: 'GET',
          path: '/admin/action-logs',
          query: request
        })
    }
  };
}

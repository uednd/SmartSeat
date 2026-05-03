import type {
  AdminActionType,
  AnomalyStatus,
  AnomalyType,
  AuthMode,
  AuthProvider,
  DeviceOnlineStatus,
  LeaderboardMetric,
  PresenceStatus,
  QRTokenStatus,
  ReservationStatus,
  SeatAvailability,
  SeatStatus,
  SeatUnavailableReason,
  SensorHealthStatus,
  UserRole
} from './enums.js';

export type IsoDateTimeString = string;
export type EntityId = string;

export interface PageRequest {
  page?: number;
  page_size?: number;
}

export interface PageResponse<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

export interface TimeRangeRequest {
  start_time?: IsoDateTimeString;
  end_time?: IsoDateTimeString;
}

export enum ApiErrorCode {
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  AUTH_INVALID_TOKEN = 'AUTH_INVALID_TOKEN',
  AUTH_LOGIN_MODE_MISMATCH = 'AUTH_LOGIN_MODE_MISMATCH',
  AUTH_PROVIDER_FAILED = 'AUTH_PROVIDER_FAILED',
  FORBIDDEN = 'FORBIDDEN',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  PAYLOAD_INVALID = 'PAYLOAD_INVALID',
  STATE_CONFLICT = 'STATE_CONFLICT',
  SEAT_UNAVAILABLE = 'SEAT_UNAVAILABLE',
  RESERVATION_CONFLICT = 'RESERVATION_CONFLICT',
  RESERVATION_NOT_ACTIVE = 'RESERVATION_NOT_ACTIVE',
  CHECKIN_WINDOW_CLOSED = 'CHECKIN_WINDOW_CLOSED',
  QR_TOKEN_EXPIRED = 'QR_TOKEN_EXPIRED',
  QR_TOKEN_USED = 'QR_TOKEN_USED',
  CHECKIN_DUPLICATED = 'CHECKIN_DUPLICATED',
  DEVICE_OFFLINE = 'DEVICE_OFFLINE',
  MQTT_PAYLOAD_INVALID = 'MQTT_PAYLOAD_INVALID',
  SECRET_NOT_CONFIGURED = 'SECRET_NOT_CONFIGURED',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

export interface ApiErrorResponse {
  code: ApiErrorCode;
  message: string;
  request_id?: string;
  details?: Record<string, unknown>;
}

export interface ApiSuccessResponse<T> {
  data: T;
  request_id?: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface UserDto {
  user_id: EntityId;
  auth_provider: AuthProvider;
  roles: UserRole[];
  anonymous_name: string;
  display_name?: string;
  avatar_url?: string;
  leaderboard_enabled: boolean;
  no_show_count_week: number;
  no_show_count_month: number;
  created_at: IsoDateTimeString;
  updated_at: IsoDateTimeString;
}

export interface AuthConfigPublicDto {
  auth_mode: AuthMode;
  oidc_issuer?: string;
  oidc_client_id?: string;
  oidc_redirect_uri?: string;
  oidc_secret_configured: boolean;
  wechat_appid?: string;
  wechat_secret_configured: boolean;
  admin_mapping_rule?: string;
  updated_by?: EntityId;
  updated_at?: IsoDateTimeString;
}

export interface LoginModeResponse {
  auth_mode: AuthMode;
  config: AuthConfigPublicDto;
}

export interface WechatLoginRequest {
  code: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface OidcStartRequest {
  redirect_uri?: string;
}

export interface OidcStartResponse {
  authorization_url: string;
  state: string;
}

export interface OidcCallbackRequest {
  code: string;
  state: string;
}

export interface AuthSessionResponse {
  token: string;
  token_type: 'Bearer';
  expires_at: IsoDateTimeString;
  user: UserDto;
  role: UserRole;
  roles: UserRole[];
  next_route: 'student' | 'admin';
}

export interface MeResponse {
  user_id: EntityId;
  role: UserRole;
  display_name: string;
  anonymous_name: string;
  user: UserDto;
  roles: UserRole[];
  auth_mode: AuthMode;
  next_route: 'student' | 'admin';
}

export interface SeatDto {
  seat_id: EntityId;
  seat_no: string;
  area: string;
  business_status: SeatStatus;
  availability_status: SeatAvailability;
  unavailable_reason?: SeatUnavailableReason;
  device_id?: EntityId;
  presence_status: PresenceStatus;
  updated_at: IsoDateTimeString;
}

export interface SeatDetailDto extends SeatDto {
  current_reservation?: ReservationSummaryDto;
  device?: DeviceDto;
  active_anomaly_count: number;
}

export interface SeatListRequest extends PageRequest {
  availability_status?: SeatAvailability;
}

export interface DeviceDto {
  device_id: EntityId;
  seat_id: EntityId;
  mqtt_client_id: string;
  online_status: DeviceOnlineStatus;
  last_heartbeat_at?: IsoDateTimeString;
  sensor_status: SensorHealthStatus;
  sensor_model?: string;
  firmware_version?: string;
  network_status?: string;
  created_at: IsoDateTimeString;
  updated_at: IsoDateTimeString;
}

export interface DeviceListRequest extends PageRequest {
  online_status?: DeviceOnlineStatus;
}

export interface ReservationSummaryDto {
  reservation_id: EntityId;
  user_id: EntityId;
  seat_id: EntityId;
  start_time: IsoDateTimeString;
  end_time: IsoDateTimeString;
  status: ReservationStatus;
}

export interface ReservationDto extends ReservationSummaryDto {
  checkin_start_time: IsoDateTimeString;
  checkin_deadline: IsoDateTimeString;
  checked_in_at?: IsoDateTimeString;
  released_at?: IsoDateTimeString;
  release_reason?: string;
  created_at: IsoDateTimeString;
}

export interface CreateReservationRequest {
  seat_id: EntityId;
  start_time: IsoDateTimeString;
  end_time: IsoDateTimeString;
}

export interface CancelReservationRequest {
  reservation_id: EntityId;
  reason?: string;
}

export interface ExtendReservationRequest {
  reservation_id: EntityId;
  end_time: IsoDateTimeString;
}

export interface UserReleaseReservationRequest {
  reservation_id: EntityId;
  reason?: string;
}

export interface CurrentUsageResponse {
  reservation: ReservationDto;
  seat: SeatDto;
  remaining_seconds: number;
}

export interface QRCodeContentDto {
  seat_id: EntityId;
  device_id: EntityId;
  token: string;
  timestamp: IsoDateTimeString;
}

export interface QRTokenDto extends QRCodeContentDto {
  token_id: EntityId;
  generated_at: IsoDateTimeString;
  expired_at: IsoDateTimeString;
  used_at?: IsoDateTimeString;
  status: QRTokenStatus;
}

export interface CheckinRequest {
  seat_id: EntityId;
  device_id: EntityId;
  token: string;
  timestamp: IsoDateTimeString;
}

export interface CheckinResponse {
  reservation: ReservationDto;
  seat: SeatDto;
  checked_in_at: IsoDateTimeString;
}

export interface NoShowRecordDto {
  reservation_id: EntityId;
  user_id: EntityId;
  seat_id: EntityId;
  seat_no: string;
  start_time: IsoDateTimeString;
  released_at: IsoDateTimeString;
}

export interface AnomalyEventDto {
  event_id: EntityId;
  event_type: AnomalyType;
  seat_id: EntityId;
  user_id?: EntityId;
  device_id?: EntityId;
  reservation_id?: EntityId;
  description: string;
  status: AnomalyStatus;
  created_at: IsoDateTimeString;
  handled_by?: EntityId;
  handled_at?: IsoDateTimeString;
  handle_note?: string;
}

export interface AnomalyListRequest extends PageRequest {
  status?: AnomalyStatus;
  event_type?: AnomalyType;
  seat_id?: EntityId;
}

export interface HandleAnomalyRequest {
  event_id: EntityId;
  status: Extract<AnomalyStatus, AnomalyStatus.HANDLED | AnomalyStatus.IGNORED>;
  handle_note?: string;
}

export interface StudyRecordDto {
  record_id: EntityId;
  user_id: EntityId;
  reservation_id: EntityId;
  seat_id: EntityId;
  start_time: IsoDateTimeString;
  end_time: IsoDateTimeString;
  duration_minutes: number;
  valid_flag: boolean;
  invalid_reason?: string;
  created_at: IsoDateTimeString;
}

export interface StudyStatsDto {
  user_id: EntityId;
  week_visit_count: number;
  week_duration_minutes: number;
  streak_days: number;
  no_show_count_week: number;
  no_show_count_month: number;
  recent_records: StudyRecordDto[];
}

export interface LeaderboardEntryDto {
  rank: number;
  user_id?: EntityId;
  anonymous_name: string;
  metric: LeaderboardMetric;
  value: number;
  is_current_user: boolean;
}

export interface LeaderboardRequest {
  metric: LeaderboardMetric;
  week_start?: IsoDateTimeString;
}

export interface LeaderboardResponse {
  metric: LeaderboardMetric;
  week_start: IsoDateTimeString;
  entries: LeaderboardEntryDto[];
  current_user_entry?: LeaderboardEntryDto;
}

export interface UpdateLeaderboardPreferenceRequest {
  leaderboard_enabled: boolean;
}

export interface AdminDashboardDto {
  seat_count: number;
  online_device_count: number;
  offline_device_count: number;
  pending_anomaly_count: number;
  reservation_count_today: number;
  no_show_count_today: number;
}

export interface AdminSeatOverviewDto extends SeatDetailDto {
  remaining_seconds?: number;
}

export interface AdminReleaseSeatRequest {
  seat_id: EntityId;
  reservation_id?: EntityId;
  reason: string;
  restore_availability: boolean;
}

export interface UpdateSeatMaintenanceRequest {
  seat_id: EntityId;
  maintenance: boolean;
  reason?: string;
}

export interface UpdateAuthConfigRequest {
  auth_mode: AuthMode;
  oidc_issuer?: string;
  oidc_client_id?: string;
  oidc_client_secret?: string;
  oidc_redirect_uri?: string;
  admin_mapping_rule?: string;
  wechat_appid?: string;
  wechat_secret?: string;
}

export interface AdminActionLogDto {
  log_id: EntityId;
  admin_id: EntityId;
  action_type: AdminActionType;
  target_type: 'seat' | 'device' | 'reservation' | 'anomaly' | 'auth_config';
  target_id: EntityId;
  reason?: string;
  detail?: Record<string, unknown>;
  created_at: IsoDateTimeString;
}

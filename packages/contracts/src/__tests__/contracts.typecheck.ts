import {
  ApiErrorCode,
  AdminActionType,
  AnomalySource,
  AnomalyStatus,
  AnomalyType,
  AuthMode,
  DeviceCommandType,
  DeviceOnlineStatus,
  DisplayLayout,
  LeaderboardMetric,
  LeaderboardTimePeriod,
  LightMode,
  LightStatus,
  MqttDeviceEventType,
  PresenceStatus,
  QRTokenStatus,
  ReservationStatus,
  SeatAvailability,
  SeatStatus,
  SensorHealthStatus,
  StudyRecordSource,
  buildMqttTopic,
  type AdminActionLogDto,
  type AdminDeviceDto,
  type AdminReleaseSeatRequest,
  type AdminReservationListRequest,
  type AdminSeatDetailDto,
  type AdminSystemConfigDto,
  type AnomalyEventDto,
  type ApiErrorResponse,
  type BindDeviceSeatRequest,
  type CheckinRequest,
  type CreateDeviceRequest,
  type CreateReservationRequest,
  type CreateSeatRequest,
  type CurrentUsageResponse,
  type ExtendReservationRequest,
  type HandleAnomalyRequest,
  type LeaderboardRequest,
  type LeaderboardResponse,
  type MqttCommandPayload,
  type MqttDisplayPayload,
  type MqttHeartbeatPayload,
  type MqttLightPayload,
  type MqttPresencePayload,
  type QRTokenDto,
  type ReservationDto,
  type ReservationHistoryRequest,
  type SeatDetailDto,
  type SeatDto,
  type SetSeatEnabledRequest,
  type StudyRecordDto,
  type StudyStatsDto,
  type UpdateDeviceMaintenanceRequest,
  type UpdateDeviceRequest,
  type UpdateSeatMaintenanceRequest,
  type UpdateSeatRequest,
  type UserReleaseReservationRequest
} from '../index.js';

const seat = {
  seat_id: 'seat-1',
  seat_no: 'A-001',
  area: 'demo',
  business_status: SeatStatus.FREE,
  availability_status: SeatAvailability.AVAILABLE,
  presence_status: PresenceStatus.UNKNOWN,
  updated_at: '2026-05-02T00:00:00.000Z'
} satisfies SeatDto;

const error = {
  code: ApiErrorCode.SEAT_UNAVAILABLE,
  message: 'Seat is unavailable.'
} satisfies ApiErrorResponse;

const heartbeat = {
  device_id: 'device-1',
  seat_id: 'seat-1',
  timestamp: '2026-05-02T00:00:00.000Z',
  firmware_version: '0.0.1',
  network_status: 'wifi:ok',
  sensor_status: SensorHealthStatus.OK,
  display_status: DisplayLayout.FREE
} satisfies MqttHeartbeatPayload;

const presence = {
  device_id: 'device-1',
  seat_id: 'seat-1',
  timestamp: '2026-05-02T00:00:00.000Z',
  presence_status: PresenceStatus.PRESENT,
  raw_value: {
    distance_mm: 800
  }
} satisfies MqttPresencePayload;

const display = {
  device_id: 'device-1',
  seat_id: 'seat-1',
  timestamp: '2026-05-02T00:00:00.000Z',
  seat_status: SeatStatus.RESERVED,
  current_time: '2026-05-02T00:00:00.000Z',
  remaining_seconds: 900,
  checkin_deadline: '2026-05-02T00:15:00.000Z',
  qr_token: 'demo-token',
  layout: DisplayLayout.RESERVED
} satisfies MqttDisplayPayload;

const qrContent = {
  device_id: display.device_id,
  seat_id: display.seat_id,
  token: display.qr_token,
  timestamp: display.timestamp
} satisfies CheckinRequest;

const light = {
  device_id: 'device-1',
  seat_id: 'seat-1',
  timestamp: '2026-05-02T00:00:00.000Z',
  light_status: LightStatus.RESERVED,
  color: 'amber',
  mode: LightMode.SLOW_BLINK,
  blink_hz: 0.5
} satisfies MqttLightPayload;

const command = {
  device_id: 'device-1',
  seat_id: 'seat-1',
  timestamp: '2026-05-02T00:00:00.000Z',
  command_id: 'command-1',
  command_type: DeviceCommandType.REFRESH_STATE,
  issued_at: '2026-05-02T00:00:00.000Z'
} satisfies MqttCommandPayload;

const token = {
  token_id: 'token-1',
  token: 'demo-token',
  seat_id: 'seat-1',
  device_id: 'device-1',
  timestamp: '2026-05-02T00:00:00.000Z',
  generated_at: '2026-05-02T00:00:00.000Z',
  expired_at: '2026-05-02T00:00:30.000Z',
  status: QRTokenStatus.UNUSED
} satisfies QRTokenDto;

const invalidatedToken = {
  ...token,
  token_id: 'token-invalidated',
  token: 'invalidated-token',
  status: QRTokenStatus.INVALIDATED
} satisfies QRTokenDto;

const checkin = {
  seat_id: 'seat-1',
  device_id: 'device-1',
  token: token.token,
  timestamp: token.timestamp
} satisfies CheckinRequest;

const createReservation = {
  seat_id: 'seat-1',
  start_time: '2026-05-02T00:00:00.000Z',
  end_time: '2026-05-02T01:00:00.000Z'
} satisfies CreateReservationRequest;

const reservation = {
  reservation_id: 'reservation-1',
  user_id: 'user-1',
  seat_id: 'seat-1',
  start_time: '2026-05-02T00:00:00.000Z',
  end_time: '2026-05-02T01:00:00.000Z',
  status: ReservationStatus.CHECKED_IN,
  checkin_start_time: '2026-05-01T23:55:00.000Z',
  checkin_deadline: '2026-05-02T00:15:00.000Z',
  checked_in_at: '2026-05-02T00:01:00.000Z',
  created_at: '2026-05-01T23:00:00.000Z'
} satisfies ReservationDto;

const extendReservation = {
  reservation_id: reservation.reservation_id,
  end_time: '2026-05-02T01:30:00.000Z'
} satisfies ExtendReservationRequest;

const userReleaseReservation = {
  reservation_id: reservation.reservation_id,
  reason: 'leaving now'
} satisfies UserReleaseReservationRequest;

const currentUsage = {
  reservation,
  seat,
  remaining_seconds: 1200
} satisfies CurrentUsageResponse;

const studyRecord = {
  record_id: 'study-record-1',
  user_id: reservation.user_id,
  reservation_id: reservation.reservation_id,
  seat_id: reservation.seat_id,
  start_time: reservation.checked_in_at,
  end_time: '2026-05-02T01:00:00.000Z',
  duration_minutes: 59,
  source: StudyRecordSource.USER_RELEASED,
  valid_flag: true,
  created_at: '2026-05-02T01:00:00.000Z'
} satisfies StudyRecordDto;

const studyStats = {
  user_id: reservation.user_id,
  week_visit_count: 1,
  week_duration_minutes: 59,
  total_duration_minutes: 59,
  streak_days: 1,
  no_show_count_week: 0,
  no_show_count_month: 0,
  recent_records: [studyRecord]
} satisfies StudyStatsDto;

const leaderboardRequest = {
  metric: LeaderboardMetric.STUDY_DURATION,
  time_period: LeaderboardTimePeriod.THIS_WEEK
} satisfies LeaderboardRequest;

const leaderboard = {
  metric: LeaderboardMetric.STUDY_DURATION,
  time_period: LeaderboardTimePeriod.THIS_WEEK,
  period_start: '2026-04-27T16:00:00.000Z',
  period_end: '2026-05-04T16:00:00.000Z',
  entries: [
    {
      rank: 1,
      user_id: 'user_1',
      anonymous_name: '匿名用户 08',
      avatar_url: null,
      metric: LeaderboardMetric.STUDY_DURATION,
      value: 59,
      is_current_user: true
    }
  ],
  current_user_entry: {
    rank: 1,
    user_id: 'user_1',
    anonymous_name: '匿名用户 08',
    avatar_url: null,
    metric: LeaderboardMetric.STUDY_DURATION,
    value: 59,
    is_current_user: true
  }
} satisfies LeaderboardResponse;

const reservationHistory = {
  page: 1,
  page_size: 20
} satisfies ReservationHistoryRequest;

const adminReservationList = {
  seat_id: 'seat-1',
  page: 1
} satisfies AdminReservationListRequest;

const anomalyEvent = {
  event_id: 'anomaly-1',
  event_type: AnomalyType.UNRESERVED_OCCUPANCY,
  seat_id: 'seat-1',
  device_id: 'device-1',
  description: 'Seat is free but presence is stable PRESENT.',
  source: AnomalySource.SCHEDULER,
  status: AnomalyStatus.PENDING,
  reason: 'IDLE_SEAT_PRESENT_STABLE',
  created_at: '2026-05-02T00:00:00.000Z'
} satisfies AnomalyEventDto;

const acknowledgedAnomalyEvent = {
  ...anomalyEvent,
  event_id: 'anomaly-acknowledged',
  status: AnomalyStatus.ACKNOWLEDGED,
  handled_by: 'admin-1',
  handled_at: '2026-05-02T00:05:00.000Z',
  handle_note: 'confirmed by administrator'
} satisfies AnomalyEventDto;

const handleAnomaly = {
  event_id: anomalyEvent.event_id,
  status: AnomalyStatus.CLOSED,
  handle_note: 'closed after manual verification'
} satisfies HandleAnomalyRequest;

const seatDetail = {
  ...seat,
  current_occupancy: {
    reservation_id: 'reservation-1',
    seat_id: 'seat-1',
    start_time: '2026-05-02T00:00:00.000Z',
    end_time: '2026-05-02T01:00:00.000Z',
    status: ReservationStatus.WAITING_CHECKIN
  },
  device: {
    device_id: 'device-1',
    seat_id: 'seat-1',
    online_status: DeviceOnlineStatus.ONLINE,
    last_heartbeat_at: '2026-05-02T00:00:00.000Z',
    firmware_version: '0.0.1',
    created_at: '2026-05-02T00:00:00.000Z',
    updated_at: '2026-05-02T00:00:00.000Z'
  }
} satisfies SeatDetailDto;

const adminSeatDetail = {
  ...seat,
  maintenance: false,
  active_anomaly_count: 0,
  current_reservation: {
    reservation_id: 'reservation-1',
    user_id: 'user-1',
    seat_id: 'seat-1',
    start_time: '2026-05-02T00:00:00.000Z',
    end_time: '2026-05-02T01:00:00.000Z',
    status: ReservationStatus.WAITING_CHECKIN
  }
} satisfies AdminSeatDetailDto;

const adminDevice = {
  device_id: 'device-1',
  seat_id: 'seat-1',
  mqtt_client_id: 'smartseat-device-1',
  online_status: DeviceOnlineStatus.ONLINE,
  sensor_status: SensorHealthStatus.OK,
  maintenance: false,
  firmware_version: '0.0.1',
  hardware_version: 'esp32-p4',
  network_status: 'wifi:ok',
  created_at: '2026-05-02T00:00:00.000Z',
  updated_at: '2026-05-02T00:00:00.000Z',
  seat
} satisfies AdminDeviceDto;

const createSeat = {
  seat_no: 'A-002',
  area: 'demo'
} satisfies CreateSeatRequest;

const updateSeat = {
  area: 'demo-updated'
} satisfies UpdateSeatRequest;

const setSeatEnabled = {
  enabled: false,
  reason: 'maintenance'
} satisfies SetSeatEnabledRequest;

const adminReleaseSeat = {
  seat_id: 'seat-1',
  reservation_id: reservation.reservation_id,
  reason: 'administrator release',
  restore_availability: true,
  exclude_study_record: true
} satisfies AdminReleaseSeatRequest;

const updateSeatMaintenance = {
  seat_id: 'seat-1',
  maintenance: true,
  reason: 'terminal inspection'
} satisfies UpdateSeatMaintenanceRequest;

const updateDeviceMaintenance = {
  device_id: 'device-1',
  maintenance: false,
  reason: 'terminal inspection complete'
} satisfies UpdateDeviceMaintenanceRequest;

const adminSystemConfig = {
  auth: {
    auth_mode: AuthMode.WECHAT,
    oidc_secret_configured: false,
    wechat_secret_configured: true
  },
  mqtt: {
    enabled: true,
    connected: false,
    heartbeat_offline_threshold_seconds: 30
  },
  presence: {
    evaluation_enabled: true,
    present_stable_seconds: 3,
    absent_stable_seconds: 10,
    untrusted_stable_seconds: 5
  },
  auto_rules: {
    enabled: true,
    no_show_enabled: true,
    usage_enabled: true,
    occupancy_anomalies_enabled: true,
    device_reconcile_enabled: true,
    sensor_error_enabled: true,
    no_show_interval_seconds: 30,
    usage_interval_seconds: 30,
    occupancy_anomaly_interval_seconds: 30,
    device_reconcile_interval_seconds: 30,
    ending_soon_window_seconds: 300
  },
  checkin: {
    enabled: true,
    qr_token_refresh_seconds: 15,
    qr_token_ttl_seconds: 30
  }
} satisfies AdminSystemConfigDto;

const adminActionLog = {
  log_id: 'log-1',
  admin_id: 'admin-1',
  action_type: AdminActionType.CLOSE_ANOMALY,
  target_type: 'anomaly',
  target_id: 'anomaly-1',
  reason: 'closed',
  detail: {
    previous_status: AnomalyStatus.ACKNOWLEDGED,
    status: AnomalyStatus.CLOSED
  },
  created_at: '2026-05-02T00:00:00.000Z'
} satisfies AdminActionLogDto;

const createDevice = {
  mqtt_client_id: 'smartseat-device-2',
  firmware_version: '0.0.1'
} satisfies CreateDeviceRequest;

const updateDevice = {
  firmware_version: '0.0.2'
} satisfies UpdateDeviceRequest;

const bindDeviceSeat = {
  seat_id: 'seat-1',
  reason: 'demo binding'
} satisfies BindDeviceSeatRequest;

const topic = buildMqttTopic('device-1', 'heartbeat');

const eventType = MqttDeviceEventType.COMMAND_ACK;

void seat;
void error;
void heartbeat;
void presence;
void display;
void light;
void command;
void token;
void invalidatedToken;
void checkin;
void qrContent;
void createReservation;
void reservation;
void extendReservation;
void userReleaseReservation;
void currentUsage;
void studyRecord;
void studyStats;
void leaderboardRequest;
void leaderboard;
void reservationHistory;
void adminReservationList;
void anomalyEvent;
void acknowledgedAnomalyEvent;
void handleAnomaly;
void seatDetail;
void adminSeatDetail;
void adminDevice;
void createSeat;
void updateSeat;
void setSeatEnabled;
void adminReleaseSeat;
void updateSeatMaintenance;
void updateDeviceMaintenance;
void adminSystemConfig;
void adminActionLog;
void createDevice;
void updateDevice;
void bindDeviceSeat;
void topic;
void eventType;

const invalidSeat = {
  seat_id: 'seat-1',
  seat_no: 'A-001',
  area: 'demo',
  // @ts-expect-error seat status must come from SeatStatus.
  business_status: 'BROKEN',
  availability_status: SeatAvailability.AVAILABLE,
  presence_status: PresenceStatus.UNKNOWN,
  updated_at: '2026-05-02T00:00:00.000Z'
} satisfies SeatDto;

const missingDeviceId = {
  seat_id: 'seat-1',
  timestamp: '2026-05-02T00:00:00.000Z',
  firmware_version: '0.0.1',
  network_status: 'wifi:ok',
  sensor_status: SensorHealthStatus.OK,
  display_status: DisplayLayout.FREE
  // @ts-expect-error MQTT heartbeat payload requires device_id.
} satisfies MqttHeartbeatPayload;

const missingErrorCode = {
  message: 'Missing code.'
  // @ts-expect-error API error response requires a stable code.
} satisfies ApiErrorResponse;

// @ts-expect-error reservation status rejects arbitrary strings.
const invalidReservationStatus: ReservationStatus = 'ACTIVE';

void invalidSeat;
void missingDeviceId;
void missingErrorCode;
void invalidReservationStatus;

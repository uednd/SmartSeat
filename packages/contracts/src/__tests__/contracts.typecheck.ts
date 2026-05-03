import {
  ApiErrorCode,
  DeviceCommandType,
  DeviceOnlineStatus,
  DisplayLayout,
  LightMode,
  LightStatus,
  MqttDeviceEventType,
  PresenceStatus,
  QRTokenStatus,
  ReservationStatus,
  SeatAvailability,
  SeatStatus,
  SensorHealthStatus,
  buildMqttTopic,
  type AdminDeviceDto,
  type AdminReservationListRequest,
  type AdminSeatDetailDto,
  type ApiErrorResponse,
  type BindDeviceSeatRequest,
  type CheckinRequest,
  type CreateDeviceRequest,
  type CreateReservationRequest,
  type CreateSeatRequest,
  type MqttCommandPayload,
  type MqttDisplayPayload,
  type MqttHeartbeatPayload,
  type MqttLightPayload,
  type MqttPresencePayload,
  type QRTokenDto,
  type ReservationHistoryRequest,
  type SeatDetailDto,
  type SeatDto,
  type SetSeatEnabledRequest,
  type UpdateDeviceRequest,
  type UpdateSeatRequest
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

const reservationHistory = {
  page: 1,
  page_size: 20
} satisfies ReservationHistoryRequest;

const adminReservationList = {
  seat_id: 'seat-1',
  page: 1
} satisfies AdminReservationListRequest;

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
void checkin;
void createReservation;
void reservationHistory;
void adminReservationList;
void seatDetail;
void adminSeatDetail;
void adminDevice;
void createSeat;
void updateSeat;
void setSeatEnabled;
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

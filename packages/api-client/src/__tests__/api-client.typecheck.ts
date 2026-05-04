import {
  ApiClientError,
  ApiErrorCode,
  createHttpTransport,
  createSmartSeatApiClient,
  isApiErrorResponse,
  type ApiTransport,
  type ApiTransportRequest,
  type SmartSeatApiClient
} from '../index.js';
import { AnomalyStatus, AuthMode } from '@smartseat/contracts';

const transport: ApiTransport = {
  async request<TResponse>(request: ApiTransportRequest) {
    if (request.method === undefined || request.path === undefined) {
      throw new Error(`Missing HTTP binding for ${request.operation_id}.`);
    }

    if (request.operation_id === 'auth.getLoginMode') {
      return {
        auth_mode: 'WECHAT',
        config: {
          auth_mode: 'WECHAT',
          oidc_secret_configured: false,
          wechat_secret_configured: false
        }
      } as TResponse;
    }

    return undefined as TResponse;
  }
};

const client = createSmartSeatApiClient(transport) satisfies SmartSeatApiClient;
const loginMode = await client.auth.getLoginMode();
const wechatSession = await client.auth.loginWechat({ code: 'wx-code' });
const oidcStart = await client.auth.getOidcAuthorizeUrl();
const oidcSession = await client.auth.completeOidc({ code: 'oidc-code', state: 'oidc-state' });
const me = await client.me.get();
const updatedMePreference = await client.me.updateLeaderboardPreference({
  leaderboard_enabled: false
});
const seats = await client.seats.list({ page: 1, page_size: 20 });
const seat = await client.seats.get('seat-1');
const devices = await client.devices.list({ page: 1 });
const device = await client.devices.get('device-1');
const adminSeats = await client.admin.listSeats({ page: 1 });
const adminSeat = await client.admin.getSeat('seat-1');
const createdSeat = await client.admin.createSeat({ seat_no: 'A-001', area: 'demo' });
const updatedSeat = await client.admin.updateSeat('seat-1', { area: 'updated' });
const enabledSeat = await client.admin.setSeatEnabled('seat-1', { enabled: true });
const adminDevices = await client.admin.listDevices({ page: 1 });
const adminDevice = await client.admin.getDevice('device-1');
const createdDevice = await client.admin.createDevice({ mqtt_client_id: 'smartseat-device-1' });
const updatedDevice = await client.admin.updateDevice('device-1', { firmware_version: '0.0.2' });
const boundDevice = await client.admin.bindDeviceSeat('device-1', { seat_id: 'seat-1' });
const unboundDevice = await client.admin.unbindDeviceSeat('device-1', {
  reason: 'replace terminal'
});
const createdReservation = await client.reservations.create({
  seat_id: 'seat-1',
  start_time: '2026-05-03T09:00:00.000Z',
  end_time: '2026-05-03T10:00:00.000Z'
});
const currentReservation = await client.reservations.current();
const currentUsage = await client.reservations.currentUsage();
const reservationHistory = await client.reservations.history({ page: 1 });
const extendedReservation = await client.reservations.extend({
  reservation_id: 'reservation-1',
  end_time: '2026-05-03T10:30:00.000Z'
});
const userReleasedReservation = await client.reservations.releaseByUser({
  reservation_id: 'reservation-1',
  reason: 'leaving now'
});
const cancelledReservation = await client.reservations.cancel('reservation-1', {
  reason: 'plan changed'
});
const legacyCancelledReservation = await client.reservations.cancel({
  reservation_id: 'reservation-1',
  reason: 'plan changed'
});
const checkedInReservation = await client.checkin.submit({
  seat_id: 'seat-1',
  device_id: 'device-1',
  token: 'qr-token',
  timestamp: '2026-05-03T09:00:00.000Z'
});
const anomalyList = await client.anomalies.list({ page: 1 });
const handledAnomaly = await client.anomalies.handle({
  event_id: 'anomaly-1',
  status: AnomalyStatus.ACKNOWLEDGED,
  handle_note: 'acknowledged'
});
const adminReservations = await client.admin.listCurrentReservations({ page: 1 });
const adminSeatReservation = await client.admin.getSeatReservation('seat-1');
const adminDashboard = await client.admin.dashboard();
const adminReleasedSeat = await client.admin.releaseSeat({
  seat_id: 'seat-1',
  reason: 'administrator release',
  restore_availability: true
});
const adminMaintainedSeat = await client.admin.setSeatMaintenance({
  seat_id: 'seat-1',
  maintenance: true,
  reason: 'terminal inspection'
});
const adminMaintainedDevice = await client.admin.setDeviceMaintenance({
  device_id: 'device-1',
  maintenance: false,
  reason: 'terminal restored'
});
const adminNoShows = await client.admin.noShows({ page: 1 });
const adminAnomalies = await client.admin.anomalies({ status: AnomalyStatus.PENDING });
const adminAnomaly = await client.admin.getAnomaly('anomaly-1');
const handledAdminAnomaly = await client.admin.handleAnomaly({
  event_id: 'anomaly-1',
  status: AnomalyStatus.CLOSED,
  handle_note: 'closed by administrator'
});
const adminSystemConfig = await client.admin.getSystemConfig();
const adminAuthConfig = await client.admin.getAuthConfig();
const updatedAdminAuthConfig = await client.admin.updateAuthConfig({
  auth_mode: AuthMode.WECHAT
});
const adminActionLogs = await client.admin.actionLogs({ page: 1 });

const httpTransport = createHttpTransport({
  baseUrl: 'http://localhost:3000',
  token: async () => 'demo-token',
  operationResolver: (request) => {
    if (request.operation_id === 'auth.getLoginMode') {
      return {
        method: 'GET',
        path: '/auth/mode'
      };
    }

    return undefined;
  },
  fetch: async () => ({
    ok: false,
    status: 401,
    headers: {
      get: () => 'application/json'
    },
    text: async () =>
      JSON.stringify({
        code: ApiErrorCode.AUTH_REQUIRED,
        message: 'Authentication is required.'
      })
  })
});

const clientError = new ApiClientError({
  code: ApiErrorCode.PAYLOAD_INVALID,
  message: 'Invalid payload.'
});

const isErrorResponse = isApiErrorResponse(clientError.response);

void loginMode;
void wechatSession;
void oidcStart;
void oidcSession;
void me;
void updatedMePreference;
void seats;
void seat;
void devices;
void device;
void adminSeats;
void adminSeat;
void createdSeat;
void updatedSeat;
void enabledSeat;
void adminDevices;
void adminDevice;
void createdDevice;
void updatedDevice;
void boundDevice;
void unboundDevice;
void createdReservation;
void currentReservation;
void currentUsage;
void reservationHistory;
void extendedReservation;
void userReleasedReservation;
void cancelledReservation;
void legacyCancelledReservation;
void checkedInReservation;
void anomalyList;
void handledAnomaly;
void adminReservations;
void adminSeatReservation;
void adminDashboard;
void adminReleasedSeat;
void adminMaintainedSeat;
void adminMaintainedDevice;
void adminNoShows;
void adminAnomalies;
void adminAnomaly;
void handledAdminAnomaly;
void adminSystemConfig;
void adminAuthConfig;
void updatedAdminAuthConfig;
void adminActionLogs;
void httpTransport;
void clientError;
void isErrorResponse;

// @ts-expect-error client methods require typed request payloads.
void client.auth.loginWechat({ token: 'not-a-wechat-code' });

// @ts-expect-error transport requests require operation_id for OpenAPI binding.
const missingOperationId = {} satisfies ApiTransportRequest;

void missingOperationId;

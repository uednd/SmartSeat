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

const transport: ApiTransport = {
  async request<TResponse>(request: ApiTransportRequest) {
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
void httpTransport;
void clientError;
void isErrorResponse;

// @ts-expect-error client methods require typed request payloads.
void client.auth.loginWechat({ token: 'not-a-wechat-code' });

// @ts-expect-error transport requests require operation_id for OpenAPI binding.
const missingOperationId = {} satisfies ApiTransportRequest;

void missingOperationId;

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
void httpTransport;
void clientError;
void isErrorResponse;

// @ts-expect-error client methods require typed request payloads.
void client.auth.loginWechat({ token: 'not-a-wechat-code' });

// @ts-expect-error transport requests require operation_id for OpenAPI binding.
const missingOperationId = {} satisfies ApiTransportRequest;

void missingOperationId;

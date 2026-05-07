import {
  createHttpTransport,
  createSmartSeatApiClient,
  type ApiTransport
} from '@smartseat/api-client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

let transport: ApiTransport | null = null;

function getTransport(): ApiTransport {
  if (!transport) {
    transport = createHttpTransport({
      baseUrl: API_BASE_URL,
      token: getAuthToken
    });
  }
  return transport;
}

function getAuthToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(/(?:^|;\s*)auth_token=([^;]*)/);
  return match?.[1] ?? undefined;
}

export function setAuthTokenCookie(token: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `auth_token=${token}; path=/; samesite=lax`;
}

export function clearAuthTokenCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

export function hasAuthToken(): boolean {
  return getAuthToken() !== undefined;
}

let client: ReturnType<typeof createSmartSeatApiClient> | null = null;

export function getApiClient() {
  if (!client) {
    client = createSmartSeatApiClient(getTransport());
  }
  return client;
}

import { createHttpTransport, createSmartSeatApiClient } from '@smartseat/api-client';

import { getStoredToken } from '../stores/storage';
import { uniFetch } from './uni-transport';

const DEFAULT_API_BASE_URL = 'http://localhost:3000';
const API_TIMEOUT_MS = 10000;

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_SMARTSEAT_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL;
}

export function createMiniappApiClient() {
  return createSmartSeatApiClient(
    createHttpTransport({
      baseUrl: getApiBaseUrl(),
      token: () => getStoredToken(),
      fetch: uniFetch,
      timeout_ms: API_TIMEOUT_MS
    })
  );
}

export const smartSeatApiClient = createMiniappApiClient();

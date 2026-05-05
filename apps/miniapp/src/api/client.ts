import { createSmartSeatApiClient } from '@smartseat/api-client';

import { getStoredToken } from '../stores/storage';
import { createUniTransport } from './uni-transport';

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3000';
const API_TIMEOUT_MS = 10000;

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_SMARTSEAT_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL;
}

export function createMiniappApiClient() {
  return createSmartSeatApiClient(
    createUniTransport({
      baseUrl: getApiBaseUrl(),
      token: () => getStoredToken(),
      timeout_ms: API_TIMEOUT_MS
    })
  );
}

export const smartSeatApiClient = createMiniappApiClient();

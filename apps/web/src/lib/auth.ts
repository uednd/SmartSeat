import type { AuthSessionResponse } from '@smartseat/contracts';
import { getApiClient, setAuthTokenCookie, clearAuthTokenCookie } from './api';

export interface LoginResult {
  success: boolean;
  error?: string;
  data?: AuthSessionResponse;
}

export async function login(username: string, password: string): Promise<LoginResult> {
  try {
    const api = getApiClient();
    const response = await api.auth.loginPassword({ username, password });
    setAuthTokenCookie(response.token);
    return { success: true, data: response };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Login failed. Please try again.';
    return { success: false, error: message };
  }
}

export function logout(): void {
  clearAuthTokenCookie();
  window.location.href = '/login';
}

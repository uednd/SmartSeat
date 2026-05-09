import type { AuthSessionResponse, RegisterRequest } from '@smartseat/contracts';
import { getApiClient, setAuthTokenCookie, clearAuthTokenCookie } from './api';

export interface LoginResult {
  success: boolean;
  error?: string;
  notRegistered?: boolean;
  data?: AuthSessionResponse;
}

export interface RegisterResult {
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
    // Check if it's a "not registered" error
    const isNotRegistered =
      typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'AUTH_NOT_REGISTERED';
    return { success: false, error: message, notRegistered: isNotRegistered };
  }
}

export async function userRegister(request: RegisterRequest): Promise<RegisterResult> {
  try {
    const api = getApiClient();
    const response = await api.auth.register(request);
    setAuthTokenCookie(response.token);
    return { success: true, data: response };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Registration failed. Please try again.';
    return { success: false, error: message };
  }
}

export function logout(): void {
  clearAuthTokenCookie();
  window.location.href = '/login';
}

import {
  AuthMode,
  AuthProvider,
  UserRole,
  type AuthSessionResponse,
  type MeResponse
} from '@smartseat/contracts';
import { describe, expect, it, vi } from 'vitest';

import { createAuthStore, type AuthApiPort } from '../auth';
import { AUTH_SESSION_STORAGE_KEY, type StorageDriver } from '../storage';

function createMemoryStorage(): StorageDriver & { values: Map<string, string> } {
  const values = new Map<string, string>();

  return {
    values,
    getItem(key) {
      return values.get(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

function createSession(
  role: UserRole,
  expires_at = '2099-01-01T00:00:00.000Z'
): AuthSessionResponse {
  return {
    token: `token-${role}`,
    token_type: 'Bearer',
    expires_at,
    role,
    roles: [role],
    next_route: role === UserRole.ADMIN ? 'admin' : 'student',
    user: {
      user_id: `user-${role}`,
      auth_provider: AuthProvider.WECHAT,
      roles: [role],
      anonymous_name: '匿名用户',
      display_name: role,
      leaderboard_enabled: true,
      no_show_count_week: 0,
      no_show_count_month: 0,
      created_at: '2026-05-05T00:00:00.000Z',
      updated_at: '2026-05-05T00:00:00.000Z'
    }
  };
}

function createMe(role: UserRole): MeResponse {
  const session = createSession(role);

  return {
    user_id: session.user.user_id,
    role,
    display_name: session.user.display_name ?? session.user.anonymous_name,
    anonymous_name: session.user.anonymous_name,
    user: session.user,
    roles: [role],
    auth_mode: AuthMode.WECHAT,
    next_route: session.next_route
  };
}

function createApi(session: AuthSessionResponse): AuthApiPort {
  return {
    auth: {
      getLoginMode: vi.fn(async () => ({
        auth_mode: AuthMode.WECHAT,
        config: {
          auth_mode: AuthMode.WECHAT,
          oidc_secret_configured: false,
          wechat_secret_configured: true
        }
      })),
      loginWechat: vi.fn(async () => session),
      getOidcAuthorizeUrl: vi.fn(async () => ({
        authorization_url: 'https://idp.example.test/auth',
        state: 'state'
      })),
      completeOidc: vi.fn(async () => session)
    },
    me: {
      get: vi.fn(async () => createMe(session.role))
    }
  };
}

describe('miniapp auth store', () => {
  it('persists token and role after WeChat login', async () => {
    const storage = createMemoryStorage();
    const session = createSession(UserRole.STUDENT);
    const store = createAuthStore({
      api: createApi(session),
      storage
    });

    await store.getLoginMode();
    await store.loginWechat('wx-code');

    expect(store.state.token).toBe('token-STUDENT');
    expect(store.state.role).toBe(UserRole.STUDENT);
    expect(storage.values.has(AUTH_SESSION_STORAGE_KEY)).toBe(true);
  });

  it('refreshes user and role from /me', async () => {
    const storage = createMemoryStorage();
    const session = createSession(UserRole.ADMIN);
    const store = createAuthStore({
      api: createApi(session),
      storage
    });

    await store.loginWechat('wx-code');
    await store.refreshMe();

    expect(store.state.role).toBe(UserRole.ADMIN);
    expect(store.state.next_route).toBe('admin');
    expect(store.state.auth_mode).toBe(AuthMode.WECHAT);
  });

  it('clears expired local token during hydration', () => {
    const storage = createMemoryStorage();
    const expired = createSession(UserRole.STUDENT, '2020-01-01T00:00:00.000Z');
    storage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      JSON.stringify({
        token: expired.token,
        expires_at: expired.expires_at,
        user: expired.user,
        role: expired.role,
        roles: expired.roles,
        next_route: expired.next_route
      })
    );
    const store = createAuthStore({
      api: createApi(expired),
      storage,
      now: () => Date.parse('2026-05-05T00:00:00.000Z')
    });

    expect(store.hasUsableSession()).toBe(false);
    expect(store.state.token).toBeUndefined();
    expect(store.state.error).toBe('登录已过期，请重新登录');
    expect(storage.values.has(AUTH_SESSION_STORAGE_KEY)).toBe(false);
  });

  it('clears token and user state on logout', async () => {
    const storage = createMemoryStorage();
    const session = createSession(UserRole.STUDENT);
    const store = createAuthStore({
      api: createApi(session),
      storage
    });

    await store.loginWechat('wx-code');
    store.logout();

    expect(store.state.token).toBeUndefined();
    expect(store.state.user).toBeUndefined();
    expect(store.state.role).toBeUndefined();
    expect(storage.values.has(AUTH_SESSION_STORAGE_KEY)).toBe(false);
  });
});

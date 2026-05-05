import { ApiClientError, ApiErrorCode } from '@smartseat/api-client';
import { AuthMode, AuthProvider, UserRole, type MeResponse } from '@smartseat/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { AuthStore, AuthState } from '../../stores/auth';
import type { NavigationDriver } from '../navigation';
import { guardProtectedPage, routeFromLaunch } from '../guards';
import { ADMIN_HOME_ROUTE, LOGIN_ROUTE, resolveRoleRoute, STUDENT_HOME_ROUTE } from '../routes';

function createNavigation(): NavigationDriver & {
  calls: Array<{ action: string; value?: string }>;
} {
  const calls: Array<{ action: string; value?: string }> = [];

  return {
    calls,
    reLaunch(route) {
      calls.push({ action: 'reLaunch', value: route });
    },
    redirectTo(route) {
      calls.push({ action: 'redirectTo', value: route });
    },
    navigateTo(route) {
      calls.push({ action: 'navigateTo', value: route });
    },
    navigateBack() {
      calls.push({ action: 'navigateBack' });
    },
    showToast(message) {
      calls.push({ action: 'showToast', value: message });
    }
  };
}

function createState(role: UserRole | undefined = undefined): AuthState {
  return {
    token: role === undefined ? undefined : 'token',
    expires_at: role === undefined ? undefined : '2099-01-01T00:00:00.000Z',
    user: undefined,
    role,
    roles: role === undefined ? [] : [role],
    auth_mode: undefined,
    next_route: role === undefined ? undefined : role === UserRole.ADMIN ? 'admin' : 'student',
    loading: false,
    error: undefined
  };
}

function createMe(role: UserRole, next_route: 'student' | 'admin'): MeResponse {
  return {
    user_id: `user-${role}`,
    role,
    display_name: role,
    anonymous_name: '匿名用户',
    roles: [role],
    auth_mode: AuthMode.WECHAT,
    next_route,
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

function createStore(options: {
  usable: boolean;
  role?: UserRole;
  me?: MeResponse;
  error?: unknown;
  stateError?: string;
}): AuthStore {
  const state = createState(options.role);
  state.error = options.stateError;

  return {
    state,
    hydrate: vi.fn(),
    hasUsableSession: vi.fn(() => options.usable),
    getLoginMode: vi.fn(),
    loginWechat: vi.fn(),
    startOidc: vi.fn(),
    completeOidcLogin: vi.fn(),
    refreshMe: vi.fn(async () => {
      if (options.error !== undefined) {
        throw options.error;
      }

      if (options.me === undefined) {
        throw new Error('missing me fixture');
      }

      return options.me;
    }),
    logout: vi.fn()
  };
}

describe('miniapp role routing and guards', () => {
  it('uses backend next_route before falling back to role', () => {
    expect(resolveRoleRoute('admin', UserRole.STUDENT)).toBe(ADMIN_HOME_ROUTE);
    expect(resolveRoleRoute('student', UserRole.ADMIN)).toBe(STUDENT_HOME_ROUTE);
    expect(resolveRoleRoute(undefined, UserRole.ADMIN)).toBe(ADMIN_HOME_ROUTE);
    expect(resolveRoleRoute(undefined, UserRole.STUDENT)).toBe(STUDENT_HOME_ROUTE);
  });

  it('redirects launch without token to login', async () => {
    const navigation = createNavigation();
    const store = createStore({ usable: false });

    await expect(routeFromLaunch(store, navigation)).resolves.toBe(LOGIN_ROUTE);
    expect(navigation.calls).toContainEqual({ action: 'reLaunch', value: LOGIN_ROUTE });
  });

  it('routes student login to the student placeholder page', async () => {
    const navigation = createNavigation();
    const store = createStore({
      usable: true,
      role: UserRole.STUDENT,
      me: createMe(UserRole.STUDENT, 'student')
    });

    await expect(routeFromLaunch(store, navigation)).resolves.toBe(STUDENT_HOME_ROUTE);
    expect(navigation.calls).toContainEqual({ action: 'reLaunch', value: STUDENT_HOME_ROUTE });
  });

  it('routes admin login to the admin placeholder page', async () => {
    const navigation = createNavigation();
    const store = createStore({
      usable: true,
      role: UserRole.ADMIN,
      me: createMe(UserRole.ADMIN, 'admin')
    });

    await expect(routeFromLaunch(store, navigation)).resolves.toBe(ADMIN_HOME_ROUTE);
    expect(navigation.calls).toContainEqual({ action: 'reLaunch', value: ADMIN_HOME_ROUTE });
  });

  it('blocks protected pages when the token is expired locally', async () => {
    const navigation = createNavigation();
    const store = createStore({
      usable: false,
      stateError: '登录已过期，请重新登录'
    });

    await expect(guardProtectedPage({ store, navigation })).resolves.toBe(false);
    expect(navigation.calls).toContainEqual({
      action: 'showToast',
      value: '登录已过期，请重新登录'
    });
    expect(navigation.calls).toContainEqual({ action: 'reLaunch', value: LOGIN_ROUTE });
  });

  it('clears auth state and returns to login when /me reports invalid token', async () => {
    const navigation = createNavigation();
    const error = new ApiClientError(
      {
        code: ApiErrorCode.AUTH_INVALID_TOKEN,
        message: 'invalid token'
      },
      401
    );
    const store = createStore({
      usable: true,
      role: UserRole.STUDENT,
      error
    });

    await expect(guardProtectedPage({ store, navigation })).resolves.toBe(false);
    expect(store.logout).toHaveBeenCalledTimes(1);
    expect(navigation.calls).toContainEqual({
      action: 'showToast',
      value: '登录已过期，请重新登录'
    });
    expect(navigation.calls).toContainEqual({ action: 'reLaunch', value: LOGIN_ROUTE });
  });

  it('sends a student away from the admin page', async () => {
    const navigation = createNavigation();
    const store = createStore({
      usable: true,
      role: UserRole.STUDENT,
      me: createMe(UserRole.STUDENT, 'student')
    });

    await expect(
      guardProtectedPage({
        allowedRole: UserRole.ADMIN,
        store,
        navigation
      })
    ).resolves.toBe(false);
    expect(navigation.calls).toContainEqual({
      action: 'showToast',
      value: '当前账号无权访问该页面'
    });
    expect(navigation.calls).toContainEqual({ action: 'reLaunch', value: STUDENT_HOME_ROUTE });
  });
});

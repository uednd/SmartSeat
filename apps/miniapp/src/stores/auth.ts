import type {
  AuthMode,
  AuthSessionResponse,
  LoginModeResponse,
  MeResponse,
  OidcAuthorizeUrlResponse,
  UserDto,
  UserRole
} from '@smartseat/contracts';
import { reactive } from 'vue';

import { smartSeatApiClient } from '../api/client';
import { isAuthExpiredError, mapApiErrorToMessage } from '../api/errors';
import {
  clearStoredSession,
  isSessionExpired,
  loadStoredSession,
  type MiniappAuthSession,
  saveStoredSession,
  type StorageDriver,
  uniStorageDriver
} from './storage';

export interface AuthState {
  token: string | undefined;
  expires_at: string | undefined;
  user: UserDto | undefined;
  role: UserRole | undefined;
  roles: UserRole[];
  auth_mode: AuthMode | undefined;
  next_route: 'student' | 'admin' | undefined;
  loading: boolean;
  error: string | undefined;
}

export interface AuthApiPort {
  auth: {
    getLoginMode(): Promise<LoginModeResponse>;
    loginWechat(request: { code: string }): Promise<AuthSessionResponse>;
    getOidcAuthorizeUrl(): Promise<OidcAuthorizeUrlResponse>;
    completeOidc(request: { code: string; state: string }): Promise<AuthSessionResponse>;
  };
  me: {
    get(): Promise<MeResponse>;
  };
}

export interface AuthStore {
  state: AuthState;
  hydrate(): MiniappAuthSession | undefined;
  hasUsableSession(): boolean;
  getLoginMode(): Promise<LoginModeResponse>;
  loginWechat(code: string): Promise<AuthSessionResponse>;
  startOidc(): Promise<OidcAuthorizeUrlResponse>;
  completeOidcLogin(code: string, state: string): Promise<AuthSessionResponse>;
  refreshMe(): Promise<MeResponse>;
  logout(): void;
}

export interface AuthStoreOptions {
  api?: AuthApiPort;
  storage?: StorageDriver;
  now?: () => number;
}

function createInitialState(): AuthState {
  return {
    token: undefined,
    expires_at: undefined,
    user: undefined,
    role: undefined,
    roles: [],
    auth_mode: undefined,
    next_route: undefined,
    loading: false,
    error: undefined
  };
}

export function createAuthStore(options: AuthStoreOptions = {}): AuthStore {
  const api = options.api ?? smartSeatApiClient;
  const storage = options.storage ?? uniStorageDriver;
  const now = options.now ?? Date.now;
  const state = reactive<AuthState>(createInitialState());

  function applySession(session: MiniappAuthSession): void {
    state.token = session.token;
    state.expires_at = session.expires_at;
    state.user = session.user;
    state.role = session.role;
    state.roles = session.roles;
    state.auth_mode = session.auth_mode;
    state.next_route = session.next_route;
    state.error = undefined;
  }

  function clearState(): void {
    const initialState = createInitialState();
    state.token = initialState.token;
    state.expires_at = initialState.expires_at;
    state.user = initialState.user;
    state.role = initialState.role;
    state.roles = initialState.roles;
    state.auth_mode = initialState.auth_mode;
    state.next_route = initialState.next_route;
    state.loading = initialState.loading;
    state.error = initialState.error;
  }

  function hydrate(): MiniappAuthSession | undefined {
    const session = loadStoredSession(storage);

    if (session === undefined) {
      clearState();
      return undefined;
    }

    if (isSessionExpired(session, now())) {
      clearStoredSession(storage);
      clearState();
      state.error = '登录已过期，请重新登录';
      return undefined;
    }

    applySession(session);
    return session;
  }

  function persistFromSessionResponse(
    response: AuthSessionResponse,
    authMode: AuthMode | undefined
  ): void {
    const session: MiniappAuthSession = {
      token: response.token,
      expires_at: response.expires_at,
      user: response.user,
      role: response.role,
      roles: response.roles,
      auth_mode: authMode,
      next_route: response.next_route
    };

    saveStoredSession(session, storage);
    applySession(session);
  }

  function persistFromMeResponse(response: MeResponse): void {
    if (state.token === undefined || state.expires_at === undefined) {
      return;
    }

    const session: MiniappAuthSession = {
      token: state.token,
      expires_at: state.expires_at,
      user: response.user,
      role: response.role,
      roles: response.roles,
      auth_mode: response.auth_mode,
      next_route: response.next_route
    };

    saveStoredSession(session, storage);
    applySession(session);
  }

  async function runWithLoading<T>(task: () => Promise<T>): Promise<T> {
    state.loading = true;
    state.error = undefined;

    try {
      return await task();
    } catch (error) {
      state.error = mapApiErrorToMessage(error);

      if (isAuthExpiredError(error)) {
        clearStoredSession(storage);
        clearState();
        state.error = '登录已过期，请重新登录';
      }

      throw error;
    } finally {
      state.loading = false;
    }
  }

  return {
    state,
    hydrate,
    hasUsableSession() {
      const session = hydrate();
      return session !== undefined;
    },
    async getLoginMode() {
      return await runWithLoading(async () => {
        const response = await api.auth.getLoginMode();
        state.auth_mode = response.auth_mode;
        return response;
      });
    },
    async loginWechat(code) {
      return await runWithLoading(async () => {
        const response = await api.auth.loginWechat({ code });
        persistFromSessionResponse(response, state.auth_mode);
        return response;
      });
    },
    async startOidc() {
      return await runWithLoading(async () => await api.auth.getOidcAuthorizeUrl());
    },
    async completeOidcLogin(code, oidcState) {
      return await runWithLoading(async () => {
        const response = await api.auth.completeOidc({
          code,
          state: oidcState
        });
        persistFromSessionResponse(response, state.auth_mode);
        return response;
      });
    },
    async refreshMe() {
      return await runWithLoading(async () => {
        const session = hydrate();

        if (session === undefined) {
          throw new Error('请先登录');
        }

        const response = await api.me.get();
        persistFromMeResponse(response);
        return response;
      });
    },
    logout() {
      clearStoredSession(storage);
      clearState();
    }
  };
}

export const authStore = createAuthStore();

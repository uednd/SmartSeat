import type { AuthMode, UserDto, UserRole } from '@smartseat/contracts';

export const AUTH_SESSION_STORAGE_KEY = 'smartseat.auth.session';

export interface MiniappAuthSession {
  token: string;
  expires_at: string;
  user: UserDto;
  role: UserRole;
  roles: UserRole[];
  auth_mode?: AuthMode;
  next_route: 'student' | 'admin';
}

export interface StorageDriver {
  getItem(key: string): string | undefined;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const uniStorageDriver: StorageDriver = {
  getItem(key) {
    const value = uni.getStorageSync(key) as unknown;
    return typeof value === 'string' ? value : undefined;
  },
  setItem(key, value) {
    uni.setStorageSync(key, value);
  },
  removeItem(key) {
    uni.removeStorageSync(key);
  }
};

export function loadStoredSession(
  storage: StorageDriver = uniStorageDriver
): MiniappAuthSession | undefined {
  const rawSession = storage.getItem(AUTH_SESSION_STORAGE_KEY);

  if (rawSession === undefined) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(rawSession) as Partial<MiniappAuthSession>;

    if (
      typeof parsed.token !== 'string' ||
      typeof parsed.expires_at !== 'string' ||
      typeof parsed.user !== 'object' ||
      parsed.user === null ||
      typeof parsed.role !== 'string' ||
      !Array.isArray(parsed.roles) ||
      (parsed.next_route !== 'student' && parsed.next_route !== 'admin')
    ) {
      storage.removeItem(AUTH_SESSION_STORAGE_KEY);
      return undefined;
    }

    return parsed as MiniappAuthSession;
  } catch {
    storage.removeItem(AUTH_SESSION_STORAGE_KEY);
    return undefined;
  }
}

export function saveStoredSession(
  session: MiniappAuthSession,
  storage: StorageDriver = uniStorageDriver
): void {
  storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession(storage: StorageDriver = uniStorageDriver): void {
  storage.removeItem(AUTH_SESSION_STORAGE_KEY);
}

export function getStoredToken(storage: StorageDriver = uniStorageDriver): string | undefined {
  return loadStoredSession(storage)?.token;
}

export function isSessionExpired(
  session: Pick<MiniappAuthSession, 'expires_at'>,
  now = Date.now()
): boolean {
  const expiresAt = Date.parse(session.expires_at);
  return Number.isNaN(expiresAt) || expiresAt <= now;
}

import { UserRole } from '@smartseat/contracts';

import { isAuthExpiredError, mapApiErrorToMessage } from '../api/errors';
import { authStore, type AuthStore } from '../stores/auth';
import { type NavigationDriver, uniNavigation } from './navigation';
import { LOGIN_ROUTE, resolveRoleRoute, type SmartSeatRoute } from './routes';

export interface GuardOptions {
  allowedRole?: UserRole;
  store?: AuthStore;
  navigation?: NavigationDriver;
}

export async function routeFromLaunch(
  store: AuthStore = authStore,
  navigation: NavigationDriver = uniNavigation
): Promise<SmartSeatRoute> {
  if (!store.hasUsableSession()) {
    navigation.reLaunch(LOGIN_ROUTE);
    return LOGIN_ROUTE;
  }

  try {
    const me = await store.refreshMe();
    const route = resolveRoleRoute(me.next_route, me.role);
    navigation.reLaunch(route);
    return route;
  } catch (error) {
    store.logout();
    navigation.showToast(mapApiErrorToMessage(error));
    navigation.reLaunch(LOGIN_ROUTE);
    return LOGIN_ROUTE;
  }
}

export async function routeToCurrentUserHome(
  store: AuthStore = authStore,
  navigation: NavigationDriver = uniNavigation
): Promise<SmartSeatRoute> {
  const me = await store.refreshMe();
  const route = resolveRoleRoute(me.next_route, me.role);
  navigation.reLaunch(route);
  return route;
}

export async function guardProtectedPage(options: GuardOptions = {}): Promise<boolean> {
  const store = options.store ?? authStore;
  const navigation = options.navigation ?? uniNavigation;

  if (!store.hasUsableSession()) {
    navigation.showToast(store.state.error ?? '请先登录');
    navigation.reLaunch(LOGIN_ROUTE);
    return false;
  }

  try {
    const me = await store.refreshMe();
    const route = resolveRoleRoute(me.next_route, me.role);

    if (options.allowedRole !== undefined && me.role !== options.allowedRole) {
      navigation.showToast('当前账号无权访问该页面');
      navigation.reLaunch(route);
      return false;
    }

    return true;
  } catch (error) {
    if (isAuthExpiredError(error)) {
      store.logout();
    }

    navigation.showToast(mapApiErrorToMessage(error));
    navigation.reLaunch(LOGIN_ROUTE);
    return false;
  }
}

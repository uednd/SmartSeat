import { UserRole } from '@smartseat/contracts';

export const INDEX_ROUTE = '/pages/index/index';
export const LOGIN_ROUTE = '/pages/auth/login';
export const OIDC_CALLBACK_ROUTE = '/pages/auth/oidc-callback';
export const STUDENT_HOME_ROUTE = '/pages/student/home';
export const ADMIN_HOME_ROUTE = '/pages/admin/home';
export const PROFILE_ROUTE = '/pages/me/profile';

export type SmartSeatRoute =
  | typeof INDEX_ROUTE
  | typeof LOGIN_ROUTE
  | typeof OIDC_CALLBACK_ROUTE
  | typeof STUDENT_HOME_ROUTE
  | typeof ADMIN_HOME_ROUTE
  | typeof PROFILE_ROUTE;

export function resolveRoleRoute(
  nextRoute: 'student' | 'admin' | undefined,
  role: UserRole | undefined
): SmartSeatRoute {
  if (nextRoute === 'admin') {
    return ADMIN_HOME_ROUTE;
  }

  if (nextRoute === 'student') {
    return STUDENT_HOME_ROUTE;
  }

  return role === UserRole.ADMIN ? ADMIN_HOME_ROUTE : STUDENT_HOME_ROUTE;
}

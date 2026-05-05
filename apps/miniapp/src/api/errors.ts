import { ApiClientError, ApiErrorCode } from '@smartseat/api-client';

export function isAuthExpiredError(error: unknown): boolean {
  if (!(error instanceof ApiClientError)) {
    return false;
  }

  return (
    error.status === 401 ||
    error.code === ApiErrorCode.AUTH_REQUIRED ||
    error.code === ApiErrorCode.AUTH_INVALID_TOKEN
  );
}

export function mapApiErrorToMessage(error: unknown): string {
  if (!(error instanceof ApiClientError)) {
    return error instanceof Error ? error.message : '请求失败，请稍后重试';
  }

  if (error.status === 401 || error.code === ApiErrorCode.AUTH_INVALID_TOKEN) {
    return '登录已过期，请重新登录';
  }

  if (error.code === ApiErrorCode.AUTH_REQUIRED) {
    return '请先登录';
  }

  if (error.code === ApiErrorCode.AUTH_LOGIN_MODE_MISMATCH) {
    return '当前登录方式与系统配置不一致，请刷新后重试';
  }

  if (error.code === ApiErrorCode.INTERNAL_ERROR) {
    return error.message || '服务暂不可用，请稍后重试';
  }

  return error.message || '请求失败，请稍后重试';
}

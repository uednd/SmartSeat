import { ApiClientError, ApiErrorCode } from '@smartseat/api-client';
import { describe, expect, it } from 'vitest';

import { isAuthExpiredError, mapApiErrorToMessage } from '../errors';

describe('miniapp API error mapping', () => {
  it('maps expired token responses to the shared login-expired prompt', () => {
    const error = new ApiClientError(
      {
        code: ApiErrorCode.AUTH_INVALID_TOKEN,
        message: 'invalid token'
      },
      401
    );

    expect(isAuthExpiredError(error)).toBe(true);
    expect(mapApiErrorToMessage(error)).toBe('登录已过期，请重新登录');
  });

  it('maps auth-required responses to a login prompt', () => {
    const error = new ApiClientError(
      {
        code: ApiErrorCode.AUTH_REQUIRED,
        message: 'auth required'
      },
      401
    );

    expect(isAuthExpiredError(error)).toBe(true);
    expect(mapApiErrorToMessage(error)).toBe('登录已过期，请重新登录');
  });

  it('maps login-mode mismatch to a frontend-safe message', () => {
    const error = new ApiClientError({
      code: ApiErrorCode.AUTH_LOGIN_MODE_MISMATCH,
      message: 'mode mismatch'
    });

    expect(mapApiErrorToMessage(error)).toBe('当前登录方式与系统配置不一致，请刷新后重试');
  });

  it('falls back to generic errors for unknown failures', () => {
    expect(mapApiErrorToMessage(new Error('network down'))).toBe('network down');
    expect(mapApiErrorToMessage('bad')).toBe('请求失败，请稍后重试');
  });
});

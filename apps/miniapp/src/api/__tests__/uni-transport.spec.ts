import { ApiErrorCode } from '@smartseat/api-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createUniTransport } from '../uni-transport';

type UniRequestOptions = Parameters<typeof uni.request>[0];

const originalUrl = globalThis.URL;

afterEach(() => {
  globalThis.URL = originalUrl;
  vi.unstubAllGlobals();
});

describe('miniapp uni transport', () => {
  it('builds requests without relying on the global URL constructor', async () => {
    globalThis.URL = undefined as unknown as typeof URL;

    const requestMock = vi.fn((options: UniRequestOptions) => {
      options.success?.({
        data: JSON.stringify({ ok: true }),
        statusCode: 200,
        header: {},
        cookies: []
      });
      return {
        abort: vi.fn()
      };
    });
    vi.stubGlobal('uni', {
      request: requestMock
    });

    const transport = createUniTransport({
      baseUrl: 'http://localhost:3000/',
      token: () => 'token'
    });

    await expect(
      transport.request({
        operation_id: 'auth.getLoginMode',
        method: 'GET',
        path: '/auth/mode',
        query: {
          role: 'STUDENT',
          tags: ['a', 'b'],
          skipped: undefined
        }
      })
    ).resolves.toEqual({ ok: true });

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'http://localhost:3000/auth/mode?role=STUDENT&tags=a&tags=b',
        method: 'GET',
        header: expect.objectContaining({
          Accept: 'application/json',
          Authorization: 'Bearer token'
        })
      })
    );
  });

  it('normalizes backend error responses into ApiClientError', async () => {
    vi.stubGlobal('uni', {
      request(options: UniRequestOptions) {
        options.success?.({
          data: JSON.stringify({
            code: ApiErrorCode.AUTH_INVALID_TOKEN,
            message: 'invalid token'
          }),
          statusCode: 401,
          header: {},
          cookies: []
        });
        return {
          abort: vi.fn()
        };
      }
    });

    const transport = createUniTransport({
      baseUrl: 'http://localhost:3000'
    });

    await expect(
      transport.request({
        operation_id: 'me.get',
        method: 'GET',
        path: '/me'
      })
    ).rejects.toMatchObject({
      name: 'ApiClientError',
      code: ApiErrorCode.AUTH_INVALID_TOKEN,
      status: 401
    });
  });

  it('adds the requested URL to miniapp network failures', async () => {
    vi.stubGlobal('uni', {
      request(options: UniRequestOptions) {
        options.fail?.({
          errMsg: 'request:fail'
        });
        return {
          abort: vi.fn()
        };
      }
    });

    const transport = createUniTransport({
      baseUrl: 'http://127.0.0.1:3000'
    });

    await expect(
      transport.request({
        operation_id: 'auth.getLoginMode',
        method: 'GET',
        path: '/auth/mode'
      })
    ).rejects.toMatchObject({
      name: 'MiniappNetworkError',
      url: 'http://127.0.0.1:3000/auth/mode',
      reason: 'request:fail'
    });
  });
});

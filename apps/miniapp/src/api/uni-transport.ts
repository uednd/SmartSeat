import type { FetchLike, FetchLikeResponse } from '@smartseat/api-client';

function normalizeHeaders(headers: unknown): Record<string, string> {
  if (typeof headers !== 'object' || headers === null) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)])
  );
}

export const uniFetch: FetchLike = (input, init) =>
  new Promise<FetchLikeResponse>((resolve, reject) => {
    if (init.signal?.aborted === true) {
      reject(new Error('SmartSeat API request was aborted.'));
      return;
    }

    uni.request({
      url: input,
      method: init.method as unknown as UniNamespace.RequestOptions['method'],
      header: init.headers,
      data: init.body,
      dataType: 'text',
      responseType: 'text',
      success(response) {
        const headers = normalizeHeaders(response.header);
        const data = response.data;

        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          headers: {
            get(name: string) {
              return headers[name.toLowerCase()] ?? null;
            }
          },
          async text() {
            return typeof data === 'string' ? data : JSON.stringify(data);
          }
        });
      },
      fail(error) {
        reject(new Error(error.errMsg || 'uni.request failed.'));
      }
    });

    init.signal?.addEventListener('abort', () =>
      reject(new Error('SmartSeat API request was aborted.'))
    );
  });

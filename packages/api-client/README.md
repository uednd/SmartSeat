# @smartseat/api-client

SmartSeat API client defines typed client method boundaries for the miniapp and future integration tests. It does not bind concrete REST paths in SHR-01.

## Transport Strategy

The client uses transport injection:

- `ApiTransport` is the stable request boundary.
- `createSmartSeatApiClient(transport)` exposes typed domain methods for auth, current user, seats, devices, reservations, check-in, anomalies, stats, leaderboard, and admin APIs.
- `createHttpTransport` provides base URL handling, JSON serialization, token injection, optional timeout/abort, and unified `ApiClientError` handling.

The default HTTP transport requires either `request.path` or an `operationResolver`. Because SHR-01 is OpenAPI-first, client methods currently emit `operation_id` values and do not hardcode endpoint paths. API-PLT-01 and later API tasks should bind those operation ids to concrete OpenAPI/NestJS routes.

## Token And Errors

Pass either a static token or async token provider:

```ts
createHttpTransport({
  baseUrl: 'http://localhost:3000',
  token: async () => loadToken(),
  operationResolver
});
```

Non-2xx responses are normalized into `ApiClientError`, preserving:

- `status`: HTTP status when available
- `code`: `ApiErrorCode`
- `response`: full `ApiErrorResponse`

This package does not implement login flows, page state, role routing, real backend calls, or a `uni.request` adapter. A miniapp-specific adapter can be added later by implementing `ApiTransport`.

# @smartseat/api-client

SmartSeat API client defines typed client method boundaries for the miniapp and future integration tests. Implemented backend surfaces bind concrete REST paths for the default HTTP transport.

## Transport Strategy

The client uses transport injection:

- `ApiTransport` is the stable request boundary.
- `createSmartSeatApiClient(transport)` exposes typed domain methods for auth, current user, seats, devices, reservations, check-in, anomalies, and admin APIs that exist in the backend.
- `createHttpTransport` provides base URL handling, JSON serialization, token injection, optional timeout/abort, and unified `ApiClientError` handling.

The default HTTP transport requires either `request.path` or an `operationResolver`. Client methods for implemented API tasks bind concrete NestJS routes directly; future surfaces such as stats and leaderboard should be added only when the backend route exists.

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

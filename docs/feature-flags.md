# Runtime capabilities

Frontend [#17](https://github.com/EmilXavierVT/MTOGO-Front/issues/17) integrates the
[backend foundation](https://github.com/EmilXavierVT/MTOGO/issues/112) from
[research #111](https://github.com/EmilXavierVT/MTOGO/issues/111).

[Customer feedback](customer-feedback.md) is the first enrolled product capability:
`customerFeedback`, default OFF, backed by `MTOGO_FEATURE_CUSTOMER_FEEDBACK` in MTOGO #60.
Existing checkout, orders and courier completion remain available in either state.

## Current behavior

`RequiredRole` verifies the existing session/role, then wraps authenticated content in
`FeatureFlagsProvider`. Existing content renders without waiting for capabilities.
The provider fetches `GET /api/features` through the same-origin `/api` convention,
with the session Bearer token and `cache: "no-store"`. The backend allows all existing
roles and returns an allowlisted JSON object of Booleans with `Cache-Control: no-store`.
The application response includes `{"customerFeedback":false}` by default.

`app/features/catalog.ts` contains the explicit client allowlist, including `customerFeedback`.
Only an own property whose value is exactly Boolean `true` for a recognized name enables
a capability. Unknown/missing/non-Boolean values and malformed data are off. Older-backend
403/404 responses, 5xx responses, network/JSON failures and a five-second timeout leave
new capabilities disabled while existing content continues.

An actual 401 clears tokens and roles from both stores, removes private content and
navigates to login. Requests refresh on path or token changes. Obsolete requests are
aborted and cannot restore an earlier session's or route's capabilities. Values are not
persisted between sessions. There is no polling or instant update promise for an open
view; enter the view again after a backend configuration change.

## Enrolling another product capability

1. Create linked feature issues and follow Takt in each repository. Define the owner,
   default-off behavior and removal condition.
2. Add the named backend key, public mapping, explicit Compose forwarding and guards;
   deploy compatible backend support first. Role/ownership checks remain independent.
3. Add the agreed public key to `PUBLIC_CAPABILITY_NAMES` in `app/features/catalog.ts`.
   Use `useFeature(name)` in a client component under the existing `RequiredRole`:

   ```tsx
   // Example only: enroll the real capability before adding a product consumer.
   const enabled = useFeature("exampleCapability");
   ```

4. Hide an additive new action when disabled, or preserve the stable path for a replacement.
   Handle a backend refusal if the UI snapshot is stale. The hook never authorizes an
   operation. Do not put release values in `NEXT_PUBLIC_*` build configuration.
5. Add business on/off and mixed-version tests and record enabled demonstration evidence.
   Keep a retired public key true while supported older consumers still rely on it.

The provider's `capabilityNames` prop supports isolated catalogs in tests. Production uses
the checked-in default; query parameters, storage and backend responses cannot enroll
new client capability names.

## Verification

`useSessionExpiry()` lets a product API's 401 invoke the same `RequiredRole` cleanup and
remove the entire private view. Feedback uses it for reads and submissions.

Run `./scripts/check.sh quick` and use `gh deliver` for full verification. Tests cover on/off
fixtures, the explicit production allowlist, old/malformed backend responses, timeout, stale
requests, route/token changes, cancellation, session expiry and existing content during
capability failures. Existing checkout, menu and courier tests cover unflagged behavior;
the production build checks the Next.js client boundary and routing integration.

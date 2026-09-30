# Backend and shared-client changes (exact specification)

All new backend code goes in a new Django app, `backend/apps/mobile/`, with its tests in
`backend/tests/mobile/`. Follow the root `AGENTS.md` quality rules: thin views, logic in
`services.py`, strict MyPy, Ruff, database constraints, adapters with timeouts, and no secrets in
logs.

```
backend/apps/mobile/
  __init__.py  apps.py (MobileConfig, name="apps.mobile", ready() imports signals)
  middleware.py        BearerAwareSessionMiddleware
  models.py            PushDevice, PushTicket
  migrations/0001_initial.py   (generated with makemigrations)
  serializers.py  views.py  urls.py
  services.py          device registration, payload building, delivery
  push_provider.py     PushProvider protocol, ExpoPushProvider, FakePushProvider, get_push_provider()
  push_templates.py    copy for PUSH-channel template codes
  signals.py           post_save on NotificationIntent → enqueue delivery on commit
  tasks.py             Celery tasks
backend/tests/mobile/  test_auth.py  test_devices.py  test_push.py  test_app_config.py
```

---

## 1. Bearer-aware session middleware

Replace `django.contrib.sessions.middleware.SessionMiddleware` in `MIDDLEWARE` (same position)
with `apps.mobile.middleware.BearerAwareSessionMiddleware`, a subclass of `SessionMiddleware`:

- `process_request`: if the `Authorization` header is `Bearer <key>`, set
  `request.session = self.SessionStore(<key>)`, then `request.vsolve_bearer = True` and
  `request._dont_enforce_csrf_checks = True`. Otherwise call `super()`.
  (DRF's `SessionAuthentication.enforce_csrf` honours `_dont_enforce_csrf_checks`. A browser can
  never attach this header cross-site without a CORS pre-flight that the allow-list refuses.)
- `process_response`: call `super()`, then, if `getattr(request, "vsolve_bearer", False)`, remove
  `settings.SESSION_COOKIE_NAME` and `settings.CSRF_COOKIE_NAME` from `response.cookies`, so
  mobile never receives cookies.
- Nothing else changes. `RevocableSessionAuthentication` still checks the `UserSession` row, so
  revocation, expiry, `/auth/sessions/`, `/auth/logout/` and `/auth/roles/switch/` behave exactly
  as for cookies.

## 2. Mobile OTP verify

`POST /api/v1/auth/mobile/otp/verify/`, `authentication_classes = ()`,
`permission_classes = (AllowAny,)`, tag `Authentication`.

- Request: the existing `OtpVerifySerializer` (`challenge_id`, `phone_number`, `code`,
  `device_identifier`, `device_label`).
- Same logic as `apps.identity.views.OtpVerifyView.post`: `verify_login_otp(...)`, where
  `OtpVerificationError` → `InvalidOtpApiError`, then `create_authenticated_session(...)`.
- Before returning, set `request._request.vsolve_bearer = True` so no cookie is sent.
- Response 200 `MobileAuthenticatedSessionSerializer`: the fields of
  `AuthenticatedSessionSerializer` plus `session_token` (string, the Django session key).
  Response 400: `ApiErrorSerializer`.
- `device_identifier` is required (non-blank) on this endpoint.
- Never log the token or the code.

## 3. Push devices

```python
class PushDevice(models.Model):
    class App(models.TextChoices): CUSTOMER = "customer"; PARTNER = "partner"
    class Platform(models.TextChoices): IOS = "ios"; ANDROID = "android"
    id = UUIDField(primary_key=True, default=uuid4)
    user = FK(User, CASCADE, related_name="push_devices")
    session = FK(identity.UserSession, CASCADE, related_name="push_devices")
    app = CharField(max_length=16, choices=App.choices)
    platform = CharField(max_length=16, choices=Platform.choices)
    expo_push_token = CharField(max_length=200, unique=True)
    app_version = CharField(max_length=32)
    created_at = DateTimeField(auto_now_add=True)
    last_registered_at = DateTimeField(default=timezone.now)
    disabled_at = DateTimeField(null=True, blank=True)
    disabled_reason = CharField(max_length=64, blank=True)
    # CheckConstraint: expo_push_token startswith "ExponentPushToken[" or "ExpoPushToken["
    # Index: (user, disabled_at)
```

A device is **active** when `disabled_at IS NULL` and its session is not revoked and not expired.

| Endpoint | Auth | Body | Result |
|---|---|---|---|
| `POST /api/v1/mobile/devices/` | signed in | `expo_push_token, app, platform, app_version` | 200 `PushDevice` (id, app, platform, app_version, last_registered_at). **Upsert by token**: re-binds the token to the current user + session and clears `disabled_at`. Idempotent. |
| `POST /api/v1/mobile/devices/unregister/` | signed in | `expo_push_token` | 204. Disables the token if it belongs to the caller; also 204 if unknown (idempotent, reveals nothing). |

## 4. Push delivery

**Provider** (`push_provider.py`), in the same style as `apps/notifications/transport.py`
(fail-closed):

- `MOBILE_PUSH_PROVIDER = env("MOBILE_PUSH_PROVIDER", default="unconfigured")`, values
  `expo` | `fake`. `fake` is allowed only when `DEBUG` or `MOBILE_PUSH_ALLOW_FAKE=true`.
  Anything else raises `PushProviderError`.
- `ExpoPushProvider.send(messages) -> list[Ticket]`: `POST https://exp.host/--/api/v2/push/send`
  in chunks of 100, `requests` with timeout `(3, EXPO_PUSH_TIMEOUT_SECONDS=10)`, header
  `Authorization: Bearer {EXPO_ACCESS_TOKEN}` when set.
  `get_receipts(ids)`: `POST https://exp.host/--/api/v2/push/getReceipts`, chunks of 300.
- Message: `to`, `title`, `body`, `data`, `sound: "default"`, `priority: "high"`,
  `channelId` (`"offers"` for purpose `partner.offer_created`, otherwise `"default"`).

**Copy** (`push_templates.py`): the PUSH-channel codes already written by the backend are not in
the in-app registry. Register their copy here:

| template_code | title | body | target |
|---|---|---|---|
| `partner_offer_created` | `New job offer` | `Open to see the job and accept before it expires.` | `{"kind": "PARTNER_OFFERS", "id": offer_id}` |
| `partner_job_assigned` | `Job confirmed` | `A job has been assigned to you. Open for the details.` | `{"kind": "PARTNER_WORK", "id": fulfilment_unit_id}` |
| `partner_job_cancelled` | `Job cancelled` | `A job you were holding has been cancelled.` | `{"kind": "PARTNER_WORK", "id": fulfilment_unit_id}` |
| `customer_booking_unstaffable` | `We could not find a professional` | `Open your booking to see your options.` | `null` |

Before finalizing, grep the backend for every `channel="PUSH"` / `Channel.PUSH` call and make sure
each `template_code` has a row. An unknown code must fail loudly in tests. The owner signs off
this copy in Phase 15. The Partner app maps `PARTNER_OFFERS` → `/work/offers` and
`PARTNER_WORK` → `/work/all`.

**Delivery** (`services.py` + `tasks.py`):

1. `signals.py`: `post_save` on `NotificationIntent` (created only):
   - `channel == PUSH` and status `PENDING` → `transaction.on_commit(deliver_push_intent.delay(id))`
   - `channel == IN_APP` and status `SENT` → `transaction.on_commit(mirror_in_app_notice.delay(id))`

   `request_notification` saves an in-app intent as `PENDING` and then delivers it inline, so also
   handle the `SENT` update: connect on save and check `status == SENT` plus "no `PushTicket` yet
   for this intent" (use `update_fields`, or look up existing tickets).
2. `deliver_push_intent(intent_id)`:
   - `select_for_update(skip_locked=True)` the intent. Skip it unless it is still `PENDING`.
   - Render the copy from `push_templates`.
   - Send to every active device of the recipient.
   - `record_delivery_attempt(intent_id, provider="expo", status=ACCEPTED, provider_message_id=<first ticket id>)`
     if at least one ticket is ok. Otherwise `FAILED` with `failure_code`: `no_registered_device`,
     `provider_error` or `provider_timeout`.
   - Create a `PushTicket` per device.
3. `mirror_in_app_notice(intent_id)`: `title`, `body` and `target` come from
   `NotificationSerializer(intent).data`, and `data` = `{ notification_id, target, purpose }`.
   Send to active devices and store `PushTicket`s. **Do not** call `record_delivery_attempt`: the
   in-app intent is already delivered.
4. `sweep_pending_push_intents` (beat, every 30 s): PENDING PUSH intents with
   `attempts < MAX_DELIVERY_ATTEMPTS`, oldest first, limit 100 → `deliver_push_intent`.
5. `check_push_receipts` (beat, every 15 min): tickets older than 15 minutes without a receipt →
   `get_receipts`. On `DeviceNotRegistered`, disable the device (`disabled_reason="device_not_registered"`).
   Store `receipt_status` and `receipt_error`.

```python
class PushTicket(models.Model):
    id = UUIDField(primary_key=True, default=uuid4)
    device = FK(PushDevice, CASCADE, related_name="tickets")
    intent = FK(notifications.NotificationIntent, PROTECT, related_name="push_tickets")
    expo_ticket_id = CharField(max_length=64, blank=True)
    ticket_status = CharField(max_length=8)          # "ok" | "error"
    ticket_error = CharField(max_length=64, blank=True)
    receipt_status = CharField(max_length=8, blank=True)
    receipt_error = CharField(max_length=64, blank=True)
    created_at = DateTimeField(auto_now_add=True)
    receipt_checked_at = DateTimeField(null=True, blank=True)
    # UniqueConstraint(device, intent)  ← makes retries idempotent
```

## 5. App version gate

`GET /api/v1/mobile/app-config/?app=partner|customer&platform=ios|android&version=1.2.3`,
`AllowAny`, no auth.

Response: `{ minimum_version, latest_version, update_required, store_url }`. `update_required`
is true when `version < minimum_version` (compare semantic versions numerically). Invalid
input → 400 `ApiErrorSerializer`.

Settings (all from env, with defaults):
`MOBILE_PARTNER_MIN_VERSION="1.0.0"`, `MOBILE_CUSTOMER_MIN_VERSION="1.0.0"`,
`MOBILE_PARTNER_LATEST_VERSION="1.0.0"`, `MOBILE_CUSTOMER_LATEST_VERSION="1.0.0"`,
`MOBILE_PARTNER_ANDROID_STORE_URL`, `MOBILE_PARTNER_IOS_STORE_URL`,
`MOBILE_CUSTOMER_ANDROID_STORE_URL`, `MOBILE_CUSTOMER_IOS_STORE_URL` (default `""`).

Settings block to add to `base.py` (next to `MESSAGE_TRANSPORT`):

```python
# Mobile apps (frontend/mobile). Push is fail-closed like MESSAGE_TRANSPORT.
MOBILE_PUSH_PROVIDER = env("MOBILE_PUSH_PROVIDER", default="unconfigured")
MOBILE_PUSH_ALLOW_FAKE = env.bool("MOBILE_PUSH_ALLOW_FAKE", default=False)
EXPO_ACCESS_TOKEN = env("EXPO_ACCESS_TOKEN", default="")
EXPO_PUSH_TIMEOUT_SECONDS = env.int("EXPO_PUSH_TIMEOUT_SECONDS", default=10)
# + the MOBILE_*_VERSION / *_STORE_URL settings above
```

Beat entries: `"sweep-pending-push-intents"` → `apps.mobile.tasks.sweep_pending_push_intents`
every `30.0`, and `"check-push-receipts"` → `apps.mobile.tasks.check_push_receipts` every
`900.0`.

Local `.env`: `MOBILE_PUSH_PROVIDER=expo` plus `EXPO_ACCESS_TOKEN=<from owner>` to test real push.
Use `fake` if you are not testing push.

## 6. `@vsolve/api-client`: bearer mode

In `frontend/packages/api-client/src/client.ts`, add to `CreateApiClientOptions`:

```ts
/**
 * How the session travels. Web apps omit this (cookie + CSRF, unchanged).
 * Native apps use a bearer token: no cookies, no CSRF bootstrap.
 */
auth?: { mode: "cookie" } | { mode: "bearer"; getToken: () => string | null };
```

When `auth.mode === "bearer"`:

- skip `fetchWithCsrf` (no CSRF bootstrap, no `X-CSRFToken`)
- `credentials: "omit"`
- set `Authorization: Bearer <token>` on every request when `getToken()` returns a value
- `onUnauthorized` behaviour is unchanged

Add tests for bearer mode next to the existing client tests: the header is sent, no CSRF call is
made, no header is sent without a token, and cookie mode is unchanged. Cookie mode must stay
byte-for-byte the same.

## 7. `@vsolve/query`: native entry

Add `"./native": "./src/native.ts"` to `exports` in `frontend/packages/query/package.json`, and
mark `react-dom` optional (`peerDependenciesMeta: { "react-dom": { "optional": true } }`).

`src/native.ts` re-exports everything `src/index.ts` exports, **except**:
`QueryProvider`, `makeQueryClient`, `getQueryClient`, `AppErrorBoundary`, `createTabChannel`,
`getTabChannel`, `SessionSync`, `useTabSync` and `publishToTabs` (browser-only). The web keeps
importing `@vsolve/query`, which is unchanged.

## 8. Contract

After §2–§5: regenerate the OpenAPI document and the TypeScript client (commands in
`10-commands.md`), bump `SPECTACULAR_SETTINGS["VERSION"]` by one minor version, and add an entry
to `contracts/openapi/CHANGELOG.md` listing the four new endpoints.

## 9. Required backend tests (`backend/tests/mobile/`)

- bearer request authenticates; revoked session → 403 `session_expired`; unknown token → 403
  `not_authenticated`; bearer POST works without CSRF; cookie POST still needs CSRF; bearer
  responses set no cookies
- mobile verify: success returns `session_token` that works as bearer; wrong code → 400; blank
  `device_identifier` → 400
- devices: register, re-register the same token (idempotent, re-binds user), unregister (own,
  unknown, someone else's → still 204 and theirs unchanged), unauthenticated → 403
- push: PUSH intent → one ticket per active device and intent `SENT`; no device → attempt
  `no_registered_device`; revoked session's device skipped; provider timeout → attempt
  `provider_timeout` and still `PENDING` until budget spent; in-app mirror sends with the
  serializer's title/body/target and does not add a delivery attempt; receipts
  `DeviceNotRegistered` disables the device; every PUSH `template_code` in the codebase is
  registered; retry does not double-send (unique device+intent)
- app-config: below / equal / above minimum; invalid version → 400

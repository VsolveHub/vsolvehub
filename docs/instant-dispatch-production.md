# Shift-Based, Push-Gated Instant Availability and Dispatch

## 1. Architecture Diagram

```mermaid
flowchart TD
    subgraph PartnerPortal [Partner Portal (Next.js / Browser)]
        direction TB
        SP[Start Shift] --> OS[OneSignal Web Push Register]
        OS --> Sync[POST /api/v1/partner/push-subscriptions/sync/]
        HB[Heartbeat / Location update 30s] --> HB_EP[POST /api/v1/partner/presence/heartbeat/]
        PushReceive[Receive OneSignal Push: 'New Instant Job Nearby'] --> ViewOffer[Open /dispatch/{offerId}]
        ViewOffer --> ActionOffer{Accept or Decline?}
        ActionOffer -->|Accept| AcceptOffer[POST /api/v1/partner/dispatch-offers/{offerId}/accept/]
        ActionOffer -->|Decline| DeclineOffer[POST /api/v1/partner/dispatch-offers/{offerId}/decline/]
    end

    subgraph BackendDuty [Duty & Presence Layer]
        PS[PartnerShift (Duty Period)]
        POS[PartnerOnlineSession (Telemetry)]
        PPS[PartnerPushSubscription (Active Device)]
        PL[PartnerLocation (Coarse GPS <= 30 min)]
        Redis[(Redis Presence Key 90s TTL)]
    end

    subgraph CustomerCheckout [Customer Checkout App]
        ReqAvail[GET /api/v1/availability/instant/] --> Eval[compute_instant_availability()]
        ConfirmInstant[Confirm Instant Booking] --> CeleryDispatch[dispatch_instant_booking_task]
    end

    subgraph CeleryWorkflow [Celery Dispatch Engine]
        CeleryDispatch --> Rank[Candidate Ranking & Rotation]
        Rank --> CreateOffer[Create DispatchOffer PENDING]
        CreateOffer --> SendPush[send_dispatch_offer_push_task]
        CreateOffer --> ExpireTask[expire_dispatch_offer_task (countdown=60s)]
        ExpireTask -->|If expired without response| Reassign[reassign_or_downgrade_booking_task]
        Reassign -->|Next candidate| NextOffer[Create next DispatchOffer]
        Reassign -->|Exhausted attempts >= 5| Downgrade[Downgrade to SCHEDULED]
    end

    Sync --> PPS
    SP --> PS
    SP --> POS
    SP --> Redis
    HB_EP --> POS
    HB_EP --> PL
    HB_EP --> Redis

    SendPush --> OneSignalAPI[OneSignal REST API]
    OneSignalAPI --> PushReceive
```

---

## 2. Data Model Explanation

### 2.1 `PartnerShift` (`backend/apps/partners/models/availability.py`)
Represents an explicit duty work session for a partner.
- **`id`**: UUID primary key.
- **`partner`**: ForeignKey to `PartnerProfile` (`on_delete=PROTECT`, `related_name="shifts"`).
- **`service_area`**: ForeignKey to `ServiceArea` (`on_delete=PROTECT`, `related_name="partner_shifts"`).
- **`started_at`**: DateTimeField (`default=timezone.now`).
- **`scheduled_end_at`**: DateTimeField. Default duration is 8 hours from shift start (`PARTNER_SHIFT_DEFAULT_DURATION_HOURS`).
- **`ended_at`**: Nullable DateTimeField. Null indicates an ongoing active shift.
- **`end_reason`**: CharField choices (`PARTNER_LOGOUT`, `SHIFT_EXPIRED`, `IDLE_EXPIRED`, `MISSED_OFFERS`, `SUPERSEDED`, `SUSPENDED`, `OFFBOARDED`, `ADMIN_ENDED`).
- **`last_active_at`**: DateTimeField, refreshed on heartbeat and API interactions.
- **Constraints & Indexes**:
  - `partners_unique_active_shift`: Partial UniqueConstraint on `(partner,)` where `ended_at__isnull=True`. Guarantees exactly one active shift per partner.
  - `partners_shift_valid_window`: CheckConstraint enforcing `scheduled_end_at > started_at`.
  - Indexes on `(partner, ended_at)`, `(service_area, ended_at)`, `(ended_at, scheduled_end_at)`, `(partner, last_active_at)`.

### 2.2 `PartnerPushSubscription` (`backend/apps/partners/models/availability.py`)
Tracks Web Push, Android, and iOS push tokens verified against OneSignal.
- **`id`**: UUID primary key.
- **`partner`**: ForeignKey to `PartnerProfile`.
- **`user`**: ForeignKey to `AUTH_USER_MODEL`.
- **`onesignal_subscription_id`**: Unique string provided by OneSignal SDK v16.
- **`onesignal_external_id`**: Foreign key string mapped to `str(partner.id)`.
- **`platform`**: `WEB`, `ANDROID`, `IOS`.
- **`user_agent`**: Client user agent string.
- **`is_active`**: Boolean indicating whether push notifications can currently be delivered to this device.
- **`last_verified_at`**: Refreshed during subscription sync or successful push delivery.
- **Constraints & Indexes**:
  - Indexes on `(partner, is_active)`, `(user, is_active)`, `(onesignal_external_id, is_active)`.
  - In Web environment: Registering a new active WEB subscription marks prior WEB subscriptions for that partner inactive.

### 2.3 `DispatchOffer` (`backend/apps/assignments/models.py`)
Time-boxed dispatch offer presented sequentially to candidates for an Instant booking.
- **`id`**: UUID primary key.
- **`booking`**: ForeignKey to `commerce.Booking`.
- **`partner`**: ForeignKey to `PartnerProfile`.
- **`status`**: `PENDING`, `ACCEPTED`, `DECLINED`, `EXPIRED`, `CANCELLED`.
- **`offered_at`**: DateTimeField.
- **`expires_at`**: Authoritative server timestamp (default 60 seconds from offer creation).
- **`responded_at`**: Timestamp when partner accepted, declined, or offer expired.
- **`attempt_number`**: PositiveSmallIntegerField tracking rotation attempt (1, 2, ...).
- **`onesignal_notification_id`**: OneSignal notification ID for idempotency and audit tracking.
- **Constraints & Indexes**:
  - `assignments_one_pending_dispatch_offer_per_booking`: Partial UniqueConstraint ensuring only one offer is `PENDING` per booking at any moment.
  - Indexes on `(booking, status)`, `(partner, status, expires_at)`, `(expires_at, status)`.

---

## 3. Feature-Flag Behavior

### `FEATURE_PUSH_GATED_INSTANT`
- **Default**: `False` (safe rollback/staging default).
- **When `False`**:
  - Existing heartbeat-based presence rules apply strictly.
  - `go_online()` only manages `PartnerOnlineSession` and Redis `partner:presence:{partner_id}` (90s TTL).
  - Backgrounding browser stops JS heartbeat -> Redis presence expires -> `PartnerOnlineSession` ended with `PRESENCE_EXPIRED` -> Instant availability returns `NO_ONLINE_PARTNERS`.
  - Zero changes to legacy checkout or partner experience.
- **When `True`**:
  - `go_online()` starts or reuses an active `PartnerShift` (default 8 hours duration).
  - Instant availability requires:
    1. Active `PartnerShift` (`ended_at IS NULL` and `scheduled_end_at > now`).
    2. Active `PartnerPushSubscription` (`is_active = True`).
    3. Fresh `PartnerLocation` (`captured_at >= now - PARTNER_LOCATION_MAX_AGE_MINUTES`).
    4. Service area eligibility (`PartnerServiceArea`).
    5. Working-hours rule or exception coverage (`PartnerAvailabilityRule` / `PartnerAvailabilityException`).
    6. No conflicting `Reservation` or confirmed booking.
  - Backgrounding browser drops Redis presence and expires `PartnerOnlineSession`, but **`PartnerShift` remains active and partner remains Instant-eligible**.

---

## 4. API Documentation

### 4.1 Sync Partner Push Subscription
- **Endpoint**: `POST /api/v1/partner/push-subscriptions/sync/`
- **Auth**: Authenticated partner (`Bearer` / Session).
- **Request Body**:
```json
{
  "onesignal_subscription_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "platform": "WEB",
  "user_agent": "Mozilla/5.0 ...",
  "is_active": true
}
```
- **Response `200 OK`**:
```json
{
  "id": "e44d3606-bd36-4db1-9b16-43b9df083818",
  "partner_id": "764beee6-7b28-406e-8260-a29285744cb8",
  "onesignal_subscription_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "platform": "WEB",
  "is_active": true,
  "last_verified_at": "2026-10-28T11:00:00Z"
}
```

### 4.2 Get Dispatch Offer
- **Endpoint**: `GET /api/v1/partner/dispatch-offers/{offer_id}/`
- **Auth**: Authenticated partner (must match `offer.partner_id`).
- **Response `200 OK`**:
```json
{
  "id": "18cf1b37-cf86-4bb6-b8db-432d665f9df6",
  "booking_id": "6bb5d969-081a-4efe-9ec2-b5d9f98a49c5",
  "status": "PENDING",
  "offered_at": "2026-10-28T11:00:00Z",
  "expires_at": "2026-10-28T11:01:00Z",
  "remaining_seconds": 42,
  "attempt_number": 1,
  "booking": {
    "id": "6bb5d969-081a-4efe-9ec2-b5d9f98a49c5",
    "scheduled_start": "2026-10-28T11:15:00Z",
    "estimated_duration_minutes": 45,
    "service_area_name": "Madhapur"
  }
}
```

### 4.3 Accept Dispatch Offer
- **Endpoint**: `POST /api/v1/partner/dispatch-offers/{offer_id}/accept/`
- **Auth**: Authenticated partner (must match `offer.partner_id`).
- **Response `200 OK`**:
```json
{
  "id": "18cf1b37-cf86-4bb6-b8db-432d665f9df6",
  "status": "ACCEPTED",
  "responded_at": "2026-10-28T11:00:18Z"
}
```
- **Error Responses**:
  - `400 Bad Request`: `{"error": "Offer is not pending (current status: EXPIRED)."}`
  - `403 Forbidden`: `{"detail": "This offer belongs to another partner."}`
  - `404 Not Found`: `{"error": "Offer not found."}`

### 4.4 Decline Dispatch Offer
- **Endpoint**: `POST /api/v1/partner/dispatch-offers/{offer_id}/decline/`
- **Auth**: Authenticated partner.
- **Behavior**: Transitions status to `DECLINED`, triggers next candidate offer via `reassign_or_downgrade_booking_task`.

---

## 5. Celery Task Documentation

### 5.1 `dispatch_instant_booking_task(booking_id)`
- Evaluates eligible candidates ranked by distance and rating.
- Creates `DispatchOffer` for the top candidate.
- Enqueues `send_dispatch_offer_push_task.delay(offer_id)` on commit.
- Enqueues `expire_dispatch_offer_task.apply_async((offer_id,), countdown=60)` on commit.

### 5.2 `send_dispatch_offer_push_task(offer_id)`
- Verifies offer is still `PENDING`.
- Checks active `PartnerPushSubscription`.
- Invokes OneSignal REST client with `include_aliases: {"external_id": [str(partner.id)]}`.
- If OneSignal indicates subscription invalid or unsubscribed, deactivates subscription and triggers reassignment.

### 5.3 `expire_dispatch_offer_task(offer_id)`
- Uses `select_for_update()`.
- If offer is `PENDING` and `expires_at <= now()`, transitions offer to `EXPIRED`.
- Enqueues `reassign_or_downgrade_booking_task(booking_id, exhausted_partner_ids)`.

### 5.4 `reassign_or_downgrade_booking_task(booking_id, exhausted_partner_ids)`
- If next candidate exists and `attempt_number < MAX_DISPATCH_ATTEMPTS`:
  - Creates next `DispatchOffer` and sends push.
- If attempts exhausted or no candidate remains:
  - Downgrades booking from `INSTANT` to `SCHEDULED`.
  - Assigns earliest available scheduled slot and notifies customer.

### 5.5 Periodic Reconciliations (Celery Beat)
- **`reconcile_expired_dispatch_offers`** (Runs every 30 seconds):
  - Safety net for lost ETA countdowns or worker crashes. Expired pending offers are marked `EXPIRED` safely with row locks.
- **`reconcile_partner_shifts`** (Runs every 5 minutes):
  - Ends shifts where `scheduled_end_at <= now` with `end_reason=SHIFT_EXPIRED`.
  - Ends shifts where partner missed `MAX_CONSECUTIVE_MISSED_OFFERS` (3) with `end_reason=MISSED_OFFERS`.
  - Ends idle shifts (`last_active_at > 30 min` without pending offers) with `end_reason=IDLE_EXPIRED`.

---

## 6. OneSignal Integration Details

- **Web SDK**: OneSignal Web SDK v16 initializes in `frontend/apps/partner`.
- **Opt-in Flow**:
  - `apps/partner/features/notifications/view/job-alerts-banner.tsx` displays the explanatory banner: *"Enable job alerts to receive Instant booking requests even when this app is in the background."*
  - User clicks "Enable Job Alerts" -> triggers `OneSignal.Notifications.requestPermission()`.
  - On opt-in, `OneSignal.User.PushSubscription.id` is read and sent to `/api/v1/partner/push-subscriptions/sync/`.
- **External ID**:
  - Partner ID is bound to OneSignal via `OneSignal.login(partnerId)`.
  - Push dispatch targets `include_aliases: {"external_id": [partner_id]}`.
- **Security Rule**:
  - OneSignal REST API Key (`ONESIGNAL_REST_API_KEY`) is stored strictly in server environment settings (`backend/.env`, `infra/env.production`).
  - Next.js apps only have access to `NEXT_PUBLIC_ONESIGNAL_APP_ID`.

---

## 7. Local Testing Instructions

1. **Start Database & Services**:
   ```bash
   docker compose up -d
   ```
2. **Run Pytest Suite**:
   ```bash
   backend\.venv\Scripts\python.exe -m pytest backend\tests\partners\test_shifts.py backend\tests\assignments\test_push_gated_dispatch.py --reuse-db -o addopts="" -v
   ```
   *Expected result: 8 passed.*

---

## 8. Staging Deployment Checklist

- [ ] Apply database migrations:
  - `python manage.py migrate partners`
  - `python manage.py migrate assignments`
- [ ] Configure environment variables in staging `.env`:
  - `FEATURE_PUSH_GATED_INSTANT=False` (initial deploy)
  - `PARTNER_SHIFT_DEFAULT_DURATION_HOURS=8`
  - `PARTNER_SHIFT_MAX_IDLE_MINUTES=30`
  - `PARTNER_LOCATION_MAX_AGE_MINUTES=30`
  - `DISPATCH_OFFER_EXPIRY_SECONDS=60`
  - `MAX_DISPATCH_ATTEMPTS=5`
  - `MAX_CONSECUTIVE_MISSED_OFFERS=3`
  - `ONESIGNAL_REST_API_KEY=<staging_key>`
- [ ] Verify Celery Beat schedules are running:
  - `reconcile-partner-shifts` (every 300s)
  - `reconcile-expired-dispatch-offers` (every 30s)
- [ ] Verify partner web push opt-in synchronizes subscription to database table `partners_partnerpushsubscription`.

---

## 9. Production Rollout Plan

1. **Phase 1: Shadow / Dark Deploy**:
   - Deploy backend code and migrations with `FEATURE_PUSH_GATED_INSTANT=False`.
   - Verify zero errors on existing heartbeat sessions and checkout availability.
2. **Phase 2: Push Token Gathering**:
   - Deploy partner portal with job alerts banner.
   - Monitor `partners_partnerpushsubscription` row counts as partners opt in.
3. **Phase 3: Area-Specific / Flag Enablement**:
   - Set `FEATURE_PUSH_GATED_INSTANT=True`.
   - Verify partner shift creation on "Start Shift" / "Go Online".
   - Test end-to-end Instant checkout with partner browser backgrounded.
4. **Phase 4: Monitoring**:
   - Monitor `dispatch_offer_created`, `dispatch_offer_accepted`, `dispatch_offer_expired`.

---

## 10. Monitoring and Alerting Recommendations

- **Alert 1: High Offer Expiry Rate**:
  - Metric: `sum(rate(dispatch_offer_expired[5m])) / sum(rate(dispatch_offer_created[5m])) > 0.40`.
  - Meaning: Over 40% of offers expiring without partner response. Check push delivery latency or partner shift idle state.
- **Alert 2: High Customer Downgrade Rate**:
  - Metric: `rate(booking_downgraded_to_scheduled[5m]) > 0.20`.
  - Meaning: Multiple bookings exhausting all dispatch attempts.
- **Alert 3: Celery Beat Reconciler Lag**:
  - Alert if `reconcile_expired_dispatch_offers` has not executed within 120 seconds.

---

## 11. Rollback Plan

- If any unexpected dispatch behavior occurs:
  1. Set `FEATURE_PUSH_GATED_INSTANT=False` in production environment settings.
  2. Reload Django workers (`systemctl reload vsolve-backend`).
  3. System immediately returns to raw heartbeat/presence-based instant availability.
  4. Ongoing `PartnerShift` records remain intact for audit; no data deletion is required.

---

## 12. Known Limitations of Web Push

- **Browser Power Management**: On mobile Android browsers (Chrome), strict OS battery savers can delay web push notifications by 10–30 seconds if the device is in Deep Doze.
- **iOS Safari Limitations**: Web Push on iOS requires the user to add the web app to their Home Screen (PWA mode) and iOS 16.4+. Standalone Safari tabs cannot receive background pushes when closed.
- **User Permission Revocation**: Users may revoke notifications in browser settings without the backend immediately knowing until the next push fails or session syncs.

---

## 13. Future Native-App Migration Path

- The `PartnerPushSubscription` model already includes `platform` choices: `WEB`, `ANDROID`, `IOS`.
- When the native React Native / Flutter Partner App is launched:
  1. The native app initializes the OneSignal Mobile SDK.
  2. The mobile app posts its device token with `platform="ANDROID"` or `platform="IOS"` to `/api/v1/partner/push-subscriptions/sync/`.
  3. Native apps provide high-priority FCM/APNs pushes that wake background processes and display full-screen dispatch alerts immediately, eliminating web browser sleep limits.

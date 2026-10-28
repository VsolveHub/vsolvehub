# OneSignal Instant Booking Dispatch Testing Guide

This guide details how to configure, test, and verify the end-to-end Instant Booking push dispatch flow locally and prepare it for production.

---

## 1. Architecture Overview

1. **Partner Subscription**:
   - Partner logs in on the Partner Portal (`http://localhost:3001`).
   - App calls `OneSignal.login(partner_user_id)` so the OneSignal player/subscription is associated with the partner's Django User UUID (`external_id`).
   - A non-intrusive banner explains: *"Enable job alerts to receive Instant booking requests even when this app is in the background."*
   - Clicking **Enable job alerts** triggers `OneSignal.Slidedown.promptPush()`.
2. **Dispatch Offer Creation**:
   - For an Instant booking, Django creates a `DispatchOffer` (UUID, `booking`, `partner`, `status=PENDING`, `expires_at=now + 60s`).
   - Celery executes `send_dispatch_offer_task(offer_id)` and schedules `expire_dispatch_offer_task(offer_id, countdown=60)`.
3. **Targeted Web Push**:
   - `send_push_to_external_ids([partner.user.id], ...)` calls the OneSignal REST API using `include_aliases: {"external_id": [...]}`.
   - The push notification contains a deep link to `http://localhost:3001/dispatch/{offer_id}`.
4. **Partner Interaction**:
   - Partner clicks the notification (even if browser tab is closed/backgrounded).
   - The dispatch page `/dispatch/{offerId}` displays a live 60-second countdown, booking details, ETA, and **Accept** / **Decline** buttons.
5. **Acceptance / Decline / Expiry**:
   - **Accept**: Sets offer to `ACCEPTED`, sets `responded_at`, cancels any competing pending offers for that booking, marks the booking as confirmed/dispatched.
   - **Decline**: Sets offer to `DECLINED`, triggers immediate reassignment to the next eligible partner.
   - **Expiry (60s timeout)**: If still `PENDING`, sets offer to `EXPIRED` and triggers reassignment or downgrades the booking to `SCHEDULED` if no other partner is available.

---

## 2. Environment Variables Configuration

### Backend (`backend/.env`)

```env
# OneSignal Configuration
ONESIGNAL_APP_ID=a4b12340-473f-4349-a874-bd4d1128688e
ONESIGNAL_REST_API_KEY=os_v2_app_xxxxxxxxxxxxxxxxxxxxxxxx
ONESIGNAL_ENV=local
DISPATCH_OFFER_EXPIRY_SECONDS=60
```

> **Security Note:** `ONESIGNAL_REST_API_KEY` is strictly server-side. It must **never** be exposed in Next.js public variables (`NEXT_PUBLIC_*`).

### Partner Portal (`frontend/apps/partner/.env.local`)

```env
NEXT_PUBLIC_APP_ENV="local"
NEXT_PUBLIC_ONESIGNAL_APP_ID="a4b12340-473f-4349-a874-bd4d1128688e"
NEXT_PUBLIC_API_URL="http://localhost:8000"
```

---

## 3. Required OneSignal Dashboard Configuration

1. Log in to [OneSignal Dashboard](https://dashboard.onesignal.com/).
2. Select or create an App:
   - For local development, use an app dedicated to dev/staging, or configure the Web platform:
3. Navigate to **Settings > Platforms > Web (Custom Code)**:
   - **Site URL**: `http://localhost:3001` (exact origin of the partner portal; change if your local port differs).
   - Under **Advanced**:
     - Enable **Localhost Testing**: toggle to *ON* or ensure `allowLocalhostAsSecureOrigin: true` is enabled in code (handled conditionally when `NEXT_PUBLIC_APP_ENV === "local"`).
4. Verify Worker Files:
   - `OneSignalSDKWorker.js` exists in `frontend/apps/partner/public/OneSignalSDKWorker.js`.
   - Served at `http://localhost:3001/OneSignalSDKWorker.js`.

---

## 4. Local Execution & Startup

### Step 1: Start Redis
Ensure Redis is running locally on port 6379:
```bash
redis-cli ping
# Expected output: PONG
```

### Step 2: Run Django Migrations & Server
```bash
cd backend
.venv\Scripts\python.exe manage.py migrate
.venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000
```

### Step 3: Start Celery Worker
In a separate terminal:
```bash
cd backend
.venv\Scripts\python.exe -m celery -A config worker --loglevel=info --pool=solo
```

### Step 4: Start Partner Frontend
In a separate terminal:
```bash
cd frontend
pnpm --filter partner dev
# Runs on http://localhost:3001
```

---

## 5. Verification Checklist & Testing Steps

### Step 5.1: Verify Partner Subscription & Debug Panel
1. Open Chrome/Edge at `http://localhost:3001`.
2. Log in with a partner account (e.g. `partner1@vsolve.local` or seeded partner phone).
3. Confirm the banner appears at the top:
   > *"Enable job alerts to receive Instant booking requests even when this app is in the background."*
4. Click **Enable job alerts** and allow browser notification permissions when prompted.
5. In the bottom-right corner, check the **OneSignal Dev Debug Panel** (visible only in `local` environment):
   - **Permission**: `granted`
   - **Opted In**: `true`
   - **External ID**: `<partner-user-uuid>`
   - **OneSignal ID**: `<onesignal-player-uuid>`
6. Click **Copy Debug Info** to copy subscription details to clipboard.

### Step 5.2: Test Web Push Delivery
You can test push delivery in three ways:

#### Option A: Debug Panel "Send Test Push" Button
Click **Send test notification** directly in the debug panel. A notification titled *"Test Job Alert"* will be dispatched via Django to your `external_id`.

#### Option B: Dev Endpoint via cURL / Postman
```bash
curl -X POST http://localhost:8000/api/v1/dev/onesignal/test-push/ \
  -H "Content-Type: application/json" \
  -d '{
    "external_id": "<partner-user-uuid>",
    "heading": "Test Instant Job Alert",
    "body": "This is a test notification for instant booking."
  }'
```

#### Option C: Django Management Command
```bash
cd backend
.venv\Scripts\python.exe manage.py test_onesignal_push --external-id="<partner-user-uuid>" --heading="Instant Booking Alert" --body="Test push from CLI"
```

### Step 5.3: Verify Background Push Reception
1. Minimize or background the browser window with the Partner Portal tab, or close the tab (keeping the browser running in background).
2. Trigger the push using one of the methods above.
3. Observe native OS toast notification arriving:
   - Heading: *"Instant Booking Alert"*
   - Body: *"Test push from CLI"*
4. Clicking the notification should focus or launch the browser to the target URL.

---

## 6. End-to-End Dispatch Offer Lifecycle Testing

### Scenario 1: Accept Dispatch Offer
1. Trigger a dispatch offer:
   ```python
   # In Django shell (python manage.py shell):
   from apps.assignments.models import DispatchOffer, Partner
   from apps.commerce.models import Booking
   from apps.assignments.tasks import send_dispatch_offer_task, expire_dispatch_offer_task
   from django.utils import timezone
   from datetime import timedelta

   partner = Partner.objects.first()
   booking = Booking.objects.filter(booking_mode="INSTANT").first()

   offer = DispatchOffer.objects.create(
       booking=booking,
       partner=partner,
       status=DispatchOffer.Status.PENDING,
       expires_at=timezone.now() + timedelta(seconds=60),
   )
   send_dispatch_offer_task.delay(str(offer.id))
   expire_dispatch_offer_task.apply_async(args=[str(offer.id)], countdown=60)
   print(f"Offer ID: {offer.id}")
   ```
2. Partner receives push: *"New Instant job nearby"*.
3. Click push notification to open `http://localhost:3001/dispatch/<offer-id>`.
4. Observe:
   - Dynamic 60s countdown timer ticking down.
   - Service name, ETA ("ASAP (within 30-45 mins)"), and service area.
   - Active **Accept** and **Decline** buttons.
5. Click **Accept Offer**:
   - Status updates to `ACCEPTED`.
   - Success banner displayed.
   - Redirects to `/bookings`.
   - In Django: verify `offer.status == 'ACCEPTED'` and `booking.status in ['CONFIRMED', 'DISPATCHED']`.

### Scenario 2: Decline Dispatch Offer
1. Create a new offer for Partner A.
2. Open `/dispatch/<offer-id>` on Partner A's portal.
3. Click **Decline**:
   - Status transitions to `DECLINED`.
   - UI displays *"Looking for another professional..."*.
   - Django task triggers reassignment to the next ranked partner.

### Scenario 3: Expiry & Downgrade
1. Create a new offer with 60s expiry.
2. Open `/dispatch/<offer-id>` and do not click any button.
3. After countdown reaches 0 (60 seconds):
   - Buttons become disabled.
   - Banner displays: *"This offer has expired."*
   - In Django: Celery task sets `offer.status = 'EXPIRED'`.
   - If no other partners exist, booking mode transitions to `SCHEDULED` and assigns the earliest future slot.

---

## 7. Production Deployment Checklist

- [ ] **OneSignal REST API Key**:
  - Configured securely in backend environment variables or secret manager (`ONESIGNAL_REST_API_KEY`).
  - **Never** prefixed with `NEXT_PUBLIC_` or bundled in frontend client code.
- [ ] **OneSignal Environment**:
  - `ONESIGNAL_ENV=production` in Django backend.
  - `NEXT_PUBLIC_APP_ENV="production"` in Partner Portal frontend.
  - Confirm `allowLocalhostAsSecureOrigin` is `false` in production.
  - Confirm Dev Debug Panel (`OneSignalDebugPanel`) is not rendered in production.
- [ ] **HTTPS & Service Worker**:
  - Partner portal served over valid HTTPS.
  - `OneSignalSDKWorker.js` served at `/OneSignalSDKWorker.js` with root service-worker scope.
- [ ] **OneSignal Web Push Settings**:
  - In OneSignal dashboard: Production Web domain registered with correct HTTPS origin (e.g., `https://partner.vsolve.com`).
- [ ] **Celery Concurrency & Redis**:
  - Celery worker running under `supervisord`, `systemd`, or container orchestration with persistent Redis broker.
  - ETA scheduling configured for `expire_dispatch_offer_task`.
- [ ] **Fail-Closed Safety**:
  - Push delivery alone never confirms a booking.
  - Confirmation is strictly gated behind an authenticated DRF `POST .../accept/` transaction.

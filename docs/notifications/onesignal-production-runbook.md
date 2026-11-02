# OneSignal Web Push Notification Production Runbook

## 1. Overview & Architecture

V-Solve Hub uses **OneSignal Web Push** for transactional browser notifications:
- **Customer App**: High-intent transactional alerts (Booking Updates, Dispatch & Assignment, Arrival/OTP alerts, Account Security).
- **Partner App**: Real-time Instant Booking dispatch offers, shift reminders, product notices, Account Security.

### Scope & Constraints
- **OneSignal Web Push only**: Absolutely no MSG91, SMS, WhatsApp, or voice fallbacks.
- **Permission UX**: Never prompt on app launch, login, signup, catalog browsing, cart, checkout, or payment.
  - Partner: Custom contextual prompt only when partner taps "Go Online".
  - Customer: Custom contextual card on `/bookings/[id]` confirmation screen after completing a booking.
- **Auditable & Traceable**: Every push routes through `NotificationIntent` and `NotificationDelivery`.
- **Kill Switch & Preferences**: The `PUSH` kill switch takes precedence over all sends; user preferences suppress non-critical categories, while `ACCOUNT_SECURITY` is immutable and always delivered.

---

## 2. Configuration & Environment Variables

| Variable | Environment | Description | Default |
| :--- | :--- | :--- | :--- |
| `ONESIGNAL_CUSTOMER_APP_ID` | Production | Customer OneSignal Web Push App ID | Required |
| `ONESIGNAL_CUSTOMER_REST_API_KEY` | Production | REST API Key for Customer OneSignal App | Required |
| `ONESIGNAL_PARTNER_APP_ID` | Production | Partner OneSignal Web Push App ID | Required |
| `ONESIGNAL_PARTNER_REST_API_KEY` | Production | REST API Key for Partner OneSignal App | Required |
| `FEATURE_PUSH_GATED_INSTANT` | Production | Gate Instant Booking candidate ranking on active push subscription | `False` |
| `PUSH_SUBSCRIPTION_FRESHNESS_DAYS`| Production | Max days before a subscription is considered stale | `30` |

> [!IMPORTANT]
> `FEATURE_PUSH_GATED_INSTANT` defaults to `False` in production. It must remain `False` until dark launch subscription population reaches health thresholds.

---

## 3. Observability & Monitoring

### Health Management Command
Operations can run the observability report at any time:
```bash
# Formatted console output for the last 24 hours
python manage.py push_observability_report --hours 24

# Output as JSON for automated pipelines / Grafana scraping
python manage.py push_observability_report --hours 24 --json

# Fail with non-zero exit code if any critical threshold is breached (for CI/monitoring probes)
python manage.py push_observability_report --hours 24 --fail-on-alert
```

### Monitored Alert Thresholds
1. **Sync Failure Rate**: > 10% (Alert: `CUSTOMER_SYNC_FAILURE_HIGH` / `PARTNER_SYNC_FAILURE_HIGH`)
2. **Instant Dispatch Failure Rate**: > 10% (Alert: `DISPATCH_FAILURE_HIGH`)
3. **OneSignal 429 Rate Limit**: > 5% of deliveries (Alert: `ONESIGNAL_429_HIGH`)
4. **OneSignal 5xx Server Errors**: > 1% of deliveries (Alert: `ONESIGNAL_5XX_HIGH`)
5. **Stuck Dispatch Offers**: Any offer in `SENDING` > 5 minutes (Alert: `STUCK_DISPATCH_OFFERS`)
6. **Kill Switch Active**: Push kill switch engaged (Alert: `PUSH_KILL_SWITCH_ACTIVE`)
7. **Missing Credentials**: Any App ID or REST Key unset in production (Alert: `CUSTOMER_ONESIGNAL_UNCONFIGURED` / `PARTNER_ONESIGNAL_UNCONFIGURED`)

---

## 4. Periodic Reconciliation Tasks

Configured via Celery Beat:
1. **`reconcile_stale_push_subscriptions`** (Runs hourly):
   - Deactivates subscriptions older than `PUSH_SUBSCRIPTION_FRESHNESS_DAYS` (30 days).
   - Deduplicates active web subscriptions per user/partner (retains newest, deactivates older).
   - Deactivates subscriptions where recent delivery reported invalid/unsubscribed devices.
2. **`reconcile_onesignal_push_delivery_status_task`** (Runs every 15 minutes):
   - Polls OneSignal View Message API for delivery confirmation and click metrics.
3. **`reconcile_stuck_dispatch_offers_task`** (Runs every 5 minutes):
   - Identifies any dispatch offer stuck in `SENDING` > 5 minutes, marks `FAILED`, and releases lock.

---

## 5. Production Rollout Plan

### Stage 0: Staging Verification
1. Verify Customer & Partner OneSignal Web Push apps receive test notifications.
2. Verify browser permission prompts appear only at value moments (Go Online, Booking Confirmation).
3. Verify `push_observability_report` runs cleanly and reports zero alerts.

### Stage 1: Dark Launch (`FEATURE_PUSH_GATED_INSTANT=false`)
1. Deploy code to production with `FEATURE_PUSH_GATED_INSTANT=false`.
2. Partners and customers will see permission UX and sync active subscriptions to the backend.
3. Instant Booking candidate ranking is **not** gated on push capability; all active partners remain eligible.
4. Monitor subscription opt-in rates over 7 days until:
   - Partner active push reachability reaches >= 65% in active operating zones.
   - Sync failure rate remains < 2%.

### Stage 2: Canary / Limited Cohort Gating (`FEATURE_PUSH_GATED_INSTANT=true` for 10%)
1. Enable push gating for a single pilot service area or 10% canary traffic.
2. Monitor Instant dispatch acceptance latency and dispatch failure rates.
3. Verify offers are sent atomically and only to push-capable partners.

### Stage 3: Full Production Gating (`FEATURE_PUSH_GATED_INSTANT=true`)
1. Set `FEATURE_PUSH_GATED_INSTANT=true` across production.
2. Monitor dispatch acceptance rates, offer timeouts, and customer booking completion.

---

## 6. Incident Response & Rollback Procedures

### Scenario A: Instant Dispatch Offers Failing or Booking Delays
- **Action**: Immediate rollback of dispatch push gating:
  ```bash
  # In production environment settings
  FEATURE_PUSH_GATED_INSTANT=false
  # Restart web workers
  ```
- **Impact**: Instant booking immediately reverts to ungated partner dispatch. Partners without push subscriptions will receive job offers via in-app polling/event stream.

### Scenario B: OneSignal Outage, 5xx Spikes, or Rate Limiting (429)
- **Action**: Engage the PUSH kill switch:
  ```bash
  # Via Django management command:
  python manage.py engage_kill_switch --scope PUSH --reason "OneSignal global outage incident #1234"
  ```
  Or via Operations API:
  `POST /api/v1/operations/kill-switches/` with `{"scope": "PUSH", "reason": "OneSignal API outage"}`
- **Behavior**:
  - All push sends immediately halt without attempting network requests to OneSignal.
  - Deliveries are logged as `BLOCKED` with code `PUSH_KILL_SWITCH_ENABLED`.
  - In-app notification feed and web app operations continue unimpeded.

### Scenario C: Releasing the Kill Switch After Incident Resolution
- Verify OneSignal status page is green and run a dev test push:
  `POST /api/v1/dev/onesignal/test-push/`
- Release the kill switch:
  ```bash
  python manage.py release_kill_switch --scope PUSH
  ```
  Or via Operations API:
  `POST /api/v1/operations/kill-switches/release/` with `{"scope": "PUSH"}`
- Run `python manage.py push_observability_report` to verify delivery health recovers to 100%.


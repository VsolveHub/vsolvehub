# Phase 4 — Backend: push devices, push delivery, app version

**Before you start:** Phase 3 done. For real push later you need `EXPO_ACCESS_TOKEN` from the
owner (put it only in `backend\.env`). This phase works with the fake provider.

## Prompt

```text
Phase 4 of the Vsolve Hub mobile build (backend). Read first: frontend/mobile/AGENTS.md §1 and §7,
frontend/mobile/guide/05-backend.md §3, §4, §5 and §9, and these backend files:
apps/notifications/models.py, services.py (request_notification, record_delivery_attempt,
retryable_intents, MAX_DELIVERY_ATTEMPTS), transport.py (copy its fail-closed style),
templates_registry.py, serializers.py (NotificationSerializer), and config/settings/base.py
(MESSAGE_TRANSPORT block, CELERY_BEAT_SCHEDULE).

Build exactly guide 05 §3, §4 and §5 inside backend/apps/mobile:
1. models.py: PushDevice and PushTicket with the constraints and indexes listed. Generate the
   migration with makemigrations mobile.
2. push_provider.py: PushProviderError, PushProvider protocol, ExpoPushProvider (requests,
   timeouts, chunking, Authorization header only when EXPO_ACCESS_TOKEN is set),
   FakePushProvider, get_push_provider() (fail-closed).
3. push_templates.py: the copy table. First grep the whole backend for channel="PUSH" and
   Channel.PUSH and list every template_code you found in your answer. Each must have a row.
4. services.py: register_device, unregister_device, active_devices_for(user),
   deliver_push_intent, mirror_in_app_notice, check_receipts. Business logic here only.
5. signals.py + apps.py ready(): post_save hooks exactly as guide 05 §4 step 1, using
   transaction.on_commit.
6. tasks.py: Celery tasks deliver_push_intent, mirror_in_app_notice, sweep_pending_push_intents,
   check_push_receipts.
7. Endpoints (views.py, serializers.py, urls.py): POST mobile/devices/,
   POST mobile/devices/unregister/, GET mobile/app-config/. extend_schema on each (tag "Mobile").
8. settings/base.py: the settings block and the two beat entries from guide 05 §5. Nothing else.
9. backend/.env.example is NOT yours: tell me the new variables so I can add them to my own .env
   (MOBILE_PUSH_PROVIDER=fake for now).
10. Tests: backend/tests/mobile/test_devices.py, test_push.py, test_app_config.py covering every
    case in guide 05 §9. Mock HTTP for the Expo provider. No real network calls in tests.
11. Run and paste output (from backend/):
    .\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run --noinput
    .\.venv\Scripts\python.exe -m pytest tests/mobile -q
    .\.venv\Scripts\python.exe -m pytest tests/notifications tests/assignments -q
    .\scripts\quality-static.cmd  (regenerate the contract first if only drift fails)
Do not edit any file in apps/notifications or apps/assignments.
```

## TODO

- [ ] models + migration
- [ ] Expo provider (fail-closed, timeouts) + fake
- [ ] every PUSH template code has copy
- [ ] PUSH intents delivered; in-app notices mirrored to push
- [ ] sweep + receipts beat tasks
- [ ] 3 endpoints
- [ ] tests pass; notification/assignment tests still pass; quality-static passes

## Done when

- [ ] real passing output shown for all commands
- [ ] you added `MOBILE_PUSH_PROVIDER=fake` to your `backend\.env` and restarted server, worker
      and beat

## Commit

```powershell
git add backend/apps/mobile backend/tests/mobile backend/config/settings/base.py contracts/openapi/v1.yaml
git commit -m "feat(mobile-api): push devices, Expo push delivery and app version gate"
```

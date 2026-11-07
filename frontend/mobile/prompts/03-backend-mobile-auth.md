# Phase 3 — Backend: mobile sign-in

**Before you start:** backend running locally, `backend\.venv` exists.

## Prompt

```text
Phase 3 of the Vsolve Hub mobile build (backend). Read first: root AGENTS.md (Python environment,
Quality rules, Git), frontend/mobile/AGENTS.md §1 and §7, frontend/mobile/guide/05-backend.md §1,
§2 and §9 (auth part). Also read backend/apps/identity/views.py (OtpVerifyView),
apps/identity/services.py (create_authenticated_session, revoke_current_session),
apps/identity/authentication.py and backend/tests/identity/ to copy the test style.

Build exactly guide 05 §1 and §2:
1. Create the Django app backend/apps/mobile (apps.py MobileConfig, name "apps.mobile").
   Register it: add "apps.mobile" to INSTALLED_APPS in backend/config/settings/base.py.
2. apps/mobile/middleware.py: BearerAwareSessionMiddleware (subclass of Django SessionMiddleware),
   behaviour exactly as guide 05 §1. In MIDDLEWARE, replace the
   "django.contrib.sessions.middleware.SessionMiddleware" line with it, same position.
3. apps/mobile/serializers.py: MobileAuthenticatedSessionSerializer (AuthenticatedSessionSerializer
   + session_token). A verify serializer that reuses OtpVerifySerializer but requires a non-blank
   device_identifier.
4. apps/mobile/views.py: MobileOtpVerifyView at POST auth/mobile/otp/verify/ with extend_schema
   (tag Authentication, 200 MobileAuthenticatedSessionSerializer, 400 ApiErrorSerializer).
   apps/mobile/urls.py with that route under "auth/mobile/otp/verify/". In backend/config/urls.py
   add ONE line: path("api/v1/", include("apps.mobile.urls")).
5. Tests in backend/tests/mobile/test_auth.py covering every auth case in guide 05 §9.
6. Run and paste output (from backend/):
   .\.venv\Scripts\python.exe -m pytest tests/mobile -q
   .\.venv\Scripts\python.exe -m pytest tests/identity -q   (must still pass: cookie flow unchanged)
   .\scripts\quality-static.cmd
   quality-static includes the contract drift check. If it fails only because the contract is
   not regenerated yet, regenerate it with the spectacular command from guide 10 and re-run.
Never log the OTP code or the session token. Do not change any other file in apps/identity.
```

## TODO

- [x] `apps.mobile` created and registered
- [x] `BearerAwareSessionMiddleware` replaces `SessionMiddleware`
- [x] `POST /api/v1/auth/mobile/otp/verify/` returns `session_token`
- [x] auth tests written and passing; identity tests still pass
- [x] `quality-static.cmd` passes

## Done when

- [x] the assistant shows real passing output for all three commands
- [x] a quick manual check (ask the assistant to run it with `curl.exe`): request an OTP, verify via
      the mobile endpoint, then call `GET /api/v1/auth/session/` with `Authorization: Bearer <token>`,
      which answers as signed in

## Commit

```powershell
git add backend/apps/mobile backend/tests/mobile backend/config/settings/base.py backend/config/urls.py contracts/openapi/v1.yaml
git commit -m "feat(mobile-api): bearer session sign-in for native apps"
```

## Status

- **Status:** Complete (100% implemented)
- **Implementation:** `apps.mobile` with `BearerAwareSessionMiddleware`, `POST /api/v1/auth/mobile/otp/verify/` returning `session_token`, and comprehensive auth tests in `backend/tests/mobile/test_auth.py`.

"""Local development settings."""

from pathlib import Path

import environ

_backend_dir = Path(__file__).resolve().parents[2]
environ.Env.read_env(_backend_dir / ".env", overwrite=False)

from config.settings.base import *  # noqa: E402

# Base settings keep connections open for 60s (CONN_MAX_AGE), which is fine in
# production behind a pooler. Locally, three Next.js apps SSR-fanning catalog
# reads in parallel can exhaust Postgres's connection limit — close after each
# request instead.
DATABASES["default"]["CONN_MAX_AGE"] = 0

DEBUG = env.bool("DJANGO_DEBUG", default=True)
API_DOCS_ENABLED = env.bool("API_DOCS_ENABLED", default=True)
OTP_PROVIDER = env("OTP_PROVIDER", default="development")
OTP_DEVELOPMENT_CODE_ENABLED = env.bool("OTP_DEVELOPMENT_CODE_ENABLED", default=True)
GEOCODING_PROVIDER = env("GEOCODING_PROVIDER", default="nominatim")

# Money providers default to the deterministic fakes locally.
#
# Both are fail-closed by default — `unconfigured` raises rather than guessing — which is right
# for every environment that is not this one. Naming them here is what lets a developer drive a
# booking through capture and a payout run through settlement without credentials, and
# `PAYOUTS_ALLOW_FAKE_PROVIDER` is what `get_payout_provider` checks before letting the fake run
# outside `DEBUG`. Production refuses all three.
PAYMENT_PROVIDER = env("PAYMENT_PROVIDER", default="fake")
PAYOUT_PROVIDER = env("PAYOUT_PROVIDER", default="fake")
PAYOUTS_ALLOW_FAKE_PROVIDER = env.bool("PAYOUTS_ALLOW_FAKE_PROVIDER", default=True)
PAYMENTS_ALLOW_SIMULATED_CAPTURE = env.bool("PAYMENTS_ALLOW_SIMULATED_CAPTURE", default=True)

REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"] = [
    *REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"],
    "rest_framework.renderers.BrowsableAPIRenderer",
]

# Off by default, because local development is plain HTTP and a `Secure` cookie would never be
# stored at all. They exist as switches for the tunnelled-phone case: a cross-site session needs
# `SameSite=None`, browsers refuse `None` without `Secure`, and a tunnel is HTTPS anyway. Set all
# four together or none of them — see the note on `SESSION_COOKIE_SAMESITE` in base settings.
SESSION_COOKIE_SECURE = env.bool("SESSION_COOKIE_SECURE", default=False)
CSRF_COOKIE_SECURE = env.bool("CSRF_COOKIE_SECURE", default=False)

EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

MESSAGE_TRANSPORT = env("MESSAGE_TRANSPORT", default="fake")
NOTIFICATIONS_ALLOW_FAKE_TRANSPORT = env.bool("NOTIFICATIONS_ALLOW_FAKE_TRANSPORT", default=True)

"""Production settings. Every secret and origin must be provided explicitly."""

from django.core.exceptions import ImproperlyConfigured

from config.settings.base import *
from config.settings.guards import guard_per_host_sessions

DEBUG = False

MINIMUM_SECRET_KEY_LENGTH = 50
MINIMUM_WEBHOOK_SECRET_LENGTH = 32

if SECRET_KEY.startswith("unsafe-") or len(SECRET_KEY) < MINIMUM_SECRET_KEY_LENGTH:
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must be a strong production secret.")
if not ALLOWED_HOSTS:
    raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS must be configured.")
if not CORS_ALLOWED_ORIGINS:
    raise ImproperlyConfigured("CORS_ALLOWED_ORIGINS must list every deployed frontend origin.")
if not CSRF_TRUSTED_ORIGINS:
    raise ImproperlyConfigured(
        "DJANGO_CSRF_TRUSTED_ORIGINS must list every deployed frontend origin."
    )
if not set(CORS_ALLOWED_ORIGINS).issubset(CSRF_TRUSTED_ORIGINS):
    raise ImproperlyConfigured(
        "Every credentialed CORS origin must also be present in DJANGO_CSRF_TRUSTED_ORIGINS."
    )
if any(not origin.startswith("https://") for origin in CORS_ALLOWED_ORIGINS):
    raise ImproperlyConfigured("Production CORS origins must use HTTPS.")
if "date" not in {header.strip().lower() for header in CORS_EXPOSE_HEADERS}:
    raise ImproperlyConfigured(
        "CORS_EXPOSE_HEADERS must include Date so browser clients can calibrate the server "
        "clock. Without it every deadline countdown silently uses the device clock."
    )

SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True


guard_per_host_sessions(SESSION_COOKIE_DOMAIN, CSRF_COOKIE_DOMAIN)

SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=True)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=3600)
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = env.bool("SECURE_HSTS_PRELOAD", default=False)

API_DOCS_ENABLED = env.bool("API_DOCS_ENABLED", default=False)

if OTP_PROVIDER == "development" or OTP_DEVELOPMENT_CODE_ENABLED:
    raise ImproperlyConfigured("Development OTP delivery/exposure is forbidden in production.")
if GEOCODING_PROVIDER == "unconfigured":
    raise ImproperlyConfigured("GEOCODING_PROVIDER must be configured in production.")
if "configure-production-contact" in GEOCODING_USER_AGENT:
    raise ImproperlyConfigured("GEOCODING_USER_AGENT must identify a production contact.")
# Files on a server's own disk vanish when it is replaced: production keeps every file in R2.
if not R2_PUBLIC_ENABLED:
    raise ImproperlyConfigured(
        "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BUCKET and "
        "R2_PUBLIC_BASE_URL must be configured in production."
    )
if not R2_PUBLIC_BASE_URL.startswith("https://"):
    raise ImproperlyConfigured("R2_PUBLIC_BASE_URL must be an https:// address.")
if not R2_PRIVATE_ENABLED:
    raise ImproperlyConfigured("R2_PRIVATE_BUCKET must be configured in production.")
if R2_PRIVATE_BUCKET == R2_PUBLIC_BUCKET:
    raise ImproperlyConfigured("R2_PRIVATE_BUCKET must not be the public photo bucket.")
if DOCUMENT_STORAGE_PROVIDER not in {"r2", "supabase"}:
    raise ImproperlyConfigured("DOCUMENT_STORAGE_PROVIDER must be r2 or supabase in production.")
if DOCUMENT_STORAGE_PROVIDER == "supabase" and not SUPABASE_STORAGE_URL.startswith("https://"):
    raise ImproperlyConfigured("SUPABASE_STORAGE_URL must be an HTTPS Storage API URL.")
if DOCUMENT_STORAGE_PROVIDER == "supabase" and not SUPABASE_SERVICE_ROLE_KEY:
    raise ImproperlyConfigured("SUPABASE_SERVICE_ROLE_KEY must be configured in production.")
if not PARTNER_DOCUMENT_BUCKET:
    raise ImproperlyConfigured("PARTNER_DOCUMENT_BUCKET must be configured in production.")
if PARTNER_DOCUMENT_REVIEW_URL_TTL_SECONDS <= 0:
    raise ImproperlyConfigured("PARTNER_DOCUMENT_REVIEW_URL_TTL_SECONDS must be positive.")
if PARTNER_DOCUMENT_ORPHAN_RETENTION_HOURS <= 0:
    raise ImproperlyConfigured("PARTNER_DOCUMENT_ORPHAN_RETENTION_HOURS must be positive.")
if PAYMENT_PROVIDER != "razorpay":
    raise ImproperlyConfigured("PAYMENT_PROVIDER must be razorpay in production.")

# An unconfigured transport refuses to send. Production must never run the fake, which accepts
# every message and would make an unheard deadline look delivered. MSG91 is wired; selecting it
# without the auth key must not boot.
if MESSAGE_TRANSPORT == "msg91" and not MSG91_AUTH_KEY:
    raise ImproperlyConfigured("MSG91_AUTH_KEY must be set when MESSAGE_TRANSPORT is msg91.")
if OTP_PROVIDER == "msg91" and not (MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID):
    raise ImproperlyConfigured(
        "MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID must be set when OTP_PROVIDER is msg91."
    )
if MESSAGE_TRANSPORT == "fake" or NOTIFICATIONS_ALLOW_FAKE_TRANSPORT:
    raise ImproperlyConfigured(
        "The fake message transport must stay off in production. It reports every message as "
        "accepted without sending it."
    )

# Refused at start-up rather than checked at the endpoint. A flag that lets a caller
# mark their own money received is the single most valuable switch in this codebase to
# flip by accident, and the cheapest place to make that impossible is a deploy that
# will not boot with it on.
if PAYMENTS_ALLOW_SIMULATED_CAPTURE:
    raise ImproperlyConfigured(
        "PAYMENTS_ALLOW_SIMULATED_CAPTURE must stay off in production. It lets a caller "
        "mark a payment captured without a provider."
    )
if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
    raise ImproperlyConfigured("Razorpay server credentials must be configured in production.")
if len(PAYMENT_WEBHOOK_SECRET) < MINIMUM_WEBHOOK_SECRET_LENGTH:
    raise ImproperlyConfigured("PAYMENT_WEBHOOK_SECRET must contain at least 32 characters.")
if not RAZORPAY_API_BASE_URL.startswith("https://"):
    raise ImproperlyConfigured("RAZORPAY_API_BASE_URL must use HTTPS.")

# Payouts. `unconfigured` is a valid production state (payouts off). The fake never is, and a
# RazorpayX deployment must be able to verify its webhooks, so an empty secret refuses to boot.
if PAYOUT_PROVIDER == "fake" or PAYOUTS_ALLOW_FAKE_PROVIDER:
    raise ImproperlyConfigured("The fake payout provider must stay off in production.")
if PAYOUT_PROVIDER == "razorpayx":
    if not (RAZORPAYX_KEY_ID and RAZORPAYX_KEY_SECRET and RAZORPAYX_ACCOUNT_NUMBER):
        raise ImproperlyConfigured(
            "RAZORPAYX_KEY_ID, RAZORPAYX_KEY_SECRET and RAZORPAYX_ACCOUNT_NUMBER must be set "
            "when PAYOUT_PROVIDER is razorpayx."
        )
    if len(RAZORPAYX_WEBHOOK_SECRET) < MINIMUM_WEBHOOK_SECRET_LENGTH:
        raise ImproperlyConfigured("RAZORPAYX_WEBHOOK_SECRET must contain at least 32 characters.")
    if not RAZORPAYX_API_BASE_URL.startswith("https://"):
        raise ImproperlyConfigured("RAZORPAYX_API_BASE_URL must use HTTPS.")
if PAYOUTS_LIVE_ENABLED and PAYOUT_PROVIDER != "razorpayx":
    raise ImproperlyConfigured("PAYOUTS_LIVE_ENABLED requires PAYOUT_PROVIDER=razorpayx.")

if not PAYMENT_LIVE_COLLECTIONS_APPROVED:
    raise ImproperlyConfigured(
        "PAYMENT_LIVE_COLLECTIONS_APPROVED requires CA/legal approval before live collection."
    )

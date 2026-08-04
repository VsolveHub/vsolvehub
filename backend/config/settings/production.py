"""Production settings. Every secret and origin must be provided explicitly."""

from django.core.exceptions import ImproperlyConfigured

from config.settings.base import *

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
if DOCUMENT_STORAGE_PROVIDER != "supabase":
    raise ImproperlyConfigured("DOCUMENT_STORAGE_PROVIDER must be supabase in production.")
if not SUPABASE_STORAGE_URL.startswith("https://"):
    raise ImproperlyConfigured("SUPABASE_STORAGE_URL must be an HTTPS Storage API URL.")
if not SUPABASE_SERVICE_ROLE_KEY:
    raise ImproperlyConfigured("SUPABASE_SERVICE_ROLE_KEY must be configured in production.")
if not PARTNER_DOCUMENT_BUCKET:
    raise ImproperlyConfigured("PARTNER_DOCUMENT_BUCKET must be configured in production.")
if PARTNER_DOCUMENT_REVIEW_URL_TTL_SECONDS <= 0:
    raise ImproperlyConfigured("PARTNER_DOCUMENT_REVIEW_URL_TTL_SECONDS must be positive.")
if PARTNER_DOCUMENT_ORPHAN_RETENTION_HOURS <= 0:
    raise ImproperlyConfigured("PARTNER_DOCUMENT_ORPHAN_RETENTION_HOURS must be positive.")
if PAYMENT_PROVIDER != "razorpay":
    raise ImproperlyConfigured("PAYMENT_PROVIDER must be razorpay in production.")
if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
    raise ImproperlyConfigured("Razorpay server credentials must be configured in production.")
if len(PAYMENT_WEBHOOK_SECRET) < MINIMUM_WEBHOOK_SECRET_LENGTH:
    raise ImproperlyConfigured("PAYMENT_WEBHOOK_SECRET must contain at least 32 characters.")
if not RAZORPAY_API_BASE_URL.startswith("https://"):
    raise ImproperlyConfigured("RAZORPAY_API_BASE_URL must use HTTPS.")
if not PAYMENT_LIVE_COLLECTIONS_APPROVED:
    raise ImproperlyConfigured(
        "PAYMENT_LIVE_COLLECTIONS_APPROVED requires CA/legal approval before live collection."
    )

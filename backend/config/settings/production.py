"""Production settings. Every secret and origin must be provided explicitly."""

from django.core.exceptions import ImproperlyConfigured

from config.settings.base import *

DEBUG = False

MINIMUM_SECRET_KEY_LENGTH = 50

if SECRET_KEY.startswith("unsafe-") or len(SECRET_KEY) < MINIMUM_SECRET_KEY_LENGTH:
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must be a strong production secret.")
if not ALLOWED_HOSTS:
    raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS must be configured.")

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

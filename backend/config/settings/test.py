"""Automated-test settings."""

from config.settings.base import *

DEBUG = False
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "vsolve-tests",
    },
}

CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
OTP_PROVIDER = "development"
OTP_DEVELOPMENT_CODE_ENABLED = True
GEOCODING_PROVIDER = "unconfigured"
PAYMENT_PROVIDER = "fake"
PAYMENT_WEBHOOK_SECRET = SECRET_KEY
PAYMENT_LEGAL_ENTITY_CODE = "vsolve-test"
PAYMENT_LIVE_COLLECTIONS_APPROVED = False

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

MESSAGE_TRANSPORT = "fake"
NOTIFICATIONS_ALLOW_FAKE_TRANSPORT = True

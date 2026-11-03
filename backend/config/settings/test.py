"""Automated-test settings."""

from config.settings.base import *
from config.settings.guards import guard_razorpayx_test_keys

DEBUG = False
# Automated suites never call RazorpayX, but a live key in the environment is still refused.
guard_razorpayx_test_keys(RAZORPAYX_KEY_ID)
# Suites that settle a visit and pay it in the same test would otherwise wait three days. The
# clearing window has its own tests, which set it back to the production value.
PAYOUT_CLEARING_HOURS = 0
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
CUSTOMER_SITE_URL = "https://customer.example.test"
PAYMENT_WEBHOOK_SECRET = SECRET_KEY
PAYMENT_LEGAL_ENTITY_CODE = "vsolve-test"
PAYMENT_LIVE_COLLECTIONS_APPROVED = False

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

MESSAGE_TRANSPORT = "fake"
NOTIFICATIONS_ALLOW_FAKE_TRANSPORT = True

ONESIGNAL_PARTNER_APP_ID = "test-partner-app-id"
ONESIGNAL_PARTNER_REST_API_KEY = "test-partner-rest-key"
ONESIGNAL_CUSTOMER_APP_ID = "test-customer-app-id"
ONESIGNAL_CUSTOMER_REST_API_KEY = "test-customer-rest-key"

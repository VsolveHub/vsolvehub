"""Settings for the real-Redis, real-worker integration suite.

Deliberately NOT derived from config.settings.test: the entire value of this suite is that
CELERY_TASK_ALWAYS_EAGER is off and a separate process does the work. Eager mode has never
proven anything about ordering, retries or crash recovery.

This module lists a test-only app (`tests.integration.support`) so that the pytest process and
the worker subprocess register the same outbox handlers. No other settings module does.
"""

from config.settings.base import *
from config.settings.guards import guard_razorpayx_test_keys

DEBUG = False
guard_razorpayx_test_keys(RAZORPAYX_KEY_ID)
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

INSTALLED_APPS = [*INSTALLED_APPS, "tests.integration.support.apps.IntegrationSupportConfig"]

CELERY_TASK_ALWAYS_EAGER = False
CELERY_TASK_EAGER_PROPAGATES = False
CELERY_BROKER_URL = env(
    "CELERY_INTEGRATION_BROKER_URL",
    default="redis://127.0.0.1:56379/11",
)
CELERY_RESULT_BACKEND = env(
    "CELERY_INTEGRATION_RESULT_BACKEND",
    default="redis://127.0.0.1:56379/12",
)

# The slow handler blocks for two minutes so a test can kill the worker mid-command. The
# default 60s task time limit would terminate it first and the test would prove nothing.
CELERY_TASK_TIME_LIMIT = 600
CELERY_TASK_SOFT_TIME_LIMIT = 570

OTP_PROVIDER = "development"
OTP_DEVELOPMENT_CODE_ENABLED = True
GEOCODING_PROVIDER = "unconfigured"
PAYMENT_PROVIDER = "fake"
PAYMENT_WEBHOOK_SECRET = SECRET_KEY
PAYMENT_LEGAL_ENTITY_CODE = "vsolve-integration"
PAYMENT_LIVE_COLLECTIONS_APPROVED = False

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

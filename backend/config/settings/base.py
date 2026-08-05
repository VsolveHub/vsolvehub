"""Settings shared by every Vsolve Hub backend environment."""

from pathlib import Path

import environ
from corsheaders.defaults import default_headers

BASE_DIR = Path(__file__).resolve().parents[2]

env = environ.Env(
    DJANGO_DEBUG=(bool, False),
    API_DOCS_ENABLED=(bool, False),
    SECURE_HSTS_SECONDS=(int, 0),
)

SECRET_KEY = env("DJANGO_SECRET_KEY", default="unsafe-development-only")
DEBUG = env.bool("DJANGO_DEBUG")
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])
CSRF_TRUSTED_ORIGINS = env.list("DJANGO_CSRF_TRUSTED_ORIGINS", default=[])
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = (*default_headers, "idempotency-key")
# A browser hides every response header outside the CORS safelist from JavaScript,
# and `Date` is not on that safelist.  Shared countdown calibration reads it on every
# response, so leaving it unexposed makes each offer, undo, hold and OTP deadline
# measure against the device clock with no error state to reveal it.
CORS_EXPOSE_HEADERS = env.list("CORS_EXPOSE_HEADERS", default=["Date"])
CORS_URLS_REGEX = r"^/api/.*$"

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
    "rest_framework",
    "apps.health",
    "apps.foundation",
    "apps.identity",
    "apps.carts",
    "apps.assignments",
    "apps.commerce",
    "apps.fulfilment",
    "apps.catalog",
    "apps.pricing",
    "apps.locations",
    "apps.partners",
]

MIDDLEWARE = [
    "common.observability.middleware.RequestIdMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": env.db(
        "DATABASE_URL",
        default="postgresql://vsolve:vsolve-local-only@127.0.0.1:15432/vsolve",
    ),
}
DATABASES["default"]["CONN_MAX_AGE"] = 60
DATABASES["default"]["CONN_HEALTH_CHECKS"] = True

CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": env("REDIS_URL", default="redis://127.0.0.1:56379/0"),
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
            "SOCKET_CONNECT_TIMEOUT": 2,
            "SOCKET_TIMEOUT": 2,
        },
    },
}

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

LANGUAGE_CODE = "en-in"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "identity.User"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.identity.authentication.RevocableSessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "common.errors.handler.api_exception_handler",
    "NON_FIELD_ERRORS_KEY": "non_field_errors",
    "DEFAULT_THROTTLE_RATES": {
        "geocoding": "30/min",
        "serviceability": "60/min",
    },
}

# M1 operational limits.  These are server-authoritative and deliberately
# separate from editable commercial configuration such as tax and platform fee.
M1_PARTNER_SEARCH_TIMEOUT_SECONDS = 180
M1_PAYMENT_WINDOW_SECONDS = 300
M1_TODAY_LEAD_TIME_MINUTES = 120
M1_SCHEDULED_MAX_DAYS = 7
M1_ARRIVAL_WINDOW_MINUTES = 60
M1_WINDOW_TOKEN_TTL_SECONDS = 15 * 60
M1_QUOTE_TTL_SECONDS = 15 * 60
M1_PARTNER_OFFER_TIMEOUT_SECONDS = 45
M1_PARTNER_SEARCH_CANDIDATE_LIMIT = 3
M1_PARTNER_UNDO_TIMEOUT_SECONDS = 120
M1_CART_ITEM_LIMIT = 5
M1_FULFILMENT_UNIT_LIMIT = 5
M1_CONCURRENT_PARTNER_LIMIT = 2
M1_SEQUENTIAL_UNIT_MAX_MINUTES = 240
M1_FULFILMENT_PLAN_LIMIT = 3
M1_FULFILMENT_PLAN_TTL_SECONDS = 15 * 60

# M1 booking-fulfilment clocks (05-initial-configuration.md).
M1_LATE_ARRIVAL_GRACE_MINUTES = 15
M1_CUSTOMER_WAIT_MINUTES = 10
M1_CUSTOMER_CONTACT_ATTEMPT_MINUTES = (0, 5)
M1_START_OTP_TTL_SECONDS = 5 * 60
M1_START_OTP_MAX_ATTEMPTS = 5
M1_COMPLETION_RESPONSE_HOURS = 24
M1_QUALITY_DISPUTE_WINDOW_HOURS = 72
M1_SCOPE_AMENDMENT_RESPONSE_MINUTES = 30
# The earliest a Customer may move a visit to. Mirrors the fee ladder's two-hour boundary below,
# which the frozen configuration already treats as "too close to the visit to change for free".
# A guard that only required a *future* time let a Customer 24h out drop the visit to twenty
# minutes away, make the Partner unreachably late, and waive their own cancellation fee.
M1_RESCHEDULE_MIN_NOTICE_MINUTES = 120
M1_CANCELLATION_BAND_MORE_THAN_24H = "more-than-24-hours"
M1_CANCELLATION_BAND_24_TO_2H = "24-to-2-hours"
M1_CANCELLATION_BAND_LESS_THAN_2H = "less-than-2-hours"
M1_CANCELLATION_BAND_VERIFIED_ARRIVAL = "verified-arrival"

SPECTACULAR_SETTINGS = {
    "TITLE": "Vsolve Hub API",
    "DESCRIPTION": "Authoritative API for Vsolve Hub customer, partner and operations clients.",
    "VERSION": "1.16.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": r"/api/v1",
    "COMPONENT_SPLIT_REQUEST": True,
    "SORT_OPERATIONS": True,
    "POSTPROCESSING_HOOKS": [
        "drf_spectacular.hooks.postprocess_schema_enums",
        "common.schema.publish_parameter_enum_components",
    ],
    # Every choice set that shares a field name with another must be named here.
    # Left to itself the generator resolves a collision by hashing — `Status7a2Enum`,
    # `Kind0bfEnum` — and those names reach the published contract and the generated
    # TypeScript client, where they mean nothing to a reader and change whenever an
    # unrelated model adds a choice.
    "ENUM_NAME_OVERRIDES": {
        "PartnerApplicationStatusEnum": "apps.partners.models.PartnerApplication.Status",
        "PartnerDocumentKindEnum": "apps.partners.models.PartnerDocument.Kind",
        "QuoteLineKindEnum": "apps.carts.models.QuoteLine.Kind",
        "PrivacyRequestKindEnum": "apps.identity.models.PrivacyRequest.Kind",
        "ScopeAmendmentStatusEnum": "apps.fulfilment.models.ScopeAmendment.Status",
        "ScopeAmendmentLineKindEnum": "apps.fulfilment.models.ScopeAmendmentLine.Kind",
        "WorkTaskKindEnum": "apps.fulfilment.models.WorkTask.Kind",
        "WorkEvidenceKindEnum": "apps.fulfilment.models.WorkEvidence.Kind",
        "WorkOutcomeEnum": "apps.fulfilment.models.WorkOutcome.Outcome",
        "BookingStatusEnum": "apps.commerce.models.Booking.Status",
        # Named so the *existing* `DecisionEnum` keeps its name. Adding a second `decision`
        # field made the generator disambiguate both, silently renaming a component the admin
        # app already imported — a published rename is a breaking change, and a new model is
        # not a reason to inflict one on an existing consumer.
        "CompletionResponseDecisionEnum": "apps.fulfilment.models.CompletionResponse.Decision",
    },
}
API_DOCS_ENABLED = env.bool("API_DOCS_ENABLED")

SESSION_COOKIE_NAME = "vsolve_session"
SESSION_COOKIE_AGE = 60 * 60 * 24 * 30
SESSION_SAVE_EVERY_REQUEST = False

OTP_CODE_LENGTH = 6
OTP_TTL_SECONDS = 5 * 60
OTP_RESEND_COOLDOWN_SECONDS = 60
OTP_RATE_WINDOW_SECONDS = 10 * 60
OTP_PHONE_RATE_LIMIT = 5
OTP_IP_RATE_LIMIT = 20
OTP_PROVIDER = env("OTP_PROVIDER", default="unconfigured")
OTP_DEVELOPMENT_CODE_ENABLED = env.bool("OTP_DEVELOPMENT_CODE_ENABLED", default=False)
FINANCE_STEP_UP_TTL_SECONDS = env.int("FINANCE_STEP_UP_TTL_SECONDS", default=10 * 60)
OPERATIONS_STEP_UP_TTL_SECONDS = env.int("OPERATIONS_STEP_UP_TTL_SECONDS", default=10 * 60)

PAYMENT_PROVIDER = env("PAYMENT_PROVIDER", default="unconfigured")
PAYMENT_WEBHOOK_SECRET = env("PAYMENT_WEBHOOK_SECRET", default="")
RAZORPAY_API_BASE_URL = env("RAZORPAY_API_BASE_URL", default="https://api.razorpay.com/v1")
RAZORPAY_KEY_ID = env("RAZORPAY_KEY_ID", default="")
RAZORPAY_KEY_SECRET = env("RAZORPAY_KEY_SECRET", default="")
PAYMENT_PROVIDER_CONNECT_TIMEOUT_SECONDS = env.float(
    "PAYMENT_PROVIDER_CONNECT_TIMEOUT_SECONDS", default=3.0
)
PAYMENT_PROVIDER_READ_TIMEOUT_SECONDS = env.float(
    "PAYMENT_PROVIDER_READ_TIMEOUT_SECONDS", default=10.0
)
PAYMENT_LEGAL_ENTITY_CODE = env("PAYMENT_LEGAL_ENTITY_CODE", default="vsolve")
PAYMENT_LIVE_COLLECTIONS_APPROVED = env.bool("PAYMENT_LIVE_COLLECTIONS_APPROVED", default=False)

GEOCODING_PROVIDER = env("GEOCODING_PROVIDER", default="unconfigured")
GEOCODING_NOMINATIM_URL = env(
    "GEOCODING_NOMINATIM_URL",
    default="https://nominatim.openstreetmap.org",
)
GEOCODING_USER_AGENT = env(
    "GEOCODING_USER_AGENT",
    default="VsolveHub/0.1 (configure-production-contact)",
)
GEOCODING_TIMEOUT_SECONDS = env.float("GEOCODING_TIMEOUT_SECONDS", default=3.0)
GEOCODING_CACHE_SECONDS = env.int("GEOCODING_CACHE_SECONDS", default=60 * 60 * 24 * 7)
GEOCODING_CACHE_COORDINATE_PRECISION = env.int(
    "GEOCODING_CACHE_COORDINATE_PRECISION",
    default=5,
)

PARTNER_REQUIRED_DOCUMENT_KINDS = ("GOVERNMENT_ID",)
DOCUMENT_STORAGE_PROVIDER = env("DOCUMENT_STORAGE_PROVIDER", default="unconfigured")
SUPABASE_STORAGE_URL = env("SUPABASE_STORAGE_URL", default="")
SUPABASE_SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY", default="")
PARTNER_DOCUMENT_BUCKET = env("PARTNER_DOCUMENT_BUCKET", default="partner-kyc")
DOCUMENT_STORAGE_CONNECT_TIMEOUT_SECONDS = env.float(
    "DOCUMENT_STORAGE_CONNECT_TIMEOUT_SECONDS",
    default=3.0,
)
DOCUMENT_STORAGE_READ_TIMEOUT_SECONDS = env.float(
    "DOCUMENT_STORAGE_READ_TIMEOUT_SECONDS",
    default=15.0,
)
PARTNER_DOCUMENT_REVIEW_URL_TTL_SECONDS = env.int(
    "PARTNER_DOCUMENT_REVIEW_URL_TTL_SECONDS",
    default=300,
)
PARTNER_DOCUMENT_ORPHAN_RETENTION_HOURS = env.int(
    "PARTNER_DOCUMENT_ORPHAN_RETENTION_HOURS",
    default=24,
)
FULFILMENT_EVIDENCE_BUCKET = env("FULFILMENT_EVIDENCE_BUCKET", default="fulfilment-evidence")
PARTNER_PRESENCE_TTL_SECONDS = env.int("PARTNER_PRESENCE_TTL_SECONDS", default=90)
PARTNER_PRESENCE_DB_TOUCH_SECONDS = env.int(
    "PARTNER_PRESENCE_DB_TOUCH_SECONDS",
    default=300,
)
PARTNER_LOCATION_MAX_ACCURACY_METERS = env.int(
    "PARTNER_LOCATION_MAX_ACCURACY_METERS",
    default=500,
)
PARTNER_LOCATION_STALE_SECONDS = env.int(
    "PARTNER_LOCATION_STALE_SECONDS",
    default=30 * 60,
)

CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://127.0.0.1:56379/1")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default="redis://127.0.0.1:56379/2")
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_TASK_TIME_LIMIT = env.int("CELERY_TASK_TIME_LIMIT_SECONDS", default=60)
CELERY_TASK_SOFT_TIME_LIMIT = env.int("CELERY_TASK_SOFT_TIME_LIMIT_SECONDS", default=45)

# `OutboxEvent.available_at` is a visibility deadline, not a creation stamp. A worker that claims
# an event pushes the deadline out by the lease; a worker that dies without publishing lets the
# deadline lapse, and the recovery sweep re-drives the event. The lease must exceed
# CELERY_TASK_TIME_LIMIT, otherwise the sweep re-queues work that is still legitimately running.
OUTBOX_LEASE_SECONDS = env.int("OUTBOX_LEASE_SECONDS", default=120)
OUTBOX_MAX_ATTEMPTS = env.int("OUTBOX_MAX_ATTEMPTS", default=10)
OUTBOX_RETRY_BACKOFF_SECONDS = env.int("OUTBOX_RETRY_BACKOFF_SECONDS", default=30)
OUTBOX_RETRY_BACKOFF_MAX_SECONDS = env.int("OUTBOX_RETRY_BACKOFF_MAX_SECONDS", default=900)
OUTBOX_RECOVERY_BATCH_SIZE = env.int("OUTBOX_RECOVERY_BATCH_SIZE", default=200)

CELERY_BEAT_SCHEDULE = {
    "recover-outbox-events": {
        "task": "apps.foundation.tasks.recover_outbox_events",
        "schedule": 30.0,
    },
    "reconcile-booking-group-dispatch": {
        "task": "apps.assignments.tasks.reconcile_booking_group_dispatch",
        "schedule": 10.0,
    },
    "cleanup-partner-document-uploads": {
        "task": "apps.partners.tasks.cleanup_partner_document_uploads",
        "schedule": 60.0 * 60,
    },
    "sweep-late-bookings": {
        "task": "apps.fulfilment.tasks.sweep_late_bookings",
        "schedule": 60.0,
    },
    "sweep-completion-auto-finalize": {
        "task": "apps.fulfilment.tasks.sweep_completion_auto_finalize",
        "schedule": 300.0,
    },
    "reconcile-partner-presence-sessions": {
        "task": "apps.partners.tasks.reconcile_partner_presence_sessions",
        "schedule": 60.0,
    },
    "reconcile-payments": {
        "task": "apps.commerce.tasks.reconcile_payments",
        "schedule": 30.0,
    },
    "reconcile-refunds": {
        "task": "apps.commerce.tasks.reconcile_refunds",
        "schedule": 60.0,
    },
}

SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SAMESITE = "Lax"
X_FRAME_OPTIONS = "DENY"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"

LOG_LEVEL = env("LOG_LEVEL", default="INFO")
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "()": "common.observability.logging.JsonFormatter",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": LOG_LEVEL,
    },
    "loggers": {
        "django.server": {
            "handlers": ["console"],
            "level": LOG_LEVEL,
            "propagate": False,
        },
    },
}

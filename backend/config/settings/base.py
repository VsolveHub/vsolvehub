"""Settings shared by every Vsolve Hub backend environment."""

from pathlib import Path

import environ

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
        default="postgresql://vsolve:vsolve-local-only@127.0.0.1:55432/vsolve",
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
M1_PARTNER_OFFER_TIMEOUT_SECONDS = 45
M1_PARTNER_SEARCH_CANDIDATE_LIMIT = 3
M1_PARTNER_UNDO_TIMEOUT_SECONDS = 120

SPECTACULAR_SETTINGS = {
    "TITLE": "Vsolve Hub API",
    "DESCRIPTION": "Authoritative API for Vsolve Hub customer, partner and operations clients.",
    "VERSION": "1.2.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": r"/api/v1",
    "COMPONENT_SPLIT_REQUEST": True,
    "SORT_OPERATIONS": True,
    "ENUM_NAME_OVERRIDES": {
        "PartnerDocumentKindEnum": "apps.partners.models.PartnerDocument.Kind",
        "PrivacyRequestKindEnum": "apps.identity.models.PrivacyRequest.Kind",
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
PARTNER_REQUIRED_CONSENT_PURPOSES = ("partner_terms", "privacy_notice")
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
CELERY_BEAT_SCHEDULE = {
    "reconcile-partner-presence-sessions": {
        "task": "apps.partners.tasks.reconcile_partner_presence_sessions",
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

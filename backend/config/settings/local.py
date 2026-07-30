"""Local development settings."""

from pathlib import Path

import environ

_backend_dir = Path(__file__).resolve().parents[2]
environ.Env.read_env(_backend_dir / ".env", overwrite=False)

from config.settings.base import *  # noqa: E402

DEBUG = env.bool("DJANGO_DEBUG", default=True)
API_DOCS_ENABLED = env.bool("API_DOCS_ENABLED", default=True)
OTP_PROVIDER = env("OTP_PROVIDER", default="development")
OTP_DEVELOPMENT_CODE_ENABLED = env.bool("OTP_DEVELOPMENT_CODE_ENABLED", default=True)
GEOCODING_PROVIDER = env("GEOCODING_PROVIDER", default="nominatim")

REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"] = [
    *REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"],
    "rest_framework.renderers.BrowsableAPIRenderer",
]

EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

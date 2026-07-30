"""Staging settings with production-like security."""

from config.settings.production import *

API_DOCS_ENABLED = env.bool("API_DOCS_ENABLED", default=True)

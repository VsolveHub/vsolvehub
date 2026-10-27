"""Staging settings with production-like security."""

from config.settings.guards import guard_razorpayx_test_keys
from config.settings.production import *

API_DOCS_ENABLED = env.bool("API_DOCS_ENABLED", default=True)

# Staging tries payouts against RazorpayX test mode. Live keys belong to production alone.
guard_razorpayx_test_keys(RAZORPAYX_KEY_ID)

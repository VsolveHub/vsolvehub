"""Celery application configuration."""

import os

from celery import Celery

# The same default as `manage.py`, deliberately.
#
# This entrypoint used to default to production while `manage.py` defaulted to
# local, so `celery -A config worker` on a developer's machine loaded production
# settings and died on the placeholder secret key. The crash was the lucky
# outcome: with a plausible-looking key it would have started, and the worker
# processing a developer's outbox would have been pointed at production's
# database, cache and storage configuration.
#
# `.env` cannot fix this — `config.settings.local` is what reads `.env`, so a
# `DJANGO_SETTINGS_MODULE` line inside it is only consulted after the choice has
# already been made.
#
# `setdefault` still yields to an explicit environment variable, which is how a
# real deployment selects `config.settings.production`.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

app = Celery("vsolve_hub")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

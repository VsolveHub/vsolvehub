"""Gunicorn settings for the production web process. Gunicorn reads this file from its
working directory, so the Dockerfile's plain `gunicorn config.wsgi:application` picks it up.

Threaded workers, not ASGI. The partner offer stream (apps/notifications/streaming.py) is a
synchronous generator that holds one worker thread per open connection for up to
`M1_OFFER_STREAM_MAX_SECONDS`, and Django buffers a synchronous stream whole under ASGI, which
would hold every offer back until the stream ended.

Capacity is `WEB_CONCURRENCY x GUNICORN_THREADS` concurrent requests, and each partner with the
app open takes one of them. Size it to the partners you expect online at once plus headroom for
ordinary traffic. Past that point the stream needs a real push transport (see streaming.py).
"""

import os

bind = f"0.0.0.0:{os.environ.get('PORT', '8000')}"
worker_class = "gthread"
workers = int(os.environ.get("WEB_CONCURRENCY", "2"))
threads = int(os.environ.get("GUNICORN_THREADS", "32"))
accesslog = "-"
errorlog = "-"

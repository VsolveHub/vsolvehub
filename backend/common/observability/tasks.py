"""Correlation across the async boundary (`M2-BE-808`).

`RequestIdMiddleware` puts a request id on every HTTP log line, and `JsonFormatter` renders it. The
id then **stopped at the queue**: a command that enqueued an outbox event, or a view that dispatched
a Celery task, produced logs under one id and the work it caused produced logs under none.

That is the gap `M2-BE-808` names, and it is the gap that matters most on this platform, because
almost nothing important in M2 finishes inside the request. The booking fee is verified by a
callback; the engagement is opened by a task; the cascade widens on a beat tick; a refund settles on
a sweep. "Show me everything that happened because that Customer tapped pay" is the question, and
without this it cannot be asked.

## How it works

Two signals, and no new dependency.

* `before_task_publish` copies the current request id into the message **headers**. Celery's
  protocol 2 carries unknown headers through to the worker and exposes them on `task.request`, so
  no serialiser, base class or task signature changes.
* `task_prerun` reads the header back and sets the context variable for the duration of the task;
  `task_postrun` resets it. A task published by a beat tick rather than by a request has no header
  and gets a fresh id, so **every** task run is correlatable — a scheduled sweep's own id ties its
  log lines together even though nobody's request started it.

The id is prefixed `task:` when it was generated here rather than inherited, so a reader can tell
"this is the tail of a request" from "this is a sweep that started on its own". Both are useful;
confusing them is not.

## Nothing here may break a task

Every handler swallows its own failures. Correlation is an aid to reading logs; a worker that
refuses to run a sweep because it could not attach an id would have traded the thing being observed
for the observation of it.
"""

from typing import Any
from uuid import uuid4

from celery.signals import before_task_publish, task_postrun, task_prerun

from common.observability.context import get_request_id, reset_request_id, set_request_id

#: The message header the request id travels in. Underscored rather than hyphenated because it also
#: becomes an attribute name on `task.request`.
CORRELATION_HEADER = "x_request_id"

#: Tokens for the context variable, keyed by Celery task id, so `task_postrun` resets exactly what
#: `task_prerun` set. A module-level dict is safe here for the reason it would not be in a web
#: worker: a Celery prefork child runs one task at a time, and the key is the task id in any case.
_TOKENS: dict[str, Any] = {}


@before_task_publish.connect
def attach_correlation_id(headers: dict[str, Any] | None = None, **_kwargs: Any) -> None:
    """Copy the caller's request id onto the outgoing message."""
    try:
        if headers is None:
            return
        request_id = get_request_id()
        if request_id and CORRELATION_HEADER not in headers:
            headers[CORRELATION_HEADER] = request_id
    except Exception:
        # See the module docstring. There is nothing useful to report a failure to from inside the
        # thing that makes reports readable.
        return


@task_prerun.connect
def bind_correlation_id(task_id: str | None = None, task: Any = None, **_kwargs: Any) -> None:
    """Adopt the published id, or mint one so an unattributed task is still correlatable."""
    try:
        inherited = getattr(getattr(task, "request", None), CORRELATION_HEADER, None)
        request_id = str(inherited) if inherited else f"task:{uuid4()}"
        token = set_request_id(request_id)
        if task_id:
            _TOKENS[task_id] = token
    except Exception:
        return


@task_postrun.connect
def unbind_correlation_id(task_id: str | None = None, **_kwargs: Any) -> None:
    """Put the context variable back, so a pooled worker thread cannot leak one task's id."""
    try:
        token = _TOKENS.pop(task_id, None) if task_id else None
        if token is not None:
            reset_request_id(token)
    except Exception:
        return

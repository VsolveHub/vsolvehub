"""Abuse controls for the M2 write surface (`M2-BE-803`).

## Why DRF's own throttle rather than a new limiter

`locations.GeocodeView` and `ServiceabilityView` already run `ScopedRateThrottle` against the named
rates in `settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]`, and
`common.errors.handler.api_exception_handler` already renders `Throttled` into the standard error
envelope with `code: "throttled"` and a `Retry-After`. So the transport, the error shape and the
client's handling of it all exist. What did not exist was a rate on any M2 route.

Two behaviours are added on top, and both exist because of what a rate limiter does when its own
dependencies fail or when it fires.

## It fails **open** when the cache is unreachable, and says so

This is the one place in M2 that deliberately does not fail closed, and the reasoning is worth
stating because the sprint rule says the opposite. Rule 4's fail-closed requirement is about
**owner-blocked values** — a price, a split, a window — where guessing means charging somebody a
number nobody approved. A rate limiter is not that. Its input is not an unmade decision; it is a
Redis connection. Refusing every M2 write because the cache blinked would convert a cache incident
into a total outage of the product, which is a strictly worse failure than briefly not enforcing a
limit that exists to slow down abuse.

So a cache error allows the request and emits `m2.abuse.throttle_cache_unavailable`. The metric is
the point: an unenforced limiter that is silent is indistinguishable from a working one, and
`docs/runbooks/m2-adapter-reliability.md` alerts on that counter for exactly that reason.

## A throttled request is counted

`m2.abuse.request_throttled`, labelled with the scope. A limit nobody watches gets tuned by
complaint rather than by evidence, and the first question after "why did that customer see a 429"
is always "how often does that happen".

## `ThrottledWriteMixin` throttles writes only, and carries no class docstring

Two facts about it, and the second one is not style.

**It exempts safe methods**, and that is load-bearing rather than a micro-optimisation. Several M2
routes carry a `GET` and a `POST` on one class — the unlock, the visit plan, the booking fee — and
the `GET` is what the Customer's screen **polls** while the provider confirms a payment. A DRF
throttle applies to every method on a view, so mounting `m2_money` at 30/hour without the exemption
would rate-limit the poll that exists to tell somebody their money arrived, precisely while they are
watching it. Reads are cursor-paginated and bounded elsewhere; the abuse this file is about is
writing.

**It deliberately has no class docstring**, and this paragraph is where its explanation lives
instead. `drf_spectacular.plumbing.get_doc` falls back through the MRO with `inspect.getdoc`,
skipping DRF's own base classes but not third-party mixins — so a docstring here becomes the
**published API description** of every mounted view that has no docstring of its own. The first
regeneration after this mixin landed put this very text into the OpenAPI description of nine
operations, and the contract-drift check is what caught it. If a future edit gives this class a
docstring, that leak returns.
"""

from typing import Any

from rest_framework.permissions import SAFE_METHODS
from rest_framework.request import Request
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from common.observability.metrics import M2Metric, emit


class ScopedWriteThrottle(ScopedRateThrottle):
    """`ScopedRateThrottle` that survives a cache outage and reports when it fires.

    Keyed per authenticated user through the inherited `get_cache_key`, which is the right unit for
    every scope below: M2's write surface is authenticated end to end, and an IP-keyed limit would
    punish a shared office network for one member's behaviour while doing nothing at all about a
    script running from a hundred addresses.
    """

    def allow_request(self, request: Request, view: APIView) -> bool:
        try:
            return bool(super().allow_request(request, view))
        except Exception:
            # Deliberately broad, and this is the fail-open branch the module docstring argues for.
            # The cache backend is configurable (`django_redis` today) and the
            # exception classes it raises on a connection failure are its own; catching a named
            # `ConnectionError` would silently stop working the day the backend changes, which is
            # the failure mode this branch exists to survive.
            emit(
                M2Metric.THROTTLE_CACHE_UNAVAILABLE,
                scope=getattr(view, "throttle_scope", "unknown"),
                view=view.__class__.__name__,
            )
            return True

    def throttle_failure(self) -> bool:
        emit(
            M2Metric.REQUEST_THROTTLED,
            scope=getattr(self, "scope", "unknown"),
            rate=self.rate or "unset",
        )
        return bool(super().throttle_failure())


# Mounts `ScopedWriteThrottle` on a view's writes only. Subclasses set `throttle_scope`.
#
# **No class docstring — see the module docstring's last section.** One here becomes the published
# OpenAPI description of every mounted view that has no docstring of its own.
class ThrottledWriteMixin:
    throttle_classes: Any = (ScopedWriteThrottle,)

    def get_throttles(self) -> list[Any]:
        method = getattr(getattr(self, "request", None), "method", "GET")
        if method in SAFE_METHODS:
            return []
        return list(super().get_throttles())  # type: ignore[misc]

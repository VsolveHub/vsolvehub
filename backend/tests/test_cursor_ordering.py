"""Every cursor paginator names its own sort, and that sort resolves to real columns.

DRF defaults `CursorPagination.ordering` to `"-created"`. **No model in this project has a
`created` column** — they all use `created_at` — so a subclass that forgets one imports cleanly,
passes every check, and then raises `FieldError` on the first request that reaches it.

`EngagementCursorPagination` shipped exactly that way and turned every read of
`/api/v1/engagements/` into a 500. These tests pin both halves of the fix: the guard that refuses
the inherited default, and the ordering fields actually existing on the models they sort.
"""

import importlib
import inspect

import pytest
from django.apps import apps as django_apps
from django.core.exceptions import FieldDoesNotExist
from rest_framework.pagination import CursorPagination

from common.pagination import StrictCursorPagination

#: Every module that defines a paginator, and the model each of its paginators sorts. Written out
#: rather than discovered: a paginator does not name its model anywhere, and a test that guessed
#: would quietly stop checking the moment a name changed.
PAGINATOR_MODELS: dict[str, str] = {
    "apps.assignments.views.PartnerOfferCursorPagination": "assignments.PartnerOffer",
    "apps.carts.views.BookingGroupCursorPagination": "carts.BookingGroup",
    "apps.cases.views.CaseCursorPagination": "cases.OperationsCase",
    "apps.notifications.views.NotificationCursorPagination": "notifications.NotificationIntent",
    "apps.payouts.views.LedgerCursorPagination": "payouts.PartnerLedgerEntry",
    "apps.payouts.views.PayoutBatchCursorPagination": "payouts.PayoutBatch",
    "apps.fulfilment.views.partner.PartnerBookingCursorPagination": "commerce.Booking",
    "apps.requirements.views.base.RequirementCursorPagination": "requirements.CustomerRequirement",
    "apps.requirements.views.base.EnquiryCursorPagination": "requirements.VendorInvitation",
    "apps.requirements.views.base.ProposalCursorPagination": "requirements.Proposal",
    "apps.requirements.views.base.EngagementCursorPagination": "requirements.Engagement",
}


def _load(dotted: str) -> type[CursorPagination]:
    module_name, _, class_name = dotted.rpartition(".")
    return getattr(importlib.import_module(module_name), class_name)


def test_a_subclass_that_forgets_its_ordering_is_refused() -> None:
    """At class-definition time, which is when it is cheap to notice."""
    with pytest.raises(TypeError) as refusal:

        class Forgetful(StrictCursorPagination):
            page_size = 20

    assert "ordering" in str(refusal.value)


def test_an_explicit_ordering_is_accepted() -> None:
    """The guard must not refuse a correct subclass — it checks for the inherited default only."""

    class Careful(StrictCursorPagination):
        ordering = ("-created_at", "id")

    assert Careful.ordering == ("-created_at", "id")


@pytest.mark.parametrize("dotted", sorted(PAGINATOR_MODELS))
def test_every_paginator_sorts_on_columns_that_exist(dotted: str) -> None:
    """The failure itself: an ordering naming a field the model does not have.

    Checked against the model rather than against a list of allowed names, so this keeps working
    when a column is renamed — which is the change most likely to reintroduce the bug.
    """
    paginator = _load(dotted)
    model = django_apps.get_model(PAGINATOR_MODELS[dotted])
    ordering = paginator.ordering
    fields = (ordering,) if isinstance(ordering, str) else tuple(ordering)

    assert fields, f"{dotted} has no ordering"
    for field in fields:
        try:
            model._meta.get_field(field.lstrip("-"))
        except FieldDoesNotExist:  # pragma: no cover - the regression
            pytest.fail(f"{dotted} sorts on {field!r}, absent from {model.__name__}")


@pytest.mark.parametrize("dotted", sorted(PAGINATOR_MODELS))
def test_every_paginator_ends_on_a_unique_tiebreak(dotted: str) -> None:
    """Cursor pagination pages by position, so a non-unique sort skips or repeats rows.

    Not the bug that was reported, and the one most likely to be reported next: a page boundary
    landing between two rows sharing a timestamp loses whichever one sorts second.
    """
    paginator = _load(dotted)
    ordering = paginator.ordering
    fields = (ordering,) if isinstance(ordering, str) else tuple(ordering)

    assert fields[-1].lstrip("-") == "id", (
        f"{dotted} ends on {fields[-1]!r}; a cursor sort needs a unique final key."
    )


def test_the_shared_base_still_carries_drfs_default() -> None:
    """Which is precisely why the guard exists, and why this is worth stating out loud.

    If a future DRF release changes its default to something this project *does* have, the guard
    silently stops firing. This is the tripwire for that.
    """
    assert StrictCursorPagination.ordering == CursorPagination.ordering
    assert inspect.getattr_static(StrictCursorPagination, "__init_subclass__") is not None

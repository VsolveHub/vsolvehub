"""The archetype constants, the receipt series, and the reads both front doors share.

The bottom layer of the package. `usable_proposals`, `active_unlock` and `charged_visit_plan` are
each consulted by more than one slice — and `customer_may_read_full_quotes` answers the paywall
question for A3 and A5 in the same breath — so none of them can live inside either door. The
boundary is one-way: nothing in this module imports a sibling submodule, which is what keeps the
package free of an import cycle.
"""

from apps.catalog.models import ServiceVariant
from apps.requirements.exceptions import (
    UnlockRequiredError,
    VisitPlanRequiredError,
)
from apps.requirements.models import (
    CustomerRequirement,
    Proposal,
    QuoteUnlock,
    VisitPlan,
)

A3 = ServiceVariant.BookingArchetype.A3_TIME_BLOCK
A5 = ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT

#: The document series M2 access receipts are numbered in. Reuses `commerce.DocumentSequence` so
#: there is one numbering authority, not a second counter that could collide with invoices.
ACCESS_RECEIPT_KIND = "M2_ACCESS"


# ---------------------------------------------------------------------------
# Shared reads
# ---------------------------------------------------------------------------


def usable_proposals(requirement: CustomerRequirement) -> list[Proposal]:
    """Quotes or estimates the Customer could actually act on, right now.

    `SUBMITTED`, vendor-confirmed and classified `USABLE`. An out-of-budget quote is deliberately
    excluded from *this* list — it is still shown to the Customer, labelled — because an unlock
    sold on the strength of a quote outside the stated budget is an unlock sold against nothing the
    Customer asked for.
    """
    return list(
        Proposal.objects.filter(
            requirement=requirement,
            status=Proposal.Status.SUBMITTED,
            usability=Proposal.Usability.USABLE,
            vendor_confirmed_at__isnull=False,
        ).order_by("total_paise")
    )


def active_unlock(requirement: CustomerRequirement) -> QuoteUnlock | None:
    """The unlock that entitles this Customer to read full quotes, if there is one."""
    return QuoteUnlock.objects.filter(
        requirement=requirement,
        status__in=QuoteUnlock.READABLE_STATUSES,
    ).first()


def charged_visit_plan(requirement: CustomerRequirement) -> VisitPlan | None:
    plan = VisitPlan.objects.filter(requirement=requirement).first()
    if plan is None or plan.status not in VisitPlan.CHARGED_STATUSES:
        return None
    return plan


def latest_unlock(requirement: CustomerRequirement) -> QuoteUnlock | None:
    """The most recent unlock in any state, for the read that has to explain a failed one.

    `active_unlock` answers "may they read"; this answers "what happened". A `PENDING` attempt the
    provider never confirmed and a `FAILED` one whose amount did not match are both states the
    Customer needs told, and neither is readable.
    """
    return QuoteUnlock.objects.filter(requirement=requirement).order_by("-created_at").first()


def customer_may_read_full_quotes(requirement: CustomerRequirement) -> bool:
    """Whether the paywall is open.

    Two different answers by archetype, and that asymmetry is the whole of revision 3: **A3** sells
    access to remote quotes, so a paid unlock is the gate. **A5** sells the visits themselves, so
    the estimates those visits produced are readable with no second paywall — the plan already
    bought them.
    """
    if requirement.archetype == A5:
        return charged_visit_plan(requirement) is not None
    return active_unlock(requirement) is not None


def assert_customer_may_read_full_quotes(requirement: CustomerRequirement) -> None:
    """The same rule as a refusal, for the read that enforces it.

    Two different codes, because the two recoveries are different actions on different screens: A3
    says "unlock the quotes" (`403 m2_unlock_required`) and A5 says "your visit plan is not paid
    for yet" (`409 m2_visit_plan_required`). Collapsing them would send an A5 Customer looking for
    an unlock button that does not exist on their flow.
    """
    if customer_may_read_full_quotes(requirement):
        return
    if requirement.archetype == A5:
        raise VisitPlanRequiredError()
    raise UnlockRequiredError()

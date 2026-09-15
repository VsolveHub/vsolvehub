"""The M2 capability vocabulary every other slice of this package reads.

Two closed lists and one wire shape: which booking archetypes M2 covers, which actions each
workspace authorises, and the grant row the Partner read model returns. This module imports no
sibling, which is what keeps the package free of import cycles — the arrows all point at it.
"""

from typing import TypedDict

from apps.catalog.models import ServiceVariant

M2_ARCHETYPES = (
    ServiceVariant.BookingArchetype.A3_TIME_BLOCK,
    ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
)

#: Actions the backend authorises per workspace. The frontend maps these to controls;
#: an action absent from this list is not permitted regardless of what the UI renders.
WORKSPACE_ACTIONS: dict[str, tuple[str, ...]] = {
    ServiceVariant.BookingArchetype.A3_TIME_BLOCK: (
        "enquiry.view",
        "enquiry.accept",
        "enquiry.decline",
        # Revision 4. Its own vocabulary rather than a reuse of `enquiry.accept`, and the
        # difference matters the day Operations wants to stop offering instant crew without also
        # stopping quote enquiries: a rate-card offer and a quote enquiry are answered on different
        # clocks by different screens, and one action name for both makes that an all-or-nothing
        # switch.
        "crew_offer.view",
        "crew_offer.accept",
        "crew_offer.decline",
        "proposal.submit",
        "crew.manage",
        "crew.assign",
        "attendance.confirm",
        "amendment.propose",
        "incident.report",
    ),
    ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT: (
        "enquiry.view",
        "enquiry.accept",
        "enquiry.decline",
        "proposal.submit",
        "site_visit.request",
        "stage.submit_evidence",
        "amendment.propose",
        "deliverable.hand_over",
    ),
    ServiceVariant.BookingArchetype.A10_LISTING: (
        "listing.view",
        "listing.manage",
        "listing.create",
        "listing.publish",
        "listing.close",
        "application.view",
        "application.shortlist",
        "application.reveal",
        "subscription.manage",
    ),
    ServiceVariant.BookingArchetype.A7_RENTAL: (
        "rental.view",
        "rental.manage",
        "rental.create",
        "rental.handover",
        "rental.return",
        "rental.deposit",
    ),
    ServiceVariant.BookingArchetype.A9_STAY: (
        "stay.view",
        "stay.manage",
        "stay.create",
        "stay.enquiry.respond",
    ),
}


class WorkspaceGrant(TypedDict):
    workspace_key: str
    commercial_mode: str
    actions: list[str]

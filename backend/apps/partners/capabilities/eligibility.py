"""May this vendor act? The guards and read models the rest of the platform asks.

The read half of the original `Capability lifecycle` section. Nothing here moves a capability —
`lifecycle` owns every write — and everything here answers a question about one that already
exists: are its documents current, does it cover this area, is the Partner working that day, what
does its workspace authorise, and which registration gates are still standing.

`assert_capability_active` is the single eligibility guard; the smaller reads above it are its
parts, published because invitations, dispatch and the Operations console each need one of them on
its own.
"""

from collections.abc import Callable
from datetime import date

from django.conf import settings
from django.utils import timezone

from apps.catalog.models import ServiceVariant
from apps.locations.models import ServiceArea
from apps.partners.exceptions import (
    CapabilityNotApprovedError,
    CapabilitySuspendedError,
    PartnerDomainError,
)
from apps.partners.gates import GATE_BLOCKS, GATE_COPY, GateState
from apps.partners.models import (
    PartnerApplication,
    PartnerAvailabilityException,
    PartnerAvailabilityRule,
    PartnerCapability,
    PartnerDocument,
    PartnerProfile,
    PartnerServiceArea,
    commercial_mode_for_archetype,
)

from .base import WORKSPACE_ACTIONS, WorkspaceGrant
from .registration import (
    assert_crew_roster_present,
    assert_kyc_complete,
    assert_payout_details_present,
)


def expired_required_document_kinds(
    partner: PartnerProfile,
    *,
    on_day: date | None = None,
) -> list[str]:
    """Required document kinds this Partner holds whose recorded expiry has passed.

    Reads `settings.PARTNER_REQUIRED_DOCUMENT_KINDS`, which M1 already owns, rather than adding a
    second list of what a Partner must hold. Which kinds each *capability* requires beyond that is
    owner decision 7 and is not guessed at here.

    A document with no `expires_on` never appears: absence of an expiry is not staleness, and
    treating it as staleness would refuse every M1 Partner on the day this shipped.
    """
    day = on_day or timezone.localdate()
    kinds = tuple(settings.PARTNER_REQUIRED_DOCUMENT_KINDS)
    if not kinds:
        return []
    expired = (
        PartnerDocument.objects.filter(
            application__partner=partner,
            kind__in=kinds,
            expires_on__isnull=False,
            expires_on__lt=day,
        )
        .exclude(status=PartnerDocument.Status.SUPERSEDED)
        .values_list("kind", flat=True)
    )
    return sorted(set(expired))


def earliest_required_document_expiry(
    partner: PartnerProfile,
    *,
    on_day: date | None = None,
) -> date | None:
    """The next required document to expire, or nothing. Advisory: the client warns from it."""
    day = on_day or timezone.localdate()
    kinds = tuple(settings.PARTNER_REQUIRED_DOCUMENT_KINDS)
    if not kinds:
        return None
    row = (
        PartnerDocument.objects.filter(
            application__partner=partner,
            kind__in=kinds,
            expires_on__isnull=False,
            expires_on__gte=day,
        )
        .exclude(status=PartnerDocument.Status.SUPERSEDED)
        .order_by("expires_on")
        .values_list("expires_on", flat=True)
        .first()
    )
    return row


def capability_serves_area(
    capability: PartnerCapability,
    service_area: ServiceArea,
) -> bool:
    """Whether this capability is approved to operate in one area.

    An empty `service_areas` set means "everywhere this Partner works", which is the common case;
    the M1 `PartnerServiceArea` link is still the coverage record and is checked separately. This
    only ever narrows.
    """
    scoped = list(capability.service_areas.values_list("id", flat=True))
    if not scoped:
        return True
    return service_area.id in scoped


def partner_unavailable_on(
    *,
    partner: PartnerProfile,
    service_area: ServiceArea,
    on_day: date,
) -> bool:
    """Whether this Partner has *said* they cannot work a day in an area.

    Deliberately narrower than `selectors.partner_available_during`, which answers "does the
    published schedule cover this half-hour" and treats an empty schedule as unavailable. That rule
    is right for the A1 slot grid, where the Customer is picking a time; it is wrong for A3 and A5,
    where the unit is a day and most workforce vendors publish no hourly calendar at all. Applying
    it here would exclude every existing vendor the day it shipped.

    So: a dated exception saying `is_available=False` is a refusal, and so is a weekday no
    published rule covers **when the Partner has published rules for that area at all**. A Partner
    with no rules has made no statement, and no statement is not a refusal.
    """
    exception = PartnerAvailabilityException.objects.filter(
        partner=partner,
        service_area=service_area,
        date=on_day,
    ).first()
    if exception is not None:
        return not exception.is_available

    rules = PartnerAvailabilityRule.objects.filter(
        partner=partner,
        service_area=service_area,
        is_active=True,
    )
    weekdays = set(rules.values_list("weekday", flat=True))
    if not weekdays:
        return False
    return on_day.weekday() not in weekdays


def assert_capability_active(
    *,
    partner: PartnerProfile,
    variant: ServiceVariant,
    service_area: ServiceArea | None = None,
    on_day: date | None = None,
) -> PartnerCapability:
    """The single eligibility guard. Invitations and assignments both call it.

    `service_area` and `on_day` are optional because not every caller has them — a workspace read
    is about the capability, not about a job. When they are supplied the guard also checks
    coverage (`M2-BE-102`) and the Partner's own published availability (`M2-BE-115`); when they
    are not, it checks what it can and says so by omission rather than by silently passing a check
    it never ran.

    **Insurance is still not enforced here**, and that is a policy gap rather than an oversight:
    whether an approved A3 capability requires a *verified* declaration is owner decision 6, and
    `PartnerCapability.requires_insurance` currently records a default nobody approved. Enforcing
    it now would refuse real vendors on a rule the owner has not set. Recorded against
    `M2-BE-104`/`M2-BE-115`.
    """
    capability = (
        PartnerCapability.objects.filter(
            partner=partner,
            variant=variant,
        )
        .exclude(
            status__in=(
                PartnerCapability.Status.WITHDRAWN,
                PartnerCapability.Status.REJECTED,
            )
        )
        .first()
    )

    if capability is None:
        raise CapabilityNotApprovedError()
    if capability.status == PartnerCapability.Status.SUSPENDED:
        raise CapabilitySuspendedError()
    if capability.status != PartnerCapability.Status.APPROVED:
        raise CapabilityNotApprovedError()

    moment = timezone.now()
    if capability.expires_at is not None and capability.expires_at <= moment:
        raise CapabilityNotApprovedError()

    if service_area is not None:
        serves_area = PartnerServiceArea.objects.filter(
            partner=partner,
            service_area=service_area,
            is_active=True,
        ).exists()
        if not serves_area or not capability_serves_area(capability, service_area):
            # `m2_capability_not_approved` rather than a new code, for the same reason document
            # expiry reuses it: `07-state-machines-and-permissions.md` §8 is the authority on
            # codes and lists none for coverage. The *message* is what tells the vendor which of
            # the several things this code covers went wrong.
            raise CapabilityNotApprovedError(
                f"You are not approved to work in {service_area.name} for this service.",
            )

    if (
        service_area is not None
        and on_day is not None
        and partner_unavailable_on(partner=partner, service_area=service_area, on_day=on_day)
    ):
        raise CapabilityNotApprovedError(
            f"Your calendar says you are not working on {on_day.isoformat()}.",
        )

    # An expired required document is not a policy judgement — it is what "expired" means. The
    # refusal reuses `m2_capability_not_approved`, the code this function already raises for an
    # expired capability: `07-state-machines-and-permissions.md` §8 is the authority on codes and
    # lists no document-expiry code, and inventing one to save a client a string comparison would
    # put a code on the wire the design document does not know about. The distinguishable *state*
    # is published on the capability read instead, which is where a state belongs.
    expired_kinds = expired_required_document_kinds(partner)
    if expired_kinds:
        raise CapabilityNotApprovedError(
            "Renew your "
            + ", ".join(kind.replace("_", " ").lower() for kind in expired_kinds)
            + " before taking new work.",
        )
    return capability


def workspace_grants(partner: PartnerProfile) -> list[WorkspaceGrant]:
    """The Partner read model: stable machine values only, never routes or labels.

    An archetype with no action list is omitted rather than guessed at, so a frontend
    that does not know a key renders nothing instead of falling back to a generic view.
    """
    grants: list[WorkspaceGrant] = []
    seen: set[str] = set()
    approved = PartnerCapability.objects.filter(
        partner=partner,
        status=PartnerCapability.Status.APPROVED,
    ).order_by("archetype")

    for capability in approved:
        key = capability.workspace_key
        if key in seen:
            continue
        actions = WORKSPACE_ACTIONS.get(key)
        if actions is None:
            continue
        seen.add(key)
        grants.append(
            WorkspaceGrant(
                workspace_key=key,
                commercial_mode=capability.commercial_mode,
                actions=list(actions),
            )
        )
    stay_key = ServiceVariant.BookingArchetype.A9_STAY
    if stay_key not in seen and is_approved_stay_host(partner):
        grants.append(
            WorkspaceGrant(
                workspace_key=stay_key,
                commercial_mode=commercial_mode_for_archetype(stay_key),
                actions=list(WORKSPACE_ACTIONS[stay_key]),
            )
        )
    rental_key = ServiceVariant.BookingArchetype.A7_RENTAL
    if rental_key not in seen and is_approved_rental_owner(partner):
        grants.append(
            WorkspaceGrant(
                workspace_key=rental_key,
                commercial_mode=commercial_mode_for_archetype(rental_key),
                actions=list(WORKSPACE_ACTIONS[rental_key]),
            )
        )
    listing_key = ServiceVariant.BookingArchetype.A10_LISTING
    if listing_key not in seen and is_approved_employer(partner):
        grants.append(
            WorkspaceGrant(
                workspace_key=listing_key,
                commercial_mode=commercial_mode_for_archetype(listing_key),
                actions=list(WORKSPACE_ACTIONS[listing_key]),
            )
        )
    return grants


def has_approved_application(partner: PartnerProfile) -> bool:
    """The partner's application is approved right now.

    The one rule every listing surface shares — rentals, stays and jobs. A capability is a
    permission to do a kind of work; this is whether the partner may work at all. Suspending or
    offboarding the application turns everything off at once, without touching capabilities, and
    reinstating turns it back on.
    """
    return PartnerApplication.objects.filter(
        partner=partner,
        status=PartnerApplication.Status.APPROVED,
    ).exists()


def is_approved_employer(partner: PartnerProfile) -> bool:
    """A business that signed up to hire staff and whose application was approved.

    The application review is the job-posting permission; no separate A10 capability.
    Mirrors ``is_approved_stay_host``.
    """
    return PartnerApplication.objects.filter(
        partner=partner,
        status=PartnerApplication.Status.APPROVED,
        track=PartnerApplication.Track.EMPLOYER,
    ).exists()


def is_approved_stay_host(partner: PartnerProfile) -> bool:
    """A partner who signed up to list their property and whose application was approved.

    For stay hosts the application review *is* the stay permission; they never request a
    separate A9 capability.
    """
    return PartnerApplication.objects.filter(
        partner=partner,
        status=PartnerApplication.Status.APPROVED,
        track=PartnerApplication.Track.STAY_HOST,
    ).exists()


def is_approved_rental_owner(partner: PartnerProfile) -> bool:
    """A partner who signed up to rent out items and whose application was approved.

    For rental owners the application review *is* the rental permission; they never request
    a separate A7 capability. Mirrors ``is_approved_stay_host``.
    """
    return PartnerApplication.objects.filter(
        partner=partner,
        status=PartnerApplication.Status.APPROVED,
        track=PartnerApplication.Track.RENTAL_OWNER,
    ).exists()


def gate_states(partner: PartnerProfile) -> list[GateState]:
    """Project the three `assert_*` guards for the UI that explains them.

    **Advisory, and the contract says so.** The guards below are the enforcement, at the moment of
    the command; this read only decides what the UI explains beforehand. A client that treated it as
    authoritative would block somebody whose KYC completed thirty seconds ago and admit somebody
    suspended thirty seconds ago.

    The reason and next action come out of `gates.GATE_COPY`, keyed on the error code the guard
    raises, so this read and that refusal cannot present different sentences for one rule.
    """
    guards: tuple[tuple[str, Callable[[PartnerProfile], None]], ...] = (
        ("m2_kyc_required", assert_kyc_complete),
        ("m2_payout_details_required", assert_payout_details_present),
        ("m2_crew_roster_required", assert_crew_roster_present),
    )

    states: list[GateState] = []
    for code, guard in guards:
        gate, reason, next_action = GATE_COPY[code]
        try:
            guard(partner)
        except PartnerDomainError:
            satisfied = False
        else:
            satisfied = True
        states.append(
            GateState(
                gate=gate,
                is_satisfied=satisfied,
                blocks=GATE_BLOCKS[gate],
                # A satisfied gate carries no reason and no next action: there is nothing to
                # explain and nowhere to send anybody, and publishing copy for it invites a UI
                # that renders a resolved warning.
                reason="" if satisfied else reason,
                next_action=None if satisfied else next_action,
            )
        )
    return states


def gate_refusal_detail(code: str) -> tuple[str, str | None]:
    """The `reason` and `next_action` a gate refusal carries, for the error body.

    Acceptance criterion 7 of proposal 0013 in one function: the strings a `403` carries are the
    strings `gate_states` published, read from the same table.
    """
    entry = GATE_COPY.get(code)
    if entry is None:
        return "", None
    _gate, reason, next_action = entry
    return reason, next_action

"""What a vendor states about itself, and the gates that check it when it starts to matter.

Three slices of the original module that are all about the account rather than about any one
capability: the progressive registration gates, the stated business identity, and the worker
insurance declaration. The boundary is the capability row — nothing here reads or writes a
`PartnerCapability`; `lifecycle` and `eligibility` own that.

`eligibility.gate_states` projects the three guards below for the UI that explains them, which is
the one arrow out of this module.
"""

from datetime import date

from django.db import transaction
from django.utils import timezone

from apps.partners.exceptions import (
    BusinessTypeInvalidError,
    CrewRosterRequiredError,
    KycRequiredError,
    PayoutDetailsRequiredError,
)
from apps.partners.models import (
    PartnerApplication,
    PartnerBusinessProfile,
    PartnerCrewMembership,
    PartnerInsuranceDeclaration,
    PartnerProfile,
)

# ---------------------------------------------------------------------------
# Progressive registration gates
#
# Each gate is checked at the moment it becomes necessary, never at registration.
# Supply is the scarce side of this marketplace; a Partner browses masked demand
# before proving anything.
# ---------------------------------------------------------------------------


def assert_kyc_complete(partner: PartnerProfile) -> None:
    """Gate for accepting a first enquiry."""
    application = PartnerApplication.objects.filter(partner=partner).first()
    if application is None or application.status != PartnerApplication.Status.APPROVED:
        raise KycRequiredError()


def assert_payout_details_present(partner: PartnerProfile) -> None:
    """Gate for a first payout. Imported lazily: payouts depends on partners.

    A merely registered account is not enough. M1 makes an account payable only once it is
    verified and past its `effective_from` cooling period, which is the control against
    account takeover; this gate honours that rather than restating a weaker rule.
    """
    from apps.payouts.models import PartnerPayoutAccount  # noqa: PLC0415

    has_payable_account = PartnerPayoutAccount.objects.filter(
        partner=partner,
        status=PartnerPayoutAccount.Status.VERIFIED,
        effective_from__lte=timezone.now(),
    ).exists()
    if not has_payable_account:
        raise PayoutDetailsRequiredError()


def assert_crew_roster_present(partner: PartnerProfile) -> None:
    """Gate for a first crew assignment, not for registration."""
    has_crew = PartnerCrewMembership.objects.filter(
        partner=partner,
        status=PartnerCrewMembership.Status.ACTIVE,
    ).exists()
    if not has_crew:
        raise CrewRosterRequiredError()


# ---------------------------------------------------------------------------
# Business identity
#
# `business_type` is stated, never inferred. Not from the capability requested, not from the
# services selected: the three types carry different tax, liability and payout consequences, and a
# platform that guessed which one a Partner is would be guessing who owes the tax.
# ---------------------------------------------------------------------------


@transaction.atomic
def upsert_business_profile(
    *,
    partner: PartnerProfile,
    business_type: str,
    legal_name: str = "",
    registration_number: str = "",
    gst_registered: bool = False,
    gstin: str = "",
    years_in_operation: int = 0,
    upi_vpa: str = "",
) -> PartnerBusinessProfile:
    """Create or replace the business profile. A replace, not a merge.

    A `PUT` rather than a `PATCH` because the three business types have genuinely different
    required field sets. A partial update is how a Partner switching from `WORKFORCE_AGENCY` to
    `INDIVIDUAL` keeps a registration number that `partners_individual_has_no_registration_number`
    forbids — the row would be refused by the database, and the Partner would be shown a server
    error for doing something reasonable.
    """
    if business_type == PartnerBusinessProfile.BusinessType.INDIVIDUAL and registration_number:
        raise BusinessTypeInvalidError(
            "An individual Partner has no company registration number.",
            field="registration_number",
        )
    if gstin and not gst_registered:
        raise BusinessTypeInvalidError(
            "Tick GST registered before entering a GSTIN.",
            field="gstin",
        )
    # `M2-BE-536`. A UPI address is one `@` and two non-empty halves, and that is the whole of
    # what is checked: this platform never sends money to it, so a stricter rule here would be
    # this system claiming to know which handles a bank will accept. Blank clears it, which is a
    # thing a lead must be able to do — the deep link then simply stops being offered.
    handle = upi_vpa.strip()
    if handle and (handle.count("@") != 1 or not all(handle.split("@"))):
        raise BusinessTypeInvalidError(
            "A UPI ID looks like name@bank.",
            field="upi_vpa",
        )

    profile, _created = PartnerBusinessProfile.objects.update_or_create(
        partner=partner,
        defaults={
            "business_type": business_type,
            "legal_name": legal_name,
            "registration_number": registration_number,
            "gst_registered": gst_registered,
            "gstin": gstin,
            "years_in_operation": years_in_operation,
            "upi_vpa": handle,
        },
    )
    return profile


# ---------------------------------------------------------------------------
# Worker insurance
# ---------------------------------------------------------------------------


@transaction.atomic
def declare_insurance(
    *,
    partner: PartnerProfile,
    insurer_name: str,
    policy_reference: str,
    coverage_paise: int,
    covers_workmen_compensation: bool,
    valid_from: date,
    valid_to: date,
) -> PartnerInsuranceDeclaration:
    """Record a worker-insurance declaration. Declared is not insured.

    `verified_at` is set by Operations and never by this command. The difference between a declared
    policy and a verified one is who carries the liability when a worker is hurt, and a command that
    let the declaring party also mark it verified would erase that difference.

    Whether an approved A3 capability *requires* a verified declaration is owner decision 6 and is
    not enforced anywhere yet — `M2-BE-104` records that, and this command does not pretend
    otherwise by refusing on a rule nobody has set.
    """
    if valid_to <= valid_from:
        raise BusinessTypeInvalidError(
            "The policy end date must be after the start date.",
            field="valid_to",
        )
    if coverage_paise <= 0:
        raise BusinessTypeInvalidError(
            "Enter the amount this policy covers.",
            field="coverage_paise",
        )

    existing = live_insurance_declaration(partner)
    if existing is not None:
        # Replace the Partner's own current declaration rather than accumulating rows nobody can
        # tell apart. Historic declarations for expired policies stay, because a claim is argued
        # against the policy that was live on the day of the work.
        existing.insurer_name = insurer_name
        existing.policy_reference = policy_reference
        existing.coverage_paise = coverage_paise
        existing.covers_workmen_compensation = covers_workmen_compensation
        existing.valid_from = valid_from
        existing.valid_to = valid_to
        existing.declared_at = timezone.now()
        # A changed policy is an unverified policy. Carrying the old `verified_at` across would let
        # a Partner swap a checked policy for an unchecked one and keep the badge.
        existing.verified_at = None
        existing.verified_by = None
        existing.save()
        return existing

    return PartnerInsuranceDeclaration.objects.create(
        partner=partner,
        insurer_name=insurer_name,
        policy_reference=policy_reference,
        coverage_paise=coverage_paise,
        covers_workmen_compensation=covers_workmen_compensation,
        valid_from=valid_from,
        valid_to=valid_to,
    )


def live_insurance_declaration(
    partner: PartnerProfile,
    *,
    on_day: date | None = None,
) -> PartnerInsuranceDeclaration | None:
    """The declaration in force today, or nothing. Nothing is the ordinary state, not an error."""
    day = on_day or timezone.localdate()
    return (
        PartnerInsuranceDeclaration.objects.filter(
            partner=partner,
            valid_from__lte=day,
            valid_to__gte=day,
        )
        .order_by("-valid_to")
        .first()
    )

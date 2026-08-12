"""Shared M2 HTTP fixtures.

One world, built once per test, holding every actor an object-level authorization test needs: two
Customers, two vendors, an Operations reviewer and a signed-in stranger with no Partner profile at
all. The point of the second of each is the only thing these tests exist to prove — that a record
belonging to one actor is invisible to the other.

Deliberately *not* a factory library. Every helper here builds a real record through the real
domain command, because a fixture that inserts rows directly can construct states the commands
refuse, and a test that passes against an impossible state proves nothing about the endpoint.
"""

from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from secrets import token_urlsafe

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.catalog.models import (
    Category,
    M2VariantConfiguration,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.foundation.storage import (
    DocumentStorageError,
    SignedReview,
    SignedUpload,
    VerifiedObject,
)
from apps.identity.models import Role, User, UserRole
from apps.locations.models import (
    Address,
    ServiceArea,
    ServiceAreaOperatingWindow,
    ServiceAreaService,
)
from apps.partners import capabilities
from apps.partners.models import (
    MinimumWageFloor,
    PartnerApplication,
    PartnerCapability,
    PartnerOnlineSession,
    PartnerProfile,
    PartnerServiceArea,
    Skill,
)
from apps.requirements import matching, proposals, services
from apps.requirements.models import (
    CustomerRequirement,
    Proposal,
    RequirementAttachmentUpload,
    SiteVisit,
    VendorInvitation,
)
from tests.helpers import force_role_client

MAX_QUOTES = 3
A3_RATE_PAISE = 80_000
A3_TOTAL_PAISE = 960_000
A5_TOTAL_PAISE = 4_500_000


class FakeAttachmentStorage:
    """A signed-upload provider that agrees with whatever intent the server recorded.

    Agreeing by default is what makes a *disagreement* meaningful: a test that wants a checksum
    mismatch sets one override, and every other test exercises the happy path without describing
    storage at all.
    """

    def __init__(self) -> None:
        self.verification_overrides: dict[str, VerifiedObject] = {}
        self.deleted_keys: list[str] = []
        self.reviewed_keys: list[str] = []
        self.upload_token = token_urlsafe(16)
        self.fail_next_signed_upload = False

    def create_signed_upload(self, *, object_key: str) -> SignedUpload:
        if self.fail_next_signed_upload:
            raise DocumentStorageError("storage down")
        return SignedUpload(
            upload_url=f"https://storage.test/upload/{object_key}?token={self.upload_token}",
            upload_token=self.upload_token,
            resumable_url="https://storage.test/upload/resumable",
            expires_at=timezone.now() + timedelta(hours=2),
        )

    def verify_object(self, *, object_key: str, maximum_size_bytes: int) -> VerifiedObject:
        del maximum_size_bytes
        if object_key in self.verification_overrides:
            return self.verification_overrides[object_key]
        upload = RequirementAttachmentUpload.objects.get(object_key=object_key)
        return VerifiedObject(
            size_bytes=upload.size_bytes,
            content_type=upload.content_type,
            sha256=upload.sha256,
        )

    def create_signed_review(self, *, object_key: str, expires_in_seconds: int) -> SignedReview:
        self.reviewed_keys.append(object_key)
        return SignedReview(
            review_url=f"https://storage.test/review/{object_key}",
            expires_at=timezone.now() + timedelta(seconds=expires_in_seconds),
        )

    def delete_object(self, *, object_key: str) -> None:
        self.deleted_keys.append(object_key)


@pytest.fixture(autouse=True)
def attachment_storage(monkeypatch: pytest.MonkeyPatch) -> FakeAttachmentStorage:
    storage = FakeAttachmentStorage()
    monkeypatch.setattr(
        "apps.requirements.attachments.get_attachment_storage",
        lambda: storage,
    )
    monkeypatch.setattr(
        "apps.requirements.tasks.get_attachment_storage",
        lambda: storage,
    )
    return storage


@dataclass(frozen=True, slots=True)
class M2World:
    area: ServiceArea
    skill: Skill
    variant: ServiceVariant
    project_variant: ServiceVariant
    customer: User
    customer_client: APIClient
    other_customer: User
    other_customer_client: APIClient
    vendor: PartnerProfile
    vendor_client: APIClient
    other_vendor: PartnerProfile
    other_vendor_client: APIClient
    #: Authenticated, holds no Partner role. Every `partner/**` route must refuse this one at the
    #: permission layer rather than at a record lookup.
    outsider: User
    outsider_client: APIClient
    #: Holds the Partner role but has no `PartnerProfile` and no approved capability — the account a
    #: person has thirty seconds after starting to register.
    unregistered_vendor_client: APIClient
    operations: User
    operations_client: APIClient


#: The wage-floor mapping every A3 fixture needs since `M2-BE-317` made the guard fail closed.
#: `submit_proposal` now derives the state and the skill from the requirement instead of taking
#: them from its caller, so a variant with no `wage_floor_skill` or an area with no `state_code`
#: refuses every A3 quote with `m2_wage_floor_unavailable`. That is the intended behaviour; these
#: fixtures supply the mapping so the tests exercise the rate check rather than the missing map.
WAGE_FLOOR_STATE_CODE = "TG"
WAGE_FLOOR_PAISE_PER_DAY = 50_000


def wage_floor_skill() -> Skill:
    skill, _created = Skill.objects.get_or_create(
        code="wage-floor-helper",
        defaults={"name": "Helper"},
    )
    MinimumWageFloor.objects.get_or_create(
        state_code=WAGE_FLOOR_STATE_CODE,
        skill=skill,
        effective_from=timezone.localdate() - timedelta(days=365),
        defaults={"floor_paise_per_day": WAGE_FLOOR_PAISE_PER_DAY},
    )
    return skill


def _variant(
    *,
    code: str,
    archetype: str,
    area: ServiceArea,
    sla_hours: int | None = 8,
) -> ServiceVariant:
    category = Category.objects.create(slug=f"cat-{code}", name=f"Cat {code}")
    subcategory = Subcategory.objects.create(
        category=category,
        slug=f"sub-{code}",
        name=f"Sub {code}",
    )
    service = Service.objects.create(
        subcategory=subcategory,
        slug=f"svc-{code}",
        name=f"Service {code}",
        short_description="Test service.",
        status=Service.Status.ACTIVE,
    )
    variant = ServiceVariant.objects.create(
        service=service,
        code=code,
        name=f"Variant {code}",
        pricing_strategy=ServiceVariant.PricingStrategy.DURATION,
        booking_archetype=archetype,
        required_skill_code="helper",
        tax_category_code="labour",
    )
    M2VariantConfiguration.objects.create(
        variant=variant,
        version=1,
        status=M2VariantConfiguration.Status.ACTIVE,
        question_schema={
            "questions": [
                {"code": "worker_count", "kind": "INTEGER", "minimum": 1},
                {"code": "duration_days", "kind": "INTEGER", "minimum": 1},
                {"code": "deliverable", "kind": "TEXT"},
            ]
        },
        first_quote_sla_hours=sla_hours,
        quote_delivery_sla_hours=None if sla_hours is None else sla_hours * 3,
        max_quotes=MAX_QUOTES,
        wage_floor_skill=wage_floor_skill(),
    )
    ServiceAreaService.objects.create(service_area=area, variant=variant)
    return variant


def _customer(*, phone: str, name: str) -> tuple[User, APIClient]:
    user = User.objects.create_user(phone_number=phone, full_name=name)
    client = APIClient()
    client.force_authenticate(user=user)
    return user, client


def _partner_role() -> Role:
    role, _created = Role.objects.get_or_create(
        code="partner",
        defaults={"name": "Partner", "is_system": True},
    )
    return role


def _vendor(
    *,
    area: ServiceArea,
    variants: tuple[ServiceVariant, ...],
    phone: str,
    name: str,
    crew: int = 4,
    kyc_approved: bool = True,
) -> tuple[PartnerProfile, APIClient]:
    user = User.objects.create_user(phone_number=phone, full_name=name)
    UserRole.objects.create(user=user, role=_partner_role())
    partner = PartnerProfile.objects.create(user=user, display_name=name)
    PartnerServiceArea.objects.create(partner=partner, service_area=area)
    PartnerApplication.objects.create(
        partner=partner,
        status=(
            PartnerApplication.Status.APPROVED if kyc_approved else PartnerApplication.Status.DRAFT
        ),
        submitted_at=timezone.now(),
    )
    for variant in variants:
        approve_capability(partner=partner, variant=variant)
    # Responsiveness is an eligibility input, so a fixture vendor with no session is invisible to
    # matching and every enquiry test would silently exercise an empty pool.
    PartnerOnlineSession.objects.create(
        partner=partner,
        service_area=area,
        started_at=timezone.now(),
    )
    for index in range(crew):
        capabilities.add_crew_member(
            partner=partner,
            display_name=f"{name} worker {index}",
            phone_e164=f"+9199{phone[-6:]}{index:02d}",
        )
    client = force_role_client(user=user, role_code="partner")
    return partner, client


def approve_capability(
    *,
    partner: PartnerProfile,
    variant: ServiceVariant,
) -> PartnerCapability:
    capability = capabilities.request_capability(partner=partner, variant=variant)
    capabilities.transition_capability(
        capability_id=capability.id,
        to_status=PartnerCapability.Status.UNDER_REVIEW,
        actor=None,
        reason_code="queued",
    )
    return capabilities.transition_capability(
        capability_id=capability.id,
        to_status=PartnerCapability.Status.APPROVED,
        actor=None,
        reason_code="ok",
    )


@pytest.fixture
def world() -> M2World:
    area = ServiceArea.objects.create(
        slug="kukatpally",
        name="Kukatpally",
        state_code=WAGE_FLOOR_STATE_CODE,
    )
    for weekday in range(7):
        ServiceAreaOperatingWindow.objects.create(
            service_area=area,
            weekday=weekday,
            opens_at="09:00",
            closes_at="18:00",
        )

    variant = _variant(
        code="housekeeping",
        archetype=ServiceVariant.BookingArchetype.A3_TIME_BLOCK,
        area=area,
    )
    project_variant = _variant(
        code="renovation",
        archetype=ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
        area=area,
    )
    skill = Skill.objects.create(code="helper", name="Helper")

    customer, customer_client = _customer(phone="+919812345670", name="Priya S")
    other_customer, other_customer_client = _customer(phone="+919812345671", name="Arun M")

    vendor, vendor_client = _vendor(
        area=area,
        variants=(variant, project_variant),
        phone="+919812345680",
        name="Sri Sai Facility",
    )
    other_vendor, other_vendor_client = _vendor(
        area=area,
        variants=(variant,),
        phone="+919812345681",
        name="Lakshmi Services",
    )

    outsider, outsider_client = _customer(phone="+919812345690", name="Nobody Special")

    unregistered = User.objects.create_user(
        phone_number="+919812345691",
        full_name="Just Started",
    )
    UserRole.objects.create(user=unregistered, role=_partner_role())
    unregistered_vendor_client = force_role_client(user=unregistered, role_code="partner")

    operations = User.objects.create_user(phone_number="+919812345699", full_name="Ops Reviewer")
    operations_role, _created = Role.objects.get_or_create(
        code="operations",
        defaults={"name": "Operations", "is_system": True},
    )
    UserRole.objects.create(user=operations, role=operations_role)
    operations_client = force_role_client(user=operations, role_code="operations")

    return M2World(
        area=area,
        skill=skill,
        variant=variant,
        project_variant=project_variant,
        customer=customer,
        customer_client=customer_client,
        other_customer=other_customer,
        other_customer_client=other_customer_client,
        vendor=vendor,
        vendor_client=vendor_client,
        other_vendor=other_vendor,
        other_vendor_client=other_vendor_client,
        outsider=outsider,
        outsider_client=outsider_client,
        unregistered_vendor_client=unregistered_vendor_client,
        operations=operations,
        operations_client=operations_client,
    )


# ---------------------------------------------------------------------------
# Record builders, all through real domain commands
# ---------------------------------------------------------------------------


def address_for(customer: User) -> Address:
    return Address.objects.create(
        customer=customer,
        label="Warehouse",
        line1="Plot 14",
        locality="Kukatpally",
        city="Hyderabad",
        state="Telangana",
        postal_code="500072",
        latitude=Decimal("17.494500"),
        longitude=Decimal("78.399200"),
        confirmed_at=timezone.now(),
    )


def draft_requirement(
    *,
    world: M2World,
    customer: User | None = None,
    archetype: str = ServiceVariant.BookingArchetype.A3_TIME_BLOCK,
) -> CustomerRequirement:
    owner = customer or world.customer
    is_project = archetype == ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT
    variant = world.project_variant if is_project else world.variant
    answers = (
        {"deliverable": "Repaint the whole first floor"}
        if is_project
        else {"worker_count": 4, "duration_days": 3}
    )
    requirement = services.create_draft(customer=owner, variant=variant, answers=answers)
    return services.update_draft(
        requirement=requirement,
        address=address_for(owner),
        service_area=world.area,
        requested_start=timezone.now() + timedelta(days=10),
        service_by=timezone.localdate() + timedelta(days=20),
    )


def submitted_requirement(
    *,
    world: M2World,
    customer: User | None = None,
    archetype: str = ServiceVariant.BookingArchetype.A3_TIME_BLOCK,
) -> CustomerRequirement:
    requirement = draft_requirement(world=world, customer=customer, archetype=archetype)
    return services.submit_requirement(
        requirement=requirement,
        actor=customer or world.customer,
        allow_duplicate=True,
    )


def invitation_for(
    *,
    requirement: CustomerRequirement,
    partner: PartnerProfile,
    accepted: bool = False,
) -> VendorInvitation:
    invitation = VendorInvitation.objects.create(
        requirement=requirement,
        partner=partner,
        snapshot=matching.snapshot_requirement(requirement),
        cluster_key="",
        wave=1,
        responds_by=timezone.now() + timedelta(hours=8),
    )
    if accepted:
        matching.accept_invitation(invitation_id=invitation.id)
        invitation.refresh_from_db()
    return invitation


def proposal_for(*, invitation: VendorInvitation) -> Proposal:
    is_project = (
        invitation.requirement.archetype == ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT
    )
    if is_project:
        return proposals.submit_proposal(
            invitation_id=invitation.id,
            total_paise=A5_TOTAL_PAISE,
            tax_basis=Proposal.TaxBasis.INCLUSIVE,
            stages=[{"name": "Prep", "amount_paise": A5_TOTAL_PAISE}],
            valid_until=timezone.now() + timedelta(days=7),
        )
    return proposals.submit_proposal(
        invitation_id=invitation.id,
        total_paise=A3_TOTAL_PAISE,
        tax_basis=Proposal.TaxBasis.INCLUSIVE,
        rate_paise_per_worker_day=A3_RATE_PAISE,
        minimum_days=3,
        worker_count=4,
        valid_until=timezone.now() + timedelta(days=7),
    )


def site_visit_for(*, invitation: VendorInvitation) -> SiteVisit:
    return proposals.request_site_visit(invitation_id=invitation.id, fee_paise=50_000)

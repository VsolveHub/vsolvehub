"""Clarification, site visits, and the Partner enquiry and proposal surface.

Two banners, kept together because the second consumes the first: `RequirementQuestionSerializer`
and `SiteVisitSerializer` are read by both roles, and `EnquiryDetailSerializer` embeds them. The
boundary is the vendor's own composer — everything from the enquiry row to the quote a vendor
submits. What the Customer is shown of that quote once they have paid for it lives in
`engagements`.
"""

from datetime import datetime, timedelta
from typing import Any

from django.conf import settings
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.partners.photos import partner_photo_url
from apps.requirements import proposals
from apps.requirements.models import Proposal, RequirementQuestion, SiteVisit, VendorInvitation
from apps.requirements.selectors import (
    QUESTION_ASKER_ROLES,
    question_asker_role,
    requirement_area_label,
    vendor_business_type,
    verified_partner_ids,
)

from .base import INVITATION_DECLINE_REASONS

# ---------------------------------------------------------------------------
# Clarification, shared by both roles
# ---------------------------------------------------------------------------


class RequirementQuestionSerializer(serializers.ModelSerializer[RequirementQuestion]):
    """One question and its answer, on the timeline both parties read.

    `asked_by_role` is new at 1.26.0 and is not decoration: clarification ran one way until this
    release, so "who asked" was implied by the surface you were looking at. Now that a Customer can
    ask a vendor about a delivered quote, a client with no direction field renders both halves of a
    conversation as though the other side started it, and neither app can tell whose turn it is.

    Derived by **identity comparison, not by inference**: the requirement records its Customer and
    the invitation records its Partner's user, so the three answers are exact rather than guessed.
    `OPERATIONS` covers an assisted question, which has no route yet and will have one in Wave C6 —
    naming it now is what stops the answer defaulting to `VENDOR` when it arrives.
    """

    asked_by_role = serializers.SerializerMethodField()

    class Meta:
        model = RequirementQuestion
        fields = (
            "id",
            "invitation",
            "asked_by_role",
            "question",
            "answer",
            "asked_at",
            "answered_at",
        )
        read_only_fields = fields

    @extend_schema_field(serializers.ChoiceField(choices=QUESTION_ASKER_ROLES))
    def get_asked_by_role(self, obj: RequirementQuestion) -> str:
        return question_asker_role(obj)


class QuestionCreateSerializer(serializers.Serializer[dict[str, Any]]):
    question = serializers.CharField(max_length=2000)


class QuestionAnswerSerializer(serializers.Serializer[dict[str, Any]]):
    answer = serializers.CharField(max_length=2000)


class VisitVendorSerializer(serializers.Serializer[dict[str, Any]]):
    """Who is coming to the Customer's home.

    ## Why this exists

    `SiteVisit` reaches its vendor through `invitation.partner` and always has — but nothing
    published it, so the Customer's tracker could only name a vendor who had already delivered an
    *estimate*, and a confirmed slot with nobody named on it was the ordinary case. The screen
    that tells somebody who is about to knock on their door was the one screen that could not say.

    ## Why it is not published on every visit

    Disclosure starts when a vendor confirms a slot on a paid plan, and `SCHEDULED` is precisely
    that state — a visit whose plan payment has not been verified is *held*, not scheduled. Before
    then the pool of invited vendors is deliberately private: publishing it would let a Customer
    (or anybody who got hold of the read) enumerate which businesses were approached for what.

    ## What is deliberately absent

    No phone number and no address. Contact is released by the engagement, not by a visit, and a
    visit read that carried a mobile number would be a contact-unlock nobody paid for.
    """

    display_name = serializers.CharField()
    business_type = serializers.CharField(allow_blank=True)
    #: The badge, from the only thing that verifies a Partner: an approved application.
    is_verified = serializers.BooleanField()
    experience_years = serializers.IntegerField()
    #: A short-lived signed link, or null. Null covers every honest case at once — no photograph,
    #: one still in review, one refused, and storage being unreachable — because the client renders
    #: all four identically, as the vendor's initials. See `PartnerProfile.has_publishable_photo`.
    photo_url = serializers.URLField(allow_null=True)


#: The visit states in which the Customer may be told who is coming.
#:
#: `SCHEDULED` is the earliest, and it carries two facts at once: a vendor has committed to a time
#: *and* the plan payment behind it was verified. The three later states are kept because a
#: Customer reading back a completed visit still needs to know whose it was.
_VENDOR_DISCLOSED_STATUSES = (
    SiteVisit.Status.SCHEDULED,
    SiteVisit.Status.IN_PROGRESS,
    SiteVisit.Status.COMPLETED,
    SiteVisit.Status.VENDOR_NO_SHOW,
)


class SiteVisitSerializer(serializers.ModelSerializer[SiteVisit]):
    """One visit, in both its shapes.

    `is_plan_visit` is the field that decides how the whole record reads. A plan visit is paid for
    out of the A5 visit plan, occupies a share of it and opens an estimate window when it completes;
    an ad-hoc visit is a vendor-priced journey with none of that behind it. Publishing the flag
    rather than letting a client infer it from `fee_paise` keeps the two from being rendered as one
    thing with a different price.
    """

    is_plan_visit = serializers.SerializerMethodField()
    #: The service area's own IANA zone, so a client renders "Tuesday 10am" in the hours the area
    #: actually keeps. `BookingWindows` has published one since M1 and the visit — booked against
    #: the *same* `carts.availability` grid — carried only an instant, so every caller fell back to
    #: a deprecated Hyderabad-only constant: correct while the platform is one city and wrong the
    #: day it is not (`M2-FE-421`).
    timezone = serializers.SerializerMethodField()
    #: Who is coming, once the Customer is entitled to know. See `VisitVendorSerializer`.
    vendor = serializers.SerializerMethodField()

    class Meta:
        model = SiteVisit
        fields = (
            "id",
            "status",
            "is_plan_visit",
            "timezone",
            "vendor",
            "fee_paise",
            "adjusts_against_final_price",
            "scheduled_for",
            "duration_minutes",
            "arrival_confirmed_at",
            "arrival_method",
            "completed_at",
            #: When a completed visit stops being allowed to produce an estimate. Null when the
            #: owner has set no post-visit window — which is an unset policy, not "no deadline
            #: soon", and the composer must not render it as time in hand.
            "estimate_due_at",
            "cancellation_reason_code",
        )
        read_only_fields = fields

    def get_is_plan_visit(self, obj: SiteVisit) -> bool:
        return obj.plan_share_id is not None

    @extend_schema_field(VisitVendorSerializer(allow_null=True))
    def get_vendor(self, obj: SiteVisit) -> dict[str, Any] | None:
        """The vendor, or null while the Customer is not entitled to one.

        Reads through `invitation.partner`, so callers that page a list of visits should
        `select_related("invitation__partner")` — the tracker reads at most a plan's worth of
        visits, but the relation is a query per row without it.
        """

        if obj.status not in _VENDOR_DISCLOSED_STATUSES:
            return None
        partner = getattr(getattr(obj, "invitation", None), "partner", None)
        if partner is None:  # pragma: no cover - the FK is non-null
            return None
        return {
            "display_name": partner.display_name,
            "business_type": vendor_business_type(partner),
            "is_verified": partner.id in verified_partner_ids([partner.id]),
            "experience_years": partner.experience_years,
            "photo_url": partner_photo_url(partner),
        }

    def get_timezone(self, obj: SiteVisit) -> str:
        """The area's zone, or the platform's own as a last resort.

        A visit cannot exist on a requirement without a serviceable area — `_assert_submittable`
        refuses the submit — so the fallback is unreachable through any live path. It is written as
        the deployment's `TIME_ZONE` rather than a literal so that the one impossible case cannot
        become a second place Hyderabad is hardcoded.
        """
        area = getattr(obj.requirement, "service_area", None)
        return str(area.timezone) if area is not None else str(settings.TIME_ZONE)


class VisitArrivalCodeSerializer(serializers.Serializer[dict[str, Any]]):
    """The Customer's live arrival code, and whether a new one can be asked for.

    `code` and `can_issue` answer two different questions and a client needs both. A visit that is
    live but whose display copy has been evicted returns a null `code` with `can_issue` true —
    "ask for a new one" — while a visit that has already started returns null with `can_issue`
    false, which is "there is nothing left to prove here".
    """

    code = serializers.CharField(allow_null=True)
    expires_at = serializers.DateTimeField(allow_null=True)
    can_issue = serializers.BooleanField()
    server_now = serializers.DateTimeField()


class VisitArrivalCodeEntrySerializer(serializers.Serializer[dict[str, Any]]):
    """What the vendor types in.

    Bounded rather than free text: the length is fixed by `OTP_CODE_LENGTH`, and accepting an
    unbounded string would hand the hasher arbitrary input on an unauthenticated-ish guess path.
    """

    code = serializers.CharField(min_length=4, max_length=12, trim_whitespace=True)


class SiteVisitRequestSerializer(serializers.Serializer[dict[str, Any]]):
    #: No default. A free site visit gets refused by vendors who will not travel unpaid, and used
    #: by Customers as free consulting; the fee is what makes the visit real. The domain refuses
    #: a non-positive fee, and a default here would put a policy number in a serializer.
    fee_paise = serializers.IntegerField(min_value=1)
    adjusts_against_final_price = serializers.BooleanField(required=False, default=True)


class SiteVisitScheduleSerializer(serializers.Serializer[dict[str, Any]]):
    scheduled_for = serializers.DateTimeField()


class SiteVisitCompleteSerializer(serializers.Serializer[dict[str, Any]]):
    #: Optional. A visit that happened and produced nothing worth writing down is still a visit
    #: that happened, and requiring prose here would produce prose nobody reads.
    outcome_notes = serializers.CharField(required=False, allow_blank=True, max_length=4000)


# ---------------------------------------------------------------------------
# Partner: enquiries and proposals
# ---------------------------------------------------------------------------


class EnquirySummarySerializer(serializers.ModelSerializer[VendorInvitation]):
    """An enquiry list row.

    Reads the **snapshot**, not the live requirement: the snapshot is what this vendor was invited
    against, and re-reading the requirement would silently move the goalposts under a quote in
    progress. Customer identity and the exact address are absent from this list by design; only a
    locality-level area is published.
    """

    requirement_id = serializers.UUIDField(read_only=True)
    category_slug = serializers.SlugField(
        source="requirement.variant.service.slug",
        read_only=True,
    )
    #: The catalogue's own name. It landed on `EnquiryDetail` at 1.24.0 and not here, so the
    #: **inbox list** went on de-slugging `category_slug` into a title — presentation of a server
    #: value that the server already holds correctly.
    service_name = serializers.CharField(
        source="requirement.variant.service.name",
        read_only=True,
    )
    #: A locality-level decision input. Never a street, building, coordinate or customer-entered
    #: address line. The exact visit address has its own post-payment disclosure below.
    approximate_area = serializers.SerializerMethodField()
    archetype = serializers.CharField(source="snapshot.archetype", read_only=True)
    requirement_status = serializers.CharField(source="requirement.status", read_only=True)
    requested_start = serializers.DateTimeField(source="snapshot.requested_start", read_only=True)
    service_by = serializers.DateField(source="snapshot.service_by", read_only=True)
    language = serializers.CharField(source="snapshot.language", read_only=True)
    #: Guidance for a countdown only. The backend owns expiry and slot ownership; a client clock
    #: that has drifted must never be what decides an enquiry is still open.
    responds_by = serializers.DateTimeField(read_only=True)
    latest_proposal_status = serializers.SerializerMethodField()
    latest_proposal_rejection_reason = serializers.SerializerMethodField()

    class Meta:
        model = VendorInvitation
        #: Annotated widely so the detail subclass can extend it. Without this the inherited
        #: `Meta` fixes the tuple at its own arity and every added field is a type error.
        fields: tuple[str, ...] = (
            "id",
            "requirement_id",
            "category_slug",
            "service_name",
            "approximate_area",
            "archetype",
            "requirement_status",
            "status",
            "wave",
            "requested_start",
            "service_by",
            "language",
            "responds_by",
            "latest_proposal_status",
            "latest_proposal_rejection_reason",
            "created_at",
        )
        read_only_fields: tuple[str, ...] = fields

    @extend_schema_field(serializers.CharField(allow_blank=True))
    def get_approximate_area(self, obj: VendorInvitation) -> str:
        return requirement_area_label(obj.requirement)

    def _latest_proposal(self, obj: VendorInvitation) -> Proposal | None:
        ordered = getattr(obj, "ordered_proposals", None)
        if isinstance(ordered, list):
            return ordered[0] if ordered else None
        return Proposal.objects.filter(invitation=obj).order_by("-revision").first()

    def get_latest_proposal_status(self, obj: VendorInvitation) -> str | None:
        proposal = self._latest_proposal(obj)
        return proposal.status if proposal is not None else None

    def get_latest_proposal_rejection_reason(self, obj: VendorInvitation) -> str | None:
        proposal = self._latest_proposal(obj)
        return proposal.rejection_reason or None if proposal is not None else None


class EnquirySummaryPageSerializer(serializers.Serializer[dict[str, Any]]):
    """The Partner enquiry inbox's page envelope.

    The same correction as `RequirementSummaryPageSerializer`, and it closes a second gap Session B
    logged: no `cursor` parameter was published, so a Partner with more than twenty enquiries saw a
    silently truncated inbox with no way to page past it.
    """

    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = EnquirySummarySerializer(many=True)


class VendorAttachmentSerializer(serializers.Serializer[dict[str, Any]]):
    """One of the Customer's checked files, as a short-lived signed link.

    `download_url` is a bearer credential — anyone holding it holds the file — which is why it is
    minted per read and expires in minutes rather than being stored anywhere.
    """

    id = serializers.UUIDField(read_only=True)
    kind = serializers.CharField(read_only=True)
    size_bytes = serializers.IntegerField(read_only=True)
    #: For a voice note, the language it was spoken in — the field that decides whether this vendor
    #: can act on it at all.
    language = serializers.CharField(read_only=True, allow_blank=True)
    download_url = serializers.URLField(read_only=True)
    expires_at = serializers.DateTimeField(read_only=True)


class VendorAttachmentListSerializer(serializers.Serializer[dict[str, Any]]):
    """Attachments this vendor may see, and whether they still may.

    `has_access` is `false` once the invitation was declined, expired or withdrawn and this vendor
    was not selected. It is published as a state on a `200` rather than as an error because the
    vendor is entitled to their own enquiry record either way, and because "there are no
    photographs" and "you may no longer see the photographs" are different things to render.
    """

    has_access = serializers.BooleanField(read_only=True)
    attachments = VendorAttachmentSerializer(many=True, read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class PartnerSiteAddressSerializer(serializers.Serializer[dict[str, Any]]):
    """The visit destination, disclosed only once the paid visit is genuinely scheduled.

    Customer identity and contact remain absent. Coordinates remain absent too: the Partner needs
    a destination, not a reusable precision-location feed.
    """

    line1 = serializers.CharField()
    line2 = serializers.CharField(allow_blank=True)
    landmark = serializers.CharField(allow_blank=True)
    locality = serializers.CharField()
    city = serializers.CharField()
    state = serializers.CharField()
    postal_code = serializers.CharField()


_SITE_ADDRESS_DISCLOSED_STATUSES = (
    SiteVisit.Status.SCHEDULED,
    SiteVisit.Status.IN_PROGRESS,
)


class EnquiryDetailSerializer(EnquirySummarySerializer):
    answers = serializers.JSONField(source="snapshot.answers", read_only=True)
    additional_details = serializers.CharField(
        source="snapshot.additional_details",
        read_only=True,
    )
    budget_min_paise = serializers.IntegerField(
        source="snapshot.budget_min_paise",
        read_only=True,
        allow_null=True,
    )
    budget_max_paise = serializers.IntegerField(
        source="snapshot.budget_max_paise",
        read_only=True,
        allow_null=True,
    )
    #: **The basis every quote on this requirement is compared on.** `_required_tax_basis` forces
    #: each proposal onto whichever basis the first vendor used and refuses a mismatch — against a
    #: vendor the second one cannot see. Blank means nobody has quoted yet and this vendor sets it
    #: (`M2-FE-311`).
    required_tax_basis = serializers.SerializerMethodField()
    #: The quotes this vendor has already submitted against this enquiry, so the composer opens on
    #: the current revision rather than on an empty form.
    proposals = serializers.SerializerMethodField()
    questions = RequirementQuestionSerializer(many=True, read_only=True)
    site_visits = SiteVisitSerializer(many=True, read_only=True)
    #: Null before the Partner has committed to a slot and while the first slot is merely held for
    #: payment. A verified plan payment promotes the visit to `SCHEDULED`, which is the first point
    #: at which the Partner both needs and is entitled to the exact destination.
    site_address = serializers.SerializerMethodField()
    #: The one read carrying a hard `responds_by`. Without the server's own clock beside it a
    #: countdown is drawn against a browser clock that may have drifted, on the field that decides
    #: whether the vendor still has a slot.
    server_now = serializers.SerializerMethodField()

    class Meta(EnquirySummarySerializer.Meta):
        fields = (
            *EnquirySummarySerializer.Meta.fields,
            "answers",
            "additional_details",
            "budget_min_paise",
            "budget_max_paise",
            "required_tax_basis",
            "decline_reason_code",
            "proposals",
            "questions",
            "site_visits",
            "site_address",
            "server_now",
        )
        read_only_fields = fields

    def get_required_tax_basis(self, obj: VendorInvitation) -> str:
        from apps.requirements.proposals import required_tax_basis  # noqa: PLC0415 - import cycle

        return required_tax_basis(obj.requirement)

    def get_proposals(self, obj: VendorInvitation) -> list[dict[str, Any]]:
        ordered = getattr(obj, "ordered_proposals", None)
        queryset = ordered if isinstance(ordered, list) else obj.proposals.order_by("-revision")
        return list(ProposalSerializer(queryset, many=True).data)

    def get_server_now(self, _obj: VendorInvitation) -> str:
        return timezone.now().isoformat()

    @extend_schema_field(PartnerSiteAddressSerializer(allow_null=True))
    def get_site_address(self, obj: VendorInvitation) -> dict[str, str] | None:
        may_travel = any(
            visit.plan_share_id is not None and visit.status in _SITE_ADDRESS_DISCLOSED_STATUSES
            for visit in obj.site_visits.all()
        )
        address = obj.requirement.address
        if not may_travel or address is None:
            return None
        return {
            "line1": address.line1,
            "line2": address.line2,
            "landmark": address.landmark,
            "locality": address.locality,
            "city": address.city,
            "state": address.state,
            "postal_code": address.postal_code,
        }


class EnquiryDeclineSerializer(serializers.Serializer[dict[str, Any]]):
    #: Required, and the database agrees: `requirements_decline_needs_reason` refuses a declined
    #: invitation with an empty reason. Declines without reasons make replacement guesswork.
    #: Constrained to `INVITATION_DECLINE_REASONS` since 1.24.0 — an unconstrained slug meant every
    #: app invented its own strings and no Operations report could group them.
    reason_code = serializers.ChoiceField(choices=INVITATION_DECLINE_REASONS)


class ProposalStageSerializer(serializers.Serializer[dict[str, Any]]):
    """One A5 milestone, published so two vendors cannot send two incomparable structures.

    Until 1.24.0 `stages` was an untyped list and the domain read exactly one key, `amount_paise`.
    Everything a Customer needs to *read* a stage — what it delivers, when it ends — was
    client-authored, so the comparison view had nothing stable to render (`M2-FE-309`).

    `title` is required and the rest are not: a stage with a name and an amount is a comparable
    stage, and refusing one because a vendor did not fill in an end date would push them back to
    a single-line quote.
    """

    title = serializers.CharField(max_length=200)
    deliverable = serializers.CharField(
        required=False, allow_blank=True, max_length=2000, default=""
    )
    amount_paise = serializers.IntegerField(min_value=0)
    starts_on = serializers.DateField(required=False, allow_null=True, default=None)
    duration_days = serializers.IntegerField(
        required=False, allow_null=True, min_value=1, max_value=3650, default=None
    )
    ends_on = serializers.DateField(required=False, allow_null=True, default=None)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        starts_on = attrs.get("starts_on")
        duration_days = attrs.get("duration_days")
        ends_on = attrs.get("ends_on")
        if starts_on is not None and duration_days is not None:
            expected = starts_on + timedelta(days=int(duration_days) - 1)
            if ends_on is None:
                attrs["ends_on"] = expected
            elif ends_on != expected:
                raise serializers.ValidationError(
                    {"ends_on": "The deadline must match the start date and number of days."}
                )
        return attrs

    def to_representation(self, instance: Any) -> dict[str, Any]:
        """Read a stored stage defensively; the column is a `JSONField`, not a table.

        Stages are stored as JSON, so a row written before this shape existed can be missing any
        key — and the declared-field path would raise `KeyError` on the *read*, turning an old
        proposal into a 500 on the screen that compares quotes. Reading through `.get` publishes the
        same four keys for every row and degrades an unknown stage to a blank title rather than an
        error page. `label` is accepted as a `title` alias because `engagements._a5_stages` already
        reads both.
        """
        stage = instance if isinstance(instance, dict) else {}
        return {
            "title": str(stage.get("title") or stage.get("label") or ""),
            "deliverable": str(stage.get("deliverable") or ""),
            "amount_paise": int(stage.get("amount_paise") or 0),
            "starts_on": stage.get("starts_on"),
            "duration_days": stage.get("duration_days"),
            "ends_on": stage.get("ends_on"),
        }


class ProposalMaterialLineSerializer(serializers.Serializer[dict[str, Any]]):
    """One material line on an A5 estimate — **not** a stage, and that is the whole point.

    Until 1.26.0 the wire carried exactly one money-carrying row type, so a vendor pricing cement
    sent it as a `ProposalStage` with their own title. A stage is a unit of evidence, approval and
    release, so that made a bag of cement a fundable milestone somebody had to *approve as work*.
    `README.md` is explicit that material money is spent rather than earned and therefore cannot be
    recovered like an unearned work stage; a row type that cannot tell the two apart cannot carry
    that rule (`M2-BE-543`).

    `quantity` and `unit` are here because a material line without them is unreadable in a
    comparison — "cement, 1,20,000 paise" against "cement, 40 bags at 3,000" is the difference
    between two quotes a Customer can compare and two they cannot. `unit` is free text on purpose:
    bags, cubic metres, running feet and coils are all real, and a closed vocabulary authored here
    would refuse whichever trade nobody thought of.
    """

    title = serializers.CharField(max_length=200)
    quantity = serializers.IntegerField(min_value=1, required=False, default=1)
    unit = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    amount_paise = serializers.IntegerField(min_value=0)

    def to_representation(self, instance: Any) -> dict[str, Any]:
        """Read a stored line defensively; the column is a `JSONField`, not a table.

        The same rule as `ProposalStageSerializer.to_representation` and for the same reason: a row
        written before this shape existed must degrade rather than turn a comparison screen into a
        500.
        """
        line = instance if isinstance(instance, dict) else {}
        return {
            "title": str(line.get("title") or ""),
            "quantity": int(line.get("quantity") or 1),
            "unit": str(line.get("unit") or ""),
            "amount_paise": int(line.get("amount_paise") or 0),
        }


class ProposalSerializer(serializers.ModelSerializer[Proposal]):
    """A vendor's own quote, read back to that vendor."""

    stages = ProposalStageSerializer(many=True, read_only=True)
    material_lines = ProposalMaterialLineSerializer(many=True, read_only=True)
    revision_expires_at = serializers.SerializerMethodField()

    class Meta:
        model = Proposal
        fields = (
            "id",
            "requirement",
            "invitation",
            "revision",
            "revision_expires_at",
            "status",
            "usability",
            "rejection_reason",
            #: The completed visit this estimate was priced on. Null for every A3 quote.
            "site_visit",
            #: Set when the Customer asked for a fresh price on an expired quote. The vendor's
            #: answer is a supersession, and it reuses the unlock or plan already paid for.
            "revalidation_requested_at",
            "rate_paise_per_worker_day",
            "minimum_days",
            "worker_count",
            "total_paise",
            "tax_paise",
            "tax_basis",
            "commission_treatment",
            "inclusions",
            "exclusions",
            "stages",
            "material_lines",
            "warranty_terms",
            "valid_until",
            "vendor_confirmed_at",
            "submitted_at",
        )
        read_only_fields = fields

    @extend_schema_field(serializers.DateTimeField(allow_null=True))
    def get_revision_expires_at(self, obj: Proposal) -> datetime | None:
        if obj.requirement.archetype != "A5_CUSTOM_PROJECT":
            return None
        return proposals.estimate_revision_expires_at(obj)


class ProposalPageSerializer(serializers.Serializer[dict[str, Any]]):
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = ProposalSerializer(many=True)


class ProposalCreateSerializer(serializers.Serializer[dict[str, Any]]):
    """Both composers in one shape; the domain validates which fields the archetype requires.

    Deliberately not two serializers. `proposals.submit_proposal` already runs `_assert_a3_shape`
    or `_assert_a5_shape` against the requirement's own archetype, and a second archetype check
    here would be a copy of that rule which could disagree with it. A vendor sending A5 stages on
    an A3 requirement gets one refusal, from the layer that knows.
    """

    invitation_id = serializers.UUIDField()
    total_paise = serializers.IntegerField(min_value=1)
    tax_basis = serializers.ChoiceField(choices=Proposal.TaxBasis.choices)
    tax_paise = serializers.IntegerField(min_value=0, required=False, default=0)

    rate_paise_per_worker_day = serializers.IntegerField(
        min_value=1, required=False, allow_null=True
    )
    minimum_days = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    worker_count = serializers.IntegerField(min_value=1, required=False, allow_null=True)

    stages = ProposalStageSerializer(many=True, required=False)
    #: A5 only. Refused on an A3 quote — a workforce quote is a rate per worker per day, and a
    #: vendor supplying their own materials on a labour hire is not a shape this platform brokers.
    material_lines = ProposalMaterialLineSerializer(many=True, required=False)
    inclusions = serializers.ListField(child=serializers.CharField(max_length=200), required=False)
    exclusions = serializers.ListField(child=serializers.CharField(max_length=200), required=False)
    warranty_terms = serializers.CharField(required=False, allow_blank=True, max_length=4000)
    valid_until = serializers.DateTimeField(required=False, allow_null=True)
    commission_treatment = serializers.CharField(required=False, allow_blank=True, max_length=24)
    #: **Required for an A5 estimate**, and the field that was missing: `submit_proposal` has always
    #: taken a `site_visit_id` and no serializer published one, so an on-site estimate could not be
    #: submitted over HTTP at all. The domain refuses a visit that is not `COMPLETED` and not this
    #: vendor's, so this is an identifier and never an assertion.
    site_visit_id = serializers.UUIDField(required=False, allow_null=True)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if attrs.get("tax_paise", 0) > attrs["total_paise"]:
            raise serializers.ValidationError(
                {"tax_paise": "Tax cannot be more than the quoted total."}
            )
        return attrs

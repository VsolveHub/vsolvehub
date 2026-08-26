"""Request and response shapes for the booking-fulfilment API.

Two rules shape every serializer here, and both come from `07-api-events-and-operations.md`.

**Projections are actor-scoped, not model-scoped.** A Customer sees their visit: status, times,
their Partner's display name, what was done. A Partner sees the same visit as work: the tasks,
the OTP state, the evidence they filed — and never the sibling units of the same Booking Group,
never another Partner's earnings. Operations sees the audit trail on top. Three serializers over
one `Booking` is deliberate; one serializer with conditional fields is how a field leaks.

**Nothing accepts a status, a price or a time the server owns.** Request serializers carry an
`expected_version` and the few genuinely client-authored values (a reason, an OTP code, a task
outcome). Everything else is read from the domain layer.
"""

from datetime import timedelta
from typing import Any

from django.conf import settings
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.carts.models import QuoteLine
from apps.commerce.models import Booking
from apps.fulfilment.models import (
    BookingStatusHistory,
    CompletionResponse,
    CompletionSubmission,
    ScopeAmendment,
    ScopeAmendmentLine,
    WorkEvidence,
    WorkOutcome,
    WorkTask,
)
from apps.payouts.models import PartnerLedgerEntry
from apps.payouts.services import estimated_booking_earning


class VersionedCommandSerializer(serializers.Serializer[dict[str, Any]]):
    """The floor every state-changing fulfilment command sits on.

    `expected_version` is required, never defaulted. A command that would apply to whatever
    state it happens to find is the thing optimistic concurrency exists to prevent, and a
    default here would silently reintroduce it for every caller that forgot the field.
    """

    expected_version = serializers.IntegerField(min_value=1)


class ReasonedCommandSerializer(VersionedCommandSerializer):
    reason = serializers.CharField(max_length=240, allow_blank=False, trim_whitespace=True)


# --------------------------------------------------------------------------------------------
# Shared read projections
# --------------------------------------------------------------------------------------------


class WorkTaskSerializer(serializers.ModelSerializer[WorkTask]):
    class Meta:
        model = WorkTask
        fields = (
            "id",
            "kind",
            "position",
            "code",
            "label",
            "quantity",
            "amount_paise",
            "currency",
        )
        read_only_fields = fields


class WorkOutcomeSerializer(serializers.ModelSerializer[WorkOutcome]):
    work_task_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = WorkOutcome
        fields = ("id", "work_task_id", "outcome", "quantity", "reason")
        read_only_fields = fields


class WorkEvidenceSerializer(serializers.ModelSerializer[WorkEvidence]):
    """Evidence metadata only.

    The object key is a private-bucket path and the bytes are KYC-adjacent: neither belongs in
    a list projection. A reader who needs the file asks for a fresh, audited, expiring grant,
    the same way Partner documents work.
    """

    work_task_id = serializers.UUIDField(read_only=True, allow_null=True)

    class Meta:
        model = WorkEvidence
        fields = (
            "id",
            "kind",
            "work_task_id",
            "content_type",
            "size_bytes",
            "processing_status",
            "created_at",
        )
        read_only_fields = fields


class BookingStatusHistorySerializer(serializers.ModelSerializer[BookingStatusHistory]):
    class Meta:
        model = BookingStatusHistory
        fields = ("id", "command", "from_status", "to_status", "reason", "created_at")
        read_only_fields = fields


class ScopeAmendmentLineSerializer(serializers.ModelSerializer[ScopeAmendmentLine]):
    class Meta:
        model = ScopeAmendmentLine
        fields = (
            "id",
            "position",
            "kind",
            "code",
            "label",
            "quantity",
            "amount_paise",
            "currency",
        )
        read_only_fields = fields


class ScopeAmendmentSerializer(serializers.ModelSerializer[ScopeAmendment]):
    booking_id = serializers.UUIDField(read_only=True)
    lines = ScopeAmendmentLineSerializer(many=True, read_only=True)
    server_now = serializers.SerializerMethodField()

    class Meta:
        model = ScopeAmendment
        fields = (
            "id",
            "booking_id",
            "status",
            "version",
            "reason",
            "evidence_required",
            "total_paise",
            "currency",
            "expires_at",
            "responded_at",
            "lines",
            "server_now",
        )
        read_only_fields = fields

    @extend_schema_field(serializers.DateTimeField())
    def get_server_now(self, _instance: ScopeAmendment) -> str:
        """`expires_at` is a deadline the UI counts down to.

        Published beside it for the same reason the Partner offer publishes it: a device clock
        an hour out would otherwise show an amendment as expired, or as having half an hour
        left, with no error and no visual difference. Proposal 0010.

        Rendered as a string rather than handed back as a `datetime`: every command
        response is persisted verbatim into `IdempotencyRecord.response_body`, which is a
        `JSONField`. A raw `datetime` makes the whole command uncommittable.
        """

        return timezone.now().isoformat()


class CompletionResponseSerializer(serializers.ModelSerializer[CompletionResponse]):
    class Meta:
        model = CompletionResponse
        fields = ("id", "decision", "dispute_reason", "responded_at")
        read_only_fields = fields


class CompletionSubmissionSerializer(serializers.ModelSerializer[CompletionSubmission]):
    outcomes = serializers.SerializerMethodField()
    response = serializers.SerializerMethodField()
    responds_by = serializers.SerializerMethodField()

    class Meta:
        model = CompletionSubmission
        fields = (
            "id",
            "notes",
            "safety_damage_declared",
            "submitted_at",
            "responds_by",
            "outcomes",
            "response",
        )
        read_only_fields = fields

    @extend_schema_field(WorkOutcomeSerializer(many=True))
    def get_outcomes(self, instance: CompletionSubmission) -> Any:
        return WorkOutcomeSerializer(instance.outcomes.all(), many=True).data

    @extend_schema_field(CompletionResponseSerializer(allow_null=True))
    def get_response(self, instance: CompletionSubmission) -> Any:
        response = getattr(instance, "response", None)
        return None if response is None else CompletionResponseSerializer(response).data

    @extend_schema_field(serializers.DateTimeField())
    def get_responds_by(self, instance: CompletionSubmission) -> str:
        """The deadline after which an evidence-backed report finalizes itself.

        Derived rather than stored, from the same setting `auto_finalize_completion` sweeps on,
        so the number a Customer counts down to and the number the watchdog acts on cannot
        drift apart.
        """

        deadline = instance.submitted_at + timedelta(hours=settings.M1_COMPLETION_RESPONSE_HOURS)
        return deadline.isoformat()


# --------------------------------------------------------------------------------------------
# Customer projection
# --------------------------------------------------------------------------------------------


class CancellationPreviewSerializer(serializers.Serializer[Any]):
    """What cancelling this visit would cost and return, as of now.

    Every figure is the server's. A browser cannot read the frozen band ladder or the live
    payment allocations, so a client that computed either would be inventing the number it then
    asked the Customer to accept.
    """

    band_code = serializers.CharField()
    fee_paise = serializers.IntegerField()
    fee_waiver = serializers.CharField(allow_blank=True)
    refund_paise = serializers.IntegerField()
    currency = serializers.CharField()


class ReschedulePreviewSerializer(serializers.Serializer[Any]):
    """Whether a visit may be moved right now, and why not when it may not.

    Published rather than derived client-side because the rule reads the frozen quote-time
    cancellation ladder: a visit is movable only while its *free* band still applies. That
    snapshot never leaves the server, so a client can only guess — and guessing here means
    offering a picker that refuses every slot in it.
    """

    is_available = serializers.BooleanField()
    unavailable_reason = serializers.CharField(allow_blank=True)
    earliest_start = serializers.DateTimeField()


class CustomerBookingSerializer(serializers.ModelSerializer[Booking]):
    """One visit, as the Customer who paid for it sees it.

    Carries the Partner's display name and nothing else about them — not their phone number,
    not their earnings, not their other jobs. `G7` in the frontend task file is the same rule
    from the other side: Customer projections contain no Partner identity beyond what is needed
    to recognise the person at the door.
    """

    fulfilment_unit_id = serializers.UUIDField(read_only=True, allow_null=True)
    partner_display_name = serializers.SerializerMethodField()
    work_tasks = serializers.SerializerMethodField()
    active_amendment = serializers.SerializerMethodField()
    completion = serializers.SerializerMethodField()
    cancellation_preview = serializers.SerializerMethodField()
    reschedule_preview = serializers.SerializerMethodField()
    server_now = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = (
            "id",
            "fulfilment_unit_id",
            "status",
            "version",
            "scheduled_start",
            "estimated_duration_minutes",
            "partner_display_name",
            "en_route_at",
            "arrived_at",
            "late_declared_at",
            "cancelled_at",
            "cancellation_reason",
            "work_tasks",
            "active_amendment",
            "completion",
            "cancellation_preview",
            "reschedule_preview",
            "server_now",
        )
        read_only_fields = fields

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_partner_display_name(self, instance: Booking) -> str | None:
        """`null` while a replacement is being found, because nobody is coming yet.

        `Booking.partner` still holds the Partner who released — that column is rewritten only
        when `adopt_replacement_reservation` lands a replacement — so reading it during recovery
        names the one person who is definitely not turning up, directly under a status that says
        somebody else is being assigned.

        Operations' projection deliberately keeps naming them: who dropped the job is the whole
        point of the case they are working.
        """

        if instance.status == Booking.Status.RECOVERY_REQUIRED:
            return None
        return instance.partner.display_name

    @extend_schema_field(WorkTaskSerializer(many=True))
    def get_work_tasks(self, instance: Booking) -> Any:
        return WorkTaskSerializer(instance.work_tasks.all(), many=True).data

    @extend_schema_field(ScopeAmendmentSerializer(allow_null=True))
    def get_active_amendment(self, instance: Booking) -> Any:
        amendment = (
            ScopeAmendment.objects.filter(booking=instance, status=ScopeAmendment.Status.PROPOSED)
            .prefetch_related("lines")
            .order_by("-created_at")
            .first()
        )
        return None if amendment is None else ScopeAmendmentSerializer(amendment).data

    @extend_schema_field(CompletionSubmissionSerializer(allow_null=True))
    def get_completion(self, instance: Booking) -> Any:
        submission = (
            CompletionSubmission.objects.filter(booking=instance)
            .prefetch_related("outcomes")
            .order_by("-submitted_at")
            .first()
        )
        return None if submission is None else CompletionSubmissionSerializer(submission).data

    @extend_schema_field(CancellationPreviewSerializer(allow_null=True))
    def get_cancellation_preview(self, instance: Booking) -> Any:
        """Priced here rather than in the browser, and `null` when cancelling is not on offer.

        Imported inside the method: `fulfilment.cancellation` imports this module's siblings and
        a module-scope import closes the loop.
        """

        from apps.fulfilment.cancellation import preview_cancellation  # noqa: PLC0415

        unit = instance.fulfilment_unit
        if unit is None:
            return None
        preview = preview_cancellation(unit=unit, booking=instance)
        return None if preview is None else CancellationPreviewSerializer(preview).data

    @extend_schema_field(ReschedulePreviewSerializer(allow_null=True))
    def get_reschedule_preview(self, instance: Booking) -> Any:
        """Whether this visit can be moved, and the sentence to show when it cannot.

        Two things the client cannot work out for itself, and got wrong when it tried. The
        notice rule is keyed on the *frozen quote-time* fee ladder — a visit is movable only
        while its free cancellation band still applies — and no browser holds that snapshot.
        A client guessing from `status` alone offers Reschedule on a visit fourteen hours out
        and lands the Customer on a grid where every slot is refused.
        """

        from apps.fulfilment.cancellation import preview_reschedule  # noqa: PLC0415

        unit = instance.fulfilment_unit
        if unit is None:
            return None
        return ReschedulePreviewSerializer(preview_reschedule(unit=unit, booking=instance)).data

    @extend_schema_field(serializers.DateTimeField())
    def get_server_now(self, _instance: Booking) -> str:
        return timezone.now().isoformat()


class StartOtpSerializer(serializers.Serializer[dict[str, Any]]):
    """What the Customer is told about the code they must read out.

    `code_length` rather than the code: the Customer reads the code off their own SMS, and
    publishing it here would hand it to anyone who could reach this endpoint — which is the
    whole point of the OTP. `development_code` is populated only by the development sender,
    exactly as OTP login already works.
    """

    booking_id = serializers.UUIDField()
    expires_at = serializers.DateTimeField()
    code_length = serializers.IntegerField()
    development_code = serializers.CharField(allow_null=True, required=False)
    server_now = serializers.DateTimeField()


# --------------------------------------------------------------------------------------------
# Partner projection
# --------------------------------------------------------------------------------------------


class PartnerBookingEarningSerializer(serializers.Serializer[dict[str, object]]):
    """One Partner's own money for one job — never the Customer's invoice."""

    gross_paise = serializers.IntegerField()
    commission_paise = serializers.IntegerField()
    net_paise = serializers.IntegerField()
    currency = serializers.CharField()
    status = serializers.CharField()
    calculation_snapshot = serializers.JSONField()


class PartnerBookingEstimatedEarningSerializer(serializers.Serializer[dict[str, object]]):
    """The booked-scope estimate, before completion determines the final ledger earning."""

    gross_paise = serializers.IntegerField(min_value=0)
    commission_paise = serializers.IntegerField(min_value=0)
    net_paise = serializers.IntegerField(min_value=0)
    currency = serializers.CharField(max_length=3)


class PartnerBookingServiceLineSerializer(serializers.Serializer[dict[str, object]]):
    """One immutable service line carried from the offer into the accepted job."""

    line_id = serializers.UUIDField()
    service_label = serializers.CharField()
    quantity = serializers.IntegerField(min_value=1)
    scope = serializers.DictField(child=serializers.JSONField())


class PartnerBookingListQuerySerializer(serializers.Serializer[dict[str, object]]):
    """Which shelf of the Partner's work to read.

    Buckets rather than raw statuses, because a Partner is answering "what do I
    have to do now?", not "which of eleven states is this row in". The mapping
    lives on the server so the app cannot invent a bucket the queue does not
    honour.
    """

    bucket = serializers.ChoiceField(
        choices=("active", "completed", "cancelled"),
        required=False,
    )


class PartnerBookingSerializer(serializers.ModelSerializer[Booking]):
    """The same visit, as the Partner assigned to it sees it.

    Deliberately does not carry `order_id`, any sibling unit, the Customer's invoice, or their
    exact address. Its estimate and settled earning are this Partner's own money for this one
    unit. The Booking Group is not addressable from here at all: `G7` requires that a Partner
    cannot reach a sibling unit's scope or earnings, and the cheapest way to guarantee that is to
    never publish the identifier that would let them try.
    """

    fulfilment_unit_id = serializers.UUIDField(read_only=True, allow_null=True)
    display_title = serializers.SerializerMethodField()
    approximate_area = serializers.SerializerMethodField()
    service_lines = serializers.SerializerMethodField()
    requirements = serializers.SerializerMethodField()
    work_tasks = serializers.SerializerMethodField()
    evidence = serializers.SerializerMethodField()
    active_amendment = serializers.SerializerMethodField()
    estimated_earning = serializers.SerializerMethodField()
    earning = serializers.SerializerMethodField()
    server_now = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = (
            "id",
            "fulfilment_unit_id",
            "display_title",
            "approximate_area",
            "service_lines",
            "requirements",
            "status",
            "version",
            "scheduled_start",
            "estimated_duration_minutes",
            "en_route_at",
            "arrived_at",
            "customer_unavailable_wait_started_at",
            "late_declared_at",
            "work_tasks",
            "evidence",
            "active_amendment",
            "estimated_earning",
            "earning",
            "server_now",
        )
        read_only_fields = fields

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_display_title(self, booking: Booking) -> str | None:
        """Name the immutable booked service even before operational tasks are materialized."""

        unit = booking.fulfilment_unit
        if unit is None:
            return None
        labels = [line.label for line in unit.lines.all() if line.kind == QuoteLine.Kind.SERVICE]
        if not labels:
            return None
        return labels[0] if len(labels) == 1 else f"{labels[0]} +{len(labels) - 1} more"

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_approximate_area(self, booking: Booking) -> str | None:
        """Area already disclosed with the accepted offer; never the Customer's exact address."""

        unit = booking.fulfilment_unit
        return None if unit is None else unit.service_area.name

    @extend_schema_field(PartnerBookingServiceLineSerializer(many=True))
    def get_service_lines(self, booking: Booking) -> list[dict[str, object]]:
        """Publish the accepted service scope before start-OTP materializes work tasks."""

        unit = booking.fulfilment_unit
        if unit is None:
            return []
        result: list[dict[str, object]] = []
        for line in unit.lines.all():
            if line.kind != QuoteLine.Kind.SERVICE:
                continue
            snapshot = line.snapshot if isinstance(line.snapshot, dict) else {}
            raw_scope = snapshot.get("scope", {})
            scope = raw_scope if isinstance(raw_scope, dict) else {}
            result.append(
                {
                    "line_id": str(line.id),
                    "service_label": line.label,
                    "quantity": line.quantity,
                    "scope": scope,
                }
            )
        return result

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_requirements(self, booking: Booking) -> list[str]:
        """Tools frozen with the booked configuration, matching the accepted offer."""

        unit = booking.fulfilment_unit
        if unit is None:
            return []
        requirements: set[str] = set()
        for line in unit.lines.all():
            if line.kind != QuoteLine.Kind.SERVICE:
                continue
            snapshot = line.snapshot if isinstance(line.snapshot, dict) else {}
            raw_configuration = snapshot.get("configuration", {})
            if not isinstance(raw_configuration, dict):
                continue
            raw_requirements = raw_configuration.get("required_equipment", [])
            if not isinstance(raw_requirements, list):
                continue
            requirements.update(
                item.strip() for item in raw_requirements if isinstance(item, str) and item.strip()
            )
        return sorted(requirements)

    @extend_schema_field(WorkTaskSerializer(many=True))
    def get_work_tasks(self, instance: Booking) -> Any:
        return WorkTaskSerializer(instance.work_tasks.all(), many=True).data

    @extend_schema_field(WorkEvidenceSerializer(many=True))
    def get_evidence(self, instance: Booking) -> Any:
        return WorkEvidenceSerializer(instance.evidence.all(), many=True).data

    @extend_schema_field(ScopeAmendmentSerializer(allow_null=True))
    def get_active_amendment(self, instance: Booking) -> Any:
        amendment = (
            ScopeAmendment.objects.filter(booking=instance, status=ScopeAmendment.Status.PROPOSED)
            .prefetch_related("lines")
            .order_by("-created_at")
            .first()
        )
        return None if amendment is None else ScopeAmendmentSerializer(amendment).data

    @extend_schema_field(PartnerBookingEstimatedEarningSerializer(allow_null=True))
    def get_estimated_earning(self, booking: Booking) -> dict[str, object] | None:
        """The offer-equivalent estimate; final settlement remains `earning`."""

        estimate = estimated_booking_earning(booking)
        if estimate is None:
            return None
        return {
            "gross_paise": estimate.gross_paise,
            "commission_paise": estimate.commission_paise,
            "net_paise": estimate.net_paise,
            "currency": estimate.currency,
        }

    @extend_schema_field(PartnerBookingEarningSerializer(allow_null=True))
    def get_earning(self, booking: Booking) -> dict[str, object] | None:
        """What **this Partner** earns from this job, once it has settled.

        Their own ledger line, not the Customer's invoice. The two are different
        numbers and only one of them is the Partner's business: the Customer's
        total carries a platform fee and tax that are not the Partner's to
        receive, and showing it here would tell them they earned a figure they
        will never be paid.

        `null` until settlement writes the entry — an unfinished job has no
        earning yet, and a projected one would be a promise made by a serializer.
        `calculation_snapshot` is published because a Partner is entitled to see
        why they were paid what they were paid; hiding it turns every payment
        question into a support ticket.
        """
        entry = (
            PartnerLedgerEntry.objects.filter(
                booking=booking,
                kind=PartnerLedgerEntry.Kind.EARNING,
            )
            .order_by("-created_at")
            .first()
        )
        if entry is None:
            return None
        return {
            "gross_paise": entry.gross_paise,
            "commission_paise": entry.commission_paise,
            "net_paise": entry.net_paise,
            "currency": entry.currency,
            "status": entry.status,
            "calculation_snapshot": entry.calculation_snapshot,
        }

    @extend_schema_field(serializers.DateTimeField())
    def get_server_now(self, _instance: Booking) -> str:
        return timezone.now().isoformat()


# --------------------------------------------------------------------------------------------
# Operations projection
# --------------------------------------------------------------------------------------------


class PartnerBookingPageSerializer(serializers.Serializer[dict[str, object]]):
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = PartnerBookingSerializer(many=True)
    # An empty shelf carries no row to calibrate a countdown from, so the page
    # publishes the server instant too — the same reason the offer inbox does.
    server_now = serializers.DateTimeField()


class OperationsBookingSerializer(serializers.ModelSerializer[Booking]):
    """Cross-unit recovery context, with the audit trail that justifies it.

    Operations is the one actor that legitimately sees both sides, so this is the one
    projection that names the Partner and the Booking Group. Every read of it is audited by
    `IsOperationsUser`.
    """

    fulfilment_unit_id = serializers.UUIDField(read_only=True, allow_null=True)
    booking_group_id = serializers.SerializerMethodField()
    partner_id = serializers.UUIDField(read_only=True)
    partner_display_name = serializers.SerializerMethodField()
    work_tasks = serializers.SerializerMethodField()
    evidence = serializers.SerializerMethodField()
    status_history = serializers.SerializerMethodField()
    server_now = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = (
            "id",
            "fulfilment_unit_id",
            "booking_group_id",
            "order_id",
            "status",
            "version",
            "scheduled_start",
            "estimated_duration_minutes",
            "partner_id",
            "partner_display_name",
            "en_route_at",
            "arrived_at",
            "customer_unavailable_wait_started_at",
            "late_declared_at",
            "cancelled_at",
            "cancellation_reason",
            "payout_hold",
            "work_tasks",
            "evidence",
            "status_history",
            "server_now",
        )
        read_only_fields = fields

    @extend_schema_field(serializers.UUIDField(allow_null=True))
    def get_booking_group_id(self, instance: Booking) -> Any:
        unit = instance.fulfilment_unit
        return None if unit is None else unit.booking_group_id

    @extend_schema_field(serializers.CharField())
    def get_partner_display_name(self, instance: Booking) -> str:
        return instance.partner.display_name

    @extend_schema_field(WorkTaskSerializer(many=True))
    def get_work_tasks(self, instance: Booking) -> Any:
        return WorkTaskSerializer(instance.work_tasks.all(), many=True).data

    @extend_schema_field(WorkEvidenceSerializer(many=True))
    def get_evidence(self, instance: Booking) -> Any:
        return WorkEvidenceSerializer(instance.evidence.all(), many=True).data

    @extend_schema_field(BookingStatusHistorySerializer(many=True))
    def get_status_history(self, instance: Booking) -> Any:
        return BookingStatusHistorySerializer(instance.status_history.all(), many=True).data

    @extend_schema_field(serializers.DateTimeField())
    def get_server_now(self, _instance: Booking) -> str:
        return timezone.now().isoformat()


# --------------------------------------------------------------------------------------------
# Command request bodies
# --------------------------------------------------------------------------------------------


class CustomerContactAttemptRequestSerializer(serializers.Serializer[dict[str, Any]]):
    outcome = serializers.CharField(max_length=32)


class StartOtpVerifyRequestSerializer(VersionedCommandSerializer):
    code = serializers.CharField(max_length=12, trim_whitespace=True)


class AssistedStartRequestSerializer(VersionedCommandSerializer):
    outage_reason = serializers.CharField(max_length=240, allow_blank=False, trim_whitespace=True)


class EvidenceUploadRequestSerializer(serializers.Serializer[dict[str, Any]]):
    kind = serializers.ChoiceField(choices=WorkEvidence.Kind.choices)
    content_type = serializers.CharField(max_length=120)
    size_bytes = serializers.IntegerField(min_value=1)


class EvidenceUploadGrantSerializer(serializers.Serializer[dict[str, Any]]):
    """A short-lived, single-attempt grant to put bytes in a private bucket.

    The token is published because the browser must send it, and for no longer than one attempt:
    FE-07 established that a signed grant lives in component state and is dropped afterwards,
    never persisted. `expires_at` is what makes that enforceable.
    """

    object_key = serializers.CharField()
    upload_url = serializers.CharField()
    upload_token = serializers.CharField()
    resumable_url = serializers.CharField()
    method = serializers.CharField()
    expires_at = serializers.DateTimeField()


class EvidenceFinalizeRequestSerializer(serializers.Serializer[dict[str, Any]]):
    """The client's claim about what it uploaded; Django streams the object and checks it.

    `sha256` is not trusted — it is *compared*. The same three-step shape FE-07 established for
    KYC: the client computes the digest locally, Django recomputes it from the bytes actually in
    the bucket, and a mismatch fails closed. Sending it is what makes the comparison possible.
    """

    kind = serializers.ChoiceField(choices=WorkEvidence.Kind.choices)
    object_key = serializers.CharField(max_length=512)
    content_type = serializers.CharField(max_length=120)
    size_bytes = serializers.IntegerField(min_value=1)
    sha256 = serializers.RegexField(r"^[0-9a-f]{64}$")
    work_task_id = serializers.UUIDField(required=False, allow_null=True)


class ProposeAmendmentRequestSerializer(VersionedCommandSerializer):
    reason = serializers.CharField(max_length=240, allow_blank=False, trim_whitespace=True)
    task_quantity = serializers.IntegerField(min_value=1)


class OutcomeInputSerializer(serializers.Serializer[dict[str, Any]]):
    work_task_id = serializers.UUIDField()
    outcome = serializers.ChoiceField(choices=WorkOutcome.Outcome.choices)
    quantity = serializers.IntegerField(min_value=0, default=0)
    reason = serializers.CharField(max_length=240, allow_blank=True, default="")


class SubmitCompletionRequestSerializer(VersionedCommandSerializer):
    notes = serializers.CharField(max_length=2000, allow_blank=True, default="")
    safety_damage_declared = serializers.BooleanField(default=False)
    outcomes = OutcomeInputSerializer(many=True)

    def validate_outcomes(self, value: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not value:
            raise serializers.ValidationError(
                "A completion report must state an outcome for every task."
            )
        return value


class DisputeCompletionRequestSerializer(VersionedCommandSerializer):
    dispute_reason = serializers.CharField(max_length=240, allow_blank=False, trim_whitespace=True)
    disputed_outcome_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, allow_empty=True
    )


class RescheduleBookingRequestSerializer(VersionedCommandSerializer):
    new_requested_start = serializers.DateTimeField()


class GroupCommandSerializer(serializers.Serializer[dict[str, Any]]):
    expected_version = serializers.IntegerField(min_value=1)


class GroupCancelRequestSerializer(GroupCommandSerializer):
    reason = serializers.CharField(max_length=240, allow_blank=False, trim_whitespace=True)


class GroupRescheduleRequestSerializer(GroupCommandSerializer):
    new_group_start = serializers.DateTimeField()


class GroupAddressChangeRequestSerializer(GroupCommandSerializer):
    new_address_id = serializers.UUIDField()


class RecoverBookingRequestSerializer(VersionedCommandSerializer):
    offer_id = serializers.UUIDField()


# --------------------------------------------------------------------------------------------
# Command result bodies
# --------------------------------------------------------------------------------------------


class UnitCancellationOutcomeSerializer(serializers.Serializer[dict[str, Any]]):
    fulfilment_unit_id = serializers.UUIDField()
    booking_id = serializers.UUIDField()
    outcome = serializers.CharField()
    booking_status = serializers.CharField()
    fee_paise = serializers.IntegerField()
    refund_ids = serializers.ListField(child=serializers.UUIDField())


class GroupCancellationResultSerializer(serializers.Serializer[dict[str, Any]]):
    booking_group_id = serializers.UUIDField()
    group_status = serializers.CharField()
    group_version = serializers.IntegerField()
    units = UnitCancellationOutcomeSerializer(many=True)
    server_now = serializers.DateTimeField()


class UnitRescheduleOutcomeSerializer(serializers.Serializer[dict[str, Any]]):
    fulfilment_unit_id = serializers.UUIDField()
    booking_id = serializers.UUIDField()
    old_requested_start = serializers.DateTimeField()
    new_requested_start = serializers.DateTimeField()


class GroupRescheduleResultSerializer(serializers.Serializer[dict[str, Any]]):
    booking_group_id = serializers.UUIDField()
    group_version = serializers.IntegerField()
    shift_seconds = serializers.IntegerField()
    units = UnitRescheduleOutcomeSerializer(many=True)
    server_now = serializers.DateTimeField()


class BookingCancellationResultSerializer(serializers.Serializer[dict[str, Any]]):
    booking = CustomerBookingSerializer()
    refund_ids = serializers.ListField(child=serializers.UUIDField())


class AmendmentApprovalResultSerializer(serializers.Serializer[dict[str, Any]]):
    amendment = ScopeAmendmentSerializer()
    payment_attempt_id = serializers.UUIDField()
    amount_paise = serializers.IntegerField()
    currency = serializers.CharField()

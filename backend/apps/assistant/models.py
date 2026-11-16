"""Conversations, their messages, and the one booking a conversation may have open.

Nothing here duplicates a booking or a payment. `AssistantBooking` is a link row: the
`CheckoutSession` and `BookingGroup` it points at are the system of record, and their statuses
are read live rather than copied.
"""

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.carts.models import BookingGroup, CheckoutSession


class AssistantSession(models.Model):
    """One chat conversation, addressed by an unguessable token the client holds.

    The token itself is never stored: only its SHA-256, so a database read cannot be replayed as
    a conversation. A conversation started signed out is claimed by the first signed-in Customer
    who uses its token, and from then on answers to that Customer only.
    """

    class Channel(models.TextChoices):
        WEB = "WEB", "Website"
        WHATSAPP = "WHATSAPP", "WhatsApp"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    token_hash = models.CharField(max_length=64, unique=True)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="assistant_sessions",
    )
    channel = models.CharField(max_length=16, choices=Channel.choices, default=Channel.WEB)
    #: Opaque references handed to the model (`refs`) and the turn counter's companions. The model
    #: only ever sees references such as `V3`; the ids they stand for stay here.
    state = models.JSONField(default=dict, blank=True)
    turn_count = models.PositiveIntegerField(default=0)
    user_message_count = models.PositiveIntegerField(default=0)
    input_tokens = models.PositiveBigIntegerField(default=0)
    output_tokens = models.PositiveBigIntegerField(default=0)
    #: A lease, not a lock: one turn at a time per conversation without holding a database
    #: transaction open across a model call. A crashed turn frees itself when the lease lapses.
    busy_until = models.DateTimeField(null=True, blank=True)
    last_activity_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=("customer", "-last_activity_at"))]

    def __str__(self) -> str:
        return str(self.id)


class AssistantMessage(models.Model):
    class Role(models.TextChoices):
        USER = "USER", "Customer"
        ASSISTANT = "ASSISTANT", "Assistant"
        #: Tool results. Kept for the model's history and for review; never shown to the Customer.
        TOOL = "TOOL", "Tool results"
        #: Written by the server, not the model: greetings and booking progress such as
        #: "a professional accepted" or "payment received". Deterministic text from live status.
        NOTICE = "NOTICE", "Notice"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        AssistantSession,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    sequence = models.PositiveIntegerField()
    role = models.CharField(max_length=16, choices=Role.choices)
    text = models.TextField(blank=True)
    tool_calls = models.JSONField(default=list, blank=True)
    tool_results = models.JSONField(default=list, blank=True)
    #: UI cards for this message: quick replies, login, pay, view booking.
    actions = models.JSONField(default=list, blank=True)
    #: Vendor data that must be echoed back to the vendor that produced it (Gemini thought
    #: signatures). Opaque; never interpreted here.
    provider_payload = models.JSONField(default=dict, blank=True)
    client_message_id = models.CharField(max_length=64, blank=True)
    provider = models.CharField(max_length=32, blank=True)
    model = models.CharField(max_length=80, blank=True)
    input_tokens = models.PositiveIntegerField(default=0)
    output_tokens = models.PositiveIntegerField(default=0)
    latency_ms = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("session", "sequence")
        constraints = [
            models.UniqueConstraint(
                fields=("session", "sequence"),
                name="assistant_unique_message_sequence",
            ),
            models.UniqueConstraint(
                fields=("session", "client_message_id"),
                condition=~models.Q(client_message_id=""),
                name="assistant_unique_client_message",
            ),
        ]
        indexes = [models.Index(fields=("role", "created_at"))]

    def __str__(self) -> str:
        return f"{self.session_id}:{self.sequence}"


class AssistantBooking(models.Model):
    """The booking a conversation created, and the last status it told the Customer about.

    At most one open booking per conversation, enforced by the database: a double-sent
    "yes, book it" cannot start two checkouts from one chat.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        AssistantSession,
        on_delete=models.CASCADE,
        related_name="bookings",
    )
    checkout = models.OneToOneField(
        CheckoutSession,
        on_delete=models.PROTECT,
        related_name="assistant_booking",
    )
    booking_group = models.ForeignKey(
        BookingGroup,
        on_delete=models.PROTECT,
        related_name="assistant_bookings",
    )
    announced_status = models.CharField(max_length=24, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("session",),
                condition=models.Q(closed_at__isnull=True),
                name="assistant_one_open_booking_per_session",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.session_id}:{self.checkout_id}"

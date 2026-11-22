from django.conf import settings
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import AssistantMessage

ACTION_TYPES = (
    "QUICK_REPLY",
    "LOGIN",
    "ADD_ADDRESS",
    "OPEN_LINK",
    "QUOTE",
    "PAY",
    "VIEW_BOOKING",
)
SENDERS = ("customer", "assistant")


class AssistantActionSerializer(serializers.Serializer[dict[str, object]]):
    """A card under a message. `message` is the text to send when a reply chip is tapped."""

    action_type = serializers.ChoiceField(choices=ACTION_TYPES, source="type")
    label = serializers.CharField()  # type: ignore[assignment]
    href = serializers.CharField(required=False)
    message = serializers.CharField(required=False)
    amount = serializers.CharField(required=False)
    lines = serializers.ListField(child=serializers.CharField(), required=False)


class AssistantMessageSerializer(serializers.ModelSerializer[AssistantMessage]):
    sender = serializers.SerializerMethodField()
    actions = AssistantActionSerializer(many=True, read_only=True)

    class Meta:
        model = AssistantMessage
        fields = ("sequence", "sender", "text", "actions", "created_at")
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(serializers.ChoiceField(choices=SENDERS))
    def get_sender(message: AssistantMessage) -> str:
        return "customer" if message.role == AssistantMessage.Role.USER else "assistant"


class AssistantConversationSerializer(serializers.Serializer[dict[str, object]]):
    messages = AssistantMessageSerializer(many=True)
    is_answering = serializers.BooleanField()
    signed_in = serializers.BooleanField()
    has_open_booking = serializers.BooleanField()


class AssistantConversationCreatedSerializer(serializers.Serializer[dict[str, object]]):
    conversation_token = serializers.CharField(
        help_text="Send as the X-Assistant-Token header. Shown once; keep it on the device.",
    )
    conversation = AssistantConversationSerializer()


class AssistantMessageCreateSerializer(serializers.Serializer[dict[str, object]]):
    text = serializers.CharField(max_length=settings.ASSISTANT_MAX_MESSAGE_CHARS)
    client_message_id = serializers.RegexField(
        r"^[A-Za-z0-9_-]{8,64}$",
        help_text="A client-generated id. Resending the same id replays the stored answer.",
    )


class AssistantTurnSerializer(serializers.Serializer[dict[str, object]]):
    messages = AssistantMessageSerializer(many=True)

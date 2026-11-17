from django.urls import path

from .views import (
    AssistantConversationCreateView,
    AssistantConversationView,
    AssistantHistoryView,
    AssistantMessageCreateView,
    AssistantOwnedConversationView,
    AssistantOwnedMessageCreateView,
)

app_name = "assistant"

urlpatterns = [
    path(
        "assistant/conversations/",
        AssistantConversationCreateView.as_view(),
        name="conversation-create",
    ),
    path("assistant/history/", AssistantHistoryView.as_view(), name="history"),
    path(
        "assistant/conversations/<uuid:conversation_id>/",
        AssistantOwnedConversationView.as_view(),
        name="owned-conversation",
    ),
    path(
        "assistant/conversations/<uuid:conversation_id>/messages/",
        AssistantOwnedMessageCreateView.as_view(),
        name="owned-message-create",
    ),
    path("assistant/conversation/", AssistantConversationView.as_view(), name="conversation"),
    path(
        "assistant/conversation/messages/",
        AssistantMessageCreateView.as_view(),
        name="message-create",
    ),
]

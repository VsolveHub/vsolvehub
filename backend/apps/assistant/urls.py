from django.urls import path

from .views import (
    AssistantConversationCreateView,
    AssistantConversationView,
    AssistantMessageCreateView,
)

app_name = "assistant"

urlpatterns = [
    path(
        "assistant/conversations/",
        AssistantConversationCreateView.as_view(),
        name="conversation-create",
    ),
    path("assistant/conversation/", AssistantConversationView.as_view(), name="conversation"),
    path(
        "assistant/conversation/messages/",
        AssistantMessageCreateView.as_view(),
        name="message-create",
    ),
]

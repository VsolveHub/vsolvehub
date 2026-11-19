"""Operations routes for privacy requests, mounted under `/api/v1/`."""

from django.urls import path

from apps.identity.operations_views import (
    OperationsPrivacyRequestCancelView,
    OperationsPrivacyRequestCollectionView,
    OperationsPrivacyRequestCompleteView,
    OperationsPrivacyRequestEraseView,
    OperationsPrivacyRequestHoldView,
    OperationsPrivacyRequestRejectView,
    OperationsPrivacyRequestReleaseView,
    OperationsUserDeletionRequestView,
)

urlpatterns = [
    path(
        "operations/privacy-requests/",
        OperationsPrivacyRequestCollectionView.as_view(),
        name="operations-privacy-requests",
    ),
    path(
        "operations/privacy-requests/<uuid:privacy_request_id>/hold/",
        OperationsPrivacyRequestHoldView.as_view(),
        name="operations-privacy-request-hold",
    ),
    path(
        "operations/privacy-requests/<uuid:privacy_request_id>/release/",
        OperationsPrivacyRequestReleaseView.as_view(),
        name="operations-privacy-request-release",
    ),
    path(
        "operations/privacy-requests/<uuid:privacy_request_id>/cancel/",
        OperationsPrivacyRequestCancelView.as_view(),
        name="operations-privacy-request-cancel",
    ),
    path(
        "operations/privacy-requests/<uuid:privacy_request_id>/reject/",
        OperationsPrivacyRequestRejectView.as_view(),
        name="operations-privacy-request-reject",
    ),
    path(
        "operations/privacy-requests/<uuid:privacy_request_id>/complete/",
        OperationsPrivacyRequestCompleteView.as_view(),
        name="operations-privacy-request-complete",
    ),
    path(
        "operations/privacy-requests/<uuid:privacy_request_id>/erase/",
        OperationsPrivacyRequestEraseView.as_view(),
        name="operations-privacy-request-erase",
    ),
    path(
        "operations/users/<uuid:user_id>/deletion-request/",
        OperationsUserDeletionRequestView.as_view(),
        name="operations-user-deletion-request",
    ),
]

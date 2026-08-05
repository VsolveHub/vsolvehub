"""Operations case routes. Every one is Operations-only and audited."""

from django.urls import path

from apps.cases.views import (
    OperationsCaseClaimView,
    OperationsCaseDetailView,
    OperationsCaseEscalateView,
    OperationsCaseListView,
    OperationsCaseNoteView,
    OperationsCaseResolveView,
)

urlpatterns = [
    path("operations/cases/", OperationsCaseListView.as_view(), name="operations-cases"),
    path(
        "operations/cases/<uuid:case_id>/",
        OperationsCaseDetailView.as_view(),
        name="operations-case-detail",
    ),
    path(
        "operations/cases/<uuid:case_id>/claim/",
        OperationsCaseClaimView.as_view(),
        name="operations-case-claim",
    ),
    path(
        "operations/cases/<uuid:case_id>/escalate/",
        OperationsCaseEscalateView.as_view(),
        name="operations-case-escalate",
    ),
    path(
        "operations/cases/<uuid:case_id>/resolve/",
        OperationsCaseResolveView.as_view(),
        name="operations-case-resolve",
    ),
    path(
        "operations/cases/<uuid:case_id>/notes/",
        OperationsCaseNoteView.as_view(),
        name="operations-case-notes",
    ),
]

"""Operations case routes. Every one is Operations-only and audited, except the public Contact
form, which only ever opens a case."""

from django.urls import path

from apps.cases.views import (
    ContactMessageView,
    OperationsCaseAppealDecisionView,
    OperationsCaseClaimView,
    OperationsCaseDetailView,
    OperationsCaseEscalateView,
    OperationsCaseListView,
    OperationsCaseNoteView,
    OperationsCaseOverrideView,
    OperationsCaseResolveView,
    OperationsCaseResponseDeadlineView,
    OperationsCaseSummaryView,
)

urlpatterns = [
    path("support/contact/", ContactMessageView.as_view(), name="support-contact"),
    path("operations/cases/", OperationsCaseListView.as_view(), name="operations-cases"),
    # Before the `<uuid:case_id>` route so `summary` is never read as a case id.
    path(
        "operations/cases/summary/",
        OperationsCaseSummaryView.as_view(),
        name="operations-cases-summary",
    ),
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
    # Wave C6 (`M2-BE-704`, `712`).
    path(
        "operations/cases/<uuid:case_id>/response-deadline/",
        OperationsCaseResponseDeadlineView.as_view(),
        name="operations-case-response-deadline",
    ),
    path(
        "operations/cases/<uuid:case_id>/appeal-decision/",
        OperationsCaseAppealDecisionView.as_view(),
        name="operations-case-appeal-decision",
    ),
    path(
        "operations/cases/<uuid:case_id>/override/",
        OperationsCaseOverrideView.as_view(),
        name="operations-case-override",
    ),
]

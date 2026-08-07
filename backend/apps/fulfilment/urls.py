"""Booking-fulfilment routes.

Three actor prefixes, deliberately not one.

`/bookings/{id}/…` is the Customer's. `/partner/bookings/{id}/…` is the Partner's.
`/operations/bookings/{id}/…` is Operations'. The same underlying `Booking` is reachable from
all three, and each one runs a different permission class and returns a different projection.
Collapsing them into one route family with role branching inside the view is how a Partner ends
up reading a Customer's address: the branch is one `if` away from being wrong, whereas a
separate URL cannot accidentally serve the wrong serializer.

Group-wide post-payment commands live under `/booking-groups/{id}/` beside the pre-payment
`cancel` that `apps.carts` already publishes there. They are different operations — one collects
nothing, the other runs the fee ladder per unit — so they get different path segments rather
than one endpoint whose meaning depends on state.
"""

from django.urls import path

from apps.fulfilment.views import (
    BookedGroupAddressChangeView,
    BookedGroupCancelView,
    BookedGroupRescheduleView,
    CustomerAmendmentApproveView,
    CustomerAmendmentDeclineView,
    CustomerBookingCancelView,
    CustomerBookingDetailView,
    CustomerBookingRescheduleView,
    CustomerCompletionConfirmView,
    CustomerCompletionDisputeView,
    CustomerQualityDisputeView,
    CustomerStartOtpView,
    OperationsAssistedStartView,
    OperationsBookingDetailView,
    OperationsRecoverBookingView,
    PartnerAbortView,
    PartnerArrivedView,
    PartnerBookingCollectionView,
    PartnerBookingDetailView,
    PartnerContactAttemptView,
    PartnerCustomerUnavailableView,
    PartnerEnRouteView,
    PartnerEvidenceFinalizeView,
    PartnerEvidenceUploadView,
    PartnerProposeAmendmentView,
    PartnerReleaseView,
    PartnerStartOtpVerifyView,
    PartnerSubmitCompletionView,
)

urlpatterns = [
    # Customer — one visit
    path("bookings/<uuid:booking_id>/", CustomerBookingDetailView.as_view(), name="booking-detail"),
    path(
        "bookings/<uuid:booking_id>/cancel/",
        CustomerBookingCancelView.as_view(),
        name="booking-cancel",
    ),
    path(
        "bookings/<uuid:booking_id>/reschedule/",
        CustomerBookingRescheduleView.as_view(),
        name="booking-reschedule",
    ),
    path(
        "bookings/<uuid:booking_id>/start-otp/",
        CustomerStartOtpView.as_view(),
        name="booking-start-otp",
    ),
    path(
        "bookings/<uuid:booking_id>/completion/confirm/",
        CustomerCompletionConfirmView.as_view(),
        name="booking-completion-confirm",
    ),
    path(
        "bookings/<uuid:booking_id>/completion/dispute/",
        CustomerCompletionDisputeView.as_view(),
        name="booking-completion-dispute",
    ),
    path(
        "bookings/<uuid:booking_id>/quality-dispute/",
        CustomerQualityDisputeView.as_view(),
        name="booking-quality-dispute",
    ),
    path(
        "scope-amendments/<uuid:amendment_id>/approve/",
        CustomerAmendmentApproveView.as_view(),
        name="scope-amendment-approve",
    ),
    path(
        "scope-amendments/<uuid:amendment_id>/decline/",
        CustomerAmendmentDeclineView.as_view(),
        name="scope-amendment-decline",
    ),
    # Customer — the whole group
    path(
        "booking-groups/<uuid:group_id>/cancel-booked/",
        BookedGroupCancelView.as_view(),
        name="booked-group-cancel",
    ),
    path(
        "booking-groups/<uuid:group_id>/reschedule/",
        BookedGroupRescheduleView.as_view(),
        name="booked-group-reschedule",
    ),
    path(
        "booking-groups/<uuid:group_id>/address/",
        BookedGroupAddressChangeView.as_view(),
        name="booked-group-address",
    ),
    # Partner — the physical work
    path(
        "partner/bookings/",
        PartnerBookingCollectionView.as_view(),
    ),
    path(
        "partner/bookings/<uuid:booking_id>/",
        PartnerBookingDetailView.as_view(),
        name="partner-booking-detail",
    ),
    path(
        "partner/bookings/<uuid:booking_id>/en-route/",
        PartnerEnRouteView.as_view(),
        name="partner-booking-en-route",
    ),
    path(
        "partner/bookings/<uuid:booking_id>/arrived/",
        PartnerArrivedView.as_view(),
        name="partner-booking-arrived",
    ),
    path(
        "partner/bookings/<uuid:booking_id>/customer-unavailable/",
        PartnerCustomerUnavailableView.as_view(),
        name="partner-booking-customer-unavailable",
    ),
    path(
        "partner/bookings/<uuid:booking_id>/contact-attempts/",
        PartnerContactAttemptView.as_view(),
        name="partner-booking-contact-attempt",
    ),
    path(
        "partner/bookings/<uuid:booking_id>/start-otp/verify/",
        PartnerStartOtpVerifyView.as_view(),
        name="partner-booking-start-otp-verify",
    ),
    path(
        "partner/bookings/<uuid:booking_id>/evidence/uploads/",
        PartnerEvidenceUploadView.as_view(),
        name="partner-booking-evidence-upload",
    ),
    path(
        "partner/bookings/<uuid:booking_id>/evidence/",
        PartnerEvidenceFinalizeView.as_view(),
        name="partner-booking-evidence",
    ),
    path(
        "partner/bookings/<uuid:booking_id>/scope-amendments/",
        PartnerProposeAmendmentView.as_view(),
        name="partner-booking-propose-amendment",
    ),
    path(
        "partner/bookings/<uuid:booking_id>/completion/",
        PartnerSubmitCompletionView.as_view(),
        name="partner-booking-submit-completion",
    ),
    path(
        "partner/bookings/<uuid:booking_id>/abort/",
        PartnerAbortView.as_view(),
        name="partner-booking-abort",
    ),
    path(
        "partner/bookings/<uuid:booking_id>/release/",
        PartnerReleaseView.as_view(),
        name="partner-booking-release",
    ),
    # Operations
    path(
        "operations/bookings/<uuid:booking_id>/",
        OperationsBookingDetailView.as_view(),
        name="operations-booking-detail",
    ),
    path(
        "operations/bookings/<uuid:booking_id>/assisted-start/",
        OperationsAssistedStartView.as_view(),
        name="operations-booking-assisted-start",
    ),
    path(
        "operations/bookings/<uuid:booking_id>/recover/",
        OperationsRecoverBookingView.as_view(),
        name="operations-booking-recover",
    ),
]

import uuid
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone

from apps.assignments.models import DispatchOffer
from apps.assignments.ranking import ExclusionReason
from apps.assignments.ranking import evaluate_unit_candidates as rank_unit_candidates
from apps.assignments.tasks import (
    reconcile_stuck_dispatch_offers_task,
    send_dispatch_offer_push_task,
)
from apps.carts.models import BookingGroup
from apps.partners.models import (
    PartnerLocation,
    PartnerOnlineSession,
    PartnerPushSubscription,
    PartnerShift,
)
from tests.fulfilment.conftest import create_booked_group

pytestmark = [
    pytest.mark.django_db(transaction=True),
    pytest.mark.usefixtures("partner_gates_open"),
]


# ============================================================================
# 1. Eligibility Tests


def _prepare_instant_unit(booked):
    booked.group.booking_mode = BookingGroup.BookingMode.INSTANT
    booked.group.save(update_fields=["booking_mode"])
    booked.unit.booking_group.booking_mode = BookingGroup.BookingMode.INSTANT
    from apps.assignments.models import AssignmentAttempt

    AssignmentAttempt.objects.filter(fulfilment_unit=booked.unit).delete()
    return booked.partner, booked.unit


# ============================================================================


def test_eligibility_fresh_active_opted_in(settings):
    settings.FEATURE_PUSH_GATED_INSTANT = True
    settings.PUSH_SUBSCRIPTION_FRESHNESS_DAYS = 30
    booked = create_booked_group(key_prefix="elig-1")
    partner, unit = _prepare_instant_unit(booked)
    now = timezone.now()

    # Active shift
    PartnerShift.objects.create(
        partner=partner,
        service_area=unit.service_area,
        started_at=now - timedelta(hours=1),
        scheduled_end_at=now + timedelta(hours=3),
    )
    # Fresh location
    PartnerLocation.objects.create(
        partner=partner,
        service_area=unit.service_area,
        latitude=17.44,
        longitude=78.38,
        accuracy_m=10,
        captured_at=now,
    )
    # Active, fresh, opted-in subscription
    PartnerPushSubscription.objects.create(
        partner=partner,
        user=partner.user,
        onesignal_subscription_id=str(uuid.uuid4()),
        onesignal_external_id=str(partner.id),
        platform=PartnerPushSubscription.Platform.WEB,
        is_active=True,
        opted_in=True,
        permission_state="granted",
        last_verified_at=now - timedelta(days=5),
    )

    ranking = rank_unit_candidates(unit=unit)
    partner_eval = next((e for e in ranking.evaluations if e.partner.id == partner.id), None)
    assert partner_eval is not None
    assert ExclusionReason.NO_PUSH_SUBSCRIPTION not in partner_eval.exclusions
    assert ExclusionReason.NO_ACTIVE_PUSH_SUBSCRIPTION not in partner_eval.exclusions
    assert ExclusionReason.PUSH_SUBSCRIPTION_STALE not in partner_eval.exclusions


def test_eligibility_excluded_no_subscription(settings):
    settings.FEATURE_PUSH_GATED_INSTANT = True
    booked = create_booked_group(key_prefix="elig-nosub")
    partner, unit = _prepare_instant_unit(booked)
    now = timezone.now()

    PartnerShift.objects.create(
        partner=partner,
        service_area=unit.service_area,
        started_at=now - timedelta(hours=1),
        scheduled_end_at=now + timedelta(hours=3),
    )
    PartnerLocation.objects.create(
        partner=partner,
        service_area=unit.service_area,
        latitude=17.44,
        longitude=78.38,
        accuracy_m=10,
        captured_at=now,
    )
    # No subscription created

    ranking = rank_unit_candidates(unit=unit)
    partner_eval = next((e for e in ranking.evaluations if e.partner.id == partner.id), None)
    assert partner_eval is not None
    assert ExclusionReason.NO_ACTIVE_PUSH_SUBSCRIPTION in partner_eval.exclusions


def test_eligibility_excluded_opted_out(settings):
    settings.FEATURE_PUSH_GATED_INSTANT = True
    booked = create_booked_group(key_prefix="elig-optout")
    partner, unit = _prepare_instant_unit(booked)
    now = timezone.now()

    PartnerShift.objects.create(
        partner=partner,
        service_area=unit.service_area,
        started_at=now - timedelta(hours=1),
        scheduled_end_at=now + timedelta(hours=3),
    )
    PartnerLocation.objects.create(
        partner=partner,
        service_area=unit.service_area,
        latitude=17.44,
        longitude=78.38,
        accuracy_m=10,
        captured_at=now,
    )
    PartnerPushSubscription.objects.create(
        partner=partner,
        user=partner.user,
        onesignal_subscription_id=str(uuid.uuid4()),
        onesignal_external_id=str(partner.id),
        platform=PartnerPushSubscription.Platform.WEB,
        is_active=False,
        opted_in=False,
        permission_state="default",
        last_verified_at=now,
    )

    ranking = rank_unit_candidates(unit=unit)
    partner_eval = next((e for e in ranking.evaluations if e.partner.id == partner.id), None)
    assert partner_eval is not None
    assert ExclusionReason.PUSH_OPTED_OUT in partner_eval.exclusions


def test_eligibility_excluded_permission_denied(settings):
    settings.FEATURE_PUSH_GATED_INSTANT = True
    booked = create_booked_group(key_prefix="elig-denied")
    partner, unit = _prepare_instant_unit(booked)
    now = timezone.now()

    PartnerShift.objects.create(
        partner=partner,
        service_area=unit.service_area,
        started_at=now - timedelta(hours=1),
        scheduled_end_at=now + timedelta(hours=3),
    )
    PartnerLocation.objects.create(
        partner=partner,
        service_area=unit.service_area,
        latitude=17.44,
        longitude=78.38,
        accuracy_m=10,
        captured_at=now,
    )
    PartnerPushSubscription.objects.create(
        partner=partner,
        user=partner.user,
        onesignal_subscription_id=str(uuid.uuid4()),
        onesignal_external_id=str(partner.id),
        platform=PartnerPushSubscription.Platform.WEB,
        is_active=False,
        opted_in=True,
        permission_state="denied",
        last_verified_at=now,
    )

    ranking = rank_unit_candidates(unit=unit)
    partner_eval = next((e for e in ranking.evaluations if e.partner.id == partner.id), None)
    assert partner_eval is not None
    assert ExclusionReason.PUSH_PERMISSION_DENIED in partner_eval.exclusions


def test_eligibility_excluded_stale_subscription(settings):
    settings.FEATURE_PUSH_GATED_INSTANT = True
    settings.PUSH_SUBSCRIPTION_FRESHNESS_DAYS = 30
    booked = create_booked_group(key_prefix="elig-stale")
    partner, unit = _prepare_instant_unit(booked)
    now = timezone.now()

    PartnerShift.objects.create(
        partner=partner,
        service_area=unit.service_area,
        started_at=now - timedelta(hours=1),
        scheduled_end_at=now + timedelta(hours=3),
    )
    PartnerLocation.objects.create(
        partner=partner,
        service_area=unit.service_area,
        latitude=17.44,
        longitude=78.38,
        accuracy_m=10,
        captured_at=now,
    )
    # Stale: verified 35 days ago
    PartnerPushSubscription.objects.create(
        partner=partner,
        user=partner.user,
        onesignal_subscription_id=str(uuid.uuid4()),
        onesignal_external_id=str(partner.id),
        platform=PartnerPushSubscription.Platform.WEB,
        is_active=True,
        opted_in=True,
        permission_state="granted",
        last_verified_at=now - timedelta(days=35),
    )

    ranking = rank_unit_candidates(unit=unit)
    partner_eval = next((e for e in ranking.evaluations if e.partner.id == partner.id), None)
    assert partner_eval is not None
    assert ExclusionReason.PUSH_SUBSCRIPTION_STALE in partner_eval.exclusions


def test_eligibility_feature_push_gated_false_preserves_presence_behavior(settings):
    settings.FEATURE_PUSH_GATED_INSTANT = False
    booked = create_booked_group(key_prefix="elig-off")
    partner, unit = _prepare_instant_unit(booked)

    # When flag is false, online presence is checked via PartnerOnlineSession
    PartnerOnlineSession.objects.create(
        partner=partner,
        service_area=unit.service_area,
        started_at=timezone.now(),
    )

    ranking = rank_unit_candidates(unit=unit)
    partner_eval = next((e for e in ranking.evaluations if e.partner.id == partner.id), None)
    assert partner_eval is not None
    assert ExclusionReason.OFFLINE_FOR_SAME_DAY not in partner_eval.exclusions
    assert ExclusionReason.NO_ACTIVE_SHIFT not in partner_eval.exclusions


# ============================================================================
# 2. Concurrency Tests
# ============================================================================


def test_atomic_claim_concurrency_race() -> None:
    booked = create_booked_group(key_prefix="concur-race")
    booking = booked.booking
    partner = booked.partner
    now = timezone.now()

    offer = DispatchOffer.objects.create(
        booking=booking,
        partner=partner,
        status=DispatchOffer.Status.PENDING,
        offered_at=now,
        expires_at=now + timedelta(seconds=60),
    )

    with patch("apps.notifications.onesignal.send_push_to_external_ids") as mock_send:
        mock_send.return_value = {
            "success": True,
            "notification_id": "push-concur-1",
            "errors": [],
        }

        # Worker 1 runs and succeeds
        res1 = send_dispatch_offer_push_task(str(offer.id))
        assert res1["success"] is True

        offer.refresh_from_db()
        assert offer.status == DispatchOffer.Status.SENT
        assert offer.onesignal_notification_id == "push-concur-1"
        assert mock_send.call_count == 1

        # Worker 2 runs concurrently on the same offer after Worker 1 transitioned it
        res2 = send_dispatch_offer_push_task(str(offer.id))
        assert res2["skipped"] is True
        assert res2["reason"] == "Push already sent"
        # Mock must NOT have been called a second time
        assert mock_send.call_count == 1


def test_worker_exits_when_already_in_sending() -> None:
    booked = create_booked_group(key_prefix="concur-send")
    booking = booked.booking
    partner = booked.partner
    now = timezone.now()

    offer = DispatchOffer.objects.create(
        booking=booking,
        partner=partner,
        status=DispatchOffer.Status.SENDING,
        offered_at=now,
        expires_at=now + timedelta(seconds=60),
    )

    with patch("apps.notifications.onesignal.send_push_to_external_ids") as mock_send:
        res = send_dispatch_offer_push_task(str(offer.id))
        assert res["skipped"] is True
        assert "claimed" in res["reason"].lower()
        mock_send.assert_not_called()


# ============================================================================
# 3. OneSignal Outcomes Tests
# ============================================================================


def test_onesignal_200_without_id_is_marked_failed() -> None:
    booked = create_booked_group(key_prefix="os-noid")
    booking = booked.booking
    partner = booked.partner
    now = timezone.now()

    offer = DispatchOffer.objects.create(
        booking=booking,
        partner=partner,
        status=DispatchOffer.Status.PENDING,
        offered_at=now,
        expires_at=now + timedelta(seconds=60),
    )

    with patch("apps.notifications.onesignal.send_push_to_external_ids") as mock_send:
        # OneSignal returns HTTP 200 but notification_id is None (e.g. no valid subscribed recipients)
        mock_send.return_value = {
            "success": False,
            "notification_id": None,
            "errors": ["All included players are not subscribed"],
            "http_status": 200,
        }

        res = send_dispatch_offer_push_task(str(offer.id))
        assert res["success"] is False
        assert "No valid recipients" in res["reason"]

        offer.refresh_from_db()
        assert offer.status == DispatchOffer.Status.FAILED
        assert offer.failure_reason == "no_valid_recipients"
        assert offer.onesignal_notification_id is None


def test_onesignal_429_schedules_retry() -> None:
    booked = create_booked_group(key_prefix="os-429")
    booking = booked.booking
    partner = booked.partner
    now = timezone.now()

    offer = DispatchOffer.objects.create(
        booking=booking,
        partner=partner,
        status=DispatchOffer.Status.PENDING,
        offered_at=now,
        expires_at=now + timedelta(seconds=60),
    )

    with patch("apps.notifications.onesignal.send_push_to_external_ids") as mock_send:
        mock_send.return_value = {
            "success": False,
            "notification_id": None,
            "errors": ["Rate limit exceeded"],
            "http_status": 429,
        }

        res = send_dispatch_offer_push_task(str(offer.id))
        assert res["retry_scheduled"] is True
        assert res["countdown"] >= 5

        offer.refresh_from_db()
        assert offer.status == DispatchOffer.Status.PENDING
        assert offer.retry_count == 1
        assert offer.failure_reason == "rate_limited_429"


def test_onesignal_5xx_server_error_schedules_retry() -> None:
    booked = create_booked_group(key_prefix="os-500")
    booking = booked.booking
    partner = booked.partner
    now = timezone.now()

    offer = DispatchOffer.objects.create(
        booking=booking,
        partner=partner,
        status=DispatchOffer.Status.PENDING,
        offered_at=now,
        expires_at=now + timedelta(seconds=60),
    )

    with patch("apps.notifications.onesignal.send_push_to_external_ids") as mock_send:
        mock_send.return_value = {
            "success": False,
            "notification_id": None,
            "errors": ["Internal server error"],
            "http_status": 502,
        }

        res = send_dispatch_offer_push_task(str(offer.id))
        assert res["retry_scheduled"] is True

        offer.refresh_from_db()
        assert offer.status == DispatchOffer.Status.PENDING
        assert offer.retry_count == 1


def test_onesignal_network_timeout_schedules_retry() -> None:
    booked = create_booked_group(key_prefix="os-net")
    booking = booked.booking
    partner = booked.partner
    now = timezone.now()

    offer = DispatchOffer.objects.create(
        booking=booking,
        partner=partner,
        status=DispatchOffer.Status.PENDING,
        offered_at=now,
        expires_at=now + timedelta(seconds=60),
    )

    with patch("apps.notifications.onesignal.send_push_to_external_ids") as mock_send:
        mock_send.side_effect = TimeoutError("Connection to OneSignal timed out")

        res = send_dispatch_offer_push_task(str(offer.id))
        assert res["retry_scheduled"] is True

        offer.refresh_from_db()
        assert offer.status == DispatchOffer.Status.PENDING
        assert offer.retry_count == 1
        assert "network_exception" in offer.failure_reason


def test_onesignal_client_error_fails_without_retry() -> None:
    booked = create_booked_group(key_prefix="os-400")
    booking = booked.booking
    partner = booked.partner
    now = timezone.now()

    offer = DispatchOffer.objects.create(
        booking=booking,
        partner=partner,
        status=DispatchOffer.Status.PENDING,
        offered_at=now,
        expires_at=now + timedelta(seconds=60),
    )

    with patch("apps.notifications.onesignal.send_push_to_external_ids") as mock_send:
        mock_send.return_value = {
            "success": False,
            "notification_id": None,
            "errors": ["Invalid app_id format"],
            "http_status": 400,
        }

        res = send_dispatch_offer_push_task(str(offer.id))
        assert res["success"] is False
        assert "retry_scheduled" not in res

        offer.refresh_from_db()
        assert offer.status == DispatchOffer.Status.FAILED
        assert offer.failure_reason == "client_error_400"


def test_onesignal_unsubscribed_deactivates_partner_subscription() -> None:
    booked = create_booked_group(key_prefix="os-unsub")
    booking = booked.booking
    partner = booked.partner
    now = timezone.now()

    sub = PartnerPushSubscription.objects.create(
        partner=partner,
        user=partner.user,
        onesignal_subscription_id=str(uuid.uuid4()),
        onesignal_external_id=str(partner.id),
        platform=PartnerPushSubscription.Platform.WEB,
        is_active=True,
    )

    offer = DispatchOffer.objects.create(
        booking=booking,
        partner=partner,
        status=DispatchOffer.Status.PENDING,
        offered_at=now,
        expires_at=now + timedelta(seconds=60),
    )

    with patch("apps.notifications.onesignal.send_push_to_external_ids") as mock_send:
        mock_send.return_value = {
            "success": False,
            "notification_id": None,
            "errors": ["Recipient is unsubscribed"],
            "http_status": 200,
        }

        res = send_dispatch_offer_push_task(str(offer.id))
        assert res["success"] is False

        sub.refresh_from_db()
        assert sub.is_active is False


def test_reconcile_stuck_sending_offers() -> None:
    booked = create_booked_group(key_prefix="rec-stuck")
    booking = booked.booking
    partner = booked.partner
    now = timezone.now()

    # Offer 1: Stuck in SENDING > 5 mins with notification_id -> marked SENT
    offer1 = DispatchOffer.objects.create(
        booking=booking,
        partner=partner,
        status=DispatchOffer.Status.SENDING,
        offered_at=now - timedelta(minutes=10),
        expires_at=now + timedelta(minutes=10),
        onesignal_notification_id="stuck-sent-id-1",
    )
    DispatchOffer.objects.filter(id=offer1.id).update(updated_at=now - timedelta(minutes=6))

    # Offer 2: Stuck in SENDING > 5 mins without ID, retry_count < 5, expires_at in future -> returned PENDING
    offer2 = DispatchOffer.objects.create(
        booking=booking,
        partner=partner,
        status=DispatchOffer.Status.SENDING,
        offered_at=now - timedelta(minutes=8),
        expires_at=now + timedelta(minutes=10),
        retry_count=1,
    )
    DispatchOffer.objects.filter(id=offer2.id).update(updated_at=now - timedelta(minutes=6))

    # Offer 3: Stuck in SENDING > 5 mins with max retries -> marked FAILED
    offer3 = DispatchOffer.objects.create(
        booking=booking,
        partner=partner,
        status=DispatchOffer.Status.SENDING,
        offered_at=now - timedelta(minutes=8),
        expires_at=now + timedelta(minutes=10),
        retry_count=5,
    )
    DispatchOffer.objects.filter(id=offer3.id).update(updated_at=now - timedelta(minutes=6))

    with patch("apps.assignments.tasks.send_dispatch_offer_push_task.delay") as mock_delay:
        summary = reconcile_stuck_dispatch_offers_task()
        assert summary["reconciled_sent"] == 1
        assert summary["reconciled_pending"] == 1
        assert summary["reconciled_failed"] == 1

        offer1.refresh_from_db()
        assert offer1.status == DispatchOffer.Status.SENT
        assert offer1.sent_at is not None

        offer2.refresh_from_db()
        assert offer2.status == DispatchOffer.Status.PENDING
        mock_delay.assert_called_once_with(str(offer2.id))

        offer3.refresh_from_db()
        assert offer3.status == DispatchOffer.Status.FAILED
        assert offer3.failure_reason == "stuck_in_sending_timed_out"

"""The partner application rules for the ``RIDE_CAPTAIN`` track.

A captain tells us who they are, accepts the agreements and uploads an identity document plus a
driving licence, the vehicle RC and insurance. They are never asked for trades, service areas or
working hours. Every other track is unchanged.
"""

import pytest

from apps.partners.exceptions import PartnerApplicationIncompleteError
from apps.partners.models import PartnerApplication, PartnerDocument
from apps.partners.selectors import required_document_kinds
from apps.partners.serializers.onboarding import PartnerApplicationSerializer
from apps.partners.services import (
    _latest_required_documents_are_approved,
    submit_partner_application,
)
from apps.rides.models import CaptainVehicle
from tests.rides.helpers import (
    CAPTAIN_KINDS,
    IDENTITY_KINDS,
    make_user,
    start_application,
    upload_documents,
)

pytestmark = pytest.mark.django_db

CAPTAIN = PartnerApplication.Track.RIDE_CAPTAIN


class TestRequiredDocuments:
    def test_a_captain_needs_the_identity_documents_plus_licence_rc_and_insurance(self) -> None:
        assert required_document_kinds(CAPTAIN) == (*IDENTITY_KINDS, *CAPTAIN_KINDS)
        assert set(CAPTAIN_KINDS) == {"DRIVING_LICENCE", "VEHICLE_RC", "VEHICLE_INSURANCE"}

    @pytest.mark.parametrize(
        "track",
        [
            PartnerApplication.Track.SERVICES,
            PartnerApplication.Track.STAY_HOST,
            PartnerApplication.Track.RENTAL_OWNER,
            PartnerApplication.Track.EMPLOYER,
        ],
    )
    def test_every_other_track_is_unchanged(self, track: str) -> None:
        assert required_document_kinds(track) == IDENTITY_KINDS

    def test_the_application_tells_the_app_which_documents_to_ask_for(self) -> None:
        application = start_application(make_user())

        listed = PartnerApplicationSerializer(application).data["required_document_kinds"]

        assert listed == [*IDENTITY_KINDS, *CAPTAIN_KINDS]


def add_vehicle(application: PartnerApplication) -> None:
    CaptainVehicle.objects.create(
        partner=application.partner,
        vehicle_type="BIKE",
        registration_number=f"TS09ZZ{str(application.pk)[:4]}",
        make_model="Honda Shine",
        colour="Black",
    )


class TestSubmitting:
    def test_a_captain_submits_without_trades_areas_or_hours(self) -> None:
        user = make_user()
        application = start_application(user)
        upload_documents(application, (*IDENTITY_KINDS, *CAPTAIN_KINDS))
        add_vehicle(application)

        submitted = submit_partner_application(user=user, expected_version=application.version)

        assert submitted.status == PartnerApplication.Status.SUBMITTED
        assert submitted.track == CAPTAIN

    def test_a_captain_cannot_submit_without_a_vehicle(self) -> None:
        """The vehicle locks once sent, so an application without one could never get one."""
        user = make_user()
        application = start_application(user)
        upload_documents(application, (*IDENTITY_KINDS, *CAPTAIN_KINDS))

        with pytest.raises(PartnerApplicationIncompleteError, match="vehicle"):
            submit_partner_application(user=user, expected_version=application.version)

    def test_identity_documents_alone_are_not_enough(self) -> None:
        user = make_user()
        application = start_application(user)
        upload_documents(application, IDENTITY_KINDS)

        with pytest.raises(PartnerApplicationIncompleteError):
            submit_partner_application(user=user, expected_version=application.version)

    @pytest.mark.parametrize("missing", CAPTAIN_KINDS)
    def test_each_captain_document_is_required(self, missing: str) -> None:
        user = make_user()
        application = start_application(user)
        upload_documents(
            application,
            (*IDENTITY_KINDS, *(kind for kind in CAPTAIN_KINDS if kind != missing)),
        )

        with pytest.raises(PartnerApplicationIncompleteError):
            submit_partner_application(user=user, expected_version=application.version)

    def test_a_service_partner_is_not_asked_for_captain_documents_but_still_needs_trades(
        self,
    ) -> None:
        user = make_user()
        application = start_application(user, track=PartnerApplication.Track.SERVICES)
        upload_documents(application, IDENTITY_KINDS)

        with pytest.raises(PartnerApplicationIncompleteError) as raised:
            submit_partner_application(user=user, expected_version=application.version)

        assert "captain" not in str(raised.value).lower()


class TestApproval:
    def _approved(self, application: PartnerApplication, kinds: tuple[str, ...]) -> None:
        upload_documents(application, kinds, status=PartnerDocument.Status.APPROVED)

    def test_a_captain_is_cleared_only_when_every_document_is_approved(self) -> None:
        application = start_application(make_user())
        self._approved(application, (*IDENTITY_KINDS, *CAPTAIN_KINDS))

        assert _latest_required_documents_are_approved(application) is True

    def test_an_approved_identity_document_alone_does_not_clear_a_captain(self) -> None:
        application = start_application(make_user())
        self._approved(application, IDENTITY_KINDS)

        assert _latest_required_documents_are_approved(application) is False

    def test_a_pending_captain_document_does_not_clear_a_captain(self) -> None:
        application = start_application(make_user())
        self._approved(application, (*IDENTITY_KINDS, *CAPTAIN_KINDS[:2]))
        upload_documents(application, CAPTAIN_KINDS[2:], status=PartnerDocument.Status.PENDING)

        assert _latest_required_documents_are_approved(application) is False

    def test_a_service_partner_is_cleared_by_the_identity_document_alone(self) -> None:
        application = start_application(make_user(), track=PartnerApplication.Track.SERVICES)
        self._approved(application, IDENTITY_KINDS)

        assert _latest_required_documents_are_approved(application) is True

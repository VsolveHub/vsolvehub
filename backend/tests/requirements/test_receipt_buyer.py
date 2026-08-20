from types import SimpleNamespace

import pytest

from apps.identity.models import CustomerProfile, User
from apps.requirements.views.receipts import _buyer

pytestmark = pytest.mark.django_db


def test_receipt_buyer_uses_customer_name_before_phone_number() -> None:
    customer = User.objects.create_user(
        phone_number="+919876543210",
        full_name="Gopal Rao",
    )
    CustomerProfile.objects.create(user=customer, display_name="Gopal")

    assert _buyer(SimpleNamespace(customer=customer)) == "Gopal Rao"


def test_receipt_buyer_falls_back_to_profile_display_name() -> None:
    customer = User.objects.create_user(phone_number="+919876543210")
    CustomerProfile.objects.create(user=customer, display_name="Gopal")

    assert _buyer(SimpleNamespace(customer=customer)) == "Gopal"

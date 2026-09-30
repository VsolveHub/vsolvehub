"""Backfill per-booking handover PINs for in-flight rentals.

Migration 0006 added ``RentalBooking.handover_pin_hash`` with a blank default.
Existing CONFIRMED / PENDING_PAYMENT rows therefore have an empty value, and
``verify_handover_pin`` rejects empty expected PINs — so partners cannot complete
handover for those bookings.

New bookings already receive a 4-digit PIN at create time (stored in the
``handover_pin_hash`` column; the name is historical — the value is plaintext,
matching create_booking). This migration assigns the same form of PIN to
in-flight rows that still lack one.

Terminal / post-handover statuses are skipped: they no longer need a PIN for
partner handover. Plaintext PINs from before 0006 cannot be recovered; customers
see the new value via the booking serializer once CONFIRMED.
"""

from __future__ import annotations

import secrets

from django.db import migrations

# Statuses that still need a handover PIN (create always sets one; handover
# requires CONFIRMED). Match apps.rental.services.create_booking / handover_booking.
_IN_FLIGHT_STATUSES = ("PENDING_PAYMENT", "CONFIRMED")


def backfill_handover_pin_hashes(apps, schema_editor):
    RentalBooking = apps.get_model("rental", "RentalBooking")
    qs = RentalBooking.objects.filter(
        status__in=_IN_FLIGHT_STATUSES,
        handover_pin_hash="",
    ).only("id", "handover_pin_hash")
    for booking in qs.iterator(chunk_size=200):
        pin = f"{secrets.randbelow(10000):04d}"
        # Do not log plaintext PINs.
        RentalBooking.objects.filter(pk=booking.pk, handover_pin_hash="").update(
            handover_pin_hash=pin,
        )


class Migration(migrations.Migration):

    dependencies = [
        ("rental", "0006_rentalbooking_handover_pin_hash"),
    ]

    operations = [
        migrations.RunPython(backfill_handover_pin_hashes, migrations.RunPython.noop),
    ]

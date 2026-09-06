from django.db import migrations, models


def link_existing_calendar_holds(apps, schema_editor):
    stay_reservation = apps.get_model("stays", "StayReservation")
    unit_reservation = apps.get_model("stays", "UnitReservation")
    for reservation in stay_reservation.objects.filter(calendar_hold__isnull=True).iterator():
        candidates = []
        for hold in unit_reservation.objects.filter(unit_id=reservation.unit_id).iterator():
            occupied = hold.occupied_range
            if (
                occupied
                and occupied.lower.date() == reservation.start_date
                and occupied.upper.date() == reservation.end_date
            ):
                candidates.append(hold)
        if not candidates:
            continue
        candidates.sort(
            key=lambda hold: abs((hold.created_at - reservation.created_at).total_seconds())
        )
        reservation.calendar_hold_id = candidates[0].id
        reservation.save(update_fields=("calendar_hold",))


class Migration(migrations.Migration):
    dependencies = [("stays", "0002_alter_stayreservation_duration_mode_and_more")]

    operations = [
        migrations.AddField(
            model_name="stayreservation",
            name="calendar_hold",
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=models.PROTECT,
                related_name="stay_reservation",
                to="stays.unitreservation",
            ),
        ),
        migrations.RunPython(link_existing_calendar_holds, migrations.RunPython.noop),
    ]

from django.db import migrations

# Intentionally empty (brief Revision 2, R1). This migration used to add a "rides" catalogue
# category, which every customer would have seen as a tile on the first deploy, even where Rides
# does not run. The Rides home entry now comes only from GET rides/availability/. The file stays
# because 0004 depends on it.


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0024_promo_banner"),
        ("rides", "0002_ride_rate_card"),
    ]

    operations: list[migrations.operations.base.Operation] = []

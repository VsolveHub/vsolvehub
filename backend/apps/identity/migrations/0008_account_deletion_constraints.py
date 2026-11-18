from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('identity', '0007_account_deletion_schedule'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='privacyrequest',
            constraint=models.UniqueConstraint(condition=models.Q(('kind', 'ERASURE'), ('status__in', ('RECEIVED', 'IN_REVIEW'))), fields=('user',), name='identity_one_open_erasure_per_user'),
        ),
        migrations.AddConstraint(
            model_name='privacyrequest',
            constraint=models.CheckConstraint(condition=models.Q(models.Q(('kind', 'ERASURE'), ('status', 'RECEIVED'), _negated=True), ('scheduled_for__isnull', False), _connector='OR'), name='identity_received_erasure_has_schedule'),
        ),
    ]

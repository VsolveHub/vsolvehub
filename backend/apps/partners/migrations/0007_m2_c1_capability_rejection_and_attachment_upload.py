"""M2 Wave C1: a capability rejection is its own state, and documents can expire.

Answers both open design questions in `contracts/proposals/0013-m2-partner-capability-crew-and-gates.md`.
"""

from django.conf import settings
from django.db import migrations, models


def requeue_corrections_without_a_note(apps, _schema_editor):
    """Put any `CHANGES_REQUIRED` capability with no note back in the review queue.

    `partners_capability_review_state_needs_notes` is added below, and a row that predates it would
    make this migration fail on real data. The fix is not to invent a note — a fabricated
    "correction needed" is exactly the copy the constraint exists to prevent — but to move the record
    back to `UNDER_REVIEW`, where a reviewer will state one. No Partner loses anything: the status
    they see changes from an unexplained correction request to "we are looking at it", which is the
    truth of a record nobody left a reason on.
    """
    PartnerCapability = apps.get_model("partners", "PartnerCapability")
    PartnerCapability.objects.filter(status="CHANGES_REQUIRED", review_notes="").update(
        status="UNDER_REVIEW",
    )


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0006_m2variantconfiguration'),
        ('partners', '0006_crewmember_partneridentitycluster_partnercapability_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='partnerdocument',
            name='expires_on',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='partnercapability',
            name='status',
            field=models.CharField(choices=[('REQUESTED', 'Requested'), ('UNDER_REVIEW', 'Under review'), ('CHANGES_REQUIRED', 'Changes required'), ('APPROVED', 'Approved'), ('SUSPENDED', 'Suspended'), ('REJECTED', 'Rejected'), ('WITHDRAWN', 'Withdrawn')], default='REQUESTED', max_length=24),
        ),
        migrations.AddIndex(
            model_name='partnerdocument',
            index=models.Index(fields=['kind', 'expires_on'], name='partners_pa_kind_7c2274_idx'),
        ),
        migrations.RunPython(
            requeue_corrections_without_a_note,
            migrations.RunPython.noop,
            elidable=True,
        ),
        migrations.AddConstraint(
            model_name='partnercapability',
            constraint=models.CheckConstraint(condition=models.Q(models.Q(('status__in', ('CHANGES_REQUIRED', 'REJECTED')), _negated=True), models.Q(('review_notes', ''), _negated=True), _connector='OR'), name='partners_capability_review_state_needs_notes'),
        ),
    ]

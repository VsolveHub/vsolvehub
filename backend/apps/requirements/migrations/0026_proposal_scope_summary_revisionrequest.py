# Hand-written. `makemigrations` on this branch also emits deletions for the price-book models that
# are checkpointed out of the model registry, and those are not this change's to make.

import uuid

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("requirements", "0025_proposal_margin_bps_proposal_misc_bps_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="proposal",
            name="scope_summary",
            field=models.TextField(blank=True),
        ),
        migrations.CreateModel(
            name="RevisionRequest",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4, editable=False, primary_key=True, serialize=False
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("OPEN", "Waiting for the vendor"),
                            ("ANSWERED", "Answered with a revised estimate"),
                            ("DECLINED", "Declined by the vendor"),
                        ],
                        default="OPEN",
                        max_length=12,
                    ),
                ),
                (
                    "reason_code",
                    models.CharField(
                        choices=[
                            ("LEAVE_OUT", "Leave something out"),
                            ("CHANGE_MATERIALS", "Change materials or finish"),
                            ("PHASE_WORK", "Split the work into phases"),
                            ("OTHER", "Something else"),
                        ],
                        max_length=20,
                    ),
                ),
                ("excluded_items", models.JSONField(blank=True, default=list)),
                ("note", models.TextField(blank=True)),
                ("decline_note", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("resolved_at", models.DateTimeField(blank=True, null=True)),
                (
                    "answered_by_proposal",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="answers_revision_requests",
                        to="requirements.proposal",
                    ),
                ),
                (
                    "proposal",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="revision_requests",
                        to="requirements.proposal",
                    ),
                ),
                (
                    "requested_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="revision_requests_made",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "requirement",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="revision_requests",
                        to="requirements.customerrequirement",
                    ),
                ),
            ],
            options={
                "ordering": ("-created_at", "id"),
                "indexes": [
                    models.Index(
                        fields=["requirement", "status"], name="requirement_require_883868_idx"
                    )
                ],
                "constraints": [
                    models.UniqueConstraint(
                        condition=models.Q(("status", "OPEN")),
                        fields=("proposal",),
                        name="requirements_one_open_revision_request_per_proposal",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("resolved_at__isnull", True), ("status", "OPEN"))
                        | (
                            models.Q(("status", "OPEN"), _negated=True)
                            & models.Q(("resolved_at__isnull", False))
                        ),
                        name="requirements_revision_request_resolved_when_closed",
                    ),
                ],
            },
        ),
    ]

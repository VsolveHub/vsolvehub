import django.db.models.deletion
import uuid

from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("cases", "0004_remove_operationscase_cases_exactly_one_subject_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="OperationsSettlementApproval",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4, editable=False, primary_key=True, serialize=False
                    ),
                ),
                ("proposal", models.JSONField()),
                (
                    "status",
                    models.CharField(
                        choices=[("PENDING", "Pending second approver"), ("APPROVED", "Approved")],
                        default="PENDING",
                        max_length=16,
                    ),
                ),
                ("proposed_at", models.DateTimeField(auto_now_add=True)),
                ("approved_at", models.DateTimeField(blank=True, null=True)),
                (
                    "approved_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="settlements_approved",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "case",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="settlement_approval",
                        to="cases.operationscase",
                    ),
                ),
                (
                    "proposed_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="settlements_proposed",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
        migrations.AddConstraint(
            model_name="operationssettlementapproval",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    models.Q(
                        ("approved_at__isnull", True),
                        ("approved_by__isnull", True),
                        ("status", "PENDING"),
                    ),
                    models.Q(
                        ("approved_at__isnull", False),
                        ("approved_by__isnull", False),
                        ("status", "APPROVED"),
                    ),
                    _connector="OR",
                ),
                name="cases_settlement_approval_state_complete",
            ),
        ),
    ]

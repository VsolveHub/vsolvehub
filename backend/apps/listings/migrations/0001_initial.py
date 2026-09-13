import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("cases", "0002_m2_recovery_and_operations"),
        ("catalog", "0020_a10variantconfiguration"),
        ("commerce", "0012_a10_payment_purposes"),
        ("partners", "0017_a10_listing_archetype"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Listing",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("title", models.CharField(max_length=180)),
                ("description", models.TextField()),
                ("structured_fields", models.JSONField(blank=True, default=dict)),
                ("status", models.CharField(choices=[("DRAFT", "Draft"), ("PUBLISHED", "Published"), ("CLOSED", "Closed"), ("EXPIRED", "Expired"), ("REMOVED", "Removed"), ("ARCHIVED", "Archived")], default="DRAFT", max_length=16)),
                ("moderation_status", models.CharField(choices=[("DRAFT", "Draft"), ("PENDING", "Pending review"), ("APPROVED", "Approved"), ("REJECTED", "Rejected"), ("REMOVED", "Removed")], default="DRAFT", max_length=16)),
                ("moderation_reason", models.CharField(blank=True, max_length=480)),
                ("location_text", models.CharField(blank=True, max_length=180)),
                ("contact_phone", models.CharField(blank=True, max_length=32)),
                ("contact_email", models.EmailField(blank=True, max_length=254)),
                ("published_at", models.DateTimeField(blank=True, null=True)),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                ("closed_at", models.DateTimeField(blank=True, null=True)),
                ("removed_at", models.DateTimeField(blank=True, null=True)),
                ("version", models.PositiveIntegerField(default=1)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("poster", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="listings", to="partners.partnerprofile")),
                ("variant", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="listings", to="catalog.servicevariant")),
            ],
            options={"ordering": ("-published_at", "-created_at")},
        ),
        migrations.CreateModel(
            name="VendorSubscriptionPlan",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("code", models.SlugField(max_length=80, unique=True)),
                ("name", models.CharField(max_length=120)),
                ("price_paise", models.PositiveBigIntegerField()),
                ("duration_days", models.PositiveSmallIntegerField(default=30)),
                ("max_active_listings", models.PositiveSmallIntegerField(default=3)),
                ("premium_capabilities", models.JSONField(blank=True, default=list)),
                ("is_active", models.BooleanField(default=True)),
            ],
        ),
        migrations.CreateModel(
            name="Application",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("status", models.CharField(choices=[("SUBMITTED", "Submitted"), ("UNDER_REVIEW", "Under review"), ("SHORTLISTED", "Shortlisted"), ("CONTACTED", "Contacted"), ("REJECTED", "Rejected"), ("WITHDRAWN", "Withdrawn"), ("EXPIRED", "Expired")], default="SUBMITTED", max_length=16)),
                ("applicant_snapshot", models.JSONField(default=dict)),
                ("cover_note", models.TextField(blank=True)),
                ("resume_url", models.URLField(blank=True, max_length=500)),
                ("contact_revealed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("applicant", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="listing_applications", to=settings.AUTH_USER_MODEL)),
                ("contact_revealed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="+", to=settings.AUTH_USER_MODEL)),
                ("listing", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="applications", to="listings.listing")),
            ],
            options={"ordering": ("-created_at",)},
        ),
        migrations.CreateModel(
            name="ListingMedia",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("kind", models.CharField(choices=[("IMAGE", "Image"), ("ATTACHMENT", "Attachment")], default="IMAGE", max_length=16)),
                ("url", models.URLField(max_length=500)),
                ("alt_text", models.CharField(blank=True, max_length=200)),
                ("display_order", models.PositiveSmallIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("listing", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="media", to="listings.listing")),
            ],
            options={"ordering": ("display_order", "id")},
        ),
        migrations.CreateModel(
            name="ListingModerationEvent",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("action", models.CharField(choices=[("SUBMITTED", "Submitted"), ("APPROVED", "Approved"), ("REJECTED", "Rejected"), ("PUBLISHED", "Published"), ("CLOSED", "Closed"), ("REMOVED", "Removed"), ("REINSTATED", "Reinstated"), ("EDITED", "Edited")], max_length=20)),
                ("reason", models.CharField(blank=True, max_length=480)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("actor", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to=settings.AUTH_USER_MODEL)),
                ("listing", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="moderation_events", to="listings.listing")),
            ],
            options={"ordering": ("-created_at",)},
        ),
        migrations.CreateModel(
            name="VendorSubscription",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("status", models.CharField(choices=[("PENDING_ACTIVATION", "Pending activation"), ("ACTIVE", "Active"), ("EXPIRED", "Expired"), ("CANCELLED", "Cancelled")], default="PENDING_ACTIVATION", max_length=24)),
                ("starts_at", models.DateTimeField(blank=True, null=True)),
                ("ends_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("payment_attempt", models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="listing_subscription", to="commerce.paymentattempt")),
                ("plan", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="subscriptions", to="listings.vendorsubscriptionplan")),
                ("poster", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="listing_subscriptions", to="partners.partnerprofile")),
            ],
        ),
        migrations.CreateModel(
            name="ListingReport",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("reason", models.CharField(max_length=80)),
                ("detail", models.TextField(blank=True)),
                ("status", models.CharField(choices=[("OPEN", "Open"), ("RESOLVED", "Resolved")], default="OPEN", max_length=16)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("listing", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="reports", to="listings.listing")),
                ("operations_case", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="listing_reports", to="cases.operationscase")),
                ("reporter", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="listing_reports", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name="ApplicationReport",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("reason", models.CharField(max_length=80)),
                ("detail", models.TextField(blank=True)),
                ("status", models.CharField(choices=[("OPEN", "Open"), ("RESOLVED", "Resolved")], default="OPEN", max_length=16)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("application", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="reports", to="listings.application")),
                ("operations_case", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="application_reports", to="cases.operationscase")),
                ("reporter", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="application_reports", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddIndex(model_name="listing", index=models.Index(fields=["poster", "status"], name="listings_poster_status_idx")),
        migrations.AddIndex(model_name="listing", index=models.Index(fields=["status", "moderation_status"], name="listings_public_status_idx")),
        migrations.AddIndex(model_name="application", index=models.Index(fields=["listing", "status"], name="listings_app_status_idx")),
        migrations.AddIndex(model_name="application", index=models.Index(fields=["applicant", "status"], name="listings_app_actor_idx")),
        migrations.AddConstraint(
            model_name="application",
            constraint=models.UniqueConstraint(condition=~models.Q(("status__in", ("WITHDRAWN", "EXPIRED"))), fields=("listing", "applicant"), name="listings_unique_active_application"),
        ),
    ]

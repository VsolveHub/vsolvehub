"""M2 Wave C1: the attachment upload intent, and `INFECTED` as its own scan outcome.

`INFECTED` is separate from `FAILED` deliberately. A checksum mismatch is an upload going wrong and
the recovery is to try again; malware is not, and the recovery is that the file is gone.
"""

import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('requirements', '0003_remove_vendorinvitation_requirements_one_live_slot_per_cluster_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='requirementattachment',
            name='processing_status',
            field=models.CharField(choices=[('PENDING', 'Pending'), ('VERIFIED', 'Verified'), ('INFECTED', 'Rejected by the malware scan'), ('FAILED', 'Failed')], default='PENDING', max_length=16),
        ),
        migrations.CreateModel(
            name='RequirementAttachmentUpload',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('kind', models.CharField(choices=[('IMAGE', 'Image'), ('VIDEO', 'Video'), ('AUDIO', 'Audio'), ('VOICE_NOTE', 'Voice note'), ('DOCUMENT', 'Document')], max_length=16)),
                ('object_key', models.CharField(max_length=400, unique=True)),
                ('content_type', models.CharField(max_length=120)),
                ('size_bytes', models.PositiveBigIntegerField()),
                ('sha256', models.CharField(max_length=64)),
                ('language', models.CharField(blank=True, max_length=16)),
                ('status', models.CharField(choices=[('ISSUED', 'Issued'), ('VERIFIED', 'Verified'), ('EXPIRED', 'Expired'), ('FAILED', 'Failed')], default='ISSUED', max_length=16)),
                ('expires_at', models.DateTimeField()),
                ('finalized_at', models.DateTimeField(blank=True, null=True)),
                ('failure_code', models.CharField(blank=True, max_length=64)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('requirement', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='attachment_uploads', to='requirements.customerrequirement')),
            ],
            options={
                'ordering': ('-created_at', 'id'),
                'indexes': [models.Index(fields=['requirement', 'status', 'expires_at'], name='requirement_require_d0120b_idx')],
                'constraints': [models.CheckConstraint(condition=models.Q(('size_bytes__gt', 0)), name='requirements_attachment_upload_size_positive')],
            },
        ),
    ]

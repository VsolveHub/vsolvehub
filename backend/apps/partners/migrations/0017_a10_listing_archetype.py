from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("partners", "0016_alter_partnercapability_archetype")]

    operations = [
        migrations.AlterField(
            model_name="partnercapability",
            name="archetype",
            field=models.CharField(
                choices=[
                    ("LEGACY", "Legacy"),
                    ("A1_TASK_VISIT", "A1 task visit"),
                    ("A3_TIME_BLOCK", "A3 time block"),
                    ("A5_CUSTOM_PROJECT", "A5 custom project"),
                    ("A7_RENTAL", "A7 rental"),
                    ("A9_STAY", "A9 stay"),
                    ("A10_LISTING", "A10 listing"),
                ],
                max_length=24,
            ),
        ),
    ]

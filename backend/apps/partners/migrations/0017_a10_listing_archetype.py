from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("partners", "0016_crew_roster_name_and_documents"),
    ]

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
                    ("A10_LISTING", "A10 listing"),
                ],
                max_length=24,
            ),
        ),
        migrations.AlterField(
            model_name="partnerbusinessprofile",
            name="business_type",
            field=models.CharField(
                choices=[
                    ("INDIVIDUAL", "Individual"),
                    ("WORKFORCE_AGENCY", "Workforce agency"),
                    ("PROJECT_VENDOR", "Project vendor"),
                    ("EMPLOYER", "Employer"),
                ],
                default="INDIVIDUAL",
                max_length=24,
            ),
        ),
    ]

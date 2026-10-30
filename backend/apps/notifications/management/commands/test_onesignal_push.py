"""Management command to test OneSignal push delivery to a partner external_id."""

from typing import Any
from django.core.management.base import BaseCommand
from apps.notifications.onesignal import send_push_to_external_ids


class Command(BaseCommand):
    help = "Send a test OneSignal push notification to an external_id"

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "--external-id",
            required=True,
            type=str,
            help="The external_id (partner user UUID or partner ID) registered with OneSignal",
        )
        parser.add_argument(
            "--heading",
            default="Test job alert",
            type=str,
            help="Notification title / heading",
        )
        parser.add_argument(
            "--body",
            default="This is a test Instant booking notification.",
            type=str,
            help="Notification body text",
        )
        parser.add_argument(
            "--url",
            default=None,
            type=str,
            help="Optional launch URL when the user clicks the notification",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        external_id = options["external_id"]
        heading = options["heading"]
        body = options["body"]
        url = options["url"]

        self.stdout.write(f"Sending test push to external_id '{external_id}'...")
        result = send_push_to_external_ids(
            external_ids=[external_id],
            heading=heading,
            body=body,
            data={"type": "DEV_TEST", "external_id": external_id},
            url=url,
        )

        if result["success"]:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Successfully sent OneSignal notification! ID: {result['notification_id']}"
                )
            )
        else:
            self.stdout.write(
                self.style.ERROR(
                    f"Failed to send OneSignal notification: {result.get('errors')}. Response: {result.get('raw_response')}"
                )
            )

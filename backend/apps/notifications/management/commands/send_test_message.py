"""Send one real WhatsApp or SMS to check the keys, without touching any notice.

    python manage.py send_test_message --channel whatsapp --to +919876543210
    python manage.py send_test_message --channel whatsapp --to +919876543210 \\
        --template customer_visit_work_submitted
    python manage.py send_test_message --channel sms --to +919876543210 \\
        --template customer_visit_arrived

WhatsApp with no `--template` sends Meta's own `hello_world` template (English, US), which every
WhatsApp Business account has: it proves the phone number id and token before any template of
ours is approved. With `--template`, one of ours is sent with each value set to "Test". SMS always
needs `--template`, and its MSG91 id in `MSG91_TEMPLATE_IDS`.

The recipient must be a number you own. Nothing is recorded in the notification tables.
"""

from argparse import ArgumentParser
from typing import Any

import requests
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.notifications.channel_plan import route_for
from apps.notifications.models import NotificationIntent
from apps.notifications.transport import MessageTransportError, get_message_transport

_SAMPLE = "Test"


class Command(BaseCommand):
    help = "Send one WhatsApp or SMS to a number you own, to check the provider keys."

    def add_arguments(self, parser: ArgumentParser) -> None:
        parser.add_argument("--channel", choices=("whatsapp", "sms"), required=True)
        parser.add_argument("--to", required=True, help="The recipient, e.g. +919876543210.")
        parser.add_argument("--template", default="", help="A template code from channel_plan.")

    def handle(self, *_args: Any, **options: Any) -> None:
        to = str(options["to"]).strip()
        template = str(options["template"]).strip()
        if options["channel"] == "whatsapp":
            self._whatsapp(to=to, template=template)
        else:
            self._sms(to=to, template=template)

    def _whatsapp(self, *, to: str, template: str) -> None:
        if not (settings.WHATSAPP_ACCESS_TOKEN and settings.WHATSAPP_PHONE_NUMBER_ID):
            raise CommandError("Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID first.")
        body: dict[str, Any]
        if template:
            route = route_for(template)
            if route is None or route.channel != NotificationIntent.Channel.WHATSAPP:
                raise CommandError(f"{template} is not a WhatsApp template in channel_plan.")
            body = {"name": template, "language": {"code": settings.WHATSAPP_TEMPLATE_LANGUAGE}}
            if route.variables:
                parameters = [{"type": "text", "text": _SAMPLE} for _ in route.variables]
                body["components"] = [{"type": "body", "parameters": parameters}]
        else:
            body = {"name": "hello_world", "language": {"code": "en_US"}}
        url = (
            f"{settings.WHATSAPP_GRAPH_API_BASE_URL.rstrip('/')}/"
            f"{settings.WHATSAPP_GRAPH_API_VERSION}/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages"
        )
        try:
            response = requests.post(
                url,
                json={
                    "messaging_product": "whatsapp",
                    "to": to.removeprefix("+"),
                    "type": "template",
                    "template": body,
                },
                headers={"Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}"},
                timeout=(
                    settings.WHATSAPP_CONNECT_TIMEOUT_SECONDS,
                    settings.WHATSAPP_READ_TIMEOUT_SECONDS,
                ),
            )
        except requests.RequestException as exc:
            raise CommandError(f"Meta could not be reached: {exc}") from exc
        # Meta's answer has no secret in it; it says which template, number or token is wrong.
        self.stdout.write(f"Meta answered {response.status_code}: {response.text[:500]}")
        if response.status_code >= 300:  # noqa: PLR2004 - any non-2xx is a failure here
            raise CommandError("WhatsApp test message was not accepted.")

    def _sms(self, *, to: str, template: str) -> None:
        route = route_for(template) if template else None
        if route is None or route.channel != NotificationIntent.Channel.SMS:
            raise CommandError("--template must be an SMS template code from channel_plan.")
        template_id = str(settings.MSG91_TEMPLATE_IDS.get(template, "") or "")
        if not template_id:
            raise CommandError(f"Put the MSG91 template id for {template} in MSG91_TEMPLATE_IDS.")
        try:
            result = get_message_transport().send(
                channel=NotificationIntent.Channel.SMS,
                destination=to,
                template_code=template_id,
                context=dict.fromkeys(route.variables, _SAMPLE),
            )
        except MessageTransportError as exc:
            raise CommandError(f"The SMS was not accepted: {exc}") from exc
        self.stdout.write(f"Accepted by {result.provider}: {result.provider_message_id}")

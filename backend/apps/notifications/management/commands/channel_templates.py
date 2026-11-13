"""Print every WhatsApp and SMS template in the form Meta and DLT/MSG91 ask for.

    python manage.py channel_templates                 # both channels
    python manage.py channel_templates --channel whatsapp
    python manage.py channel_templates --channel sms

The text comes from `notifications.channel_plan`, so what you submit is exactly what the code
sends. Submit each WhatsApp template in WhatsApp Manager with the name shown, category Utility,
in the language set in `WHATSAPP_TEMPLATE_LANGUAGE`. Register each SMS on DLT, create the MSG91
template from it, and put MSG91's id into `MSG91_TEMPLATE_IDS` under the code shown.
"""

import json
import re
from argparse import ArgumentParser
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand

from apps.notifications.channel_plan import PLAN, Route
from apps.notifications.models import NotificationIntent

_PLACEHOLDER = re.compile(r"\{([a-z0-9_]+)\}")


def whatsapp_body(route: Route) -> str:
    """The text with `{{1}}`, `{{2}}` … in place of each value, in order of appearance."""

    counter = iter(range(1, len(route.variables) + 1))
    return _PLACEHOLDER.sub(lambda _match: "{{" + str(next(counter)) + "}}", route.text)


def dlt_text(route: Route) -> str:
    return _PLACEHOLDER.sub("{#var#}", route.text)


def msg91_text(route: Route) -> str:
    return _PLACEHOLDER.sub(lambda match: f"##{match.group(1)}##", route.text)


class Command(BaseCommand):
    help = "Print the WhatsApp and SMS templates to submit to Meta and register on DLT."

    def add_arguments(self, parser: ArgumentParser) -> None:
        parser.add_argument("--channel", choices=("whatsapp", "sms"), default=None)

    def handle(self, *_args: Any, **options: Any) -> None:
        channel = options["channel"]
        if channel in (None, "whatsapp"):
            self._whatsapp()
        if channel in (None, "sms"):
            self._sms()

    def _whatsapp(self) -> None:
        routes = {
            code: route
            for code, route in PLAN.items()
            if route.channel == NotificationIntent.Channel.WHATSAPP
        }
        self.stdout.write(
            f"=== WhatsApp: {len(routes)} templates · category UTILITY · language "
            f"{settings.WHATSAPP_TEMPLATE_LANGUAGE}\n"
        )
        for code, route in routes.items():
            self.stdout.write(f"--- name: {code}")
            self.stdout.write(whatsapp_body(route))
            if route.variables:
                samples = ", ".join(
                    f"{{{{{index}}}}} = {name}" for index, name in enumerate(route.variables, 1)
                )
                self.stdout.write(f"[values: {samples}]")
            self.stdout.write("")

    def _sms(self) -> None:
        routes = {
            code: route
            for code, route in PLAN.items()
            if route.channel == NotificationIntent.Channel.SMS
        }
        self.stdout.write(f"=== SMS: {len(routes)} templates\n")
        for code, route in routes.items():
            self.stdout.write(f"--- code: {code}")
            self.stdout.write(f"DLT:   {dlt_text(route)}")
            self.stdout.write(f"MSG91: {msg91_text(route)}")
            self.stdout.write("")
        skeleton = dict.fromkeys(routes, "<msg91 template id>")
        self.stdout.write("MSG91_TEMPLATE_IDS=" + json.dumps(skeleton, separators=(",", ":")))

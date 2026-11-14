"""Submit the WhatsApp templates to Meta, and see where each one stands.

    python manage.py whatsapp_templates status            # approved / pending / rejected / missing
    python manage.py whatsapp_templates submit --dry-run  # what would be sent, nothing sent
    python manage.py whatsapp_templates submit            # every template not yet on Meta
    python manage.py whatsapp_templates submit --only customer_booking_confirmed,job_invite

Every template comes from `notifications.channel_plan`, so what Meta approves is exactly what the
code sends: the name is the template code, the body is the route's text with `{{1}}`, `{{2}}` …,
category Utility, language `WHATSAPP_TEMPLATE_LANGUAGE`. Meta requires an example value for every
variable; `SAMPLE_VALUES` holds one per variable name.

`submit` never touches a template that already exists on the account, whatever its status, so it
is safe to run again after fixing a rejected one (delete the rejected one in WhatsApp Manager
first). It needs `WHATSAPP_BUSINESS_ACCOUNT_ID` and a token with template management on that
account.
"""

from argparse import ArgumentParser
from typing import Any, Final

import requests
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.notifications.channel_plan import PLAN, Route
from apps.notifications.management.commands.channel_templates import whatsapp_body
from apps.notifications.models import NotificationIntent

#: An example per variable name, as Meta's reviewers will read it. Realistic values get templates
#: approved; "Sample" in every blank is a common reason for rejection.
SAMPLE_VALUES: Final[dict[str, str]] = {
    "amount": "₹1,200",
    "amount_asked": "2,000",
    "approved_amount": "1,500",
    "asset_title": "Canon EOS 200D camera",
    "booking_id": "VSH-10482",
    "business_name": "Sri Sai Interiors",
    "candidate_name": "Ravi Kumar",
    "check_in": "20 Nov 2026",
    "customer_name": "Anitha",
    "deducted_amount": "500",
    "deliverables": "the floor plan and 3D views",
    "deposit_amount": "3,000",
    "document": "Aadhaar card",
    "end_date": "22 Nov 2026",
    "extension_days": "3",
    "guest_name": "Suresh",
    "headcount": "4 workers",
    "host_name": "Lakshmi",
    "job_title": "AC technician",
    "mode": "in person",
    "partner_name": "Ravi",
    "pin": "4821",
    "place": "Kukatpally, Hyderabad",
    "property_title": "Green Valley PG",
    "quote_amount": "450",
    "reason": "The photo is blurred",
    "refund_amount": "2,500",
    "response_text": "Yes, a room is free from the 20th",
    "service": "AC service",
    "start_date": "18 Nov 2026",
    "total_amount": "1,800",
    "visit_count": "2 visits",
    "visit_date": "21 Nov 2026",
    "visit_time": "11:00 AM",
    "when": "Sat 15 Nov, 10:00 AM",
    "workers_expected": "5",
    "workers_present": "4",
}


def whatsapp_routes() -> dict[str, Route]:
    return {
        code: route
        for code, route in PLAN.items()
        if route.channel == NotificationIntent.Channel.WHATSAPP
    }


def template_request(code: str, route: Route) -> dict[str, Any]:
    """Meta's create-template body for one route."""

    body: dict[str, Any] = {"type": "BODY", "text": whatsapp_body(route)}
    if route.variables:
        body["example"] = {"body_text": [[SAMPLE_VALUES[name] for name in route.variables]]}
    return {
        "name": code,
        "language": settings.WHATSAPP_TEMPLATE_LANGUAGE,
        "category": "UTILITY",
        "components": [body],
    }


class Command(BaseCommand):
    help = "Submit the WhatsApp templates in channel_plan to Meta, or show their review status."

    def add_arguments(self, parser: ArgumentParser) -> None:
        parser.add_argument("action", choices=("status", "submit"))
        parser.add_argument("--dry-run", action="store_true", help="Print, send nothing.")
        parser.add_argument("--only", default="", help="Comma-separated template codes.")

    def handle(self, *_args: Any, **options: Any) -> None:
        routes = whatsapp_routes()
        if options["only"]:
            wanted = {code.strip() for code in str(options["only"]).split(",") if code.strip()}
            unknown = wanted - set(routes)
            if unknown:
                raise CommandError(f"Not WhatsApp templates in channel_plan: {sorted(unknown)}")
            routes = {code: route for code, route in routes.items() if code in wanted}
        if options["action"] == "submit" and options["dry_run"]:
            for code, route in routes.items():
                self.stdout.write(f"--- {code}\n{template_request(code, route)}\n")
            self.stdout.write(f"{len(routes)} templates; nothing was sent (--dry-run).")
            return
        existing = self._existing()
        if options["action"] == "status":
            self._status(routes, existing)
        else:
            self._submit(routes, existing)

    def _url(self) -> str:
        account = settings.WHATSAPP_BUSINESS_ACCOUNT_ID
        if not (account and settings.WHATSAPP_ACCESS_TOKEN):
            raise CommandError("Set WHATSAPP_BUSINESS_ACCOUNT_ID and WHATSAPP_ACCESS_TOKEN first.")
        return (
            f"{settings.WHATSAPP_GRAPH_API_BASE_URL.rstrip('/')}/"
            f"{settings.WHATSAPP_GRAPH_API_VERSION}/{account}/message_templates"
        )

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}"}

    def _existing(self) -> dict[str, dict[str, Any]]:
        """Every template on the account, by name, following Meta's pages."""

        found: dict[str, dict[str, Any]] = {}
        url: str | None = self._url()
        params: dict[str, Any] | None = {
            "fields": "name,status,category,language,rejected_reason",
            "limit": 200,
        }
        while url:
            try:
                response = requests.get(url, params=params, headers=self._headers(), timeout=20)
            except requests.RequestException as exc:
                raise CommandError(f"Meta could not be reached: {exc}") from exc
            body = response.json() if response.content else {}
            if response.status_code >= 300:  # noqa: PLR2004 - any non-2xx
                raise CommandError(f"Meta refused the template list: {body.get('error', body)}")
            for item in body.get("data", []):
                found[str(item.get("name"))] = item
            url = (body.get("paging") or {}).get("next")
            params = None  # the next-page URL carries them
        return found

    def _status(self, routes: dict[str, Route], existing: dict[str, dict[str, Any]]) -> None:
        counts: dict[str, int] = {}
        for code in routes:
            item = existing.get(code)
            state = str(item.get("status", "UNKNOWN")) if item else "MISSING"
            counts[state] = counts.get(state, 0) + 1
            reason = item.get("rejected_reason") if item else None
            note = f"  ({reason})" if reason and reason != "NONE" else ""
            self.stdout.write(f"{state:<10} {code}{note}")
        summary = ", ".join(f"{count} {state.lower()}" for state, count in sorted(counts.items()))
        self.stdout.write(f"\n{len(routes)} templates: {summary}")

    def _submit(self, routes: dict[str, Route], existing: dict[str, dict[str, Any]]) -> None:
        sent = skipped = failed = 0
        for code, route in routes.items():
            if code in existing:
                skipped += 1
                continue
            try:
                response = requests.post(
                    self._url(),
                    json=template_request(code, route),
                    headers=self._headers(),
                    timeout=20,
                )
            except requests.RequestException as exc:
                failed += 1
                self.stdout.write(f"FAILED   {code}: Meta could not be reached ({exc})")
                continue
            body = response.json() if response.content else {}
            if response.status_code < 300:  # noqa: PLR2004 - any 2xx
                sent += 1
                self.stdout.write(f"SENT     {code}: {body.get('status', 'PENDING')}")
            else:
                failed += 1
                error = body.get("error", {}) if isinstance(body, dict) else {}
                detail = error.get("error_user_msg") or error.get("message") or body
                self.stdout.write(f"FAILED   {code}: {detail}")
        self.stdout.write(
            f"\n{sent} submitted, {skipped} already on Meta, {failed} failed. "
            "Run `whatsapp_templates status` to follow the review."
        )

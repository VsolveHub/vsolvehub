"""Write Playwright storage-state files for the three Careers demo roles.

The Careers end-to-end spec drives the real Django API, so it needs a real
session per portal. Minting those sessions here — rather than walking the OTP
login three times per run — keeps the suite deterministic and keeps it clear of
the development OTP rate limit (five codes per phone per ten minutes), which
would otherwise make a re-run fail for a reason that has nothing to do with the
feature under test.

Usage:

    python manage.py make_a10_demo_sessions --out ../frontend/e2e/.auth

Files are written as Playwright `storageState` JSON, one per role. They contain
live session cookies: keep the directory git-ignored and never commit it.
"""

from __future__ import annotations

import json
from datetime import timedelta
from pathlib import Path
from typing import Any

from django.contrib.auth import get_user_model
from django.contrib.sessions.backends.db import SessionStore
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.identity.hashing import keyed_hash
from apps.identity.models import Role, UserSession

#: Local demo identities created by `seed_listing_catalog` (plus the seeded
#: Operations console user). These are the phones the walkthrough documents.
ROLES: tuple[tuple[str, str, str], ...] = (
    ("customer", "+919900000077", "customer"),
    ("partner", "+919900000088", "partner"),
    ("operations", "+918019013032", "operations"),
)

#: A fixed local CSRF secret. Django accepts the cookie value as the request
#: token, and the browser client echoes the cookie, so a constant is enough here
#: and keeps the generated files readable.
CSRF_TOKEN = "abcdefghijklmnopqrstuvwxyz123456"  # noqa: S105

COOKIE_DOMAIN = "localhost"


class Command(BaseCommand):
    help = "Write Playwright storage-state files for the Careers demo roles."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "--out",
            default="../frontend/e2e/.auth",
            help="Directory to write the storage-state files into.",
        )
        parser.add_argument(
            "--hours",
            type=int,
            default=8,
            help="How long the minted sessions stay valid.",
        )

    def handle(self, *_args: Any, **options: Any) -> None:
        out_dir = Path(options["out"]).resolve()
        out_dir.mkdir(parents=True, exist_ok=True)
        hours: int = options["hours"]
        user_model = get_user_model()

        for name, phone, role_code in ROLES:
            user = user_model.objects.filter(phone_number=phone).first()
            if user is None:
                raise CommandError(
                    f"No user with phone {phone} ({name}). "
                    "Run `manage.py seed_listing_catalog` first."
                )
            role = Role.objects.filter(code=role_code).first()

            store = SessionStore()
            store["_auth_user_id"] = str(user.pk)
            store["_auth_user_backend"] = "django.contrib.auth.backends.ModelBackend"
            store["_auth_user_hash"] = user.get_session_auth_hash()
            store.create()

            if store.session_key is None:
                raise RuntimeError("session_key must exist after create()")
            UserSession.objects.create(
                user=user,
                session_key_hash=keyed_hash(store.session_key),
                expires_at=timezone.now() + timedelta(hours=hours),
                active_role=role,
            )

            state = {
                "cookies": [
                    {
                        "name": "vsolve_session",
                        "value": store.session_key,
                        "domain": COOKIE_DOMAIN,
                        "path": "/",
                        "expires": -1,
                        "httpOnly": True,
                        "secure": False,
                        "sameSite": "Lax",
                    },
                    {
                        "name": "csrftoken",
                        "value": CSRF_TOKEN,
                        "domain": COOKIE_DOMAIN,
                        "path": "/",
                        "expires": -1,
                        "httpOnly": False,
                        "secure": False,
                        "sameSite": "Lax",
                    },
                ],
                "origins": [],
            }
            target = out_dir / f"a10-{name}.json"
            target.write_text(json.dumps(state, indent=2) + "\n")
            self.stdout.write(f"  {name:11} {phone:15} -> {target}")

        self.stdout.write(self.style.SUCCESS(f"Wrote {len(ROLES)} storage states to {out_dir}"))

"""Move files kept on this server's disk (and, optionally, in Supabase) into Cloudflare R2.

Run once, after the R2 settings are in place:

    python manage.py copy_files_to_r2 --dry-run
    python manage.py copy_files_to_r2 --api-base-url https://api.example.com
    python manage.py copy_files_to_r2 --include-supabase   # private documents, if Supabase held any

Safe to run again: files already in R2 are skipped and links already pointing at R2 are left.
"""

from typing import Any
from urllib.parse import urlparse

import requests
from django.conf import settings
from django.core.files.storage import FileSystemStorage, default_storage
from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.urls import reverse

from apps.foundation.storage import private_file_storage, r2_client
from apps.listings.models import Application, ListingMedia, ListingResumeUpload
from apps.rental.models import RentalAssetMedia, RentalPhotoUpload
from apps.stay.models import PropertyMedia, StayPhotoUpload, StayReview, StayReviewPhoto

#: Upload rows whose files are public photos, copied to the public bucket.
PUBLIC_UPLOADS: tuple[Any, ...] = (StayPhotoUpload, StayReviewPhoto, RentalPhotoUpload)
#: Saved links that may point at the local ``/media/`` folder.
LINK_FIELDS: tuple[tuple[Any, str], ...] = (
    (PropertyMedia, "url"),
    (RentalAssetMedia, "url"),
    (ListingMedia, "url"),
)
SUPABASE_PAGE_SIZE = 100


class Command(BaseCommand):
    help = "Copy stored files into Cloudflare R2 and repoint saved links at them."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--dry-run", action="store_true", help="Report only; change nothing.")
        parser.add_argument(
            "--api-base-url",
            default="",
            help="Public API address, used to rebuild résumé links (e.g. https://api.example.com).",
        )
        parser.add_argument(
            "--include-supabase",
            action="store_true",
            help="Also copy private documents from Supabase Storage into the R2 private bucket.",
        )

    def handle(self, *_args: Any, **options: Any) -> None:
        if not (settings.R2_PUBLIC_ENABLED and settings.R2_PRIVATE_ENABLED):
            raise CommandError("Set every R2_* setting first; nothing to copy into.")
        self.dry_run = bool(options["dry_run"])
        self.local = FileSystemStorage(location=settings.MEDIA_ROOT)
        self._copy_public_photos()
        self._repoint_links()
        self._copy_resumes(api_base_url=str(options["api_base_url"]).rstrip("/"))
        if options["include_supabase"]:
            self._copy_supabase_documents()
        self.stdout.write(
            self.style.SUCCESS("Done." if not self.dry_run else "Dry run: no changes.")
        )

    # --- public photos ---------------------------------------------------------------------------

    def _copy(self, name: str, target: Any) -> str:
        """Copy one local file into ``target`` under the same name. Returns what happened."""
        if not self.local.exists(name):
            return "missing"
        if target.exists(name):
            return "already"
        if not self.dry_run:
            with self.local.open(name, "rb") as source:
                saved = target.save(name, source)
            if saved != name:
                raise CommandError(f"R2 stored {name} as {saved}; stopping before links drift.")
        return "copied"

    def _copy_public_photos(self) -> None:
        for model in PUBLIC_UPLOADS:
            counts: dict[str, int] = {}
            for row in model.objects.all().iterator():
                outcome = self._copy(row.stored_file.name, default_storage)
                counts[outcome] = counts.get(outcome, 0) + 1
            self.stdout.write(f"{model.__name__}: {counts or 'nothing stored'}")

    def _r2_link(self, url: str) -> str | None:
        """The R2 address for a link into the local media folder, or None if it is not one."""
        media = settings.MEDIA_URL
        path = urlparse(url).path
        if not path.startswith(media):
            return None
        return str(default_storage.url(path[len(media) :]))

    def _repoint_links(self) -> None:
        for model, field in LINK_FIELDS:
            changed = 0
            for row in model.objects.all().iterator():
                new = self._r2_link(getattr(row, field) or "")
                if new:
                    changed += 1
                    if not self.dry_run:
                        model.objects.filter(pk=row.pk).update(**{field: new})
            self.stdout.write(f"{model.__name__}.{field}: {changed} link(s) repointed")
        changed = 0
        for review in StayReview.objects.exclude(image_urls=[]).iterator():
            urls = [self._r2_link(url) or url for url in review.image_urls or []]
            if urls != review.image_urls:
                changed += 1
                if not self.dry_run:
                    StayReview.objects.filter(pk=review.pk).update(image_urls=urls)
        self.stdout.write(f"StayReview.image_urls: {changed} review(s) repointed")

    # --- résumés (private) -----------------------------------------------------------------------

    def _copy_resumes(self, *, api_base_url: str) -> None:
        from apps.listings.views import resume_link_token  # noqa: PLC0415 — avoids an import cycle

        private = private_file_storage()
        counts: dict[str, int] = {}
        relinked = 0
        for row in ListingResumeUpload.objects.all().iterator():
            outcome = self._copy(row.stored_file.name, private)
            counts[outcome] = counts.get(outcome, 0) + 1
            if not api_base_url:
                continue
            old_link_end = settings.MEDIA_URL + row.stored_file.name
            new_link = api_base_url + reverse(
                "listing-resume-file", kwargs={"token": resume_link_token(row)}
            )
            applications = Application.objects.filter(
                applicant_id=row.applicant_id, resume_url__endswith=old_link_end
            )
            relinked += applications.count()
            if not self.dry_run:
                applications.update(resume_url=new_link)
        self.stdout.write(f"ListingResumeUpload: {counts or 'nothing stored'}")
        if api_base_url:
            self.stdout.write(f"Application.resume_url: {relinked} link(s) repointed")
        else:
            self.stdout.write("Application.resume_url: skipped (pass --api-base-url to relink)")

    # --- private documents from Supabase --------------------------------------------------------

    def _supabase(self, method: str, path: str, **kwargs: Any) -> requests.Response:
        key = settings.SUPABASE_SERVICE_ROLE_KEY
        response = requests.request(
            method,
            f"{settings.SUPABASE_STORAGE_URL.rstrip('/')}{path}",
            headers={"Authorization": f"Bearer {key}", "apikey": key},
            timeout=(settings.DOCUMENT_STORAGE_CONNECT_TIMEOUT_SECONDS, 120),
            **kwargs,
        )
        response.raise_for_status()
        return response

    def _supabase_keys(self, bucket: str, prefix: str = "") -> list[str]:
        keys: list[str] = []
        offset = 0
        while True:
            page = self._supabase(
                "POST",
                f"/object/list/{bucket}",
                json={"prefix": prefix, "limit": SUPABASE_PAGE_SIZE, "offset": offset},
            ).json()
            for item in page:
                name = f"{prefix}{item['name']}"
                # Folders come back without an id; walk into them.
                if item.get("id") is None:
                    keys.extend(self._supabase_keys(bucket, f"{name}/"))
                else:
                    keys.append(name)
            if len(page) < SUPABASE_PAGE_SIZE:
                return keys
            offset += SUPABASE_PAGE_SIZE

    def _copy_supabase_documents(self) -> None:
        if not (settings.SUPABASE_STORAGE_URL and settings.SUPABASE_SERVICE_ROLE_KEY):
            raise CommandError("SUPABASE_STORAGE_URL and SUPABASE_SERVICE_ROLE_KEY are needed.")
        client = r2_client()
        buckets = {
            settings.PARTNER_DOCUMENT_BUCKET,
            settings.CREW_DOCUMENT_BUCKET,
            settings.FULFILMENT_EVIDENCE_BUCKET,
            settings.REQUIREMENT_ATTACHMENT_BUCKET,
        }
        for bucket in sorted(b for b in buckets if b):
            copied = skipped = 0
            for key in self._supabase_keys(bucket):
                target = f"{bucket}/{key}"
                try:
                    client.head_object(Bucket=settings.R2_PRIVATE_BUCKET, Key=target)
                except client.exceptions.ClientError:
                    pass
                else:
                    skipped += 1
                    continue
                copied += 1
                if self.dry_run:
                    continue
                body = self._supabase("GET", f"/object/{bucket}/{key}")
                client.put_object(
                    Bucket=settings.R2_PRIVATE_BUCKET,
                    Key=target,
                    Body=body.content,
                    ContentType=body.headers.get("Content-Type", "application/octet-stream"),
                )
            self.stdout.write(f"Supabase {bucket}: {copied} copied, {skipped} already in R2")

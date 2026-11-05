"""Catalogue photos are served from R2, and only from R2."""

from io import StringIO
from pathlib import Path
from typing import Any

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.catalog.models import Category
from apps.foundation import catalog_media
from apps.foundation.catalog_media import catalog_image_url
from apps.foundation.management.commands import upload_catalog_images

MEDIA = "https://media.example.com"


class FakeR2:
    def __init__(self) -> None:
        self.objects: dict[str, dict[str, Any]] = {}

    def put_object(self, **kwargs: Any) -> None:
        self.objects[kwargs["Key"]] = kwargs


@pytest.fixture
def r2(settings: Any, monkeypatch: pytest.MonkeyPatch) -> FakeR2:
    settings.R2_PUBLIC_ENABLED = True
    settings.R2_PUBLIC_BUCKET = "public"
    settings.R2_PUBLIC_BASE_URL = MEDIA
    fake = FakeR2()
    monkeypatch.setattr(upload_catalog_images, "r2_client", lambda: fake)
    return fake


@pytest.fixture
def source(tmp_path: Path) -> Path:
    (tmp_path / "rentals").mkdir()
    (tmp_path / "rentals" / "drill.jpg").write_bytes(b"jpg")
    (tmp_path / "rentals" / "notes.txt").write_text("not an image")
    return tmp_path


def _run(source: Path, *flags: str) -> str:
    out = StringIO()
    call_command("upload_catalog_images", "--source", str(source), *flags, stdout=out)
    return out.getvalue()


def test_a_seed_saves_the_bucket_address(settings: Any) -> None:
    settings.R2_PUBLIC_ENABLED = True
    settings.R2_PUBLIC_BASE_URL = MEDIA
    assert catalog_image_url("/catalog/rentals/drill.jpg") == f"{MEDIA}/catalog/rentals/drill.jpg"


def test_without_r2_the_path_stays_for_local_development(settings: Any) -> None:
    settings.R2_PUBLIC_ENABLED = False
    assert catalog_image_url("/catalog/rentals/drill.jpg") == "/catalog/rentals/drill.jpg"


def test_the_prefix_is_the_one_the_upload_writes() -> None:
    assert catalog_media.CATALOG_PREFIX == "/catalog/"


@pytest.mark.django_db
def test_uploads_images_under_catalog_with_type_and_cache(r2: FakeR2, source: Path) -> None:
    _run(source)
    assert list(r2.objects) == ["catalog/rentals/drill.jpg"]
    stored = r2.objects["catalog/rentals/drill.jpg"]
    assert stored["Bucket"] == "public"
    assert stored["ContentType"] == "image/jpeg"
    assert stored["CacheControl"] == "public, max-age=2592000"


@pytest.mark.django_db
@pytest.mark.usefixtures("r2")
def test_repoints_a_saved_link_and_is_safe_to_run_again(source: Path) -> None:
    category = Category.objects.create(
        name="Tents", slug="tents", image_url="/catalog/tiles/tents.png"
    )
    other = Category.objects.create(name="Other", slug="other", image_url=f"{MEDIA}/Images/a.png")

    _run(source)
    _run(source)

    category.refresh_from_db()
    other.refresh_from_db()
    assert category.image_url == f"{MEDIA}/catalog/tiles/tents.png"
    assert other.image_url == f"{MEDIA}/Images/a.png"


@pytest.mark.django_db
def test_dry_run_changes_nothing(r2: FakeR2, source: Path) -> None:
    category = Category.objects.create(
        name="Tents", slug="tents", image_url="/catalog/tiles/tents.png"
    )

    output = _run(source, "--dry-run")

    category.refresh_from_db()
    assert r2.objects == {}
    assert category.image_url == "/catalog/tiles/tents.png"
    assert "Would repoint 1 saved links" in output


def test_refuses_without_r2(settings: Any, source: Path) -> None:
    settings.R2_PUBLIC_ENABLED = False
    with pytest.raises(CommandError, match="R2 is not configured"):
        _run(source)


@pytest.mark.usefixtures("r2")
def test_refuses_an_empty_folder(tmp_path: Path) -> None:
    with pytest.raises(CommandError, match="No images found"):
        _run(tmp_path)

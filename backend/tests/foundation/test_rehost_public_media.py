from io import StringIO

import pytest
from django.core.management import CommandError, call_command
from pytest_django.fixtures import SettingsWrapper

from apps.catalog.models import Category

pytestmark = pytest.mark.django_db

OLD = "https://pub-0000.r2.dev"
NEW = "https://media.example.com"


def _category(slug: str, image_url: str) -> Category:
    return Category.objects.create(slug=slug, name=slug.title(), image_url=image_url)


def test_report_only_changes_nothing() -> None:
    row = _category("plumber", f"{OLD}/Images/plumber.png")
    out = StringIO()

    call_command("rehost_public_media", "--from", OLD, "--to", NEW, stdout=out)

    row.refresh_from_db()
    assert row.image_url == f"{OLD}/Images/plumber.png"
    assert "catalog.Category.image_url: 1" in out.getvalue()
    assert "Nothing changed" in out.getvalue()


def test_apply_moves_only_links_on_the_old_address() -> None:
    moved = _category("plumber", f"{OLD}/Images/plumber%20(1).png")
    other_host = _category("painter", "https://images.unsplash.com/photo-1")
    look_alike = _category("carpenter", "https://pub-0000.r2.dev.evil.example/x.png")
    blank = _category("mason", "")

    call_command("rehost_public_media", "--from", OLD, "--to", NEW, "--apply", stdout=StringIO())

    for row in (moved, other_host, look_alike, blank):
        row.refresh_from_db()
    assert moved.image_url == f"{NEW}/Images/plumber%20(1).png"
    assert other_host.image_url == "https://images.unsplash.com/photo-1"
    assert look_alike.image_url == "https://pub-0000.r2.dev.evil.example/x.png"
    assert blank.image_url == ""


def test_running_again_finds_nothing_left() -> None:
    _category("plumber", f"{OLD}/a.png")
    call_command("rehost_public_media", "--from", OLD, "--to", NEW, "--apply", stdout=StringIO())
    out = StringIO()

    call_command("rehost_public_media", "--from", OLD, "--to", NEW, "--apply", stdout=out)

    assert "0 link(s)" in out.getvalue()


def test_defaults_to_the_configured_public_address(settings: SettingsWrapper) -> None:
    settings.R2_PUBLIC_BASE_URL = NEW
    row = _category("plumber", f"{OLD}/a.png")

    call_command("rehost_public_media", "--from", OLD, "--apply", stdout=StringIO())

    row.refresh_from_db()
    assert row.image_url == f"{NEW}/a.png"


@pytest.mark.parametrize(
    "args",
    [
        ("--from", "https://pub-0000.r2.dev/some/path", "--to", NEW),
        ("--from", OLD, "--to", "http://media.example.com"),
        ("--from", OLD, "--to", OLD),
    ],
)
def test_refuses_a_mistyped_address(args: tuple[str, ...]) -> None:
    with pytest.raises(CommandError):
        call_command("rehost_public_media", *args, stdout=StringIO())

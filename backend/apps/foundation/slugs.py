"""Readable, unique web-address slugs for public pages (stays, rentals, job listings).

"Sunrise PG" in "Madhapur, Hyderabad" becomes ``sunrise-pg-madhapur``; a taken slug gets ``-2``,
``-3``. A slug is set once, when the row is first saved, and never follows later title edits, so
a link someone shared keeps working.
"""

from typing import Any
from uuid import UUID

from django.utils.text import slugify

SLUG_MAX_LENGTH = 100
#: Fixed pages that sit beside the slug pages (/stays/mine, /listings/my-applications) and the
#: API's fixed addresses (/stays/taxonomy). A slug equal to one would never be reachable.
RESERVED_SLUGS = frozenset(
    {
        "book",
        "enquire",
        "filters",
        "mine",
        "my-applications",
        "new",
        "quote",
        "resume-files",
        "reviews",
        "taxonomy",
    }
)


def slug_base(title: str, location_text: str = "", *, fallback: str) -> str:
    area = (location_text or "").split(",")[0]
    base = slugify(f"{title} {area}")[:SLUG_MAX_LENGTH].strip("-")
    return base or fallback


def unique_slug(model: Any, base: str, *, exclude_pk: Any = None) -> str:
    candidate = f"{base}-2" if base in RESERVED_SLUGS else base
    counter = 3 if base in RESERVED_SLUGS else 2
    taken = model.objects.all()
    if exclude_pk is not None:
        taken = taken.exclude(pk=exclude_pk)
    while taken.filter(slug=candidate).exists():
        suffix = f"-{counter}"
        candidate = base[: SLUG_MAX_LENGTH - len(suffix)].rstrip("-") + suffix
        counter += 1
    return candidate


def lookup_by_slug_or_id(key: str) -> dict[str, Any]:
    """Filter arguments for a public page address: old links carry an id, new ones a slug."""
    try:
        return {"id": UUID(str(key))}
    except ValueError:
        return {"slug": key}

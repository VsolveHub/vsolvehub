"""Where a catalogue photo is served from.

Catalogue photos live in the public R2 bucket under `catalog/`, uploaded by
`manage.py upload_catalog_images`. A seed names a photo by its path and saves this full address,
so no link depends on any website's own files. Without R2 (local development and tests) the path
stays as it is.
"""

from django.conf import settings

CATALOG_PREFIX = "/catalog/"


def catalog_image_url(path: str) -> str:
    """The address to save for a catalogue photo such as `/catalog/rentals/drill.jpg`."""
    if settings.R2_PUBLIC_ENABLED and path.startswith(CATALOG_PREFIX):
        return f"{settings.R2_PUBLIC_BASE_URL}{path}"
    return path

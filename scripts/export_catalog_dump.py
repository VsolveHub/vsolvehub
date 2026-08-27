"""List local/Cloudflare images, then dump live catalog services for sharing.

Writes into ``exports/YYYY-MM-DD-catalog/``:

- IMAGE_LIST.md          Human-readable folder listing with live R2 URLs
- images_manifest.csv    One row per image (local path + Cloudflare URL)
- r2_image_urls.json     Full R2 probe inventory
- catalog_live.json      Categories → tiles → services → variants from Postgres
- services.csv           Flat spreadsheet of priced variants
- summary.json           Counts
- README.txt             How a teammate uses the dump
"""

from __future__ import annotations

import csv
import json
import os
import shutil
import sys
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import quote, urlparse

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND = REPO_ROOT / "backend"
IMAGES_DIR = REPO_ROOT / "images"
R2_INVENTORY = REPO_ROOT / "scripts" / "r2_image_urls.json"
PUBLIC_BASE = "https://pub-32e84da8140449ddbc61c13539728e0e.r2.dev"
OBJECT_PREFIX = "Images"
IMAGE_SUFFIXES = {".jpeg", ".jpg", ".png", ".webp", ".gif", ".svg"}

sys.path.insert(0, str(BACKEND))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

import django

django.setup()

from django.db.models import Prefetch  # noqa: E402
from django.utils import timezone  # noqa: E402

from apps.catalog.models import (  # noqa: E402
    Category,
    Service,
    ServiceMedia,
    ServiceVariant,
    Subcategory,
)
from apps.pricing.models import ServiceRate  # noqa: E402


def export_dir() -> Path:
    stamp = datetime.now(UTC).strftime("%Y-%m-%d")
    path = REPO_ROOT / "exports" / f"{stamp}-catalog"
    path.mkdir(parents=True, exist_ok=True)
    return path


def public_url(key: str) -> str:
    encoded = "/".join(quote(part, safe="") for part in key.split("/"))
    return f"{PUBLIC_BASE}/{encoded}"


def iter_local_images() -> list[dict]:
    rows: list[dict] = []
    for path in sorted(IMAGES_DIR.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        rel = path.relative_to(IMAGES_DIR)
        folder = rel.parts[0] if len(rel.parts) >= 2 else ""
        filename = path.name
        key = f"{OBJECT_PREFIX}/{folder}/{filename}" if folder else f"{OBJECT_PREFIX}/{filename}"
        rows.append(
            {
                "folder": folder,
                "filename": filename,
                "local_path": f"images/{rel.as_posix()}",
                "r2_key": key,
                "r2_url": public_url(key),
                "bytes": path.stat().st_size,
            }
        )
    return rows


def load_r2_index() -> dict[str, dict]:
    if not R2_INVENTORY.is_file():
        return {}
    payload = json.loads(R2_INVENTORY.read_text(encoding="utf-8"))
    index: dict[str, dict] = {}
    for row in payload.get("live", []) + payload.get("missing", []):
        index[row["key"]] = row
    return index


def merge_image_rows(local: list[dict], r2_index: dict[str, dict]) -> list[dict]:
    merged: list[dict] = []
    seen_keys: set[str] = set()
    for row in local:
        hit = r2_index.get(row["r2_key"], {})
        merged.append(
            {
                **row,
                "r2_status": hit.get("status", ""),
                "r2_bytes": hit.get("bytes"),
                "content_type": hit.get("content_type") or "",
                "on_cloudflare": hit.get("status") == 200,
            }
        )
        seen_keys.add(row["r2_key"])
    for key, hit in r2_index.items():
        if key in seen_keys:
            continue
        merged.append(
            {
                "folder": hit.get("folder", ""),
                "filename": hit.get("filename", ""),
                "local_path": "",
                "r2_key": key,
                "r2_url": hit.get("url") or public_url(key),
                "bytes": hit.get("bytes") or 0,
                "r2_status": hit.get("status", ""),
                "r2_bytes": hit.get("bytes"),
                "content_type": hit.get("content_type") or "",
                "on_cloudflare": hit.get("status") == 200,
            }
        )
    merged.sort(key=lambda row: (row["folder"].lower(), row["filename"].lower()))
    return merged


def write_manifest(rows: list[dict], path: Path) -> None:
    fieldnames = [
        "folder",
        "filename",
        "local_path",
        "r2_key",
        "r2_url",
        "bytes",
        "r2_status",
        "content_type",
        "on_cloudflare",
    ]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def write_image_list(rows: list[dict], path: Path) -> dict:
    by_folder: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        by_folder[row["folder"] or "(root)"].append(row)

    live = sum(1 for row in rows if row["on_cloudflare"])
    missing = len(rows) - live
    total_bytes = sum(int(row.get("bytes") or 0) for row in rows)

    lines = [
        "# VsolveHub Cloudflare image list",
        "",
        f"Exported at: {datetime.now(UTC).isoformat()}",
        f"Public host: `{PUBLIC_BASE}`",
        f"Object prefix: `{OBJECT_PREFIX}/`",
        "",
        f"**{len(rows)} images** · **{live} live on Cloudflare** · "
        f"**{missing} missing** · **{total_bytes / 1024 / 1024:.2f} MB**",
        "",
        "## Folders",
        "",
        "| Folder | Files | Size | Live |",
        "| --- | ---: | ---: | ---: |",
    ]
    for folder, folder_rows in by_folder.items():
        folder_bytes = sum(int(row.get("bytes") or 0) for row in folder_rows)
        folder_live = sum(1 for row in folder_rows if row["on_cloudflare"])
        lines.append(
            f"| {folder} | {len(folder_rows)} | {folder_bytes / 1024 / 1024:.2f} MB | {folder_live} |"
        )
    lines.append("")

    for folder, folder_rows in by_folder.items():
        lines.append(f"## {folder} ({len(folder_rows)})")
        lines.append("")
        for row in folder_rows:
            mark = "live" if row["on_cloudflare"] else "MISSING"
            size_kb = int(row.get("bytes") or 0) / 1024
            lines.append(f"- `{row['filename']}` · {size_kb:.0f} KB · {mark}")
            lines.append(f"  - {row['r2_url']}")
        lines.append("")

    path.write_text("\n".join(lines), encoding="utf-8")
    return {
        "files": len(rows),
        "live": live,
        "missing": missing,
        "bytes": total_bytes,
        "folders": {folder: len(folder_rows) for folder, folder_rows in by_folder.items()},
    }


def _paise_to_inr(paise: int | None) -> float | None:
    if paise is None:
        return None
    return round(paise / 100, 2)


def _active_rate(variant: ServiceVariant) -> ServiceRate | None:
    now = timezone.now()
    for rate in variant.rates.all():
        if not rate.is_active:
            continue
        if rate.effective_from and rate.effective_from > now:
            continue
        if rate.effective_to and rate.effective_to <= now:
            continue
        return rate
    return None


def _cover_url(service: Service) -> str:
    for media in service.media.all():
        if media.kind == ServiceMedia.Kind.COVER and media.is_active:
            return media.url
    return ""


def build_live_catalog() -> dict:
    variants_qs = ServiceVariant.objects.prefetch_related(
        Prefetch("rates", queryset=ServiceRate.objects.order_by("-effective_from", "-created_at"))
    )
    services_qs = Service.objects.prefetch_related(
        "media",
        Prefetch("variants", queryset=variants_qs),
    )
    categories = []
    for category in Category.objects.prefetch_related(
        Prefetch(
            "subcategories",
            queryset=Subcategory.objects.prefetch_related(
                Prefetch("services", queryset=services_qs)
            ),
        )
    ):
        tiles = []
        for tile in category.subcategories.all():
            services = []
            for service in tile.services.all():
                variants = []
                for variant in service.variants.all():
                    rate = _active_rate(variant)
                    variants.append(
                        {
                            "id": str(variant.id),
                            "code": variant.code,
                            "name": variant.name,
                            "description": variant.description,
                            "pricing_strategy": variant.pricing_strategy,
                            "booking_archetype": variant.booking_archetype,
                            "work_minutes": variant.recommended_duration_minutes,
                            "min_minutes": variant.minimum_duration_minutes,
                            "max_minutes": variant.maximum_duration_minutes,
                            "skill_code": variant.required_skill_code,
                            "tax_category_code": variant.tax_category_code,
                            "image_url": variant.image_url,
                            "is_active": variant.is_active,
                            "price_paise": rate.amount_paise if rate else None,
                            "price_inr": _paise_to_inr(rate.amount_paise if rate else None),
                            "currency": rate.currency if rate else "INR",
                        }
                    )
                services.append(
                    {
                        "id": str(service.id),
                        "slug": service.slug,
                        "name": service.name,
                        "status": service.status,
                        "short_description": service.short_description,
                        "display_order": service.display_order,
                        "icon_key": service.icon_key,
                        "cover_image_url": _cover_url(service),
                        "media": [
                            {
                                "kind": media.kind,
                                "url": media.url,
                                "alt_text": media.alt_text,
                                "display_order": media.display_order,
                                "is_active": media.is_active,
                            }
                            for media in service.media.all()
                        ],
                        "variant_count": len(variants),
                        "variants": variants,
                    }
                )
            tiles.append(
                {
                    "id": str(tile.id),
                    "slug": tile.slug,
                    "name": tile.name,
                    "is_active": tile.is_active,
                    "display_order": tile.display_order,
                    "image_url": tile.image_url,
                    "icon_key": tile.icon_key,
                    "service_count": len(services),
                    "services": services,
                }
            )
        categories.append(
            {
                "id": str(category.id),
                "slug": category.slug,
                "name": category.name,
                "description": category.description,
                "is_active": category.is_active,
                "display_order": category.display_order,
                "image_url": category.image_url,
                "icon_key": category.icon_key,
                "subcategory_count": len(tiles),
                "service_count": sum(tile["service_count"] for tile in tiles),
                "subcategories": tiles,
            }
        )

    return {
        "exported_at": datetime.now(UTC).isoformat(),
        "source": {
            "database": "postgresql://127.0.0.1:15432/vsolve",
            "note": "Live catalog rows currently in local Postgres, including image URLs.",
        },
        "counts": {
            "categories": len(categories),
            "subcategories": sum(c["subcategory_count"] for c in categories),
            "services": sum(c["service_count"] for c in categories),
            "variants": sum(
                len(svc["variants"])
                for cat in categories
                for tile in cat["subcategories"]
                for svc in tile["services"]
            ),
        },
        "categories": categories,
    }


def write_services_csv(catalog: dict, path: Path) -> int:
    rows: list[dict] = []
    for category in catalog["categories"]:
        for tile in category["subcategories"]:
            for service in tile["services"]:
                variants = service["variants"] or [
                    {
                        "code": "",
                        "name": "",
                        "price_inr": None,
                        "work_minutes": "",
                        "skill_code": "",
                        "image_url": "",
                    }
                ]
                for variant in variants:
                    rows.append(
                        {
                            "category_slug": category["slug"],
                            "category_name": category["name"],
                            "subcategory_slug": tile["slug"],
                            "subcategory_name": tile["name"],
                            "service_slug": service["slug"],
                            "service_name": service["name"],
                            "service_status": service["status"],
                            "variant_code": variant.get("code", ""),
                            "variant_name": variant.get("name", ""),
                            "price_inr": variant.get("price_inr", ""),
                            "work_minutes": variant.get("work_minutes", ""),
                            "skill_code": variant.get("skill_code", ""),
                            "cover_image_url": service["cover_image_url"],
                            "variant_image_url": variant.get("image_url", ""),
                            "tile_image_url": tile["image_url"],
                            "category_image_url": category["image_url"],
                        }
                    )
    fieldnames = list(rows[0].keys()) if rows else []
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)


def host_counts(catalog: dict) -> dict[str, int]:
    hosts: dict[str, int] = defaultdict(int)
    urls: list[str] = []
    for category in catalog["categories"]:
        urls.append(category.get("image_url") or "")
        for tile in category["subcategories"]:
            urls.append(tile.get("image_url") or "")
            for service in tile["services"]:
                urls.append(service.get("cover_image_url") or "")
                for media in service.get("media") or []:
                    urls.append(media.get("url") or "")
                for variant in service.get("variants") or []:
                    urls.append(variant.get("image_url") or "")
    for url in urls:
        if not url:
            hosts["(blank)"] += 1
            continue
        host = urlparse(url).netloc or "(unknown)"
        hosts[host] += 1
    return dict(sorted(hosts.items(), key=lambda item: (-item[1], item[0])))


def write_readme(out: Path, image_summary: dict, catalog: dict, csv_rows: int) -> None:
    text = f"""VsolveHub catalog + Cloudflare images dump
==========================================
Exported for a teammate. Images are already on public Cloudflare R2;
this folder lists them and dumps the live services catalog.

What's in this folder
---------------------
IMAGE_LIST.md         Folder-by-folder list of every image + live R2 URL.
images_manifest.csv   Spreadsheet: local path, R2 key, public URL, size.
r2_image_urls.json    Full Cloudflare inventory ({image_summary['live']} live).
catalog_live.json     Live Postgres catalog: categories → tiles → services → variants.
services.csv          Flat spreadsheet of every priced variant ({csv_rows} rows).
summary.json          Counts.
README.txt            This file.

Cloudflare images
-----------------
Public host:

    {PUBLIC_BASE}/Images/<folder>/<file>

{image_summary['files']} files across {len(image_summary['folders'])} folders.
{image_summary['live']} returned HTTP 200 when last probed. Missing: {image_summary['missing']}.

Local copies live in the repo at `images/<folder>/<file>` (same names as R2 keys
under `Images/`). You do not need to download the binaries if you can reach R2.

Live catalog
------------
{catalog['counts']['categories']} categories, {catalog['counts']['subcategories']} browse tiles,
{catalog['counts']['services']} services, {catalog['counts']['variants']} variants.

How to load services into another local DB
------------------------------------------
From `vsolvehub/backend`, after migrate:

    python manage.py seed_technician_catalog
    python manage.py seed_task_catalog

Run order matters. The first command seeds the six M1 services; the second adds the
full Technician / Beautician / Home / Pet catalog and does not prune.
"""
    (out / "README.txt").write_text(text, encoding="utf-8")


def main() -> None:
    out = export_dir()
    local = iter_local_images()
    r2_index = load_r2_index()
    rows = merge_image_rows(local, r2_index)

    write_manifest(rows, out / "images_manifest.csv")
    image_summary = write_image_list(rows, out / "IMAGE_LIST.md")
    if R2_INVENTORY.is_file():
        shutil.copy2(R2_INVENTORY, out / "r2_image_urls.json")

    catalog = build_live_catalog()
    (out / "catalog_live.json").write_text(
        json.dumps(catalog, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    csv_rows = write_services_csv(catalog, out / "services.csv")
    write_readme(out, image_summary, catalog, csv_rows)

    summary = {
        "exported_at": catalog["exported_at"],
        "export_dir": str(out.relative_to(REPO_ROOT)).replace("\\", "/"),
        "images": image_summary,
        "catalog_counts": catalog["counts"],
        "csv_rows": csv_rows,
        "image_url_hosts": host_counts(catalog),
        "files": [
            "IMAGE_LIST.md",
            "images_manifest.csv",
            "r2_image_urls.json",
            "catalog_live.json",
            "services.csv",
            "summary.json",
            "README.txt",
        ],
    }
    (out / "summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

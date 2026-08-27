VsolveHub catalog + Cloudflare images dump
==========================================
Exported for a teammate. Images are already on public Cloudflare R2;
this folder lists them and dumps the live services catalog.

What's in this folder
---------------------
IMAGE_LIST.md         Folder-by-folder list of every image + live R2 URL.
images_manifest.csv   Spreadsheet: local path, R2 key, public URL, size.
r2_image_urls.json    Full Cloudflare inventory (450 live).
catalog_live.json     Live Postgres catalog: categories → tiles → services → variants.
services.csv          Flat spreadsheet of every priced variant (533 rows).
summary.json          Counts.
README.txt            This file.

Cloudflare images
-----------------
Public host:

    https://pub-32e84da8140449ddbc61c13539728e0e.r2.dev/Images/<folder>/<file>

450 files across 11 folders.
450 returned HTTP 200 when last probed. Missing: 0.

Local copies live in the repo at `images/<folder>/<file>` (same names as R2 keys
under `Images/`). You do not need to download the binaries if you can reach R2.

Live catalog
------------
10 categories, 76 browse tiles,
322 services, 533 variants.

How to load this dump into another local DB
-------------------------------------------
Clone this repo, then from `vsolvehub/backend` after migrate:

    python manage.py seed_technician_catalog
    python manage.py load_catalog_dump

`seed_technician_catalog` creates the Hyderabad service area and M1 pricing policy.
`load_catalog_dump` writes this dump: categories, tiles, 322 services, variants,
prices, and Cloudflare R2 image URLs.

Optional: pass a dump file explicitly:

    python manage.py load_catalog_dump --path ../exports/2026-08-27-catalog/catalog_live.json

The command is idempotent (safe to re-run). It keys on slugs, not the exporter's UUIDs.

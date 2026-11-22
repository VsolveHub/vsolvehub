#!/usr/bin/env python3
"""Upload Catalog Version 2 photos and 3D tiles to Cloudflare R2 bucket.

According to exports/2026-11-15-catalog-pictures/V2-pictures.md:
- catalog-v2/ goes into Images/catalog-v2/
- tiles-v2/ goes into Images/Service Cover/tiles-v2/

Usage:
    python scripts/upload_v2_catalog_to_r2.py
    # Or with explicit env vars:
    # R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... python scripts/upload_v2_catalog_to_r2.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BASE_DIR = REPO_ROOT / "exports" / "2026-11-15-catalog-pictures"
CATALOG_DIR = BASE_DIR / "catalog-v2"
TILES_DIR = BASE_DIR / "tiles-v2"

def main() -> None:
    account_id = os.environ.get("R2_ACCOUNT_ID", "").strip()
    access_key = os.environ.get("R2_ACCESS_KEY_ID", "").strip()
    secret_key = os.environ.get("R2_SECRET_ACCESS_KEY", "").strip()
    bucket_name = os.environ.get("R2_BUCKET", "vsolvehub").strip()

    if not (account_id and access_key and secret_key):
        print("=" * 60)
        print("Cloudflare R2 credentials not found in environment.")
        print("To upload directly to Cloudflare R2:")
        print("  1. In Cloudflare, get API token for account starting with 4d9ea6.")
        print("  2. Set environment variables:")
        print("       set R2_ACCOUNT_ID=your_account_id (starts with 4d9ea6)")
        print("       set R2_ACCESS_KEY_ID=your_r2_access_key_id")
        print("       set R2_SECRET_ACCESS_KEY=your_r2_secret_access_key")
        print("  3. Run: python scripts/upload_v2_catalog_to_r2.py")
        print("=" * 60)
        print("\nNote: catalog-v2.zip is already fully packaged for manual upload")
        print("or sending to the bucket owner via Cloudflare R2 Web UI.")
        sys.exit(1)

    import boto3
    from botocore.config import Config

    endpoint_url = f"https://{account_id}.r2.cloudflarestorage.com"
    s3 = boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )

    uploads = []

    # 1. catalog-v2 -> Images/catalog-v2/...
    if CATALOG_DIR.is_dir():
        for path in CATALOG_DIR.rglob("*"):
            if path.is_file():
                rel = path.relative_to(CATALOG_DIR).as_posix()
                r2_key = f"Images/catalog-v2/{rel}"
                uploads.append((path, r2_key))

    # 2. tiles-v2 -> Images/Service Cover/tiles-v2/...
    if TILES_DIR.is_dir():
        for path in TILES_DIR.rglob("*"):
            if path.is_file():
                rel = path.relative_to(TILES_DIR).as_posix()
                r2_key = f"Images/Service Cover/tiles-v2/{rel}"
                uploads.append((path, r2_key))

    print(f"Uploading {len(uploads)} files to Cloudflare R2 bucket '{bucket_name}'...")
    success = 0
    for local_path, r2_key in uploads:
        content_type = "image/png" if local_path.suffix.lower() == ".png" else "image/jpeg"
        with open(local_path, "rb") as f:
            data = f.read()

        s3.put_object(
            Bucket=bucket_name,
            Key=r2_key,
            Body=data,
            ContentType=content_type,
            CacheControl="public, max-age=31536000, immutable",
        )
        print(f"  [OK] {local_path.name} -> s3://{bucket_name}/{r2_key} ({len(data)} bytes)")
        success += 1

    print(f"\nAll {success} files uploaded successfully to Cloudflare R2!")

if __name__ == "__main__":
    main()

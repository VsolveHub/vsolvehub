#!/usr/bin/env python3
"""Upload updated rental category 3D tiles to Cloudflare R2 bucket.

Usage:
    python scripts/upload_rental_tiles_to_r2.py
    # Or with explicit env vars:
    # R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... python scripts/upload_rental_tiles_to_r2.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TILES_DIR = REPO_ROOT / "frontend" / "apps" / "customer" / "public" / "catalog" / "tiles"

TILES_TO_UPLOAD = [
    ("lighting-rental.png", "catalog/tiles/lighting-rental.png"),
    ("home-appliance-rental.png", "catalog/tiles/home-appliance-rental.png"),
    ("tentshamiana.png", "catalog/tiles/tentshamiana.png"),
    ("sound-system-rental.png", "catalog/tiles/sound-system-rental.png"),
    ("tools-machinery.png", "catalog/tiles/tools-machinery.png"),
]

def main() -> None:
    account_id = os.environ.get("R2_ACCOUNT_ID", "").strip()
    access_key = os.environ.get("R2_ACCESS_KEY_ID", "").strip()
    secret_key = os.environ.get("R2_SECRET_ACCESS_KEY", "").strip()
    bucket_name = os.environ.get("R2_PUBLIC_BUCKET", "vsolve-public").strip()

    if not (account_id and access_key and secret_key):
        print("Error: Cloudflare R2 credentials not found in environment.")
        print("Please provide R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.")
        print("\nExample:")
        print("  set R2_ACCOUNT_ID=your_account_id")
        print("  set R2_ACCESS_KEY_ID=your_access_key_id")
        print("  set R2_SECRET_ACCESS_KEY=your_secret_access_key")
        print("  python scripts/upload_rental_tiles_to_r2.py")
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

    print(f"Uploading {len(TILES_TO_UPLOAD)} tile icons to Cloudflare R2 bucket '{bucket_name}'...")
    for filename, r2_key in TILES_TO_UPLOAD:
        local_path = TILES_DIR / filename
        if not local_path.is_file():
            print(f"Error: {local_path} not found.")
            continue

        with open(local_path, "rb") as f:
            data = f.read()

        s3.put_object(
            Bucket=bucket_name,
            Key=r2_key,
            Body=data,
            ContentType="image/png",
            CacheControl="public, max-age=31536000, immutable",
        )
        print(f"  [OK] Uploaded {filename} -> s3://{bucket_name}/{r2_key} ({len(data)} bytes)")

    print("\nAll 5 rental tiles uploaded successfully to Cloudflare R2!")

if __name__ == "__main__":
    main()


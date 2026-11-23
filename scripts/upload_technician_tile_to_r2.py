#!/usr/bin/env python3
"""Upload updated technician 3D icon to Cloudflare R2 bucket.

Replaces both the category icon key and the catalog tile key:
- Images/Icons/download (5).png
- catalog/tiles/story-technician.png
- catalog/tiles/technician.png
- catalog/tiles/technician-jobs.png

Usage:
    python scripts/upload_technician_tile_to_r2.py
    # Or with explicit arguments:
    # python scripts/upload_technician_tile_to_r2.py --account-id <ID> --access-key <KEY> --secret-key <SECRET>
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCE_IMAGE = REPO_ROOT / "vsolvehub" / "frontend" / "apps" / "customer" / "public" / "catalog" / "tiles" / "story-technician.png"
if not SOURCE_IMAGE.is_file():
    SOURCE_IMAGE = REPO_ROOT / "frontend" / "apps" / "customer" / "public" / "catalog" / "tiles" / "story-technician.png"

TARGET_KEYS = [
    "Images/Icons/download (5).png",
    "catalog/tiles/story-technician.png",
    "catalog/tiles/technician.png",
    "catalog/tiles/technician-jobs.png",
]

def main() -> None:
    parser = argparse.ArgumentParser(description="Upload technician icon to Cloudflare R2.")
    parser.add_argument("--account-id", default=os.environ.get("R2_ACCOUNT_ID", "").strip())
    parser.add_argument("--access-key", default=os.environ.get("R2_ACCESS_KEY_ID", "").strip())
    parser.add_argument("--secret-key", default=os.environ.get("R2_SECRET_ACCESS_KEY", "").strip())
    parser.add_argument("--bucket", default=os.environ.get("R2_PUBLIC_BUCKET", os.environ.get("R2_BUCKET", "vsolve-public")).strip())

    args = parser.parse_args()

    account_id = args.account_id
    access_key = args.access_key
    secret_key = args.secret_key
    bucket_name = args.bucket

    if not (account_id and access_key and secret_key):
        print("=" * 60)
        print("Error: Cloudflare R2 credentials not found.")
        print("Please provide R2 credentials via arguments or environment variables.")
        print("\nExample using command line arguments:")
        print("  python scripts/upload_technician_tile_to_r2.py --account-id <ID> --access-key <KEY> --secret-key <SECRET>")
        print("\nOr set environment variables:")
        print("  set R2_ACCOUNT_ID=your_account_id")
        print("  set R2_ACCESS_KEY_ID=your_access_key_id")
        print("  set R2_SECRET_ACCESS_KEY=your_secret_access_key")
        print("  python scripts/upload_technician_tile_to_r2.py")
        print("=" * 60)
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

    if not SOURCE_IMAGE.is_file():
        print(f"Error: Source image not found at {SOURCE_IMAGE}")
        sys.exit(1)

    with open(SOURCE_IMAGE, "rb") as f:
        data = f.read()

    print(f"Uploading technician icon ({len(data)} bytes) to Cloudflare R2 bucket '{bucket_name}'...")
    for key in TARGET_KEYS:
        s3.put_object(
            Bucket=bucket_name,
            Key=key,
            Body=data,
            ContentType="image/png",
            CacheControl="public, max-age=31536000, immutable",
        )
        print(f"  [OK] Uploaded -> s3://{bucket_name}/{key}")

    print("\nTechnician icon successfully seeded and updated on Cloudflare R2!")

if __name__ == "__main__":
    main()

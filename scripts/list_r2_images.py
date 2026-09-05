"""List catalog images that exist on the public Cloudflare R2 bucket.

The r2.dev public host does not enumerate objects, and Wrangler has no
``r2 object list`` command. This script walks the local ``images/`` tree
(same keys as the upload) and HEAD-checks each object on the public host.

Usage (from the repo root ``vsolvehub/``)::

    python scripts/list_r2_images.py
    python scripts/list_r2_images.py --json
    python scripts/list_r2_images.py --missing
    python scripts/list_r2_images.py --out scripts/r2_image_urls.json
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from http.client import RemoteDisconnected
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

PUBLIC_BASE = "https://pub-32e84da8140449ddbc61c13539728e0e.r2.dev"
OBJECT_PREFIX = "Images"
IMAGE_SUFFIXES = {".jpeg", ".jpg", ".png", ".webp", ".gif", ".svg"}
WORKERS = 8
TIMEOUT_SECONDS = 20
RETRIES = 4


@dataclass(frozen=True, slots=True)
class ImageHit:
    folder: str
    filename: str
    key: str
    url: str
    status: int
    bytes: int | None
    content_type: str | None


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def local_images_dir(override: Path | None) -> Path:
    return override if override is not None else repo_root() / "images"


def object_key(folder: str, filename: str) -> str:
    return f"{OBJECT_PREFIX}/{folder}/{filename}"


def public_url(key: str) -> str:
    encoded = "/".join(quote(part, safe="") for part in key.split("/"))
    return f"{PUBLIC_BASE}/{encoded}"


def iter_local_images(images_dir: Path) -> list[tuple[str, str]]:
    if not images_dir.is_dir():
        raise FileNotFoundError(f"images directory not found: {images_dir}")
    found: list[tuple[str, str]] = []
    for path in sorted(images_dir.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        rel = path.relative_to(images_dir)
        if len(rel.parts) < 2:
            continue
        folder = rel.parts[0]
        filename = path.name
        found.append((folder, filename))
    return found


def head_object(folder: str, filename: str) -> ImageHit:
    key = object_key(folder, filename)
    url = public_url(key)
    last_error = "request failed"
    for attempt in range(RETRIES):
        request = Request(url, method="HEAD", headers={"User-Agent": "vsolvehub-r2-list/1.0"})
        try:
            with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                length = response.headers.get("Content-Length")
                return ImageHit(
                    folder=folder,
                    filename=filename,
                    key=key,
                    url=url,
                    status=response.status,
                    bytes=int(length) if length else None,
                    content_type=response.headers.get("Content-Type"),
                )
        except HTTPError as exc:
            return ImageHit(
                folder=folder,
                filename=filename,
                key=key,
                url=url,
                status=exc.code,
                bytes=None,
                content_type=None,
            )
        except (URLError, RemoteDisconnected, TimeoutError, ConnectionError, OSError) as exc:
            last_error = f"{type(exc).__name__}: {exc}"
            time.sleep(0.4 * (attempt + 1))
    return ImageHit(
        folder=folder,
        filename=filename,
        key=key,
        url=url,
        status=0,
        bytes=None,
        content_type=last_error,
    )


def probe(images: list[tuple[str, str]]) -> list[ImageHit]:
    hits: list[ImageHit] = []
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = [pool.submit(head_object, folder, filename) for folder, filename in images]
        for future in as_completed(futures):
            hits.append(future.result())
    hits.sort(key=lambda hit: (hit.folder.lower(), hit.filename.lower()))
    return hits


def print_text(hits: list[ImageHit], *, missing: bool) -> None:
    rows = [hit for hit in hits if (hit.status != 200) is missing]
    label = "missing / failed" if missing else "live"
    by_folder: dict[str, list[ImageHit]] = {}
    for hit in rows:
        by_folder.setdefault(hit.folder, []).append(hit)
    print(f"{len(rows)} {label} object(s) of {len(hits)} probed\n")
    for folder, folder_hits in by_folder.items():
        print(f"## {folder} ({len(folder_hits)})")
        for hit in folder_hits:
            print(hit.url)
        print()


def print_json(hits: list[ImageHit], *, missing: bool) -> None:
    rows = [hit for hit in hits if (hit.status != 200) is missing]
    payload = {
        "public_base": PUBLIC_BASE,
        "prefix": OBJECT_PREFIX,
        "count": len(rows),
        "probed": len(hits),
        "objects": [asdict(hit) for hit in rows],
    }
    json.dump(payload, sys.stdout, indent=2)
    sys.stdout.write("\n")


def write_out(path: Path, hits: list[ImageHit]) -> None:
    live = [hit for hit in hits if hit.status == 200]
    missing = [hit for hit in hits if hit.status != 200]
    payload = {
        "public_base": PUBLIC_BASE,
        "prefix": OBJECT_PREFIX,
        "live_count": len(live),
        "missing_count": len(missing),
        "live": [asdict(hit) for hit in live],
        "missing": [asdict(hit) for hit in missing],
    }
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--images-dir",
        type=Path,
        default=None,
        help="Local images root (default: <repo>/images)",
    )
    parser.add_argument("--json", action="store_true", help="Print JSON instead of grouped URLs")
    parser.add_argument("--missing", action="store_true", help="Print objects that did not return 200")
    parser.add_argument("--out", type=Path, default=None, help="Write full probe result JSON here")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    images_dir = local_images_dir(args.images_dir)
    local = iter_local_images(images_dir)
    if not local:
        print(f"No image files under {images_dir}", file=sys.stderr)
        return 1
    hits = probe(local)
    if args.out:
        write_out(args.out, hits)
    if args.json:
        print_json(hits, missing=args.missing)
    else:
        print_text(hits, missing=args.missing)
    missing_count = sum(1 for hit in hits if hit.status != 200)
    return 1 if missing_count else 0


if __name__ == "__main__":
    raise SystemExit(main())

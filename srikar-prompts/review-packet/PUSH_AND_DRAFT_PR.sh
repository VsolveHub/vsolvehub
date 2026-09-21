#!/usr/bin/env bash
# Run from repo root after org grants write (or you have a fork with upstream PR rights).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
git checkout feature/m3-a10-listings
git push -u origin HEAD
gh pr create --draft --base main --head feature/m3-a10-listings \
  --title "feat(m3): A10 Career/Jobs listing engine (Wave D3) — DO NOT MERGE yet" \
  --body "$(cat <<'BODY'
## Summary
- Ports A10 Career/Jobs (`A10_LISTING`) onto current `main` as `apps.listings` + customer/partner/ops UI.
- Does **not** merge `origin/m3-changes` / cherry-pick `3fa3016`.
- Product law: Listing ≠ Booking; Application ≠ Booking; **applicant never pays**.

## Verification (owner)
- `pytest tests/listings/test_a10_flow.py -q --no-cov` → **22 passed**
- migrate + `seed_listing_catalog` applied locally
- Smoke partial: customer browse, ops Job Listings, partner listings (seed fixed for `partner` role + APPROVED application)
- Remaining: apply → withdraw → reveal → subscription/premium pay

## Do not merge
Hold until client demo + Grok PASS + remaining smoke. Main stays at `4a08ad3` until then.

## Docs
- ADR-0012, proposal 0017, `docs/runbooks/m3-a10-listing-smoke.md`
BODY
)"
echo "Draft PR created. Paste GROK_REVIEW_ASK.md into vsolvehubmanager."

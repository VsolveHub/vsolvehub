# Client demo — A10 Career/Jobs progress (no main merge)

**Branch / commit:** `feature/m3-a10-listings` @ `4b71df0`  
**Base:** `main` @ `4a08ad3`  
**Date:** 2026-09-13

## What to show

| Surface | URL | Login | Expect |
|---|---|---|---|
| Customer | http://localhost:3000/listings | optional | Seeded **Experienced Full Stack Developer** card |
| Partner | http://localhost:3001/listings | `9900000088` + OTP on screen | Career Listings & Applicants workspace |
| Ops | http://localhost:3002/operations/listings | `8019013032` | Job Listings oversight queue |

Stack: see `LOCAL_STACK.md`. Prefer `localhost` over `127.0.0.1` (CORS).

## Evidence already collected

- Pytest: **22 passed** (`--no-cov`)
- Domain smoke: apply → withdraw → shortlist → reveal → subscription → premium → ops moderate → publish (`review-packet/SMOKE_EVIDENCE.txt`)
- UI: customer browse, partner listings, ops Job Listings confirmed in browser

## GitHub / Grok

Push to `VsolveHub/vsolvehub` is blocked for `SrikarAyilneni` (SSH read OK, write denied).  
When org grants write:

```bash
./srikar-prompts/review-packet/PUSH_AND_DRAFT_PR.sh
```

Then paste `GROK_REVIEW_ASK.md` into `vsolvehubmanager` with the draft PR URL.  
**Do not merge** until client sign-off + Grok PASS.

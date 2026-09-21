# A10 Career/Jobs — CONTINUE HERE

**Audience:** any Cursor / Claude / Codex / Grok session that receives only `srikar-prompts/`.
**Updated:** 2026-09-13 11:50 IST (owner verification run by Cursor).
**Do not commit this folder.** Never `git add -A`. Never stage `srikar-prompts/`.

---

## 60-second status

| Item | State |
|---|---|
| Branch | `feature/m3-a10-listings` (uncommitted WIP on tip of `main` @ `4a08ad3`) |
| A10 on `main`? | **No** |
| Code port | **Built** — backend + FE + OpenAPI + generated client |
| Migrations applied locally? | **Yes** (2026-09-13) |
| `seed_listing_catalog` | **Yes** — fixed during verify (see below) |
| Owner pytest | **22 passed** with `--no-cov` (2026-09-13) |
| Live smoke | **Partial pass** — customer browse + ops queue + partner listings after seed fix. Apply / reveal / pay not fully click-through yet |
| Commit / push / PR | **Not done** |
| Grok auditor | Still wait until commit/PR |

**Phrase:** *built — owner verification pending* for remaining smoke (apply → moderate → reveal → pay) and for marking M3 tasks `[x]`.

---

## Verification evidence (2026-09-13)

```bash
cd backend
./.venv/bin/python manage.py migrate --noinput   # applied listings + A10 migrations
./.venv/bin/python manage.py seed_listing_catalog
./.venv/bin/python -m pytest tests/listings/test_a10_flow.py -q --no-cov
# → 22 passed in ~149s
```

| Surface | Result |
|---|---|
| `GET /api/v1/listings` | 200 — seeded “Experienced Full Stack Developer” `public_state=PUBLISHED` |
| Customer `:3000/listings` | Shows seeded job card (use `localhost` not `127.0.0.1` for CORS) |
| Ops `:3002/operations/listings` | Job Listings sidebar; seeded row **Published** visible as ops `+918019013032` |
| Partner `:3001/listings` as `+919900000088` | Works **after** seed fixes below |

### Seed bugs found and fixed during verify

In `backend/apps/catalog/management/commands/seed_listing_catalog.py`:

1. Missing `PartnerApplication` with `APPROVED` → PartnerShell sent employer to `/apply`.
2. Role code `PARTNER` (uppercase) → FE `hasRole(..., "partner")` failed → “You do not have a Partner account”.

Both fixed; re-seed grants `partner` + APPROVED application + `A10_LISTING` capability.

---

## Read these files first

1. **This file**
2. [`A10_IMPLEMENTATION_PLAN.md`](A10_IMPLEMENTATION_PLAN.md)
3. [`A10_UI_RECON_AND_E2E_PLAN.md`](A10_UI_RECON_AND_E2E_PLAN.md)
4. [`LOCAL_STACK.md`](LOCAL_STACK.md)
5. [`snapshots/2026-09-13-a10-port/`](snapshots/2026-09-13-a10-port/)

---

## Hard rules (unchanged)

1. Do not merge `origin/m3-changes` / cherry-pick `3fa3016`.
2. Stay on `feature/m3-a10-listings`.
3. Do not hand-edit OpenAPI / generated client.
4. Do not mark M3 `task.md` `[x]` without owner evidence for full exit gate.
5. Product law: Listing ≠ Booking. Applicant never pays.

---

## Next agent / owner: remaining work

1. Finish smoke: customer OTP apply → withdraw; partner shortlist/reveal; subscription/premium fake pay; ops moderate a fresh draft.
2. Optional polish: Leads/Billing tabs; listing outbox notification templates; Idempotency-Key in spectacular.
3. When owner asks: commit **explicit paths only** (include seed fix), push PR, then ask Grok for PASS/BLOCK/HOLD.
4. Update this file + `A10_IMPLEMENTATION_PLAN.md` after each slice; snapshot changed tracked MDs under `snapshots/YYYY-MM-DD-…/`.

### Owner commands

```bash
cd ~/vsolvehub/vsolvehub/backend
./.venv/bin/python -m pytest tests/listings/test_a10_flow.py -q --no-cov
# stack: LOCAL_STACK.md — API :8000, customer :3000, partner :3001, admin :3002
```

Phones: Ops `+918019013032` · A10 employer `+919900000088` · A1 partner `+919900000099`

Baseline: `4a08ad36efcc2ee61ff0cc2ca5497c95a2e7ee40`

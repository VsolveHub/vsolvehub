# A10 Career/Jobs — living implementation plan

**Updated:** 2026-09-13 11:50 IST  
**Branch:** `feature/m3-a10-listings` @ base `4a08ad3`  
**Status phrase:** built — owner verification pending (pytest green; smoke partial)  
**Handoff entrypoint:** [`A10_CONTINUE_HERE.md`](A10_CONTINUE_HERE.md)

This is the **progress board**. The original locked design lives in
`snapshots/2026-09-13-a10-port/a10_listings_implementation_2a54acf1.plan.ORIGINAL.md`
(and historically in `a10-session-handoff.zip`). Do not invent a second architecture.

---

## Locked decisions (unchanged)

| Question | Decision |
|---|---|
| First step | `feature/m3-a10-listings` from `main` @ `4a08ad3` |
| Source | Port A10-only via `git show 3fa3016:…` — never merge/cherry-pick |
| Proposal ID | **0017** (0016 already used on main) |
| ADR | **0012** A10 listing engine (0010 wallet, 0011 A7/A9 reserved) |
| Scope | Wave D3 Career/Jobs only |
| Out of scope | Wallet, A7, A9, MSG91, mobile, vehicle, analytics, Elasticsearch |

Product law: Listing ≠ Booking. Applicant never pays. Fail closed without ACTIVE
`A10VariantConfiguration` + approved `A10_LISTING` capability.

---

## Checklist

Legend: `[ ]` not started · `[~]` built, owner verification pending · `[x]` accepted with evidence · `[-]` cancelled / N/A

### Phase 0 — Branch & hygiene

| ID | Item | Status | Notes |
|---|---|---|---|
| P0-1 | Create `feature/m3-a10-listings` from `4a08ad3` | `[~]` | Branch exists; no A10 commit yet |
| P0-2 | Leave `srikar-prompts/` untracked | `[~]` | Still untracked — keep it that way |
| P0-3 | Never merge `m3-changes` / cherry-pick `3fa3016` | `[~]` | Port used `git show` only |

### Phase 1 — Design docs

| ID | Item | Status | Notes |
|---|---|---|---|
| P1-1 | Copy `03-rental-stay-jobs-categories.md` | `[~]` | On branch |
| P1-2 | ADR-0012 Proposed | `[~]` | Accept at merge |
| P1-3 | Proposal 0017 | `[~]` | |
| P1-4 | M3 `task.md` Wave D3 IDs; drop stub `M3-BE-303` | `[~]` | FE also `[~]` as of 2026-09-13 |
| P1-5 | ADR + proposals README index | `[~]` | |

### Phase 2 — Backend port

| ID | Item | Status | Notes |
|---|---|---|---|
| P2-1 | `apps.listings` + migrations 0001–0003 | `[~]` | |
| P2-2 | `tests/listings/test_a10_flow.py` (M3-A10-01…16+) | `[~]` | 22 tests; owner must run `--no-cov` |
| P2-3 | `seed_listing_catalog` | `[~]` | Fixed 2026-09-13: APPROVED `PartnerApplication` + role code `partner` (not `PARTNER`) |
| P2-4 | Catalog `A10_LISTING` + `A10VariantConfiguration` + mig `0020` | `[~]` | Migrated locally |
| P2-5 | Commerce purposes + mig `0012`; CHECKOUT_FREE | `[~]` | |
| P2-6 | Partners `A10_LISTING` / EMPLOYER + mig `0017` | `[~]` | After crew `0016` |
| P2-7 | Cases LISTING/APPLICATION abuse + mig `0003` | `[~]` | |
| P2-8 | INSTALLED_APPS, urls, celery beat expiry | `[~]` | |
| P2-9 | Premium capture → `activate_premium_feature` | `[~]` | Gap from original plan closed |
| P2-10 | `public_state` on serializers | `[~]` | Gap closed |

### Phase 3 — Contract publish

| ID | Item | Status | Notes |
|---|---|---|---|
| P3-1 | `spectacular --validate` publish `v1.yaml` | `[~]` | Via manage.py, not hand-edit |
| P3-2 | Regenerate `schema.d.ts` | `[~]` | |
| P3-3 | Idempotency-Key documented on all write ops | `[ ]` | Known gap — FE casts some headers |

### Phase 4 — Frontend

| ID | Item | Status | Notes |
|---|---|---|---|
| P4-1 | Customer `/listings` browse/detail/apply/my-applications | `[~]` | |
| P4-2 | `service-href` A10 → `/listings` | `[~]` | |
| P4-3 | Partner `/listings` + registry `A10_LISTING` | `[~]` | Nav = Home/Listings/Me |
| P4-4 | Dedicated Leads + Billing tabs | `[ ]` | Deferred: inbox-on-detail + billing modal (same as m3-changes compromise) |
| P4-5 | Ops `/operations/listings` + sidebar | `[~]` | |
| P4-6 | FE uses generated client (`getApiClient`) | `[~]` | |

### Phase 5 — Gaps / polish

| ID | Item | Status | Notes |
|---|---|---|---|
| P5-1 | Status-machine FE alignment (`public_state` only) | `[~]` | Audit badges on smoke |
| P5-2 | Outbox `listing.published\|expired\|removed` + templates | `[ ]` | application.* events present; listing.* / templates TBD |
| P5-3 | No Elasticsearch | `[~]` | ORM filters only |

### Phase 6 — Owner verification & ship

| ID | Item | Status | Notes |
|---|---|---|---|
| P6-1 | `migrate` + `seed_listing_catalog` on local/staging | `[~]` | Done locally 2026-09-13 |
| P6-2 | `pytest tests/listings/test_a10_flow.py -q --no-cov` | `[~]` | **22 passed** (~149s) |
| P6-3 | Smoke click-path (runbook) | `[~]` | Customer browse + ops queue + partner listings OK. Apply/reveal/pay still owed |
| P6-4 | Commit explicit paths (no `srikar-prompts/`) | `[ ]` | Owner asks first |
| P6-5 | Push + PR → Grok PASS/BLOCK/HOLD | `[ ]` | |
| P6-6 | Mark M3 task `[x]` with evidence | `[ ]` | Only after full exit gate |

---

## Migration map (as ported)

| App | File |
|---|---|
| listings | `0001_initial` → `0002_…` → `0003_listing_premium_payment_attempt` |
| catalog | `0020_a10variantconfiguration` |
| commerce | `0012_a10_payment_purposes` |
| partners | `0017_a10_listing_archetype` (follows main `0016` crew roster) |
| cases | `0003_listing_application_subjects` |
| requirements | `0034_alter_customerrequirement_a10_archetype` |

---

## Owner commands (copy/paste)

```bash
cd ~/vsolvehub/vsolvehub/backend
./.venv/bin/python manage.py migrate
./.venv/bin/python manage.py seed_listing_catalog
./.venv/bin/python -m pytest tests/listings/test_a10_flow.py -q --no-cov
```

Smoke: `docs/runbooks/m3-a10-listing-smoke.md`  
Stack: `srikar-prompts/LOCAL_STACK.md`

Seed phones: Ops `+918019013032` · A10 employer `+919900000088` · A1 partner `+919900000099`

---

## Changelog

| When | What |
|---|---|
| 2026-09-13 | Branch created; design docs + backend port + FE port + OpenAPI; gaps premium/`public_state` closed |
| 2026-09-13 | Living plan + CONTINUE_HERE written; M3 FE tasks → `[~]`; smoke runbook gains `--no-cov`; snapshots under `snapshots/2026-09-13-a10-port/` |
| 2026-09-13 | Owner verify: migrate + seed + **22 passed** `--no-cov`; customer/ops/partner listings smoke; seed fixed (`partner` role + APPROVED application) |

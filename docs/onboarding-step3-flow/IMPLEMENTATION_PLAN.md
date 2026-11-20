# Step 3 "Where you work": implementation plan

> **Status:** Phase 1a is built (backend, web and phone). Phase 1b and Phase 2 are open.
> **Design source:** [FLOW.md](./FLOW.md) (simple flow, commit `8483051c`).
> **Checked against the code on:** 2026-11-19, branch `feature/partner-onboarding-fixes`.
>
> Paths are relative to the repo root (`vsolvehub/`).

---

## 0. Review of FLOW.md

The code references in FLOW.md are accurate:

- **T22:** `_base_application_is_complete` requires an active area link
  ([services/base.py:131-150](../../backend/apps/partners/services/base.py#L131-L150)).
- **T23:** approval calls the same function
  ([services/review.py:355-362](../../backend/apps/partners/services/review.py#L355-L362)).
- **T24:** Operations can edit hours ([partners/urls.py:194-196](../../backend/apps/partners/urls.py#L194-L196)).
- **T25:** the `PostalCode` table exists ([locations/models.py:27-33](../../backend/apps/locations/models.py#L27-L33)).
- **Queue tabs:** All, Unassigned, Mine and Changes requested exist
  ([review-queue.tsx:29-35](../../frontend/apps/admin/features/partner-review/view/review-queue.tsx#L29-L35)).

The design works. These are the gaps to fix before or while building. Items 1–5 change what gets
built.

| # | Gap | Why it matters | Fix used in this plan |
|---|---|---|---|
| 1 | **The device can't detect case C (area full).** The partner list returns only areas that are accepting partners ([selectors.py:50-54](../../backend/apps/partners/selectors.py#L50-L54)). Adding `postal_codes` to it never puts a full area's PINs on the device. | On the device, case C looks the same as case D. | The device shows one neutral line: "Noted. We'll check 500032." After the save, the server's `area_requests[].status` gives the real wording (Area full, Waiting, Ready). We don't add full areas to the list, because older phone builds would show them as tickable. |
| 2 | **Submit and approve share one completeness check.** `_base_application_is_complete` runs at submit ([application.py](../../backend/apps/partners/services/application.py)) **and** at approval ([review.py:356](../../backend/apps/partners/services/review.py#L356)). | Relaxing it for "area OR PIN" would also let zero-area applications be **approved**, breaking the "Approve unchanged" rule (and Q1). | Add a parameter: `_base_application_is_complete(application, *, allow_area_requests: bool)`. Submit passes `True`; approval keeps `False`. A test pins both. |
| 3 | **Bulk PIN upload can't create unknown PINs.** `ServiceAreaPostalCode.postal_code` is a PROTECT foreign key to `PostalCode`, which **requires city and state**. | A CSV of `pin,area_slug` can't add a PIN we have never loaded. | The CSV becomes `pin,area_slug,city,state`. City and state are required only for PINs not yet in `PostalCode`. Otherwise the row is rejected with "Unknown PIN: add city and state". |
| 4 | **"On delete cascade (also covered by account erasure)" doesn't match the code.** Partner models use `PROTECT` and applications are never deleted. Account erasure lives in `apps/identity/account_deletion.py`, which is **on `main` but not on this branch**. | Requests would outlive an erased partner. | Keep `on_delete=CASCADE` on the application foreign key, and also delete the partner's `PartnerAreaRequest` rows inside the erasure step on `main`. |
| 5 | **This branch is 41 commits behind `main`.** | Building here would miss account deletion and other recent work, and would conflict later. | Start the build branch from current `main` (§1, step 0). |
| 6 | **The error envelope already supports details.** The handler reads `api_details` (`common/errors/handler.py`), but `PartnerApiException` ([views/base.py:27-32](../../backend/apps/partners/views/base.py#L27-L32)) doesn't pass it on. | Needed for `unavailable_service_area_ids` (case G). | Give `PartnerDomainError` an optional `api_details`, and have `PartnerApiException` copy it. This is small and reusable. |
| 7 | **"One weekly set saved to every ticked area" needs no backend change.** `PUT /partner/availability/` already replaces the whole schedule, with one `service_area_id` per rule. | — | The client expands one set into rules for every area. Date exceptions are copied to every area too ([schedule-step.tsx:118](../../frontend/apps/partner/features/application/view/schedule-step.tsx#L118)). |
| 8 | **Case H, and adding an area in Step 3 after hours exist.** The new area has no hours, so submit blocks (T12). | An extra trip to Step 4 the partner won't expect. | When Step 3 saves and ticked areas were **added** while a weekly set exists, the app re-PUTs the same set for all ticked areas straight away. |
| 9 | **"Copy their usual hours" for an approved partner (section 2) is undefined** when the partner's areas have different hours. | Ambiguous server rule. | Copy the rules of the partner's area with the **most** active rules (ties broken by area name). If they have no hours at all, refuse with a clear error. |
| 10 | **A typed PIN already covered by a ticked area** | It would show up as a request in Operations counts. | The server still stores it (it is harmless), but its live status is **Done**, and Operations lists exclude Done by default. |
| 11 | **Mobile ownership.** `frontend/mobile/**` belongs to the Mobile developer (AGENTS.md). The phone text fix (T6) is theirs. | Plan it as a separate work package. | Workstream M below. |
| 12 | **The partner slides in `index.html` are out of date** (FLOW.md says so too). | Reviewers may follow the wrong mock. | Optional: redraw the partner slides after 1a ships. Not a blocker. |

**Questions FLOW.md leaves to the owner (defaults used in this plan):**

| Question | Default used |
|---|---|
| Q1 | Zero-area applications can't be approved |
| Q2 | One PIN, one area |
| Q3 | Add the area directly for approved partners |
| Q4 | Maximum 5 asked PINs |
| Q5 | `zone` as the grouping |
| Q6 | Push and in-app notifications |
| Q7 | The 1a / 1b / 2 split |

---

## 1. Before any code (step 0)

| # | Task | Who | Size |
|---|---|---|---|
| 0.1 | Owner confirms Q1–Q7 or accepts the defaults above | Owner | — |
| 0.2 | Owner confirms **who builds the backend and contract**. Per AGENTS.md, Codex owns `backend/**` and `contracts/openapi/**` unless the owner directs otherwise, as was done for the Operations console. | Owner | — |
| 0.3 | Owner confirms the Mobile developer takes workstream M | Owner | — |
| 0.4 | Create the build branch **from `main`**, e.g. `feature/step3-area-requests`, and carry over the docs folder (cherry-pick `e4b78ad2`, `8483051c`) | Builder | S |
| 0.5 | Run a read-only PIN-overlap query on staging and production: PINs in more than one `ServiceAreaPostalCode`. This decides the clean-up work for Q2. | Owner / Ops | S |
| 0.6 | Write contract proposal `contracts/proposals/0030-partner-area-requests.md`: every field in FLOW.md §4, the new error details, example payloads, and the user-visible error text | Claude (owns `contracts/proposals/**`) | S |

---

## 2. Phase 1a: partner flow, rule changes, review screen (size M)

Goal: no dead end, no lost partners, no whole-save failure, one set of hours, and area names plus
asked PINs on every application.

### 2.1 Backend (workstream B)

| # | Task | Files | Notes |
|---|---|---|---|
| B1 | **`PartnerAreaRequest` model and migration.** Fields: `application` (FK, CASCADE), `postal_code` (char 6, `indian_postal_code_validator`), `created_at`, `notified_at`, `dismissed_at`, `dismissed_by`. | `backend/apps/partners/models/onboarding.py`, new migration, `models/__init__.py`, `admin.py` | Constraints: `unique(application, postal_code)`, a check constraint for the PIN pattern, and an index on `postal_code`. Register it in Django admin as a read-mostly fallback. |
| B2 | **Live status selector.** `area_request_rows(application)` returns PIN, place (from `PostalCode`, or null), status and covering area. There is also a batch form for lists. | `backend/apps/partners/selectors.py` | Status rules are in FLOW.md §4. Use `Exists()` subqueries so a list stays a fixed number of queries. A paused area doesn't change the status. |
| B3 | **Error details.** Add an optional `api_details` to `PartnerDomainError` and have `PartnerApiException` copy it. Add `PartnerServiceAreasUnavailableError(area_ids)` (code `partner_service_areas_unavailable`, status 409, details `{"unavailable_service_area_ids": [...]}`). | `partners/exceptions.py`, `partners/views/base.py` | Raised from `_resolve_application_service_areas` ([application.py:225-246](../../backend/apps/partners/services/application.py#L225-L246)) instead of today's generic message. Old clients still see a 409. |
| B4 | **Save `requested_postal_codes`.** In `update_partner_application`, `None` means unchanged; otherwise replace the set. Normalise, check the format, drop repeats, maximum 5 (`partner_area_requests_limit`). Removed PINs are deleted, not soft-deleted. Dismissed PINs stay dismissed if re-sent. | `services/application.py`, `serializers/onboarding.py` | Only for the SERVICES track; other tracks get 400 if they send it. |
| B5 | **Rule changes.** (a) `_validate_service_configuration`: with zero areas and at least one request, skip the coverage loop; `require_complete` accepts areas **or** requests. (b) `_base_application_is_complete(..., allow_area_requests)` (gap 2): submit `True`, approve `False`. (c) The submit hours loop is unchanged (it iterates linked areas only). | `services/application.py` (around lines 104-145, 110-123, 390-430), `services/base.py:131-150` | The approval path in `review.py:355-362` must keep refusing zero areas. |
| B6 | **Read model.** Add `area_requests[]` to `PartnerApplicationSerializer`. Add `postal_codes[]` to `PartnerServiceAreaOptionSerializer`, with a prefetch so the list stays at 2 queries. | `serializers/onboarding.py`, `locations/serializers.py:107-111`, `selectors.py:50-54` | Additive only. |
| B7 | **Operations review read model.** Area chips with `name`, `zone` (null until 1b), `hours_set` and `offers_partner_trades` (false means the mismatch flag). Add `area_requests[]` with live status. Add the queue filter `area_pending=true`: SUBMITTED or UNDER_REVIEW, zero active links, at least one request that isn't dismissed. | `partners/serializers/` (review serializer), `selectors.py` (queue), `views/operations.py` | The mismatch check is "area enables none of the partner's active variants" (`ServiceAreaService`). |
| B8 | **Operations command: remove an area during review** ("Approve without Miyapur"). Deactivates the link **and** that area's availability rules, bumps the version, writes an audit record, and is idempotent. Refuses to remove the last area unless the application has a request. | `services/review.py`, `views/operations.py`, `urls.py` | Permission: the reviewer who claimed the application (same rule as decisions). |
| B9 | **Erasure** (gap 4): delete the user's `PartnerAreaRequest` rows in the erasure step. | `backend/apps/identity/account_deletion.py` (on `main`) | Add a test case to the existing account-deletion tests. |
| B10 | **Contract.** Regenerate `contracts/openapi/v1.yaml` with the published command, bump `SPECTACULAR_SETTINGS["VERSION"]` one minor, add a `CHANGELOG.md` entry, regenerate the TypeScript client. | `config/settings/base.py`, `contracts/openapi/*`, `frontend/packages/api-client/src/generated/schema.d.ts` | Never hand-edit generated files. |

**Backend tests to write** (the owner runs them; see §6):

- `backend/tests/partners/test_area_requests.py`:
  - saving, replacing and clearing PINs
  - the limit of 5, repeats, bad format, a non-SERVICES track
  - every live status (Waiting, Area full, Ready, Done, Not valid)
  - submit with only requests (accepted)
  - **approval with zero areas (refused)**
  - the unavailable-areas error details
  - the remove-area command (rules deactivated, audit written, last-area refusal)
  - the `area_pending` queue filter
  - query-count tests for the area list and the review read model
- Update `backend/tests/partners/test_application_api.py`: the old "submit needs an area" assertion becomes "needs an area or a request".
- Add an erasure case in the identity account-deletion tests.

### 2.2 Shared rules in `@vsolve/query` (workstream S, so web and phone can't drift)

| # | Task | File |
|---|---|---|
| S1 | New `partner-areas.ts`: `normalisePin`, `isValidPin` (6 digits, first 1–9), `matchPin(areas, pin)` → `{kind:"open", areas[]}` or `{kind:"unknown"}`, `MAX_REQUESTED_PINS = 5`, `canContinueStep3(ticked, pins)` | `frontend/packages/query/src/partner-areas.ts` |
| S2 | `partner-hours.ts`: `expandWeeklySet(rules, areaIds)`, `collapseToWeeklySet(rules)` returning `{rules, differed}` (for the "Saving uses these hours for all your areas" note), plus the same for exceptions | `frontend/packages/query/src/partner-hours.ts` |
| S3 | Shared readiness: "areas OR PINs", "hours only for ticked areas", "hours step skipped when zero ticked". The web and phone `model/readiness.ts` call it. This also closes the "unify readiness" item still open in the onboarding memory. | `frontend/packages/query/src/partner-readiness.ts` |
| S4 | Exports: `index.ts` and subpath exports. The phone gets them through `native.ts` (a Mobile-developer registration file, so coordinate that one line). | `frontend/packages/query/src/index.ts`, `package.json`, `native.ts` |

Tests: `partner-areas.test.ts`, `partner-readiness.test.ts`, plus new cases in `partner-hours.test.ts`.

### 2.3 Partner web (workstream W)

| # | Task | Files |
|---|---|---|
| W1 | Reference types carry `postal_codes`; the draft carries `requestedPostalCodes` and patches `requested_postal_codes` | `features/application/reference-queries.ts`, `model/draft.ts` |
| W2 | **Step 3 screen:** list as today, plus an always-visible **"My area is not listed"** that opens the PIN box. Typed PIN → `matchPin`: open areas are ticked and named (case B); otherwise a chip saying "Noted" (gap 1), replaced after save by the server status (Area full, Waiting, Ready with "Tick it" for case H). Chips can be removed; the limit is 5. With zero open areas, the PIN box takes the list's place (case F). The "Ask us from Help" line is removed. | `view/areas-step.tsx`, `app/apply/areas/page.tsx` |
| W3 | **Case G:** on `partner_service_areas_unavailable`, drop those IDs from the draft, show "X stopped taking new partners. We removed it.", and save again | `view/application-editor.tsx` (error handling around lines 89 and 265) |
| W4 | **Hours:** one weekly editor; save uses `expandWeeklySet` across all ticked areas, with exceptions copied; the "differed" note for older drafts; zero ticked areas shows "No hours needed yet" and Continue goes to Documents; re-PUT when areas were added (gap 8) | `view/schedule-step.tsx`, `view/availability-editor.tsx`, `model/schedule.ts`, `model/steps.ts`, `model/progress.ts` |
| W5 | **Agree and send:** list asked PINs with "No jobs there until we open it" | `view/review-step.tsx` |
| W6 | **Status after sending:** "In review. Waiting for your area to open." when there are zero ticked areas and at least one request | `model/status.ts` and the status view |
| W7 | Text: new keys in en, te and hi | `i18n/catalogs/apply.ts` |

Vitest files to write or extend:

- `areas-step.test.tsx` (new): cases A, B, D, E, F, the limit, and the server-status chips.
- `draft.test.ts`, `readiness.test.ts`, `schedule.test.ts`, `steps.test.ts`.
- `application-editor.test.tsx` (case G).
- `schedule-flow.test.tsx` (zero areas skips the step; adding an area re-saves hours).

### 2.4 Partner phone (workstream M, Mobile developer)

Mirror W1–W7 in `frontend/mobile/apps/partner/src/features/application/**`, using the shared rules from S1–S3:

- Move every hard-coded Step 3 string to the catalogs (T6), in en, te and hi.
- Port the matching Jest tests (`work-step.test.tsx` is the pattern to follow; add `areas-step.test.tsx`).
- The mobile agent may run the mobile Jest suites (AGENTS.md).

### 2.5 Operations console (workstream O)

| # | Task | Files |
|---|---|---|
| O1 | **Review screen (FLOW.md 3a):** the "Where they work" card with chips (zone, hours ✓); the mismatch flag with **Approve without X** (B8); the "Requested, not available" table with live status, "In our PIN list ✓ / ✗", and row actions (**Send back to add it** = the existing Request changes with the message filled in; **Link PIN to an area…** is disabled until 1b with a tooltip; **Mark not valid** is 1b); an "Area pending" banner; the Approve button disabled with the reason; the Approve label "Approve · N areas, M asked PINs stay open" | `features/partner-review/view/review-detail.tsx` (around line 437), `features/partner-review/queries.ts`, `model/decisions.ts` |
| O2 | **Queue:** an **Area pending** tab, and row tags (`Area pending · 509216`, `Ready · now in X`, `2 areas · 1 PIN asked`) | `features/partner-review/view/review-queue.tsx` |

Vitest: extend `decisions.test.ts`; add `review-detail.test.tsx` cases for the banner, the disabled
Approve, the mismatch and the request statuses; add a queue-tab test.

### 2.6 Phase 1a order

```
0.x ─► B1 ─► B2 ─► B3 ─► B4 ─► B5 ─► B6/B7 ─► B8 ─► B10 (contract + client)
                                                     │
              S1 ─► S2 ─► S3 ─► S4 ──────────────────┤
                                                     ├─► W1..W7 ─► web release
                                                     ├─► O1, O2 ─► console release
                                                     └─► M (phone) ─► store release
B9 (erasure) runs in parallel on main.
```

**Release order:** backend first (every change is additive, so current web and phone builds keep
working), then web and console, then the phone build. No feature flag is needed: older clients
never send `requested_postal_codes`, so their behaviour is unchanged.

---

## 3. Phase 1b: Operations tools (size L)

| # | Task | Notes |
|---|---|---|
| B11 | `ServiceArea.zone` (char, blank, default `""`) plus migration; exposed on area reads | Fills the `zone: null` from B7 |
| B12 | Management command `report_postal_code_overlaps` (read-only). If Q2 = yes: Operations cleans up, then a migration adds `unique(postal_code)` on `ServiceAreaPostalCode`. The migration **checks first** and fails with the list of overlapping PINs instead of a raw integrity error. | Needs 0.5 |
| B13 | **Operations Areas API:** list (PIN count, services on/total, partners, accepting, paused), create, update, add or remove PIN (conflict → `postal_code_in_other_area` with details `{postal_code, area_id, area_name}`), move PIN, accepting switch, service switches, **bulk preview and apply** (CSV `pin,area_slug,city,state`, gap 3; preview returns add / same / conflict / invalid / unknown-area / unknown-PIN; apply takes per-conflict Move or Skip). Every change is audited. | Operations permission. Apply is idempotent with the existing idempotency-key reader in `views/base.py`. |
| B14 | **Area requests API:** grouped by PIN, counts by the asking partners' **own** active trades, live status, and the filters Open / Ready / Done / Not valid plus trade. **Notify** sets `notified_at` on open requests for that PIN and sends to each partner, with wording by application state (FLOW.md §2). **Mark not valid** sets `dismissed_at` and `dismissed_by`. | Notification templates go in `apps/notifications/templates_registry.py` (area-opened-draft, area-ready-in-review, area-added-approved), sent through `_notify_application_event` (`services/base.py:152`). |
| B15 | **Command: add an area to an approved partner.** Checks the area is active and offers at least one of the partner's variants; creates the link; copies hours (gap 9); writes `PartnerScheduleChangeAudit`; notifies. | Q3 default |
| B16 | **Coverage lite (read only):** per area and per PIN (area → PINs → partners), counts by application status, trade and zone; open asked PINs; bookings and offer expiry over 28 days (`Quote`, `FulfilmentUnit`, `PartnerOffer`, `DispatchOffer`); CSV | Check query plans; areas number in the dozens, so no paging |
| O3 | Areas screen (FLOW.md 3d) with bulk upload | New `features/areas/**`, route, `nav-groups.ts` |
| O4 | Area requests screen (3c) with the open-area form and notify step | New `features/area-requests/**` |
| O5 | Coverage lite screen (3e) | New `features/coverage/**` |
| O6 | Turn on the 1b review actions: Link PIN (opens Areas with the PIN prefilled), Mark not valid, and "add area" on the partner record | `review-detail.tsx`, `partners/view/partner-record.tsx` |

Tests: one backend test module per API (`test_operations_areas.py`, `test_operations_area_requests.py`,
`test_partner_add_area.py`, `test_coverage_lite.py`, plus the overlap command and the guarded
migration), and Vitest per screen.

---

## 4. Phase 2 (size M, not planned in detail)

Targets per area and trade (`AreaSupplyTarget`) with vs-target bars and red/amber/green flags;
`UnservedDemandEvent` written from `check_serviceability` ([locations/services.py:113](../../backend/apps/locations/services.py#L113));
weekly coverage snapshots for the trend; the recruitment push; target fields on the Areas and
Requests screens.

---

## 5. Risks and how the plan handles them

| Risk | Handling |
|---|---|
| Zero-area applications approved by accident | Gap 2 split, plus an explicit approval test |
| Older phone builds break | Every contract change is additive; full areas stay off the partner list (gap 1) |
| Hours out of step when areas change | Shared `expandWeeklySet`, re-save on area add (gap 8), and the server submit check unchanged |
| Unique-PIN migration fails in production | Overlap report first (0.5, B12); the migration checks first with a readable error |
| Request rows kept after erasure | B9 |
| Web and phone drift | Rules live in `@vsolve/query` (S1–S3); the same test cases on both |
| Ownership conflict in the shared tree | 0.2 and 0.3 confirmed before work starts; stage explicit paths only (never `git add -A`, per AGENTS.md) |

---

## 6. Checks and who runs them

Per AGENTS.md (owner-run tests):

- **Agents run:** `backend\scripts\quality-static.cmd` (ruff, strict mypy,
  `makemigrations --check`, `spectacular --validate`, contract drift), and in `frontend`:
  `pnpm lint`, `pnpm typecheck`, `pnpm build`. The Mobile developer's agent may also run the
  mobile Jest suites.
- **The owner runs:** every pytest and Vitest file listed above, for example:

  ```powershell
  # backend
  .\.venv\Scripts\python.exe -m pytest tests/partners/test_area_requests.py tests/partners/test_application_api.py
  # frontend
  pnpm --filter @vsolve/query test -- partner-areas partner-readiness partner-hours
  pnpm --filter partner test -- areas-step schedule-flow application-editor
  pnpm --filter admin test -- partner-review
  ```

- Each work package is reported as "built, owner verification pending", with its test files listed.

---

## 7. Effort summary

| Phase | Packages | Size |
|---|---|---|
| 0 | Decisions, branch from `main`, overlap query, proposal 0030 | S |
| 1a | B1–B10, S1–S4, W1–W7, M, O1–O2 | M |
| 1b | B11–B16, O3–O6 | L |
| 2 | Targets, turned-away demand, trend, recruitment push | M |

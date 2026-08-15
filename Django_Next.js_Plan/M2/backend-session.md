# Session C — Backend (Django domain, HTTP surface and contract)

**Application:** `backend/**` + `contracts/openapi/v1.yaml`
**Task detail:** [02-backend-tasks.md](02-backend-tasks.md) · **Master board:** [task.md](task.md)
**Paired sessions:** [frontend-session-a.md](frontend-session-a.md) (Customer),
[frontend-session-b.md](frontend-session-b.md) (Partner + Operations). Do not edit `frontend/**`.

> **Wave C1 shipped on 12 August 2026.** Contract **1.22.0 publishes 33 M2 paths**, the 17 from C0
> plus 16 new ones: attachments, site-visit scheduling and completion, and the whole proposal 0013
> registration surface. The four sweeps that had no schedule now have one. Object-level authorization
> tests exist for every published path — **written, not run**, per the verification convention.
> **Start at "Wave C1 remainder"**, which is the capability and matching completeness list; then C2.
>
> **Revision 3 landed on 12 August 2026 (ADR-0008), before any C2 code existed.** A5 is visit-first:
> the unlock is A3-only, the A5 front door is the tiered `VisitPlan` charged at the first confirmed
> visit slot, visit slots book against `carts.availability`, and A5 estimates are submitted on site
> against a `COMPLETED` visit. Wave C2 below is rewritten accordingly; nothing already built changes,
> except that `M2-BE-215` (`choose_visit_plan`) joins the requirement surface when C2 starts.
>
> **Revision 4 landed on 13 August 2026 (ADR-0009), after C2, C3 and C3.5 shipped.** A3 is
> rate-card-first: the primary front door is a published `RateCard`, the A1 offer cascade in
> `apps.assignments` and a `BookingFee` charged at vendor accept; wages stay direct, daily and P2P.
> **Nothing C2 built changes** — the unlock surface at 1.24.0 is demoted to the thin-supply
> fallback, untouched, and whether the fallback still charges the unlock is owner decision 14. The
> rate-card work is new build, carried as wave **C2R** below; read
> `07-state-machines-and-permissions.md` §1, §2, §4c, §6 and §8 before starting it.

## Kickoff prompt for this session

> You are Session C on M2 — the Django backend. Read
> `Django_Next.js_Plan/M2/backend-session.md` first, then `02-backend-tasks.md` for task detail and
> `07-state-machines-and-permissions.md` as the authority for states, commands, permissions and error
> codes. Your column is `backend/**` and `contracts/openapi/v1.yaml`; never touch `frontend/**`.
>
> **Waves C0 and C1 have landed.** Contract **1.22.0 publishes 33 M2 paths** over the domain layer
> in `apps/partners/{capabilities,capability_options,gates}.py` and
> `apps/requirements/{services,matching,proposals,attachments,sla,tasks}.py`. Read the "C0 outcome"
> and "C1 outcome" sections below before touching any of it.
>
> **Start at "Wave C1 remainder".** Everything C0 left open is closed: authorization tests exist for
> every path (written, owner-unverified), the four sweeps are on Celery beat, `schedule_site_visit`
> and `complete_site_visit` have routes, attachment upload is built, and proposal 0013 is answered and
> implemented. **CI was raised with the owner and deliberately deferred** — the repository has no
> pipeline of any kind, so standing one up is M1 platform work and not M2's budget. What remains in C1
> is capability and matching completeness, and the highest-priority item there is `M2-BE-317`: the
> wage-floor guard is documented on `POST /proposals/` and cannot currently fire.
>
> Copy the existing M1 HTTP conventions exactly — `apps/partners/{views,serializers,urls}.py` and
> `apps/carts/` are the reference. Thin views, business invariants stay in domain services,
> `execute_idempotent` for every retryable write, `PartnerDomainError` shape for errors, integer paise
> for money, object-level authorization on every read. Do not invent a second convention.
>
> **Do not run tests. Any tests. Ever.** Not the suite, not a focused module, not one test case. You
> write the tests; the owner runs them. See [task.md](task.md) §"Verification convention" — this is a
> standing instruction, not a preference to weigh.
>
> After each wave run **`.\scripts\quality-static.cmd`** from `backend/`. It is every gate in
> `quality.cmd` except pytest: ruff format, ruff check, strict mypy, `makemigrations --check`,
> `spectacular --validate` and the committed-contract drift comparison. **Do not run
> `.\scripts\quality.cmd`** — pytest is its fourth step and it exits on failure, so running it both
> breaks the no-tests rule and, on any red test, silently skips the four checks you actually need.
> Bump the contract version and add a `contracts/CHANGELOG.md` entry in the same change. Report every
> wave as `[~] built — owner verification pending`, and end your report with the exact test files you
> wrote and the exact commands the owner should run to verify them.
>
> Mark tasks in `02-backend-tasks.md` and this file as you go. `[x]` requires the phase's own
> completion standard — object-level authorization tests plus a published contract path — not a
> passing unit test alone. Commit once at the wave gate, never per task. Never push to `main`.

## Standing constraints

- **Owned paths:** `backend/**`, `contracts/openapi/v1.yaml`, `contracts/CHANGELOG.md`,
  `docs/adr/**`, `docs/runbooks/**`, this file, and your own task ID lines in `02-backend-tasks.md`.
- **Never touch:** `frontend/**`, `contracts/proposals/**` (read them; reply inside the proposal's
  own review section only), the two frontend session files.
- **Reuse before building.** `02-backend-tasks.md` §"Reuse before building" lists 20 M1 modules M2
  must call rather than re-implement. Three were nearly rebuilt during P2 — the business-hours
  calendar, the versioned question schema and the storage adapter. Check that table before adding a
  module.
- **No M2 exit gate may depend on a live payment provider.** `milestones.md` defers payments and OTP
  to M3; M2 proves them with provider test callbacks and the non-OTP fallback.
- **Fail closed on unset policy.** Twelve owner decisions in `task.md` P0 are open. Read every blocked
  value from configuration and raise when unset. Never encode a guess as a default.
- **Never run a test.** Write them; the owner runs them. `.\scripts\quality-static.cmd` is your gate,
  `.\scripts\quality.cmd` is the owner's. See [task.md](task.md) §"Verification convention".

---

## Wave C0 — Publish the contract (`M2-BE-013`) — **`[~]` shipped 11 August 2026**

**Depends on:** nothing. **Blocked:** every remaining task in all three sessions — now unblocked for
the 17 published paths.
**Gate:** `contracts/openapi/v1.yaml` carries validated M2 paths, the frontend can generate a typed
client, and `apps/customer/features/requirement/contract-pending/boundary.test.ts` can drop its
unpublished-route guard for the paths you shipped. **Gate open** — no authorization test exists, and
the Customer-side guard has not been updated (the Partner-side one has).

The domain commands below already exist and are tested. C0 wraps them; it does not rewrite them.
Checkboxes reflect the codebase as audited on 2026-08-12; the full account is in "C0 outcome" below.

### C0.1 Partner workspace read model

- [x] Expose `capabilities.workspace_grants(partner)` as `GET /api/v1/partner/workspaces/`, returning
  `{workspace_key, actions[]}` only. No routes, no labels, no icons — the frontend registry owns those.
  Unknown archetypes stay omitted, as the domain function already does. (`M2-BE-114` HTTP half.)
  Live, and consumed by `partner-shell.tsx` since 12 August.
- [~] Object-level authorization: `IsPartnerUser`, scoped to the caller's own `PartnerProfile`.
  Implemented in the view; **no test proves it**.

### C0.2 Customer requirement surface

- [x] `POST /api/v1/requirements/` → `services.create_draft`; `PATCH .../{id}/` → `services.update_draft`.
- [x] `POST .../{id}/submit/` → `services.submit_requirement`, idempotency-keyed. Returns the
  plain-language lifecycle sentence and `missingRequiredAnswers`, both derived from the submitted
  answer set — the frontend reducer invalidates its cached verdict on every answer edit and re-reads
  these two fields, so they must be a function of the request, never of prior state.
- [x] `GET .../{id}/` → requirement detail with matching status, `service_by`, SLA deadline.
- [x] `GET /api/v1/requirements/` → the `My requests` list (`M2-FE-213` depends on it).
- [x] Duplicate detection surfaced from `services.find_probable_duplicate` on draft create, with the
  explicit override the domain already supports. Published as `GET /requirements/duplicate-check/`.
- [x] **Nothing in this surface may accept a payment, quote a price, or imply one is coming.** The
  requirement is free; the frontend review screen reads `isFree` from the server and says nothing
  about price until it can.

### C0.3 Attachment upload (`M2-BE-202` — the one genuine C0 gap) — **built in C1**

- [~] Presigned upload + finalize commands using the **existing M1 storage adapter**
  (`apps.foundation.storage` through the new `apps/requirements/storage.py` bucket entry point), not a
  new one. Image, video, audio, document, voice note, each with its own media-type allow-list and its
  own size ceiling. Built 12 August; owner verification pending.
- [~] Scan status on the attachment record. `INFECTED` added to
  `RequirementAttachment.ProcessingStatus`, and `scan_failure_reason` published so the Customer is
  told which file and why. `record_attachment_scan_result` is idempotent per verdict and refuses a
  contradictory one.
- [ ] Access expires with the invitation for non-selected vendors (`M2-BE-310`). **Still open** — and
  it is now the only attachment gap. The snapshot does not copy attachments either, which is the same
  decision: what does a vendor see when a file is added or scanned *after* their invitation.

### C0.4 Teaser, unlock and selection reads

- [x] `GET /api/v1/requirements/{id}/quotes/teasers/` → `proposals.teasers_for`. **Verification badge,
  rating, vendor type and price band only.** No vendor identity, no contact, no full scope, no line
  items — not in a field the UI happens not to render. A client cannot un-receive a payload.
- [~] The unlock and unlocked-quote reads are shaped in proposal 0012 but their domain layer is BE4.
  Publish the read paths that exist today; leave the write paths to Wave C2 rather than stubbing them.
  Done as scoped: the teaser read is live, the unlock and selection paths are absent by design.

### C0.5 Partner enquiry and proposal surface

- [x] Invitation list/detail, `accept`, `decline` (with reason) → `matching.accept_invitation`,
  `decline_invitation`. Accept takes the soft capacity hold the domain already implements.
- [x] `POST /api/v1/proposals/` → `proposals.submit_proposal`, append-only supersession preserved.
  A3 and A5 shapes validated separately, as the domain does. Read and withdraw also published.
- [~] Structured Q&A → `ask_question` / `answer_question`. Site visits → `request_site_visit`,
  `schedule_site_visit`, `complete_site_visit`.
  Q&A and `request_site_visit` published. **`schedule_site_visit` and `complete_site_visit` have no
  route** — a requested visit currently cannot be scheduled or closed over HTTP. C1.
- [x] Business-hours deadlines from `requirements/sla.py` presented as server-owned truth; the
  frontend renders countdowns as guidance only.

### C0.6 Contract publication

- [x] Answer the open question in proposal 0012 on 202 refusals, in that file's review section.
  Refusals are always `>=400`; `m2_unlock_payment_pending` becomes `409` retryable; `202` is reserved
  for genuine acceptance carrying a projection.
- [x] Regenerate and validate `contracts/openapi/v1.yaml`; bump from 1.20.0; add a CHANGELOG entry.
  Published at **1.21.0** with zero schema warnings after naming eight M2 enums.
- [~] Add contract validation to CI so a drifting schema fails the build.
  **Raised with the owner on 12 August and deliberately deferred out of M2.** Confirmed again: no
  `.github/`, no `.gitlab-ci.yml`, no pipeline config of any kind. The real scope is a Postgres
  service, Python and pnpm toolchains, migrations, and a POSIX equivalent of `quality.ps1` — M1-wide
  infrastructure serving every column, not an M2 deliverable. **Owner decision: log it as an M1
  platform task and do not build it in M2.** Nothing else in C1 or C2 depends on it; the drift check
  runs locally in `scripts/quality-static.ps1` and has caught real bugs there.
- [x] Publish the 29 `m2_*` error codes from `07-state-machines-and-permissions.md`. The frontend
  error table in `packages/api-client/src/errors.ts` is already written against these exact strings —
  a renamed code silently degrades every M2 error to the generic fallback.
- [x] Tell both frontend sessions which paths went live, in `frontend-execution-plan.md` §7.

**Evidence to record:** the contract diff, the generated client building clean in the frontend, one
object-level authorization test per endpoint, and a teaser payload dump proving no identity leak.
**Recorded so far:** the contract diff and the clean client build. **The authorization tests and the
teaser payload dump were never produced** — they are the first two C1 items.

### C0 outcome — 11 August 2026

**Built.** Four new files in `apps/requirements` — `selectors.py`, `serializers.py`, `views.py`,
`urls.py` — plus the `config/urls.py` include and eight `ENUM_NAME_OVERRIDES` entries. **17 paths
published at contract 1.21.0.** No domain module was edited: every state change delegates to a
command that already existed, which is what made this a thin layer rather than a rewrite.

| Group | Paths |
|---|---|
| Customer requirement | list, create, read, patch, submit, duplicate-check, timeline |
| Teasers | `GET /requirements/{id}/quotes/teasers/` |
| Clarification | Customer answer, Partner ask |
| Partner enquiries | list, read, accept, decline, site-visit request |
| Proposals | submit, read, withdraw |
| Workspaces | `GET /partner/workspaces/` |

Three decisions worth carrying forward:

1. **`selectors.py` is a projection layer, not a second domain.** `missing_answer_codes` reads the
   same `required` flag `validate_scope` reads and stops there — it deliberately does not re-check
   types, minimums or unknown codes, because those are refusals the submit command owns and a
   duplicate would drift. The contract needs a *list* of outstanding codes; `validate_scope` raises
   on the first, which is right for a command and useless for a form.
2. **`lifecycle_explanation` lives in the read model, not the domain.** It is presentation — the
   sentence the Customer reads instead of `A3_TIME_BLOCK`. Putting it in `services.py` would have
   been the new domain logic C0 was told not to write.
3. **The `202` question is answered** in proposal 0012: `m2_unlock_payment_pending` becomes `409`
   retryable, and `202` is reserved for genuine acceptance carrying a projection, never an error
   body. `POST /requirements/{id}/submit/` is the reference case — it really did start matching.

**Verified.** `ruff format --check` and `ruff check` clean; **strict MyPy clean across 13 source
files**; `makemigrations --check` reports no changes; `spectacular --validate` generates with
**zero warnings**; `pnpm contract:generate` produces types at 1.21.0 and `contract:check` confirms
they are in sync; **7 of 8 frontend packages typecheck green**.

**Not done, and why C0 is `[~]` rather than `[x]`:**

- **No tests.** The completion standard requires an object-level authorization test per endpoint
  and role. Not written, so nothing here is proven beyond compiling. This is the single largest gap
  and the first thing C1 should close.
- **`apps/partner` typecheck fails** — pre-existing, unrelated: `features/capability/adapters/express-path.ts`
  passes an `ExpressStep` where `isStepComplete` wants an `ExpressStepKey` at lines 137, 147 and
  200 (`step` should be `step.key`). Untracked Session B work, not touched. Logged in the execution
  plan §7.
- **Attachments (`M2-BE-202`) deferred to C1.** The presign/finalize command is genuinely new
  domain logic, which C0 was scoped to avoid. The model exists; `RequirementAttachmentSerializer`
  publishes it read-only, so the field is in the contract and the upload path is the only gap.
- **Unlock, selection, rejection and re-validation are absent by design** — BE4 has no domain layer
  to wrap. They are named in the CHANGELOG so their absence is documented rather than discovered.

**Three shape mismatches for the frontend adapters** — all one-line maps, none needing a contract
change. Published truthfully rather than bent to fit the client's guess:

| Frontend expected | Server publishes | Why |
|---|---|---|
| `is_date_flexible: boolean` | `flexibility_days: int` **and** `is_date_flexible` | The integer is the model's truth; the boolean is published alongside so two apps cannot disagree about what zero days means. |
| `AttachmentKind: "PHOTO"` | `"IMAGE"` | The model's value. Renaming a stored enum for a client label is the wrong direction. |
| `ScanStatus: PENDING\|CLEAN\|INFECTED\|FAILED` | `PENDING\|VERIFIED\|FAILED` | `RequirementAttachment.ProcessingStatus` has no `INFECTED`. Adding it is part of the C1 attachment work, not a serializer rename. |

---

## Wave C1 — Close the P1/P2/P3 gaps — **`[~]` the named six shipped 12 August 2026**

**Depends on:** C0. Runs while the frontend integrates against the new contract.

### The six things C0 left open — all closed

- [~] **Object-level authorization tests for every published path**, per endpoint and per role.
  Written 12 August in `tests/requirements/test_m2_http_authorization.py`: a 38-row route table
  covering all 33 paths against an anonymous caller, a parametrised foreign-Customer sweep over every
  requirement-scoped route, a foreign-vendor sweep over every enquiry-scoped route, and the
  Customer-session-on-a-Partner-route refusal for all 24 `partner/**` operations. The two weighted
  cases are covered as asked: another Customer's requirement answers `404` with
  `m2_requirement_not_found`, and the teaser, demand preview and crew roster are asserted by
  **exhaustive key comparison** (`frozenset(body) == KEYS`) so a field added later fails the test
  rather than leaking, backed by a second test that greps the serialized body for the vendor's name,
  phone and exact total. **Not run** — owner verification pending.
- [~] **Contract validation in CI.** Raised with the owner; **deferred out of M2 as M1 platform
  work.** See C0.6 above for the decision and the reasoning.
- [~] **`schedule_site_visit` and `complete_site_visit` now have routes.**
  `POST /api/v1/site-visits/{id}/schedule/` resolves by *participation* — either party may move a
  visit — and `complete/` is Partner-only, because completion is a report of what happened and the
  party that travelled is the one who can make it.
- [~] **Attachment upload (`M2-BE-202`)** built. See C0.3 above.
- [~] **Proposal 0013** answered and implemented. Both design questions resolved in that file's
  §Answered: Operations' refusal is now its own `REJECTED` status (an `actor_kind` was rejected
  because `PartnerCapabilityTransition.actor` is null for both a Partner action and a system job), and
  document validity lives on a nullable `PartnerDocument.expires_on`. Thirteen paths published.
- [~] **All four sweeps are on Celery beat**, in `apps/requirements/tasks.py` with five
  `CELERY_BEAT_SCHEDULE` entries. Cadences differ on purpose: 15 minutes for `service_by` expiry,
  5 for SLA breach and proposal validity, **2 for invitation expiry** because that is the sweep the
  delivery promise depends on, and hourly for attachment-upload housekeeping.

### Scheduling — closed, and the idempotency is where the care went

- [~] `services.expired_requirement_ids` → auto-close on `service_by` (`M2-BE-210`).
- [~] `services.sla_breached_requirement_ids` → SLA breach signal (`M2-BE-212`). The Customer
  *notification* is still unwired — MSG91 is pending under `M2-BE-807`, and calling a fail-closed
  transport would turn a missed promise into a retry storm.
- [~] `matching.expired_invitation_ids` → expire, release the slot, invite a replacement (`M2-BE-308`).
- [~] `proposals.expired_proposal_ids` → expire proposals. `expire_proposal` was genuinely missing and
  is new; the selector had nothing to call.
- [~] Every sweep idempotent under overlapping runs; **a replay must not double-invite.** The
  mechanism is worth knowing: a system job has no actor, so `execute_idempotent` does not apply.
  `matching.expire_invitation_and_replace` instead locks the *requirement* first, then the invitation,
  and invites a replacement **only when this call is the one that moved the invitation out of
  `INVITED`/`ACCEPTED`**. Two overlapping sweeps serialise on the requirement and the second invites
  nobody. Parent-then-child lock ordering is deliberate: `invite_wave` locks the requirement and
  `accept_invitation` locks the invitation, so that is the only order that cannot invert against
  either.

## Wave C1 remainder — capability and matching completeness — **`[~]` shipped 13 August 2026**

Contract **1.23.0**. Full account in §"C1 remainder outcome" below.

- [~] `M2-BE-102` / `M2-BE-107` service-area scoping on the capability, plus crew availability.
  `PartnerCapability.service_areas` (M2M, empty = every area the Partner serves, can only subtract
  from `PartnerServiceArea`) and `CrewAvailabilityException` (dated, membership-scoped), both read
  by their guards.
- [~] `M2-BE-115` `assert_capability_active` now takes an optional `service_area` and `on_day` and
  checks coverage and the Partner's own published calendar. **Insurance is still not enforced** —
  owner decision 6, and `requires_insurance` currently holds a default nobody approved, so enforcing
  it would refuse real vendors on a rule the owner has not set.
- [~] `M2-BE-301` travel feasibility and language in eligibility. Vendor language is now captured
  (`PartnerLanguage`, `GET`/`PUT /partner/languages/`); travel feasibility reuses the M1 commit
  window and travel estimate against the requested start.
- [~] `M2-BE-303` real ranking signals: prior relationship, distance band, least-recent invitation,
  stable tie-break. `MATCHING_POLICY_VERSION` is now 2.
- [~] `M2-BE-306` the capacity hold consults `carts.availability`. Both at wave time and at
  acceptance, where it raises `m2_capacity_unavailable`.
- [~] `M2-BE-317` state and skill are derived from the requirement and refused when unmapped.
  **The defect is closed**: `POST /api/v1/proposals/` can now return
  `m2_proposal_below_wage_floor`, and returns `m2_wage_floor_unavailable` rather than skipping.
- [~] `M2-BE-110` `submit_capability_for_review` + `POST /partner/capabilities/{id}/submit/`. The
  resubmit-after-correction path that had no route.
- [~] `M2-BE-310` attachment access expires with the invitation, and **`RequirementSnapshot` does
  not copy attachments** — the coupled decision, with its reasoning, is below.
- [ ] Crew archive refusing on a future assignment (proposal 0013 criterion 9). **Not buildable until
  C4** — assignment is per stage and `M2-BE-522` has no model yet, so a guard now would be a check
  that always passes. Confirmed still blocked.
- [ ] A per-variant `requires_insurance` override (proposal 0013 criterion 12). The value is
  server-authored and never client-derived, which is the half that matters; no variant can be
  configured to `False` on an A3 archetype, which needs owner decision 6 first. Confirmed still
  blocked.
- [~] `M2-BE-106` category-specific registration answers on the **versioned question schema** M1
  already has: `M2VariantConfiguration.registration_question_schema` validated through
  `carts.item_inputs.validate_scope`, stored on `PartnerCapability.registration_answers`.

### Deferred by dependency, not by choice

- [ ] `M2-BE-321` price-band review signal — needs a reference price per variant.
- [ ] `M2-BE-312` masked callback requests and consented contact disclosure.
- [ ] `M2-BE-117` audit queries and Operations visibility for capability decisions.
- [~] `M2-BE-113` suspension routing funded engagements to replacement or refund. ~~Blocked until C3
  creates the engagement aggregate.~~ **Built in C3, 13 August**, once the stage money existed to
  route: an unstarted funded stage refunds, a stage in progress or awaiting review is flagged for
  replacement, and approved or released work stays settled.

**Gate:** every P1–P3 exit-gate sentence in `task.md` is true end to end, not just in the domain layer.

---

### C1 outcome — 12 August 2026

**Built.** Sixteen new paths at contract **1.22.0**, four new backend modules
(`apps/requirements/{attachments,storage,tasks}.py`, `apps/partners/{gates,capability_options}.py`),
three migrations (`partners.0007`, `partners.0008`, `requirements.0004`) and five
`CELERY_BEAT_SCHEDULE` entries. Five test files written and not run.

Six decisions worth carrying forward:

1. **`REJECTED` is a state, not a derived field.** Proposal 0013 preferred publishing
   `last_transition.actor_kind` and leaving both causes on `WITHDRAWN`. That was rejected on a fact
   the proposal could not have known: `PartnerCapabilityTransition.actor` is null both for a
   Partner's own action and for a system-driven withdrawal, so an `actor_kind` computed from it would
   confidently mislabel exactly the case the client needs right. `last_transition` is published
   anyway, minus `actor_kind`, because it dates the decision.
2. **A nullable `expires_on` is the answer to document validity, not an omission.** Enforcement reuses
   `settings.PARTNER_REQUIRED_DOCUMENT_KINDS` and `m2_capability_not_approved` rather than adding a
   policy knob and an error code, because a required document that has expired is objectively expired
   and `07-state-machines-and-permissions.md` §8 is the authority on codes.
3. **List reads answer an account with no `PartnerProfile`; record reads do not.**
   `/partner/{workspaces,capabilities,crew,gates}/` return empty rather than `404`, because a `404` on
   the registration flow's own reads is a gate and proposal 0013's first constraint is that no gate
   stands before browsing demand. `/business-profile/` and `/insurance/` still `404`, because an
   account with no profile genuinely has neither.
4. **The demand-preview id is a keyed hash and not a UUID.** "No endpoint accepts a requirement id
   today" is not a property that survives the next endpoint; "the id is not one" is — the path
   converters refuse it before a view runs.
5. **`INFECTED` and `FAILED` are separate because their recoveries are.** One offers a retry and the
   other must not.
6. **Sweep idempotency is structural, not keyed.** See the Wave C1 scheduling notes above: the
   requirement lock plus a state check inside the same transaction is what makes a Celery re-drive
   safe, and `execute_idempotent` does not apply to an actor-less system job.

**Verified.** `ruff format --check` and `ruff check` clean across 338 files; **strict MyPy clean
across 218 source files**; `makemigrations --check` reports no changes; `spectacular --validate`
generates with **zero warnings** after naming three more enums; `manage.py check` clean; every new
module byte-compiles.

**Not done, and why C1 is `[~]` rather than `[x]`:**

- **No test was executed.** Five files were written to the full standard and left unrun, per
  `task.md` §"Verification convention". Nothing here is proven against a real request until the owner
  runs them, and the rows are in the owner verification queue.
- **The capability and matching completeness list is untouched.** `M2-BE-317` is the item that matters
  most, and it is a live defect rather than a missing feature: `POST /proposals/` documents a
  wage-floor refusal it cannot currently make.
- **CI does not exist**, by owner decision, and is now recorded as M1 platform work.
- **`M2-BE-310`** — attachment access expiring with a non-selected vendor's invitation — is the one
  attachment gap left, and it is coupled to whether `RequirementSnapshot` copies attachments at all.

---

### C1 remainder outcome — 13 August 2026

**Built.** Contract **1.23.0**: two schema corrections, four new paths, several additive fields.
Three migrations (`catalog.0007`, `locations.0003`, `partners.0009`). No new module — every change
extends one that existed, which is what kept this a completeness wave rather than a second design.

#### The two defects

**`M2-BE-317` — the wage-floor guard now fires.** `submit_proposal` no longer takes
`wage_floor_skill` or `wage_floor_state_code`; it derives both:

| Input | Derived from | Why not the obvious alternative |
|---|---|---|
| Skill | `catalog.M2VariantConfiguration.wage_floor_skill` (nullable FK to `partners.Skill`) | `ServiceVariant.required_skill_code` already exists and was rejected: it is the **dispatch trade slug**, matched against `PartnerSkill` to decide who can be sent. Reusing it would tie a statutory wage classification to a merchandising decision, so a catalog re-slug would silently move a legal floor. |
| State | `locations.ServiceArea.state_code` (new, blank) | `Address.state` holds a free-text *name* ("Telangana"); `MinimumWageFloor.state_code` holds whatever code Operations loaded. Mapping one to the other would be a policy table living in code. The area is Operations-owned reference data; an address is Customer-entered text. |

Both nullable/blank, both fail closed with `m2_wage_floor_unavailable`. **This blocks A3 quoting
until Operations maps a skill, sets a state code and loads a floor** — which is the point. The old
behaviour was to skip the check, and a guard that silently does nothing is indistinguishable from
one that passed. `partners.assert_rate_meets_wage_floor` keeps its explicit-inputs signature for
anything that genuinely needs to name a state and a skill; the HTTP path cannot reach it.

One documentation error fixed alongside: the operation listed `m2_wage_floor_unavailable` under
`400`, and `WageFloorUnsetError` has always been a `409`.

**Defect B — the list envelope.** `m2_requirement_list` and `m2_partner_enquiry_list` declared bare
arrays and returned DRF page envelopes. Both now declare `RequirementSummaryPage` /
`EnquirySummaryPage` (the `BookingGroupPage` shape), use `StrictCursorPagination`, publish the
`cursor` parameter and call `reject_invalid_cursor_query` first. The frontend's compensating
narrowings (`packages/query/src/m2-requirement.ts › readRequirementList`,
`apps/partner/features/enquiry/queries.ts › readEnquiryPage`) can be deleted by their own columns —
not touched here. This also closes Session B's "cannot be paged" gap: no cursor parameter was
published, so a Partner with more than twenty enquiries saw a silently truncated inbox.

#### Six decisions worth carrying forward

1. **The snapshot does not copy attachments, and that is what makes expiry implementable.** A copied
   set would be a second grant of the file surviving the invitation it came from; "access expires
   with the invitation" cannot hold against a frozen copy without also expiring the copy, at which
   point the copy was never the grant. It also answers the open question about a file scanned *after*
   an invitation: a vendor sees the requirement's currently-`VERIFIED` attachments, so a photograph
   that passed its scan an hour later becomes visible and an `INFECTED` one never does. Nothing a
   vendor quoted against changes underneath them, because attachments cannot be added after `DRAFT`.
2. **Expired access is a state on a `200`, not an error code.** `has_access: false`. The vendor still
   owns their enquiry record, so refusing it would refuse them their own row; and it keeps M2 inside
   the error vocabulary §8 fixes instead of adding a code the frontend's error table would render as
   an unrecognised string.
3. **An undeclared language is not a mismatch.** `LANGUAGE_MISMATCH` fires only on a declaration that
   contradicts the requirement. The mirror of C1's `expires_on` rule — absence of a declaration is
   not staleness — and without it every Partner registered before the field existed would vanish
   from every pool on the day it shipped.
4. **An unknown distance is scored at the pool's median band, not last.** Sorting unknowns to the
   back would hand every M2 enquiry to whichever vendors happen to run the technician app; sorting
   them first would make deleting a location fix a ranking strategy. Treating them as typical does
   neither. Recorded per candidate as `distance_band_km: null` plus the band actually used.
5. **`partner_unavailable_on` is deliberately weaker than `partner_available_during`.** M1's rule
   ("an empty schedule means unavailable") is right for the A1 slot grid, where a Customer picks a
   half-hour. It is wrong for a day-block archetype whose vendors publish no hourly calendar, and
   applying it would have excluded every existing vendor. A dated exception is a refusal; a weekday
   no rule covers is a refusal **only when the Partner has published rules for that area at all**.
6. **`submit_capability_for_review` is not `transition_capability`.** That command stamps
   `reviewed_by`/`reviewed_at` from its actor, which would record the Partner as the reviewer of
   their own capability — in the audit trail that exists to prove who decided what.

#### Verified

`.\scripts\quality-static.cmd`: ruff format and ruff check clean across 338 files, **strict MyPy
clean across 218 source files**, `makemigrations --check` no changes, `spectacular --validate` with
**zero warnings and no new `ENUM_NAME_OVERRIDES` needed** (the new fields are FKs, JSON and free
text, not choice sets), committed-contract drift check clean. `manage.py check` clean.

#### Not done, and why

- **No test was written or run**, per the build-first amendment. Recorded as one line of deferred
  debt for this wave, not as individual rows.
- **Two existing test fixtures were corrected**, and this is worth knowing before the owner's run:
  `tests/requirements/conftest.py` and `tests/requirements/test_matching_and_proposals.py` now set
  `wage_floor_skill` on the variant configuration, `state_code` on the service area, and a baseline
  `MinimumWageFloor`. Without that every A3 `submit_proposal` in those files would refuse with
  `m2_wage_floor_unavailable` — which is the new behaviour landing, not a regression. The
  wage-floor test dropped its two removed kwargs and now supersedes the baseline with a newer
  effective-dated row, which is how Operations actually raises a floor.
- **Insurance enforcement** stays out of `assert_capability_active` — owner decision 6.
- **Crew archive on a future assignment** and the **per-variant `requires_insurance` override** are
  confirmed still blocked, on C4's assignment model and owner decision 6 respectively.
- **`M2-BE-321`** (price-band signal), **`M2-BE-113`** (suspension routing funded engagements) and
  **contract validation in CI** are unchanged and unattempted, for the reasons already recorded.
- **`evaluate_candidates` is still N+1 per candidate** on capability, service area, languages and
  roster size. The new filters were batched (reservations, distance, prior partners, last-invited);
  the pre-existing per-candidate queries were left alone rather than folded into an unrelated
  refactor. Worth a pass before a real city's pool is loaded.

---

## Wave C2 — Access (A3 unlock · A5 visit plan), selection, reconfirmation, engagement (`BE4`) — **`[~]` shipped 13 August 2026**

Contract **1.24.0**, 14 new paths and 19 new operations. Full account in §"C2 outcome" below.

**Depends on:** C1. Frontend Wave A2 integrates against this. **Revision 3 (ADR-0008) reshaped this
wave before anything in it was built** — read `07-state-machines-and-permissions.md` §1, §4, §4a and
§4b first; the A5 front door is now the visit plan, and the unlock is A3-only.

**Revision 4 (ADR-0009, 2026-08-13 — after this wave shipped):** the A3 unlock surface built here is
demoted to the thin-supply fallback, untouched; the primary A3 front door is Wave **C2R**'s
rate-card build below.

`M2-BE-215`, `M2-BE-401..428`. The commercially load-bearing wave:

A3 unlock (unchanged from revision 2):

- [~] Server-priced unlock in paise with effective dates (`401`, `402`); offered **only when a usable
  quote exists** — `proposals.classify_usability` already decides this.
- [~] One successful payment grants exactly one unlock under duplicate webhooks, browser close and
  retry (`403`, `404`, `405`). Reuse the M1 payment and ledger infrastructure with a distinct money
  purpose; do not build a second payment path.
- [~] Non-responsive rejection releases the slot and invites a replacement at no extra charge (`406`).

A5 visit plan (revision 3):

- [~] `choose_visit_plan` on the requirement (`215`): A5 only, server-priced tiers, charges nothing,
  bounds the wave. `m2_visit_plan_required` on an A5 submit without one.
- [~] `VisitPlan` + per-slot shares in integer paise, remainder on the first share (`419`, `420`).
- [~] `confirm_visit_slot` books against **`carts.availability`** — the grid the A1 flow reads, so a
  visit and an A1 booking cannot double-book (`421`). First held slot opens the plan checkout.
- [~] Plan checkout + verified webhook charge exactly one plan; the held slot hardens to `SCHEDULED`
  only on the callback; later slots book free (`422`). Same M1 payment abstractions, new purpose.
- [~] Visit arrival on the non-OTP fallback (`423`); estimate-visit guard `m2_visit_not_completed`
  and the on-site composer prefill context (`424`).
- [~] Share settlement sweeps: unfilled at visit SLA, vendor no-show, missed estimate window, customer
  no-show per config — all idempotent, all through the M1 `Refund` lifecycle (`425`).
- [~] Per-slot split (`426`, decided 2026-08-13): vendor visit payout + Vsolve platform share per
  share, in paise; `EARNED` makes the payout eligible through the M1 payout rails, gated on payout
  details; no stage credit. Reclassification money rules (`427`).

Shared:

- [~] Selection → time-limited vendor reconfirmation that **re-checks** capability, schedule and
  capacity at reconfirmation time (`407`, `408`).
- [~] Rejection, expiry or changed availability preserves the unlock/plan and offers the next
  quote, estimate or replacement visit free (`409`, `410`).
- [~] A3 completes as a connection with released contact; A5 opens stage funding at face value
  (`411`, `412`) — visit money settles per share, never as a stage discount.
- [~] Server-calculated stage amounts, commission, tax and payout allocation in paise (`413`, `414`).
- [~] Verification: simultaneous selections, vendor expiry at payment time, suspension between
  selection and payment (`417`, `418`); the visit-plan money paths — duplicate plan webhooks, hold
  expiry racing checkout, grid contention with A1, share arithmetic (payouts + platform shares +
  refunds reconcile to the plan), sweep idempotence, payout-details gating, reclassification with a
  charged plan (`428`).

**Gate:** money is collected only against a real accepted commitment — a usable quote (A3) or a
confirmed visit (A5); selection is not a booking until vendor reconfirmation and the archetype's own
confirmation condition both succeed.

---

### C2 outcome — 13 August 2026

**Resumed from a deliberately red WIP commit** (`e207543`), which had landed the domain layer with
no migration, no HTTP layer and its gates failing on purpose so nobody would mistake it for done.

**Built.** Contract **1.24.0**: 14 new paths, 19 new operations (43 M2 operations → 62), four
migrations (`requirements.0005`, `catalog.0008`, `commerce.0007`, `assignments.0008`) and five new
`CELERY_BEAT_SCHEDULE` entries. No new module — the four C2 domain modules already existed; this
wave finished them, published them and closed the gaps they left.

#### The three red gates, and what closing them actually took

**The five `ARG001`s were not a lint nit and were not deleted.** Five commands took an `actor` and
recorded nothing with it, so the money-moving half of M2 had **no audit trail**. The convention is
`services._record_transition`; the reason nobody had used it is that it was private to that module.
It is now `services.record_transition`, and the five commands write through it:
`unlock_checkout_started`, `visit_plan_chosen`, `visit_plan_checkout_started`, `proposal_selected`
and `stage_funding_started`. A row where `from_status == to_status` is deliberate and
`reclassify_requirement` already established it — not every auditable act is a state change, and
"this Customer authorised this charge at this moment" is exactly what a payment dispute asks for.
Six system-side transitions were written alongside with `actor=None`, because the party that moved
those is a provider callback and signing them with the Customer's name would be a lie in the record
that exists to prove who did what.

The three MyPy errors were what they looked like: `expires_at` typed `object`, an unguarded
`Optional` on a credit unlock, and one `plan` name bound twice with different nullability.

#### Six decisions worth carrying forward

1. **The candidate-visit-starts read is `GET` on the same path as the confirm.**
   `POST /partner/enquiries/{id}/visit-slots/` redeems a signed token that only the `GET` issues, so
   publishing the write alone would have left `M2-FE-314`'s picker with nothing to render and
   `M2-FE-421`'s tracker with no slot times. It is modelled on `POST /booking/windows/` — the same
   `carts.availability` snapshot, the same window loop — **minus `capacity`**, which on a grid
   narrowed to one vendor is a readout of that vendor's own diary depth rather than a slot fact.
2. **`_max_slots` is the visit plan on A5, not `max_quotes`.** The plan size *is* the product the
   Customer chose. Inviting on the variant's quote ceiling would send four vendors to a home that
   paid for two, and the fourth would find every share taken.
3. **`submit_proposal` numbers revisions from the chain, not from the live row.** It read
   `status=SUBMITTED`, which was right while every supersession followed a live quote and wrong the
   moment `M2-BE-410` let a vendor re-validate an `EXPIRED` one — `previous` came back `None`, the
   new row was numbered revision 1 again, and `requirements_unique_proposal_revision` refused it.
   This was a latent defect in C1 code that only the re-validation path could reach.
4. **`settle_share_for_estimate` existed and nothing called it.** Its own docstring said "called
   from proposal submission"; it is now wired there, so a vendor's visit payout is earned by the
   event rather than by a sweep noticing hours later.
5. **`_promote_requirement_when_quoted` only promoted from `MATCHING`.** An A5 requirement would
   have sat in `VISITS_BOOKED` forever and the Customer could never have selected — §1 carries
   `VISITS_BOOKED → QUOTES_READY` and the code did not.
6. **The visit payout hold needed its own release.** `payouts.release_payout_hold` resolves an entry
   **by Booking** and a visit payout has none. That is not an oversight in either place — the M1 rule
   is one earning per Booking, and a visit is not one — so `release_visit_payout_hold` plus an hourly
   sweep is the progressive gate's release for M2. The docstring in `access._earn_share` that claimed
   the M1 function would do it was wrong and is corrected.

#### The eight §7 gaps: all eight landed

Batched into this publish as asked. The largest was the first: **a Partner could not read their own
quotes back** — `GET /api/v1/proposals/` now exists as a scoped cursor page with a `requirement`
filter. `ProposalCreateRequest` also gained **`site_visit_id`**, which was a defect rather than a
gap: `submit_proposal` has always taken one and no serializer published it, so an A5 on-site estimate
was **unsubmittable over HTTP** and `m2_visit_not_completed` was unreachable.

The decline vocabulary is published on the **serializer**, not the column. The same
`decline_reason_code` column carries system reasons (`requirement_changed` from a withdrawal,
`non_responsive_quote` from a Customer rejection), so constraining the model field would have refused
the platform's own writes. `ProposalStage` reads defensively — `label` accepted as a `title` alias,
missing keys degraded rather than raised — because the column is JSON and a row written before the
shape existed must not turn the comparison screen into a 500.

#### Verified

`.\scripts\quality-static.cmd`: ruff format and ruff check clean across 342 files, **strict MyPy
clean across 222 source files**, `makemigrations --check` no changes, `spectacular --validate` with
**zero warnings** after 11 new `ENUM_NAME_OVERRIDES` entries, committed-contract drift check clean.
`manage.py check` clean.

`RejectionReasonEnum` is **pinned rather than renamed**: C2 added a second field over the same choice
set and the generator resolved the collision positionally to `Reason9ecEnum`. The override keeps the
name published at 1.22.0.

#### Not done, and why

- **No test was written or run**, per the build-first amendment. `M2-BE-417`, `M2-BE-418` and
  `M2-BE-428` are recorded as this wave's test debt in `02-backend-tasks.md`, as one line rather than
  as individual rows.
- **Contact disclosure and the callback flow are untouched**, deliberately — both need an owner
  decision, and publishing a disclosure surface before that decision would be the product making it.
- **The frontend client is not regenerated.** `frontend/packages/api-client/src/generated/**` is
  frozen and only the orchestrator regenerates it. **1.24.0 needs regeneration** before either
  frontend column can consume any of this.
- **`M2-BE-415` is a receipt number, not an invoice.** Access fees allocate from `DocumentSequence`
  under an `M2A-` series rather than creating `TaxDocument` rows, because that model's `order` is not
  nullable and making it nullable would weaken the invariant every M1 invoice depends on. The GST
  treatment of the unlock and visit-plan fees is blocking owner decision 5.
- **Every owner-blocked value still fails closed** and that is a live consequence, not a caveat:
  until Operations loads an `M2AccessPrice` row, **no unlock and no visit plan can be sold at all**.

---

## Wave C3 — The engagement spine (`BE5`) — **`[~]` shipped 13 August 2026**

Contract **1.25.0**, 15 new paths and 16 new operations. Full account in §"C3 outcome" below.

**Depends on:** C2. Frontend Wave 3 builds both halves of this spine in parallel, so a misread here
shows up in three places at once.

`M2-BE-501..509`. One `Engagement` + `EngagementStage` for both archetypes. A stage is a shift-day
(A3) or a milestone (A5) with **the same** evidence, approval and money-release semantics.

- [~] The shared stage commands (`M2-BE-503`): start, submit evidence, approve, request correction,
  dispute, review timeout, release — plus the Operations dispute decision, without which a disputed
  stage was a dead end for the whole of C4 and C5.
- [~] Stage amounts reconcile to the engagement total as a **database constraint** (`M2-BE-504`), not
  only as validation: `staged_total_paise = total_paise + amendment_delta_paise` on the engagement
  row, plus five per-stage bounds.
- [~] Scope amendments route through the **M1 amendment engine** (`M2-BE-505`). Do not build a second
  one — this is the single largest duplication risk in M2.
- [~] Verified payment or refund adjustment before an accepted amendment changes funded scope
  (`M2-BE-506`), on a new `M2_SCOPE_AMENDMENT` purpose.
- [~] Hold and release payout per stage through the M1 ledger and a dispute window (`M2-BE-507`).
- [~] No scope, amount or completion change through clarification, callback or any unilateral UI
  action (`M2-BE-508`) — enforced in `save()` on both models, not by convention.
- [~] **`M2-BE-113` unblocked and built.** Suspension routes funded and committed engagements.

**Gate:** both archetypes run on one spine with one set of stage commands, and no duplicate agreement,
amendment or approval subsystem exists. C4 and C5 may not start until this is stable.

---

### C3 outcome — 13 August 2026

**Built.** Contract **1.25.0**: 15 new paths, 16 new operations (62 M2 operations → 78), two new
backend modules (`apps/requirements/{stages,amendments}.py`) plus `apps/requirements/handlers.py`,
four migrations (`requirements.0006`, `catalog.0009`, `commerce.0008`, `fulfilment.0002`) and three
new `CELERY_BEAT_SCHEDULE` entries. Four new models: `EngagementEvent`, `StageEvidence`,
`StageEvidenceUpload`, `EngagementAmendment`.

#### `M2-BE-505`: the amendment engine was extended, not forked — and here is exactly where the seam is

The task named this the largest duplication risk in M2, so the answer needs to be precise rather
than reassuring.

**Reused verbatim:** `fulfilment.ScopeAmendment` (the six-state machine, the response deadline, the
reason, the version), `fulfilment.ScopeAmendmentLine`, and the expiry rule — which was private and
is now `fulfilment.amendments.guard_amendment_not_expired`, so both entry points call one function
instead of each holding a copy. Every row an M2 amendment writes lands in the M1 tables and is
readable by anything that already reads an amendment.

**Not reusable, and it is structural rather than stylistic.** The four command functions in that
module resolve their aggregate through `locked_booking_context(booking_id)` and price every line
through `pricing.selectors.current_task_rate`. An M2 engagement has no `Booking`, no
`FulfilmentUnit` and no catalog task, so calling them would be calling a lookup that cannot succeed.
`ScopeAmendment.booking` is now nullable and `requirements.EngagementAmendment` carries the M2
aggregate and a signed delta; the M1 commands gained an explicit `_booking_of` guard that refuses an
engagement amendment reaching the Booking door rather than failing on an attribute.

That is the documented M1 boundary stated as an extension, which is what `M2-BE-505` asked for:
`ScopeAmendmentLine.Kind` gains `LABOUR_DAY` and `PROJECT_WORK`. **One engine, two front doors,
because there are two aggregates.** The alternative — a second `ScopeAmendment` table — is the thing
the task forbids, and nothing here duplicates a column that lives there.

#### Eight decisions worth carrying forward

1. **The money envelope is columns, because a constraint cannot be a subquery.** `M2-BE-504` asks for
   database constraints, and "stage amounts reconcile to the engagement total" is a sum across rows.
   So `Engagement` carries `staged_total_paise` and five siblings, maintained with `F()` arithmetic
   inside the transaction that moved the stage, and the reconciliation becomes a check between two
   columns of one row. The bound that turned out to matter most is not the obvious one: it is
   **`funded − refunded ≤ staged`** — never hold more of a Customer's money than there is agreed
   work — which is what forces a scope reduction to refund *before* it shrinks, because the database
   refuses the other order.
2. **`total_paise` does not move; `amendment_delta_paise` does.** An accepted amendment legitimately
   changes what is owed, and the first instinct was to update the total. Keeping the agreed number
   frozen and putting the change beside it means a dispute two years later reads both, and it keeps
   `commission_paise ≤ total_paise` — an existing C2 constraint — true without re-deriving
   commission on every amendment.
3. **`M2-BE-508` is a `save()` guard, not a code convention.** Following
   `payouts.PartnerLedgerEntry.save`: `Engagement` refuses any write to its eight frozen commercial
   terms, and `EngagementStage` refuses a write to `amount_paise` unless it came through
   `apply_amendment_amount`, whose only caller is the amendment module and only after `AUTHORIZED`.
   A service that forgets the rule is a bug; a model that permits it is an invitation.
4. **`EngagementEvent` rather than `RequirementTransition`.** The requirement's own log ends at
   `ENGAGED`, and pushing forty shift-day approvals into it would bury the six status changes it
   exists to show a Customer. `actor_is_system` is published and actor *identity* is not: "approved
   by you" and "approved because the review window closed" are different sentences, and the
   counterparty's user id is not the caller's business.
5. **The review-timeout exception is enforced twice, on purpose.** §5 says
   `AWAITING_REVIEW → APPROVED` may occur on timeout **except while `DISPUTED`**. `dispute_stage`
   clears `review_due_at` so the selector cannot see the row, *and* `expire_stage_review` re-checks
   the status under the row lock — because a Customer can dispute in the window between the sweep
   reading a list and the task acting on one entry, which is exactly the moment auto-approval would
   settle an objection by ignoring it.
6. **Commission is allocated cumulatively, not per stage.** `commission × amount // staged` per
   stage leaves a remainder belonging to nobody; an eleven-milestone project would under-book Vsolve
   by up to ten paise with no row explaining where it went. Allocating against the *cumulative*
   approved total makes the last stage pick up exactly the accumulated remainder, and it needs no
   special case for "which stage is last" — which stops being knowable the moment an amendment
   appends one.
7. **A5 amendment stages arrive already funded; A3 amendment stages arrive `PENDING`.** The amendment
   payment *is* the new stage's funding, at face value, which is what `M2-BE-506` means by requiring
   verified payment before scope changes. An additive amendment **appends** a stage rather than
   growing an existing one, because a stage is the unit of evidence and approval and extra work
   inside an approved stage would be work nobody reviewed.
8. **`StageEvidence.ProcessingStatus` aliases `RequirementAttachment.ProcessingStatus`.** Not tidiness
   — a second identical `TextChoices` publishes a second identical OpenAPI component, and the
   generator resolves that by renaming *both*, taking `ScanStatusEnum` with it. The 1.24.0
   `ReasonEnum` note is this exact failure; aliasing avoids it at the source.

#### Three defects found while wiring it

**`simulate_capture` refused every M2 charge, so no M2 money path was drivable by hand.** Ownership
was resolved through the `CheckoutSession`, which a checkout-free purpose does not have — so the
unlock, the visit plan, stage funding and now amendments all answered `403`. `milestones.md` proves
every M2 money path with a provider **test** callback and this is the door those callbacks come
through in development, so the whole commercial flow was unverifiable. Ownership now resolves
against the M2 aggregate that records a customer; an unresolvable purpose is still refused, because
a permissive default on a money endpoint is the wrong direction to guess in. The view's re-read also
answered `404` *after* capturing, and no longer does.

**An A3 quote's total was whatever the client sent** — logged as a Wave B2 finding in
`frontend-execution-plan.md` §7 and never closed. `_assert_a3_shape` now refuses unless
`total = rate × workers × days`. This was not cosmetic: `engagements._a3_stages` lays out one stage
per shift-day at `rate × workers`, so a divergent total produced an agreement whose stages could
never add up — and `M2-BE-504` has now made that a database constraint, which would have turned a
bad quote into a 500 at reconfirmation. Refused rather than silently derived, because the wage-floor
guard beside it only ever measured the *rate*.

**Adding a second `processing_status` field renamed `ProcessingStatusEnum`.** Caught by diffing the
generated component names against the committed contract before publishing, which is now the
standing check the 1.24.0 CHANGELOG note asks for. Pinned.

#### Verified

`.\scripts\quality-static.cmd`: ruff format and ruff check clean across **345 files**, **strict MyPy
clean across 225 source files**, `makemigrations --check` no changes, `spectacular --validate` with
**zero warnings** after five `ENUM_NAME_OVERRIDES` entries (one pin, four new names), committed-
contract drift check clean. `manage.py check` clean. **No published path, operation or schema
component was removed or renamed.**

#### Not done, and why

- **No test was written or run**, per the build-first amendment. `M2-BE-509` is this wave's test
  debt, recorded as one line. The smoke script that replaces it is
  `docs/runbooks/m2-engagement-spine-smoke.md`.
- **The frontend client is not regenerated.** `frontend/packages/api-client/src/generated/**` is
  frozen and only the orchestrator regenerates it. **1.25.0 needs regeneration** before either
  frontend column can consume any of this.
- **Three new owner-blocked values fail closed, and the consequences are live**:
  `stage_review_window_hours` unset means **no stage ever auto-approves**;
  `stage_payout_hold_hours` unset means **no stage payout releases on a clock** (the earning is
  still written and still held — the debt is real either way); `amendment_response_hours` unset
  **blocks proposing an amendment at all**, because `ScopeAmendment.expires_at` is not nullable and
  an amendment with no deadline is an open-ended claim on somebody's money.
- **A reduction cannot empty a stage.** Removing a milestone entirely is a cancellation, and routing
  one through the amendment engine would leave a zero-value stage in the agreement pretending to be
  work. Vendor abandonment and stage transfer are `M2-BE-545`, Wave C5.
- **`Engagement.WARRANTY` and `CLOSED` are reachable states with no command behind them.** Retention
  and the warranty window are `M2-BE-546`; the digital-deliverable handover that fills the gap
  between `COMPLETING` and `COMPLETED` for Event and Media is `M2-BE-547`. Both are Wave C5, and the
  states exist now so C5 adds a step rather than a status.
- **The Operations dispute decision has no case behind it yet.** `m2_stage_dispute_resolve` is the
  transition Wave C6's case machinery will drive; it is published now so a disputed stage is not a
  dead end for the whole of C4 and C5.
- **No Operations HTTP route exists for a capability suspension**, so `M2-BE-113` is driven from the
  domain command. That surface is C6, and publishing a suspension button before the case process
  behind it would be a button with no process.

---

## Wave C3.5 — The dev seed and the Wave I defects — **`[~]` shipped 13 August 2026**

Contract **1.26.0**, 3 new paths and 3 new operations. Full account in §"C3.5 outcome" below.

**Not a phase.** Three frontend columns built against 1.25.0 and logged thirty-four findings in
`frontend-execution-plan.md` §7; about a dozen were the backend's. This wave closes those and makes
the platform demonstrable.

- [~] **`manage.py seed_m2_demo`** — placeholder configuration for every owner-blocked value, as
  data behind a dev-only door, never as a default in code. Runbook: `docs/runbooks/m2-demo-seed.md`.
- [~] `VendorCardSerializer` published at `GET /requirements/{id}/vendor-cards/` (`M2-FE-419`).
- [~] Real verification badge on teasers and cards; distance band published; **rating refused with
  a reason** — the platform has no review model.
- [~] `ProposalMaterialLine` + `EngagementStage.kind` — a material advance is a distinct money
  purpose with its own recovery rule (`M2-BE-543` groundwork).
- [~] Customer-initiated clarification, and the vendor's answer route (`M2-FE-409`).
- [~] `service_name` on `EnquirySummary`, `timezone` on `SiteVisit`, `access_receipt` on
  `Engagement`, `VisitNoShowReasonEnum`.
- [~] A5 plan-visit reschedule now moves its grid reservation.
- [~] **24 `select_for_update` + nullable-join sites fixed** — every one was a live `500`.

---

### C3.5 outcome — 13 August 2026

**Built.** Contract **1.26.0**: 3 new paths, 3 new operations (78 M2 operations → 81), one migration
(`requirements.0007`), one new management command and one new runbook. Eight additive fields, one
breaking request-shape change, three new enum overrides. **402 published components → 410; none
removed, none renamed.**

#### The seed is the deliverable, and its shape is the argument

`seed_m2_demo` writes nine owner-blocked values, a catalog, an area and three approved vendors, and
**every one of them goes into the table the fail-closed reader already reads**. Nothing in `apps/`
gained a fallback; `pricing.py` is untouched. Three doors, all of which must be open: `DEBUG`, an
explicit `--i-understand-this-is-dev-only`, and — the one that matters most operationally — a
`source_reference` check that **refuses to overwrite a row somebody loaded on purpose**. A price
without the `DEV SEED — not an owner decision` marker is a real decision and is left alone with a
warning naming it.

Two decisions inside it worth carrying forward:

1. **It writes `catalog.ServiceQuestion` rows *and* `M2VariantConfiguration.question_schema` from
   one authored table.** §7 records the split as a latent trap: screen 1 renders the first and
   `submit_requirement` validates the second, and their vocabularies differ
   (`NUMBER`/`SINGLE_CHOICE` against `INTEGER`/`SELECT`). A seed that wrote one would have produced
   a four-screen flow whose last screen refuses what its first collected. The mapping between the
   two vocabularies now exists in exactly one place.
2. **It seeds no `PartnerLocation`, on purpose.** A GPS fix goes stale in 30 minutes, so a seeded
   one shows a distance band on the first invitation and `null` an hour later — flaky demo
   behaviour indistinguishable from a bug. `distance_band_km` stays `null` until a vendor's app
   reports a position, which is what the field means.

#### Two live defects the seed found by being run

Neither was findable by reading, and both had shipped.

**`select_for_update()` beside `select_related()` over a nullable FK is a `500` on PostgreSQL.**
`FOR UPDATE cannot be applied to the nullable side of an outer join`. **Twenty-four sites**, covering
most of the C2 and C3 money surface — `submit_proposal`, `create_unlock_checkout`,
`choose_visit_plan`, `complete_visit_plan`, `complete_plan_visit`, `report_visit_no_show`,
`select_proposal`, `reconfirm_selection`, `complete_stage_funding`, every amendment command — **and
two M1 commands in `fulfilment/amendments.py` that Wave C3 broke** by making `ScopeAmendment.booking`
nullable: an inner join became an outer one and the lock became illegal. Every site now locks
`of=("self",)`, which is what each of them intended. This is the strongest argument in the wave for
the seed: a fully configured platform was still a wall of 500s, and no amount of static analysis was
going to say so.

**A plan visit could be rescheduled off its own grid reservation.** `schedule_site_visit` moved
`scheduled_for` and left the `assignments.Reservation` where it was — so the vendor's diary stayed
blocked at a time nobody was coming and *open at the time they were*, and the A1 checkout could
double-book the new slot without the exclusion constraint ever seeing it. `access.reschedule_plan_visit`
now re-books through the same grid: check, release, re-take, in that order (releasing first would
lose the vendor both times on a refusal; taking first would collide with their own hold on any
overlapping move), preserving tentative-or-confirmed state so a reschedule cannot harden a hold the
Customer has not paid for.

#### Five decisions worth carrying forward

1. **A material line is a distinct row on the wire and a distinct *kind* of stage in the engagement.**
   The tempting shapes were both wrong: a `kind` discriminator on `ProposalStage` leaves a bag of
   cement carrying an evidence cycle and an approval, and a separate `EngagementMaterialLine` table
   breaks `staged_total_paise = total_paise` and forks the money spine. `EngagementStage.kind`
   keeps one spine and one constraint while giving `M2-BE-543` something to read — and it bites
   immediately rather than waiting for C5: `route_suspended_capability_engagements` no longer
   refunds a funded material advance as unearned work.
2. **Material stages are laid out last, and that is a control rather than an ordering.** Funding
   runs in position order, so a project whose first collection is a materials advance is exactly the
   prepay-then-vanish shape staged funding exists to prevent. Work is funded first.
3. **The rating is refused, with the reason published.** `README.md` names it in the disclosure
   ladder and this platform has no review model; `carts`' professional card already refuses to
   publish one for the same reason. A star count invented in a serializer would be the API deciding
   what a vendor's reputation is. Recorded in §7 so it is a decision rather than a gap.
4. **A Customer's question hangs off a proposal, not the requirement, and is gated on the paywall.**
   A question aimed at the pool is a broadcast nobody owns; an ungated one is a channel around the
   fee, since not being addressable is the entire teaser rule. It also keeps
   `RequirementQuestion.invitation` non-nullable, so no migration. `asked_by_role` is derived from
   two non-null foreign keys — the C1 `actor_kind` objection does not apply, because each of the
   three answers is a fact.
5. **The no-show reason vocabulary is about the fact, never the settlement.** `party` decides the
   money and no dropdown may. A reason code that could move money would be a refund button labelled
   as a dropdown.

#### Verified

`.\scripts\quality-static.cmd`: ruff format and ruff check clean across **347 files**, **strict MyPy
clean across 228 source files**, `makemigrations --check` no changes, `spectacular --validate` with
**zero warnings** after three new `ENUM_NAME_OVERRIDES` entries, committed-contract drift check
clean. `manage.py check` clean. **No published path, operation or schema component was removed or
renamed** — verified by diffing generated component names against the committed contract.

The seed and both walkthroughs were driven end to end **against a throwaway database created and
destroyed in the same process** (`connection.creation.create_test_db` / `destroy_test_db`). No test
case was executed and the developer's own database was never written to; this is what found the two
defects above. Recorded because "unrun" would be inaccurate and "tested" would be untrue.

#### Not done, and why

- **No test was written or run**, per the build-first amendment. This wave's test debt is the whole
  of it: the vendor-card disclosure ladder, the material-line reconciliation, the two-way
  clarification, the reschedule reservation move and the `of=("self",)` fix all want regression
  tests before M2 acceptance.
- **`VisitNoShowRequest.reason_code` is now required**, which is a **breaking request-shape change**
  for a client that has not regenerated. Flagged in §7 for both columns.
- ~~**The frontend client is not regenerated.** **1.26.0 needs regeneration by the orchestrator.**~~
  **Closed 2026-08-14 (build-sprint Gate 0).** The orchestrator regenerated through 1.26.0, 1.27.0
  and 1.28.0; the committed client is at **1.28.0** and the drift check is clean. Left struck rather
  than deleted so the wave record stays append-only.
- **No rating**, for the reason above.
- **Contact disclosure and the callback flow** remain untouched — both need an owner decision.
- **The nullable-join fix was applied mechanically at 24 sites and is unproven at 22 of them.** Two
  were exercised by the walkthrough drive; the rest compile and follow the identical pattern. Worth
  a deliberate pass when test authoring resumes.

---

## Wave C2R — Rate-card A3 (revision 4, ADR-0009) — **not started**

`M2-BE-429..435`. **New build, not rework.** Revision 4 (2026-08-13) demotes the C2 unlock surface
to the thin-supply fallback — every 1.24.0 path stays published and untouched, and whether the
fallback keeps charging the unlock is **owner decision 14**. The primary A3 front door is built
here. Per the build-first amendment, no test is written or run in this wave —
`.\scripts\quality-static.cmd` is the gate — and the wave's test debt is recorded in
`02-backend-tasks.md`.

**Depends on:** C2's patterns, not C2's files — the effective-dated fail-closed Operations price
(`M2AccessPrice`), the payment-purpose convention and the split rails decided 2026-08-13 — plus the
A1 offer cascade in **`apps.assignments`**, the M1 payout and ledger rails for the forfeit split,
and the built fail-closed wage-floor guard. May run before or beside C4; C4's settlement rows
(`536..539`) read the rates this wave publishes.

- [ ] `RateCard` + `publish_rate_card` (`429`): effective-dated per city+skill on the
  `M2AccessPrice` pattern, three components in paise (worker day-wage + supervision margin + booking
  fee), the published overtime and add-on rates and the printed inclusion list. The wage component
  passes the **built wage-floor guard at publish** — the same fail-closed check vendor quotes pass.
  No live card means `m2_rate_card_unavailable`, never a guessed price. Seed values, the
  decline-alarm threshold and the review calendar are owner decision 13.
- [ ] The A3 **preset** on `M2VariantConfiguration` + `book_at_published_rate` (`430`): skill,
  headcount, dates, the 3–4 price-moving facts; rate and inclusion list shown before booking;
  submission starts the cascade in one step, or routes to the quote flow when no card is live.
- [ ] The cascade caller into `apps.assignments` (`431`): small wave, first accept wins,
  minutes-level timeouts; offers only to leads with approved A3 capability and verified roster ≥
  headcount; `accept_crew_offer` takes a roster-sized hold (`m2_roster_insufficient`);
  `decline_crew_offer` requires a reason and feeds the decline alarm; widening behind an honest
  holding state; `fall_back_to_quote_flow` past the configured threshold with nothing charged. A
  caller, not a second dispatch engine.
- [ ] `BookingFee` + checkout + verified webhook (`432`): `OFFER_ACCEPTED → PENDING → ACTIVE →
  EARNED | FORFEIT_SPLIT | REFUNDED | FAILED`, `EARNED` at first-day arrival;
  `create_booking_fee_checkout` refuses without a held accepted offer
  (`m2_booking_fee_not_chargeable`); one charge per booking under duplicate webhooks; never from a
  client redirect (`m2_booking_fee_payment_pending`); the verified callback hardens the booking
  **and creates the engagement**.
- [ ] Forfeit and refund machinery (`433`): the forfeit split through the **M1 payout rails**
  (travel compensation to the lead + platform share, reconciling
  `fee = travel compensation + platform share` in paise); full refund + free re-dispatch + standing
  hit on vendor no-show; free-cancel until T hours out. Fee value, split percentages and T are owner
  decision 12.
- [ ] The **decline-rate alarm** (`434`): sustained decline above the configured threshold at a rate
  pages Operations — an alarm, not a report. Threshold is owner decision 13.
- [ ] Rate-card acceptance recorded at A3 capability approval (`435`); the offer screen always shows
  the lead's own number.

**Gate:** an A3 Customer can book a confirmed crew at a published all-inclusive rate with the
booking fee as the only online charge; the cascade degrades honestly to the quote flow past the
threshold; no rate below the statutory floor can be published; and nothing shipped at 1.24.0 is
removed or renamed.

## Wave C4 — Workforce stages, A3 (`BE5A`) — **`[~]` shipped 14 August 2026**

`M2-BE-521..539`. Thin tail on the C3 spine; revision 4 adds the daily-settlement rows (`536..539`),
which read Wave C2R's published rates.

- [~] Per-**stage** crew assignment so multi-day work rotates legitimately (`522`).
- [~] **Supervisor-level daily attendance** — "n of m present today", one action. Do **not** build
  per-worker check-in/check-out; per-worker detail is captured only when the Customer disputes
  (`525`, `526`).
- [~] Missing check-out settles at the agreed shift length, flagged, disputed only on Customer dispute (`527`).
- [~] Arrival confirmation on the non-OTP fallback as the default path (`524`).
- [~] Overtime as a scope amendment **at the card's published overtime rate**; unapproved overtime
  is unpaid (`531`, revision 4 wording).
- [~] `SafetyIncident` as a first-class record with its own flow — not a cancellation reason (`530`).
- [~] The dual evening **"Day settled?"** taps — `confirm_day_settled`, supervisor and Customer, a
  UPI QR/deep-link to the lead's VPA at the exact published amount as a convenience; the money is
  P2P, the platform never holds wages, and a one-sided claim without the tap trail reaches
  Operations as unproven (`536`, revision 4).
- [~] Settlement **per worker-day present, never per job**: a 3-of-4 day settles at 3 workers'
  published rate; the Customer continues short, adds a day, or cancels the shortfall free (`537`,
  revision 4).
- [~] Scope amendments at the card's **published add-on rates** (`538`) and `report_cash_demand` —
  one-tap report, standing hit, removal on pattern (`539`) (revision 4).

---

### C4 outcome — 14 August 2026

**Built.** Contract **1.30.0**: ten new paths, entirely additive (81 → 91 M2 operations). Five new
aggregates in `apps.requirements`, one in `apps.partners`, one new module on each side
(`apps/requirements/workforce.py`, `apps/partners/standing.py`), migrations `catalog.0011`,
`partners.0010`, `requirements.0009`, and one new beat entry. **No test was written or run**, per
the build-first amendment; the smoke script that replaces `M2-BE-534`/`535` for the sprint is
[`docs/runbooks/m2-workforce-shift-day-smoke.md`](../../docs/runbooks/m2-workforce-shift-day-smoke.md).

#### What was inherited, and what happened to it

A previous session was stopped mid-wave. It left five modified files and two new ones —
`catalog/models.py` (+51), `partners/models.py` (+81), `requirements/amendments.py` (+131),
`requirements/models.py` (+565), `requirements/rate_cards.py` (+23), plus `partners/standing.py`
(152 lines) and `requirements/workforce.py` (1264 lines) — on which **no static gate had ever run**.

It was good work and most of it survives. The five model aggregates, the `PartnerStandingEvent`
shape, the `LineUnit` extension to the amendment engine and the whole of `workforce.py`'s command
set are kept, because they read 07 correctly: the crew conflict is a database index rather than a
service check, the attendance row is per shift-day and never per worker, the settlement carries no
`PaymentAttempt`, and the safety report is frozen in `save()`. In particular the catalog constraint
block was already **generated from a module-scope tuple** rather than hand-copied beside it, which
is exactly what RULES §3(a) asks for and is the lesson of C2R applied without being told.

Three things were wrong and are changed:

1. **`ShiftAttendance.standard_day_hours` was non-null and the quote-flow branch defaulted it to
   24 hours.** An invented shift length is not a cosmetic default: it is the number
   `_assert_overtime_is_timely` derives a shift end from, so it decides when overtime becomes
   retroactive and therefore whether work already done gets paid for. The column is now nullable,
   the fallback records "not published", a second check constraint requires such a row to be
   `flagged_for_review`, and the overtime timeliness check declines to derive an end time at all
   without a published one.
2. **`standing.record_event` deduplicated on a null `source_id`.**
   `get_or_create(kind=..., source_id=None)` matches `source_id IS NULL` across every partner, so
   the second sourceless event of a kind would have been handed the *first vendor's* row — a
   command recording a fact about one vendor silently updating somebody else's. The partial unique
   index is scoped to non-null sources, so the null case now takes a plain `create`.
3. **Nothing had been done about the two commands the partner side needed.** The stopped session's
   report said the crew-verification, archive-guard and A3-suspension commands were finished;
   `apps/partners/capabilities.py` was untouched, so `workforce.py` imported
   `suspend_partner_a3_capabilities`, which did not exist. Both are now written.

Nothing was deleted.

#### The defect that was the whole wave

`EngagementStage.scheduled_on` had a reader and **no writer**.

`workforce.shift_date_of` refuses to assign crew to a shift-day with no date, and it refuses
honestly and for a good reason — the cross-agency conflict rule is "this person, on this date", and
a server-chosen date would make the guard check a day nobody is working. But neither
`engagements.open_rate_card_engagement` (the rate-card path) nor `engagements._a3_stages` (the
fallback quote path) ever set the column. Every A3 engagement in every environment therefore opened
with null dates, and the entire crew, arrival, attendance and settlement surface was unreachable
behind a message that reads like a data problem at the Customer's end.

`workforce.py`'s own docstring asserted the opposite — *"`engagements` stamps `scheduled_on` on
every A3 shift-day it lays out"* — which is how this class of defect survives review: the module
that reads a column states what writes it, and nobody opens the writer to check.

`engagements.shift_dates` is the writer: consecutive days from `requirement.requested_start`, which
`submit_requirement` already requires, on both A3 paths. `None` when there is no requested start,
because a refusal is still the right answer there.

**This is the third instance of the same class in three waves** (C2R found two). The check is not a
gate. It is asking, of every column the new code reads, *who sends this?* — and then opening that
file.

#### The RULES §3 audit, stated

**(a) The drifting duplicate — swept mechanically, no live drift found.** A throwaway script walked
every model, collected every class attribute that is a tuple of strings, and compared it against
every `__in` value set inside every constraint condition. Ten pairs matched. Eight agree exactly:
`PaymentAttempt.CHECKOUT_FREE_PURPOSES` (C2R's fix, holding), `PartnerCapability.ACTIVE_STATUSES`,
`PartnerCapability.REVIEW_STATUSES_NEEDING_NOTES`, `CustomerRequirement.CLOSED_STATUSES`,
`QuoteUnlock.READABLE_STATUSES`, `VisitPlan.CHARGED_STATUSES`, `SiteVisit.SHARE_HOLDING_STATUSES`
and `ProposalSelection.LIVE_STATUSES`. Two near-misses are deliberate and documented in place:
`VendorInvitation.SLOT_HOLDING_STATUSES` includes `INVITED` where the constraint does not (its
comment explains that covering `INVITED` would make one wave picking two siblings fail with
`IntegrityError`), and `EngagementStage`'s approved-has-a-timestamp constraint covers
`APPROVED | RELEASED` where `SETTLED_STATUSES` means only `RELEASED` — two different questions.

Three of the eight *are* structurally the hand-copy RULES §3(a) warns about — the tuple exists and
the constraint restates it — and they are **not** derived here. The only way to derive one is to
move a published `TextChoices` to module scope so the nested `Meta` body can see it (a class body
is not an enclosing scope), and all three are named in `ENUM_NAME_OVERRIDES` by their nested dotted
path. Moving them risks renaming a published component, which RULES §7 forbids outright. Logged as
its own change in `frontend-execution-plan.md` §7, with a client regeneration behind it.

**Wave C4's own constraints duplicate nothing.** The catalog block is generated from
`M2_POSITIVE_WHEN_SET_POLICY_FIELDS`; every other new constraint compares a single status literal,
which is what Django requires inside `Meta` and what the surrounding file already does.

**(b) The column with no writer — one found in the inherited work, one found in the new work, both
closed.** The inherited one is `scheduled_on`, above. The new one was
`PartnerBusinessProfile.upi_vpa`: it had a reader (`workforce.upi_payment_link`), a column and a
migration, and its only writer was the dev seed — so in production the evening deep link could
never be offered, because no lead had any way to publish a handle. It is now readable and writable
on the existing `m2_partner_business_profile_read` / `_replace` pair.

Mechanically: all 39 `M2VariantConfiguration` columns were listed and checked against
`seed_m2_demo`. Every policy column has a writer there, including the four this wave added. The
only unwritten ones are structural (`id`, `variant`, `version`, `created_by`, `created_at`) and
`evidence_policy` / `contact_policy`, which have **neither a reader nor a writer** anywhere in M2 —
inert rather than broken, recorded here rather than removed.

#### The design decisions worth keeping visible

**A shift-day is a stage, so everything hangs off a stage id.** Ten paths, nine of them under
`engagement-stages/{id}/…`. A per-engagement route could not express "the gang on Thursday is not
Monday's gang", which is the fact the whole wave exists to record.

**The shift-day is one read, not four.** `GET .../shift/` returns the day, its crew, its attendance
and its settlement together, for the reason `RateCardStateSerializer` gives: the crew screen, the
attendance screen and the settlement screen are the same screen at three moments of one evening.
`attendance` and `settlement` are `null` until a command touches the day — the read creates
nothing, because a stage that acquires an attendance row because somebody opened a screen is a
stage whose record is about the app rather than the site.

**Every shift-day state change is a C3 spine command.** Arrival is `start_stage`; the supervisor's
count is `submit_stage_evidence` (the count *is* the evidence); confirm is `approve_stage`, which
for `LEAD_ONLY` also releases; dispute is `dispute_stage`. That is what keeps the review timeout,
the audit trail, the Operations dispute decision and the "no auto-approval while `DISPUTED`" rule
working on A3 without a line of new lifecycle code. Two things are genuinely new because the spine
has no equivalent: naming people to a day, and recording money the platform never touches.

**Nothing here moves wage money, and the absence is load-bearing.** No `PaymentAttempt`, no ledger
entry, no refund, no payout in `workforce.py` or in any of the ten views.
`DaySettlement.amount_paise` is a published figure with a check constraint behind it
(`amount = per_worker × present + extras`) and `upi_payment_link` is a deep link into the
Customer's own app. `M2-BE-533` is therefore **correct by absence** on this path rather than
unbuilt: A3 is `LEAD_ONLY`, so `_approve` releases immediately and writes no ledger entry, and
there is no payout to hold.

**A one-sided settlement tap is left standing.** `SUPERVISOR_CLAIMED` / `CUSTOMER_CLAIMED` is what
Operations reads as *unproven* — a different sentence from "they were paid" and from "they were
not". `sweep_unproven_day_settlements` raises those rows hourly after a day and **stops**; there is
deliberately no command behind it that could settle one, because a cash dispute where both sides
lie is unadjudicable and this plan accepted that for `LEAD_ONLY`.

**Extras are refused rather than priced when the card did not publish a rate.** Add-on codes and
the overtime rate come from the snapshot frozen at booking, not from today's card, so a card
superseded mid-job cannot reprice agreed work. A code that is not on that snapshot has no published
price. That refusal *is* the mechanism: "third floor, no lift? Extra, bhaiya" with a number the
vendor chose is the failure ADR-0009 exists to leave nowhere to live, and there is no amount field
on `ShiftExtraRequest`.

**The retroactive overtime window is applied to the acceptance, not the request.** The amendment's
own `expires_at` is shortened to it, so a retroactive claim the Customer does not answer in time
expires — and expired means unpaid. Applying it to the request instead would let a vendor file at
the last second and leave the Customer holding an open claim.

**Two things were deliberately not built, and both are refusals rather than omissions.** The
Operations arrival override (`M2-BE-524`) would be a third party asserting that a crew arrived at a
site nobody from this platform was at. Customer approval of a crew substitution (`M2-BE-528`)
has no policy naming when it is required, and a guess would either block a legitimate morning swap
or wave through one that should have been asked about. Late arrival and force majeure
(`M2-BE-529`) change no amount and no state under revision 4; a reason-code enum nothing reads is
the check that always passes.

#### Fail-closed, and in which direction

Four owner-blocked values were added, all on `M2VariantConfiguration`, and they do not fail the
same way — which is the point:

| Config | Unset means |
|---|---|
| `overtime_retroactive_window_minutes` | A **retroactive** overtime request is refused (`m2_policy_unavailable`). A request made while the shift is still running is unaffected. |
| `crew_shortfall_standing_threshold` | No matching demotion ever fires. Short days are still recorded. |
| `cash_demand_removal_threshold` | No removal ever fires. Reports are still recorded. |
| `vendor_standing_window_days` | Neither pattern can be evaluated at all — "three reports" without "since when" is not a rule. |

Only the first refuses a command, and only because it decides whether work already done gets paid
for. The other three gate a background consequence, so refusing a Customer's report or a
supervisor's tap because a policy is unconfigured would punish them for an Operations gap. The
events accumulate either way, so turning the rule on later is loading a value rather than
backfilling a history.

`seed_m2_demo` writes all four (120 minutes, 3, 3, 90 days), marked as dev-only inventions, plus a
`m2demoN@vsolvedemo.test` UPI handle on every demo vendor so the settlement link renders.

#### Also closed

- **`M2-BE-111`, proposal 0013 criterion 9.** `archive_crew_member` now refuses a worker booked on
  a future shift-day, naming the dates. It could not before, because the table did not exist; the
  import is late, since `apps.requirements` imports `apps.partners` and the reverse at module scope
  would close a cycle.
- **`report_crew_no_show`'s standing hit.** It said the vendor's standing takes the hit and then
  did not take it. It now writes a `VENDOR_NO_SHOW` event, before the re-dispatch clears the
  accepted invitation and takes the lead's identity with it.
- **`PartnerBusinessProfile.upi_vpa`** is writable, validated only as "one `@` and two non-empty
  halves" — this platform never sends money to it, so a stricter rule would be this system claiming
  to know which handles a bank accepts.

#### The orchestrator's `BookingFee` escalation — answered, and half corrected

Mid-wave the orchestrator escalated a Session A finding: **`accept_crew_offer` writes no
`BookingFee` row**, so `OFFER_ACCEPTED` is a published state nothing persists — and the conclusion
drawn from it was that the booking fee "can never be paid", which would have made every C4 step
unreachable by a walkthrough.

**The first half is true and is fixed. The second half is not, and it was worth checking rather
than accepting.** Read, not assumed:

- `booking_fee_checkout_availability` keys on `booking.status == OFFER_HELD` and then returns
  `fee is None or fee.status in (OFFER_ACCEPTED, PENDING)` — it **explicitly tolerates a missing
  fee row** and answers `True`.
- `create_booking_fee_checkout` builds the row itself: `fee = existing or BookingFee(...)`,
  straight into `PENDING`.

So accept → `checkout_available: true` → checkout → provider TEST callback →
`complete_booking_fee` → engagement has always worked end to end, and the demo could always reach
an engagement. Session A's rewrite of the pay button onto `checkout_available` was the **correct**
gate rather than a workaround for a broken one.

What the missing writer genuinely broke is a different command: **`cancel_booking`**. It has always
had an `OFFER_ACCEPTED` branch — the Customer who changes their mind while a lead is holding the
job and before any money has moved — and that branch was unreachable, because `_locked_fee` found
nothing and refused with *"There is no booking fee on this request"* in exactly the window the
command exists for. A reader with no writer, and the cost of it was a dead cancel button rather
than a dead pay button.

`booking_fees.hold_booking_fee` is the writer, called from `accept_crew_offer`. Two things about
its shape are load-bearing:

- **It reuses rather than inserts.** `requirements_one_live_booking_fee` permits one non-`FAILED`
  fee per booking, and one booking row is reused across every cascade wave and every re-dispatch.
  An existing `OFFER_ACCEPTED` row is repointed at whoever holds the job now; a row in any other
  state is left completely alone and no row is written, so this can never touch money that already
  moved.
- **A lapsed hold releases it.** `release_expired_offer_hold` now calls
  `release_held_booking_fee`, which only ever touches a row that is `OFFER_ACCEPTED` **and** has no
  payment attempt behind it, marking it `FAILED` with `failure_code: "offer_hold_released"`.
  `FAILED` is the status `live_booking_fee` excludes and the unique constraint permits a row beside,
  which is exactly what "not a state the Customer is in" needs to mean here. Without it a lapsed
  hold would leave a row the next lead's acceptance has to reuse and a screen rendering an amount
  for a job nobody is holding.

**One thing was found while doing it and deliberately not fixed here.** A free re-dispatch after a
vendor no-show cannot charge or confirm the replacement crew: the fee is `REFUNDED`, the unique
constraint permits no second live row, and `create_booking_fee_checkout` refuses with "This booking
fee is already settled" — and since `complete_booking_fee` is what opens the engagement, the
replacement crew can never be confirmed. ADR-0009 says re-dispatch is **free**, so the answer is
probably to confirm without a second charge rather than to charge again — which is a money decision
and a second engagement-opening path, i.e. C6's `M2-BE-705`/`719` territory. Guessing it inside a
wave about shift-days would put an unreviewed money branch where nobody would look for one.
Appended to `frontend-execution-plan.md` §7 as its own row.

#### Four C2R contract gaps, closed in the same release

Logged by the Partner column against the 1.29.0 surface. All are one file deep, and leaving them
would have made the frontend's workarounds permanent.

1. **`m2_crew_offer_accept` returned `RateCardBooking` to the lead**, and that component carries
   `total_customer_paise`, `booking_fee_paise` and `day_rate_paise` — the three numbers the
   crew-offer *list* is scrupulous about withholding. The only thing stopping a lead from reading
   the Customer's total was the client choosing not to render it, which is not where a disclosure
   rule belongs. The response is now `CrewOfferAccepted`: the same job at the lead's own
   disclosure. **`RateCardBooking` is not removed or renamed** — `m2_rate_card_read` still returns
   it to the Customer, whose booking it is — so no component disappears; one operation answers with
   a different one, and that is the single response-shape change in 1.30.0.
2. `CrewOffer.status` is published as `VendorInvitationStatusEnum` rather than a bare string. The
   enum has been in the schema since 1.21.0; the field simply failed to name the vocabulary it was
   already speaking.
3. `CrewOffer.decline_reason_code` — new, so a decline confirmation can show what was **recorded**
   rather than echo what the client sent.
4. `crew_offer.view` / `.accept` / `.decline` join `WORKSPACE_ACTIONS` for A3. The partner screen was
   mounted behind `enquiry.accept`, which is correct today and wrong the day Operations wants to
   stop offering instant crew without also stopping quote enquiries.

#### The seed, and why it was not turned into a fixture generator

The orchestrator asked for the seed to be extended until the walkthrough reaches an engagement.
`seed_m2_demo` is deliberately a **configuration** seed — its whole docstring is about writing rows
into the tables the fail-closed readers already read, never about driving commands — and making it
book a requirement, accept an offer and capture a payment would make it a second, untested
implementation of the flow the runbook exists to exercise by hand.

What was missing was not seed data but the **walk itself**: `m2-demo-seed.md`'s A3 section is the
quote-first door and ends at a quote, so there was no written rate-card walk anywhere. It is now
§0.1 of this wave's smoke script, self-contained from an empty requirement through preset,
published rate, book, accept, the held fee, checkout, simulated capture and the engagement — and it
asks the owner to check `booking_fee.status == OFFER_ACCEPTED` at the one step that proves the fix.

#### Static gates

`.\scripts\quality-static.cmd` and `manage.py check`, both from `backend` with
`backend\.venv\Scripts\python.exe`, both green:

- `ruff format --check` and `ruff check` clean across **353 files**;
- strict MyPy clean across **233 source files**;
- `makemigrations --check --dry-run` — no changes;
- `spectacular --validate` — **zero warnings** after nine named enum overrides;
- contract-drift check clean;
- `manage.py check` — no issues (0 silenced).

Nine enums were named on arrival rather than after a positional rename breaks a client, which is
the standing rule since the 1.24.0 `ReasonEnum` incident: `ShiftAttendanceStatusEnum`,
`DaySettlementStatusEnum`, `SafetyIncidentStatusEnum`, `SafetyIncidentSeverityEnum`,
`SafetyIncidentReporterRoleEnum`, `SafetyIncidentDecisionEnum`, `AttendanceResponseEnum`,
`ShortfallChoiceEnum`, `ShiftExtraKindEnum`.

Additivity was **verified rather than assumed**: the generated schema's component names and paths
were diffed against the committed contract before publishing. Removed components: none. Removed
paths: none.

#### The one field name a client will guess wrong

`ShiftDay.day_label`, not `label`. `label` is DRF's own `Serializer` attribute and a field of that
name shadows it — mypy refuses the assignment and DRF would resolve it at random. Recorded in the
1.30.0 changelog and in `frontend-execution-plan.md` §7.

#### Smoke script

[`docs/runbooks/m2-workforce-shift-day-smoke.md`](../../docs/runbooks/m2-workforce-shift-day-smoke.md).
Nine sections, each naming what to check and — more usefully — what must be **absent**. It starts
from `seed_m2_demo` and the C2R rate-card walk, and the first thing it asks the owner to check is
that `scheduled_on` is a real date on every stage.

#### Blocked, and left blocked

| What | Blocked on | Behaviour meanwhile |
|---|---|---|
| The four values above | Owner (pre-phase decision list; ADR-0009 names the overtime window and the standing pattern) | Fail closed as tabulated; the dev seed makes the demo walkable |
| Deriving three pre-existing constraints from their tuples | Needs a published `TextChoices` moved to module scope, which risks renaming an OpenAPI component (RULES §7) | Verified to agree today; logged in §7 as its own change |
| Photographic evidence on a `SafetyIncident` | Wave C6 | The report carries a description and a severity; the stage-evidence presign is the rail to reuse, not a second uploader |
| `m2_booking_fee_payment_pending` | Unchanged from 1.29.0 — declared, raised by no path | Recorded again in the 1.30.0 changelog rather than quietly removed |
| `M2-BE-534`, `M2-BE-535` | Build-first amendment | Left unchecked and marked deferred; the smoke script replaces them for the sprint |

## Wave C5 — Project stages, A5 (`BE5B`) — **`[~]` shipped 14 August 2026**

`M2-BE-541..550`. Contract **1.31.0**, eight new paths. Full account in §"C5 outcome" below.

- [~] Milestone stages carrying deliverables and a frozen original, funding, evidence, review,
  approval (`541`, `542`).
- [~] Material advance as a distinct money purpose with its own recovery rule — **both halves now
  written**, on the transfer path and the early-termination path (`543`).
- [~] Vendor-abandonment recovery transferring remaining stages with the delta settled (`545`).
- [~] Warranty retention held back from the final stage, released at warranty close (`546`).
- [~] Digital deliverable handover with Customer acceptance, for Event and Media (`547`).
- [~] Customer-caused delay claim with evidence and a schedule extension (`544`).
- [~] Completion and warranty-window transitions that approve nothing on the way past (`548`).
- [~] The original **and** amended schedule, deliverables and money allocation, both readable
  (`549`).

---

### C5 outcome — 14 August 2026

**Built.** Contract **1.31.0**: eight new paths, eight new operations, seventeen new components
(91 → 99 M2 operations). One new module (`apps/requirements/projects.py`), three new aggregates,
migrations `catalog.0012`, `partners.0011`, `requirements.0010`, and three new
`CELERY_BEAT_SCHEDULE` entries. **No test was written or run**, per the build-first amendment;
`M2-BE-550` is left unchecked deliberately and the smoke script that replaces it for the sprint is
[`docs/runbooks/m2-project-stage-smoke.md`](../../docs/runbooks/m2-project-stage-smoke.md).

#### The shape of the wave, and what it deliberately did not add

A5 is the same spine as A3. The temptation in a wave called "project stages" is to build a project
subsystem, and the whole of `M2-BE-541` is the instruction not to: the archetype is a field on the
record. So a milestone is an `EngagementStage`, funding and evidence and approval and release are
the Wave C3 commands unchanged, and `projects.py` adds only the four facts a project has that a
shift-day does not.

Each of the three new tables exists because the spine genuinely has no room for it, and in one case
because an existing engine **refuses** to have room for it:

1. **A schedule can move with no money moving.** The first instinct was to route a delay claim
   through the M1 amendment engine, since "every scope change goes through the amendment engine".
   It cannot: `requirements_engagement_amendment_moves_money` refuses a zero delta at the database,
   deliberately, because an amendment a Customer must decide on that changes no money is a decision
   about nothing. A date is not scope. `ProjectDelayClaim` therefore has **no amount column and
   none may be added** — a delay that costs money is extra work, and extra work is an amendment the
   Customer pays for. One record that could do both would let "the site was locked on Tuesday"
   arrive as a bill.
2. **A vendor can change.** The one term an engagement freezes that no amendment was designed to
   move.
3. **A deliverable can be a file.** Event and Media work is finished by handing something over.

#### The transfer, and why it has no checkout

`M2-BE-545`'s brief is blunt about the risk: *a transfer that silently absorbs a price difference is
how somebody ends up paying twice.* The first design collected the delta as a payment. That is
wrong twice over — it charges the Customer for work they had already funded with the abandoning
vendor, and it needs a second engagement-opening money path nobody reviewed.

The settlement is **structural instead**, in one transaction:

1. every transferable milestone refunds what the Customer funded and the abandoning vendor never
   earned, through the M1 refund rail, and drops back to `REQUIRED`;
2. every transferable milestone is repriced to the replacement's own number, and
   `amendment_delta_paise` moves by exactly the difference, so
   `staged_total = total + amendment_delta` still holds by the `M2-BE-504` constraint;
3. the Customer funds the replacement's milestones as they reach them, at the price they accepted.

So **there is no transfer checkout and no new `PaymentAttempt.Purpose`**. The money asked for
afterwards is the ordinary stage funding that was always going to be asked for. Three details are
load-bearing:

- **Refund before reprice.** `requirements_stage_exposure_within_amount` is checked on every
  statement, so repricing a funded milestone downwards first would be the one instant in which the
  platform holds more of the Customer's money than the milestone is worth, and the database would
  refuse it.
- **The engagement returns to `PENDING_START` and `work_may_start_at` is cleared.** The replacement
  has nothing funded and no clearance; leaving the clearance standing would say otherwise.
- **A disputed milestone blocks the whole transfer**, and is re-checked at acceptance as well as at
  proposal — a Customer can dispute in the window between the two, which is exactly the moment a
  transfer would move an objection out of the agreement.

**Operations proposes; the Customer accepts.** Their remaining cost changes, and 07 §7 does not let
Operations change somebody's agreement for them. That is why the decision route is not under
`operations/`.

#### Retention, and the "final stage" that stops being knowable

`M2-BE-546` says the retention is held back **from the final stage**. The obvious reading — when
approving the last milestone, subtract it — does not survive contact with the amendment engine: an
additive amendment appends a stage, so which stage is last stops being knowable the moment somebody
accepts one, and a retention already released out of what turned out not to be the final milestone
cannot be un-released.

So it is allocated against the **cumulative** approved total, exactly as commission has been since
1.25.0 and for the same reason. The amount that should be held once `approved` of `staged` has been
approved is `max(0, retention - (staged - approved))`: zero for every early milestone, and the full
retention precisely when the last one is approved, whichever that turns out to be. A retention
larger than the final milestone simply starts biting one milestone earlier, which is correct and
needs no special case.

Retention comes out of the **gross**, not the net, so the commission on it is still booked; the
release entry at warranty close therefore carries commission zero, because charging it again would
take Vsolve's share twice on the same rupee.

Two smaller decisions beside it. The **percentage** is frozen at engagement creation and the
**window** is read at completion: the first decides how much of somebody's money is held and must
not move under a live project, the second only decides when a hold that already exists lifts. And
an engagement whose configuration was retired keeps its retention held and never appears in the
sweep, which is the fail-closed direction — releasing a warranty hold early against a window nobody
can read is the one failure retention exists to prevent.

#### Completion approves nothing on the way past

`M2-BE-548` names the failure precisely, and it is not hypothetical: `_complete_engagement_if_
finished` reaches `COMPLETING` only when nothing is open, but **an accepted amendment appends a
stage afterwards**, so by the time the Customer taps "this is done" there can legitimately be work
outstanding again. `accept_engagement_completion` now refuses an open stage by position, refuses a
disputed one with `m2_stage_disputed`, and refuses while a submitted handover is unaccepted.

That third refusal is the entire mechanism behind `M2-BE-547`. No configuration flag forces a
vendor to upload anything; what does the work is that a vendor who delivers privately has an
engagement that will not close and a retention that will not release.

#### The RULES §3 audit, stated

**(a) The drifting duplicate — swept mechanically, and this wave's own two were fixed.** A
throwaway script walked every model, collected every class attribute that is a tuple of strings and
compared it against every `__in` value set inside every constraint condition. Twelve pairs, of which
eight are exact matches that agree today (`PaymentAttempt.CHECKOUT_FREE_PURPOSES`,
`PartnerCapability.ACTIVE_STATUSES` and `REVIEW_STATUSES_NEEDING_NOTES`,
`CustomerRequirement.CLOSED_STATUSES`, `QuoteUnlock.READABLE_STATUSES`,
`VisitPlan.CHARGED_STATUSES`, `SiteVisit.SHARE_HOLDING_STATUSES`,
`ProposalSelection.LIVE_STATUSES`) and two are the pre-existing deliberate near-misses C4
documented in place.

**Two of the twelve were mine, and both were hand-copied lists.**
`requirements_decided_delay_claim_has_a_timestamp` and
`requirements_decided_transfer_has_a_timestamp` each enumerated two statuses inline. Neither was a
duplicate of an existing tuple — which is exactly how this class of defect gets waved through, since
there was nothing to compare them against yet. They are now derived from module-scope tuples
(`DELAY_CLAIM_UNDECIDED_STATUSES`, `PROJECT_TRANSFER_UNDECIDED_STATUSES`) bound onto the models as
`UNDECIDED_STATUSES`, following `commerce.CHECKOUT_FREE_PURPOSES`: module scope because a nested
`Meta` body cannot see its enclosing class's namespace, which is the whole reason a constraint ever
hand-copies a list. Deliberately **not** reusing `LIVE_STATUSES` — "still waiting on somebody" and
"has no decision timestamp" are different questions that happen to overlap, and an expired claim
answers `False` to the first and `True` to the second.

The three pre-existing constraints C4 could not derive are unchanged and still blocked on the same
thing: deriving them needs a published `TextChoices` moved to module scope, which risks renaming an
OpenAPI component (RULES §7).

**(b) The reader with no writer — three found, three closed, and two of them made a documented
surface unreachable in every environment.**

Mechanically: every column and status C5's new code reads was listed, and for each one the writer
was opened and read rather than assumed.

| Column / status | Reader | Writer |
|---|---|---|
| `M2VariantConfiguration.warranty_retention_basis_points`, `warranty_window_days` | `pricing.warranty_terms` | `seed_m2_demo._seed_a5_configuration` ✔ |
| `Engagement.retention_paise` | `stages._stage_retention_paise`, project read | `engagements._open_engagement` ✔ |
| `Engagement.retention_withheld_paise` | `_open_warranty_window`, `close_warranty_window` | `stages._hold_stage_payout` ✔ |
| `Engagement.retention_ledger_entry` | `release_retention_hold`, `warranty_close_due_ids` | `close_warranty_window` ✔ |
| `Engagement.warranty_ends_at` | `close_warranty_window`, `warranty_close_due_ids` | `_open_warranty_window` ✔ |
| `Engagement.handover_submitted_at` / `_accepted_at` / `_note` | `accept_engagement_completion` guard | `submit_project_handover`, `accept_project_handover` ✔ |
| `EngagementStage.deliverable` | `milestone_rows` | `engagements._a5_stages` ✔ |
| `EngagementStage.original_terms` | `milestone_rows` | **all three** stage-laying paths ✔ |
| `EngagementStage.cancelled_at` / `cancellation_reason_code` | `milestone_rows`, constraint | `projects._cancel_stage` ✔ |
| `EngagementStage.Status.CANCELLED` | `OPEN_STATUSES` / `TRANSFERABLE_STATUSES` exclusions | `projects._cancel_stage` ✔ |
| `PartnerStandingEvent.Kind.PROJECT_ABANDONED` | **nothing yet** | transfer + termination |

The last row is a **writer with no reader**, which is the safe direction and matches C4's precedent:
no threshold acts on abandonment because the owner has not said how many abandoned projects make a
pattern. The events accumulate, so turning the rule on later is loading a value rather than
backfilling a history.

`EngagementStage.original_terms` is the one worth naming, because `_a5_stages` alone would have been
the obvious place to write it and would have been wrong: there are **three** paths that lay out a
stage, and the amendment path is the one that matters most — an appended stage with no original is a
stage a later transfer can reprice with nothing to be measured against. All three write it, through
one shared `stages.original_terms_of`.

**Three genuine defects were found by this sweep and all three are C4's or older:**

1. **`PartnerCrewMembership.documents_verified_at` had four readers and no writer anywhere in the
   codebase.** `crew_dispatch` counts only verified memberships when it sizes a lead's roster
   against the headcount, `workforce.assign_crew` refuses an unverified worker outright, and both
   apps publish a verification badge from it. With nothing setting it, **every vendor's verified
   roster was zero in every environment** — so the A3 cascade excluded every lead,
   `accept_crew_offer` answered `m2_roster_insufficient`, and the rate-card walkthrough this whole
   revision exists for could not reach its third step. This is the same class as C4's
   `scheduled_on`, one layer further out. The honest writer is an Operations "verify crew documents"
   command with an actor and an audit trail, which is Wave C6 and is logged in §7; the dev seed now
   stamps it, marked as the dev-only fixture it is.
2. **`DaySettlement.upi_payment_link` had no writer on the read path.** `DaySettlement` has no such
   column — the value is computed by `workforce.upi_payment_link` — and the only thing that ever
   populated it was a manual injection into the settlement *command's* own response body. The deep
   link was therefore **absent before the tap and gone after a reload**, never appearing on
   `m2_shift_day_read`, which is the screen a Customer opens in the evening. DRF made it invisible
   rather than loud, answering `null` for the missing attribute instead of raising, so nothing
   failed and the one convenience `M2-BE-536` exists to offer simply was not there. Now a
   `SerializerMethodField` on the serializer itself, so both surfaces get it and the injection in
   the view is gone. **The wire shape is unchanged.**
3. **No seed wrote a `PartnerPayoutAccount`.** `payouts.payable_account` gates every M2 payout
   release there is — the visit share, the approved stage, and now the warranty retention — so every
   demo earning stopped at `PENDING` and the last step of the A5 money story could not be seen at
   all. Blank is a legitimate *production* state; it is not a legitimate demo state.

**None of the three would have been caught by any static gate**, which is now the fourth wave
running that this has been true of. The check is not a gate: it is asking, of every column the new
code reads, *who writes this?* — and then opening that file.

#### Two more contract gaps closed, reported by the frontend columns against 1.30.0

Both are A3's surface rather than this wave's, both one file deep, and leaving them would have made
the workarounds permanent.

- **`DaySettlement.shortfall_choice` excluded its own resting value.** The column is `blank=True`
  and rests at `""`, but the response rendered it from `ShortfallChoice.choices`, which does not
  contain the empty string — so every settlement that never had a shortfall carried a value the
  schema called impossible. Now `oneOf: [ShortfallChoiceEnum, BlankEnum]`. The **request** shape had
  this right since 1.30.0; only the response was wrong.
- **`MAXIMUM_DISPUTED_WORKERS` was enforced and published nowhere.** The bound existed only as a
  `400` a client discovered by hitting it. Now published as a description — `max_length` on a DRF
  `ListSerializer` is enforced at runtime but drf-spectacular emits no `maxItems` for it — with the
  number imported from the domain rather than retyped, so published and enforced cannot drift.

#### Fail-closed, and in which direction

Two owner-blocked values were added, both on `M2VariantConfiguration`, and they fail together:

| Config | Unset means |
|---|---|
| `warranty_retention_basis_points` | An A5 estimate carrying `warranty_terms` is refused at submission (`m2_policy_unavailable`). An estimate with no warranty terms is unaffected. |
| `warranty_window_days` | The same refusal. A warranty of zero days is not a warranty, so this one is in `M2_POSITIVE_WHEN_SET_POLICY_FIELDS`; the percentage is not, because **zero retention is a real decision**. |

That is `M2-BE-546`'s own sentence — a variant either funds retention or does not advertise warranty
— enforced at the composer rather than discovered at handover, which is the point at which nobody
can do anything about it. `seed_m2_demo` writes both (5% for 90 days, invented and marked).

No new clock was invented for the delay claim or the transfer proposal: both reuse
`pricing.amendment_response_deadline`, because it is the same promise the amendment engine already
makes — how long the Customer has to answer the vendor about the agreed work — and a second unset
value would block a second command on a decision nobody has been asked for.

#### Not done, and why

- **`M2-BE-550`** is this wave's test debt, left unchecked. The smoke script replaces it.
- **The frontend client is not regenerated.** `generated/**` is frozen; **1.31.0 needs
  regeneration** before either frontend column can consume any of this.
- **The Operations "verify crew documents" command** is not built. It is a real reviewed surface
  with an actor, an audit trail and a permission behind it, and it belongs with the rest of the
  Operations APIs in C6. The seed stamps the column meanwhile.
- **`terminate_project_early` decides no remedy.** No penalty, no forfeit, no compensation — that is
  the cancellation policy engine (`M2-BE-701`, `706`). Returning money nobody earned is the absence
  of a remedy rather than one, which is why it is safe to ship without the owner's cancellation
  decisions.
- **The free re-dispatch after a vendor no-show is still C6's**, exactly as C4 left it. It did not
  fall out of this wave and was not expanded into it.
- **A transfer moves the milestones as they are.** A replacement who wants a *different* milestone
  structure is a scope change, and that goes through the amendment engine after the transfer. The
  transfer prices the work that was agreed; it does not renegotiate it.

#### Static gates

`.\scripts\quality-static.cmd` and `manage.py check`, both from `backend` with
`backend\.venv\Scripts\python.exe`, both green — ruff format and check clean, strict MyPy clean
across **222 source files**, `makemigrations --check` no changes, `spectacular --validate` zero
warnings after three new named enums, contract-drift check clean, `manage.py check` no issues.

Three enums named on arrival rather than after a positional rename breaks a client:
`ProjectDelayClaimStatusEnum`, `ProjectTransferStatusEnum`, `ProjectDeliverableKindEnum`. The A5
milestone read needs none even though it publishes `status`, `kind` and `funding_state`: those are
`ChoiceField`s over `EngagementStage`'s own already-pinned sets, so the project surface reuses the
components published since 1.24.0 rather than splitting them.

Additivity was **verified rather than assumed**: every component name, path and `operationId` was
diffed against the committed contract before publishing. Removed: none. Exactly two existing
components changed — `EngagementStageStatusEnum` gained `CANCELLED`, and
`DaySettlement.shortfall_choice` widened to admit the value it always carried.

#### The one field name a client will guess wrong

`ProjectMilestone.milestone_label`, not `label`. `label` is DRF's own `Serializer` attribute and a
field of that name shadows it — mypy refuses the assignment and DRF resolves it at random. This is
the **second** wave to hit it (`ShiftDay.day_label` was C4's), which is why the frozen twin is
`original_milestone_label` rather than `original_label`: every "as agreed" reading is `original_`
plus the current field's own name, so the pairing stays mechanical.

#### Blocked, and left blocked

| What | Blocked on | Behaviour meanwhile |
|---|---|---|
| Retention percentage and warranty window | Owner (pre-phase decision list) | An estimate promising warranty is refused; one without is unaffected. The dev seed makes the demo walkable |
| Operations crew-document verification | Wave C6 Operations APIs | The dev seed stamps `documents_verified_at`; production has no writer, logged in §7 |
| Cancellation remedies on an early termination | Owner decisions + Wave C6 (`M2-BE-701`, `706`) | Unearned funding is returned; no penalty is decided |
| A case behind a stage dispute | Wave C6 | `m2_stage_dispute_resolve` is drivable; the case machinery is not built |
| Deriving three pre-existing constraints from their tuples | Unchanged from C4 — needs a published `TextChoices` at module scope (RULES §7) | Verified to agree today |
| `M2-BE-550` | Build-first amendment | Left unchecked; the smoke script replaces it |

---

## Wave C6 — Recovery, refunds, disputes, Operations APIs (`BE6`) — **`[~]` shipped 15 August 2026**

`M2-BE-701..715`, `718`, `719`. Contract **1.32.0**, twenty-three new paths. Full account in
§"C6 outcome" below.

- [~] Policy engine, linked cases, evidence, deadlines, decisions, appeals (`701`–`704`).
- [~] Idempotent ledger-backed refunds; provider pending, failed and reversed states (`707`).
- [~] Booking-fee outcomes beside the unlock's (`705`) and the visit plan's (`718`): full refund
  with free re-dispatch on vendor no-show; the forfeit split through the M1 payout rails (`719`,
  revision 4).
- [~] Chargeback on the booking, unlock or visit-plan fee through the standard dispute path (`708`).
- [~] Automatic payout hold when a qualifying case opens (`709`).
- [~] Scheduled reconciliation of payment, refund, ledger and payout with alerts (`710`).
- [~] Unified request timeline API (`711`) — one timeline, consumed by both Operations folders.
- [~] Safe Operations actions: rematch, reclassification, deadline extension, refund review (`712`).
- [~] Assisted clarification and **assisted A3 quote capture as a primary path of the fallback quote
  flow** (revision 4), attributed to the named Partner with consent recorded (`713`).
- [~] Stuck-state queues and scheduled recovery (`714`); Operations-touches-per-request (`715`).
- [ ] `M2-BE-716` and `M2-BE-717` are **test tasks** and are left unchecked deliberately. The smoke
  script that replaces them for the sprint is
  [`docs/runbooks/m2-recovery-smoke.md`](../../docs/runbooks/m2-recovery-smoke.md).

---

### C6 outcome — 15 August 2026

**Built.** Contract **1.32.0**: twenty-three new paths, twenty-four new operations, thirty-six new
components (99 → 123 M2 operations). Four new modules (`apps/requirements/cancellations.py`,
`disputes.py`, `operations.py`, `reconciliation.py`), three new aggregates
(`RequirementCancellation`, `OperationsTouch`, `OperationsCaseEvidence`), migrations `catalog.0013`,
`cases.0002`, `commerce.0011`, `requirements.0011`, and two new `CELERY_BEAT_SCHEDULE` entries.
**No test was written or run**, per the build-first amendment.

#### The shape of the wave: one case table, not two

The temptation in a wave called "disputes" is to build a dispute subsystem. `apps.cases` already
owns a queue, a severity SLA, a required terminal result per kind, an append-only event trail and
the `holds_payout` column the payout selector reads. So C6 **extended that table** — two new
subjects (`requirement`, `engagement`), five new kinds, six new event kinds, response deadlines,
appeals and an evidence child — rather than building a second one beside it. An operator with two
inboxes has none, and the M1 Operations console gets every M2 case for free.

Three things genuinely could not be reused and are new records:

1. **A cancellation is not a status.** `M2-BE-701` wants "lifecycle state, actor, reason, evidence,
   contact-disclosure state, fulfilment evidence and calculated remedy" — and every one of those
   facts stops being knowable the instant the cancellation runs. So `evaluate` writes the row and
   `_execute` is a separate step that may not run for hours or, if the counterparty disputes, ever.
   A status column also cannot hold *two* accounts of one event, which is the entire subject of
   `M2-AC-702` and `M2-AC-703`.
2. **An Operations touch is not derivable.** `identity.AccessAuditEvent` counts requests to a view,
   so one operator scrolling a queue looks like ten touches; `RequirementTransition` records the
   actor but not their role, so a Customer cancelling their own request counts as Operations work.
   `M2-BE-715` needs a deliberate write by a named operator against a named request, and nothing
   else can tell you that.
3. **Case evidence is a reference, not an upload.** Wave C5 recorded the rule — "the stage-evidence
   presign is the rail to reuse, not a second uploader" — so `OperationsCaseEvidence` points at a
   `RequirementAttachment` or a `StageEvidence` that already came through a scanned rail. The
   consequence is deliberate: a party can only show something they have already legitimately put on
   the platform.

#### Scheduled item 1: the Operations crew-document verification command — **landed**

`operations.verify_crew_documents`, published at
`POST /operations/crew-memberships/{membership_id}/verification/`, with the queue it works from at
`GET /operations/crew-memberships/`.

C5 found `PartnerCrewMembership.documents_verified_at` with four readers and no writer anywhere:
`crew_dispatch.verified_roster_size` counts only verified memberships when sizing a lead's roster
against the headcount, `workforce.assign_crew` refuses an unverified worker, and both apps publish
a badge from it. With nothing setting it, **every vendor's verified roster was zero in every
environment**, the A3 cascade excluded every lead, and the rate-card walkthrough this revision
exists for could not reach its third step. C5 stamped it in the dev seed and deferred the real
command here.

It is built as the reviewed surface the brief asked for, and each of the four parts is a decision:

- **an actor** — Operations-only by permission, and the operator lands on the `AccessAuditEvent`
  the permission class already writes;
- **a reason on the negative path** — verifying needs none, because the documents were seen;
  *removing* verification takes a named person off jobs they may already be assigned to, and the
  command refuses without one;
- **an audit trail** — an outbox event per transition, keyed on the membership and the timestamp.
  A `PartnerStandingEvent` was considered and rejected: standing is about a vendor's *conduct* and
  a document check is about a worker's *paperwork*, and conflating them would put a clerical fact
  into the table a demotion threshold counts;
- **idempotence** — verifying an already-verified membership returns it unchanged rather than
  re-stamping, so the date keeps meaning "when the documents were actually checked".

#### Scheduled item 2: the vendor-no-show free re-dispatch — **landed**

This is the one that needed a money decision and a second engagement-opening path, and it had
**three** separate blockers rather than the one C4 recorded.

**Blocker 1 — the fee slot.** `requirements_one_live_booking_fee` permitted one non-`FAILED` fee per
booking. After a vendor no-show the fee is `REFUNDED`, which is non-`FAILED`, so the replacement
lead's acceptance had nowhere to write a row: `create_booking_fee_checkout` answered "this booking
fee is already settled" and `complete_booking_fee` — the only engagement-opening path — never ran.
The constraint now excludes `REFUNDED` as well, derived from a module-scope tuple
(`BOOKING_FEE_NON_BLOCKING_STATUSES`) rather than the hand-copied one-element list it had. At most
one *chargeable* fee can still exist at a time, which is the guarantee that mattered.

**Blocker 2 — the money decision, taken explicitly.** Revision 4 promises "refunds in full **and**
free re-dispatch". Three readings were available and two are wrong: charging again is not free, and
reversing the refund takes back money the Customer has already been told is theirs. So **Vsolve
earns nothing on a booking whose first crew did not turn up.** `BookingFee.Status.WAIVED` records
the confirmation without the money — the published amount, nothing collected, deliberately **not**
in `CHARGED_STATUSES`, so no reconciliation counts it as revenue.

**Blocker 3 — `Engagement.requirement` is a `OneToOneField`.** A re-dispatched requirement cannot
have a second engagement, and `open_rate_card_engagement` would find the cancelled one, return it
untouched, and attach the replacement lead to an agreement belonging to the vendor who never
arrived. `engagements.reopen_rate_card_engagement` **re-points** it instead — exactly as
`projects.decide_project_transfer` re-points an abandoned A5 project, a reviewed pattern with a
precedent rather than a novelty. It is safe in both places for the same reason: the *agreement* has
not changed. The Customer is owed the crew they booked at the frozen rate, and what moved is who is
supplying it.

Three details are load-bearing:

- **The shift-days are reused, not re-laid.** §4c only ever reaches a vendor no-show from an
  `ACTIVE` fee — the fee earns at first-day arrival — so a no-show is by construction before any
  day was delivered. Re-laying days would inflate `staged_total_paise` and force a matching
  movement in `amendment_delta_paise`, recording an amendment nobody proposed and nobody accepted.
  A stage that has actually progressed **refuses**: a vendor walking off mid-job is a different
  remedy and it is not this one.
- **The old lead's crew assignments are released**, or they would misrepresent who is coming and
  hold those workers' dates against the cross-agency conflict index.
- **It is called from `accept_crew_offer`, not from a route.** There is nothing for the Customer to
  do, and an endpoint here would be an endpoint that confirms a crew without anybody paying.

The asymmetry it creates is stated rather than papered over: a lead who travels to a locked gate on
a **re-dispatched** booking is uncompensated, because the platform holds no money for that booking.
`forfeit_booking_fee` refuses on a `WAIVED` fee with a named message, the no-show is still recorded
against standing and still opens a case, and this is logged in §7 as an owner question rather than
answered with an invented payment.

#### The warranty claim, which the Customer column found

`POST /engagements/{engagement_id}/warranty-claim/`, and it closes a real hole rather than adding a
feature. `M2-BE-546` holds a retention out of the vendor's payout against a warranty promise, and
there was **no published way to call on it**: `m2_stage_dispute` accepts only a stage in
`AWAITING_REVIEW`, and by warranty time every stage is settled by definition, so it refused by
construction; `/operations/cases/` is staff-only. Money was being held for a promise the product
could not accept a call against.

`QUALITY` rather than a new kind, because the M1 case type already means exactly this and already
carries the three terminal results a warranty claim can have. It is also already payout-holding,
which is the second half of the fix: **opening the claim freezes the retention**, and
`stages.close_warranty_window` now refuses to release while one is open. Wave C5 could not have
guarded that, because there was no way to raise the claim.

#### The RULES §3 audit, stated

**(a) The drifting duplicate — swept mechanically, and this wave's own two derive.** A throwaway
script walked every model, extracted every `__in` value set inside every constraint condition, and
compared each against every class-level tuple of strings. Twenty-three constraints carry an `__in`
set; **thirteen are bound to a tuple** and ten have no matching tuple, all ten pre-existing M1
(`assignments.Reservation` ×3, `PartnerOffer` ×2, `payouts` ×3, `carts`, `VendorInvitation`) or the
three C4 documented near-misses.

C6's own two both derive:

- `requirements_one_live_booking_fee` now reads `BOOKING_FEE_NON_BLOCKING_STATUSES` from module
  scope. It previously hand-copied a **one-element** list — the shape that looks harmless and is
  exactly the one that drifts the moment a second status joins it, as one just did.
- `requirements_one_live_cancellation` reads `CANCELLATION_LIVE_STATUSES` from module scope from
  the start.

Two more were **derived rather than duplicated** while extending existing code:

- `cases_exactly_one_subject` is now generated from `CASE_SUBJECT_FIELDS` by a helper. This wave
  took it from three subjects to five, and typing the five-way `Q` by hand is precisely how the
  sixth gets missed. Verified in the migration: the generated condition is the correct five-way OR.
- The four `catalog_m2_configuration_*_within_range` basis-point constraints are now generated from
  `M2_BASIS_POINT_POLICY_FIELDS`, which were four hand-written copies of one sentence before a
  fifth was needed. **Verified additive**: the generated names reproduce the existing four exactly,
  and `catalog.0013` only *adds* `chargeback_alarm_within_range` — no rename, no drop.

`OperationsCaseEvidence`'s two constraints and `RequirementQuestion`'s consent constraint enumerate
nothing; they are null/blank predicates with no list to drift.

**(b) The reader with no writer — one found, one closed, and it is a published enum value.**

Mechanically: every column and status C6's new code reads was listed, and for each one the writer
was opened and read rather than assumed. A second script asserted that every field on every M2
model is assigned somewhere outside a migration.

| Column / status | Reader | Writer |
|---|---|---|
| `M2VariantConfiguration.case_response_window_hours`, `case_appeal_window_hours` | `pricing.case_response_deadline`, `case_appeal_deadline` | `seed_m2_demo._C6_RECOVERY_POLICY` ✔ |
| `.chargeback_alarm_basis_points`, `.chargeback_alarm_min_charges` | `pricing.chargeback_alarm` | same ✔ |
| `.operations_touch_budget_per_request` | `pricing.operations_touch_budget` | same ✔ |
| `OperationsCase.requirement` / `.engagement` | `disputes._case_subjects`, `request_cases`, the timeline | `disputes.open_linked_case` ✔ |
| `OperationsCase.response_due_at` | `stuck_queues`, the party payload | `open_case`, `set_case_response_deadline` ✔ |
| `OperationsCase.held_ledger_entry_ids` | `disputes.release_engagement_payouts` | `disputes.hold_engagement_payouts` ✔ |
| `OperationsCase.appeal_*` | `decide_case_appeal`, the party payload | `request_case_appeal`, `decide_case_appeal` ✔ |
| `OperationsCase.Kind` ×5 new | `PAYOUT_HOLDING_KINDS`, `DEFAULT_TEAM`, `ALLOWED_RESOLUTIONS` | five distinct commands ✔ |
| `OperationsCaseEvent.Kind` ×6 new | the event trail | `cases.services` ✔ |
| `BookingFee.Status.WAIVED` | `earn_booking_fee`, `cancel_booking`, `_refund`, the remedy, reconciliation | `confirm_free_redispatch` ✔ |
| `RateCardBooking.free_redispatch_*`, `redispatch_count` | `_redispatch_entitlement_is_live`, the no-show case key | `_redispatch_after_vendor_no_show`, `confirm_free_redispatch` ✔ |
| `RequirementQuestion.captured_by`, `consent_recorded_at` | `question_asker_role` (**after this wave's fix**) | `operations.capture_assisted_clarification` ✔ |
| `OperationsTouch.*` | `touch_metric`, `touch_rollup`, the timeline | `operations.record_touch` ×5 commands ✔ |
| `FinancialException.Kind.CHARGEBACK`, `.RECONCILIATION_MISMATCH` | `open_exception_summary`, `chargeback_rate_basis_points` | `record_fee_chargeback`, `reconcile_m2_money` ✔ |
| `PartnerCrewMembership.documents_verified_at` | `verified_roster_size`, `assign_crew`, both apps' badges | **`operations.verify_crew_documents`** — the C5 defect, now closed ✔ |

**One genuine defect, and it is the sixth wave running.** `QUESTION_ASKER_ROLES` publishes
`OPERATIONS`, and `selectors.question_asker_role` returned it as the **fall-through** for "asked by
somebody who is neither party". C1 wrote it that way explicitly anticipating this wave — its
docstring says "the third exists so an assisted question does not silently read as the vendor's".
When the assisted capture arrived it attributed the question to the **Partner**, which `M2-AC-802`
requires (the question is the vendor's; the operator merely wrote it down), so the fall-through
became **unreachable** and every assisted question would have read as an ordinary vendor question —
a published enum value with a reader, a schema entry, a client `switch` and no writer. It now reads
`captured_by`, a stored fact rather than a fall-through, so the answer is positive in all three
cases. **No static gate would have caught it**, which is now the sixth consecutive wave that has
been true of.

#### Fail-closed, and in which direction

Five owner-blocked values were added, and they deliberately fail in three different directions:

| Config | Unset means |
|---|---|
| `case_response_window_hours` | The case **still opens** and carries no party deadline. Refusing to open a safety case for want of a response window would be the worst fail-closed direction available. |
| `case_appeal_window_hours` | An appeal against a **resolved** case is refused (`m2_policy_unavailable`). An appeal window with no bound is an open-ended claim to reverse a decision that already moved money. An appeal against an open case needs no window and is unaffected. |
| `chargeback_alarm_basis_points` / `_min_charges` | **No alarm fires**, and every chargeback is still recorded as a case. The same asymmetry `crew_decline_alarm_*` draws. |
| `operations_touch_budget_per_request` | The metric is **still emitted**; `within_budget` is `null`. Measurement never waits on the owner — only the judgement does. |

No new clock was invented for the counterparty confirmation: it reuses
`pricing.amendment_response_deadline`, because it is the same promise the amendment engine already
makes — how long one party has to answer the other about the agreed work — and a twelfth unset value
would have blocked the command on a decision nobody has been asked for.

**Wages stay outside all of it.** The four earnings this wave can freeze are the four that exist as
`PartnerLedgerEntry` rows — a stage payout, a visit share, a warranty retention and a booking-fee
travel compensation — and a shift-day's wage is none of them. The A3 cancellation remedy always
carries a `service_payment` entry reading `no_platform_money` with the sentence saying so, rather
than omitting it, because a missing entry reads as an oversight and an explicit one reads as a rule.

#### Not done, and why

- **`M2-BE-716` and `M2-BE-717`** are test tasks. Left unchecked deliberately;
  `docs/runbooks/m2-recovery-smoke.md` replaces them for the sprint.
- **The frontend client is not regenerated.** `generated/**` is frozen; **1.32.0 needs
  regeneration** before the admin app's M2 screens can consume any of this.
- **The chargeback rate alarm is unexercised.** It needs twenty captured M2 fee charges on one
  variant before a rate means anything, which is more than a hand-walk produces. The threshold is
  seeded and the path is one `if`; recorded as uncovered rather than quietly assumed.
- **No demo refund or chargeback row in the seed.** Both need a captured `PaymentAttempt` behind
  them, and a seeded payment no provider ever saw is a row the reconciliation sweep would
  immediately and correctly report as a mismatch — a fixture that breaks the surface it was written
  to demonstrate. The smoke script reaches both instead.
- **A `WAIVED` fee cannot compensate a lead for a customer no-show.** Stated above, logged in §7.
- **`reconcile_m2_money` walks every settled M2 row.** Fine at demo volume, hourly on the beat, and
  it will need a cursor before a production book. Recorded rather than pre-optimised.

#### Static gates

`.\scripts\quality-static.cmd` and `manage.py check`, both from `backend` with
`backend\.venv\Scripts\python.exe`, both green and both re-run to completion after the last edit —
ruff format and check clean across 358 files, strict MyPy clean across **238 source files**,
`makemigrations --check` no changes, `spectacular --validate` zero warnings, contract-drift check
clean, `manage.py check` no issues.

Additivity was **verified rather than assumed**: every path, `operationId` and component name was
diffed against the committed 1.31.0 contract. Removed: **none** — 233 → 256 paths, 262 → 286
operations, 470 → 506 components. Four existing components gained values or fields and none changed
meaning: `OperationsCaseKindEnum` (+5), `OperationsCaseEventKindEnum` (+6), `BookingFeeStatusEnum`
(+`WAIVED`) and `OperationsCase` (+11 fields).

#### The field name a client will guess wrong — for the third time

`StuckQueue.queue_label`, not `label`. `label` is DRF's own `Serializer` attribute and a field of
that name shadows it: mypy refuses the assignment and DRF resolves it at random. This is the
**third** wave to hit it — `ShiftDay.day_label` was C4's and `ProjectMilestone.milestone_label` was
C5's — so the rule is now mechanical rather than remembered: every human-readable name on an M2
shape is `<thing>_label`. The dataclass field is renamed to match, because `asdict()` would
otherwise silently drop it.

#### Blocked, and left blocked

| What | Blocked on | Behaviour meanwhile |
|---|---|---|
| The four C6 policy values | Owner (decisions 12/13 and the pre-phase list) | Each fails in the direction stated above; the dev seed makes the demo walk |
| Compensating a lead on a customer no-show against a **waived** fee | Owner: revision 4 has no answer, and the platform holds no money for that booking | Refused with a named message; the no-show is still recorded and still opens a case. §7 |
| Deriving the ten pre-existing M1 constraints from tuples | Unchanged from C4/C5 — needs published `TextChoices` at module scope (RULES §7) | Verified to agree today |
| `M2-BE-716`, `M2-BE-717` | Build-first amendment | Left unchecked; the smoke script replaces them |

## Wave C7 — Security, observability, release (`BE7`) — **`[~]` shipped 15 August 2026**

`M2-BE-801`, `803`, `805`, `806`, `808`, `809`, `810`, `811`, and the non-test half of `812`.
Contract **1.33.0**. The last backend wave. Full account in §"C7 outcome" below.

- [~] `M2-BE-801` Threat model, written as a runbook and shipped with the guards it justifies:
  [`docs/runbooks/m2-threat-model.md`](../../docs/runbooks/m2-threat-model.md).
- [ ] `M2-BE-802` **Test task — not written, not run.** Object-level authorization has no regression
  test. It is enforced at every call site by an actor-scoped selector answering `404` rather than
  `403`, and **nothing proves it stays enforced.** This is the largest open hole in the M2 security
  posture and the threat model says so in those words.
- [~] `M2-BE-803` Rate limits and abuse controls: six named scopes over thirty-two write views, a
  three-unanswered-questions-per-thread clarification cap, and a limiter that fails **open** on a
  cache outage and emits a counter saying it did.
- [ ] `M2-BE-804` **Test task — not written, not run.** No concurrency test on quote slots, capacity
  holds, selection, crew assignment, stage approval, refund or payout. The row locks and partial
  unique indexes are in place from C2–C5; none of them is exercised by anything.
- [~] `M2-BE-805` Retention, redaction and erasure, with the financial hold outranking deletion.
  `apps/requirements/retention.py`, two marker columns, a daily attachment sweep and an audited
  management command. **This platform redacts and never deletes.**
- [~] `M2-BE-806` Structured metrics for `README.md`'s success measures — eleven named counters, the
  whole funnel emitted from the one audited write every M2 command already makes — **plus the
  decline-alarm read that had no owner**.
- [~] `M2-BE-807` Confirmed, not rebuilt. The ladder and the fail-closed transport seam are as C6
  left them; MSG91 has not landed and nothing here calls a transport that raises.
- [~] `M2-BE-808` Correlation across the queue, safe structured logs, and a watchdog on the
  watchdogs. Two defects closed on the way: the log formatter was discarding every metric ever
  emitted, and no async work had a correlation id at all.
- [~] `M2-BE-809` [`docs/runbooks/m2-adapter-reliability.md`](../../docs/runbooks/m2-adapter-reliability.md).
- [~] `M2-BE-810` One feature flag, gating **new purchases only**. Three doors closed, five
  deliberately left open, and the reasoning for each written down.
- [~] `M2-BE-811` [`docs/runbooks/m2-release.md`](../../docs/runbooks/m2-release.md).
- [~] `M2-BE-812` **Non-test half only.** Ruff (format + check), strict MyPy over 246 source files,
  `makemigrations --check`, `spectacular --validate` and the contract-drift check: all green, run to
  completion. **Branch-aware coverage is a test task and was not run.**

---

### C7 outcome — 15 August 2026

**Built.** Contract **1.33.0**: one new path, one new operation, three new components, one enum value
and one field. Seven new modules (`apps/requirements/purchase_gates.py`, `metrics.py`,
`retention.py`, `watchdog.py`, `common/throttling.py`, `common/observability/redaction.py`,
`common/observability/tasks.py`), one new management command, migrations `notifications.0003` and
`requirements.0012`, and two new `CELERY_BEAT_SCHEDULE` entries.

#### `M2-BE-810` — the flag, and where the line is drawn

Reuses `notifications.KillSwitch` rather than adding a flag table: it is already a row not a
setting, already carries an actor and a reason enforced by a check constraint, and already has a
published Operations write pair. One new scope, `M2_PURCHASES`, with an optional `ServiceVariant`
target.

The rule the whole module is an instance of: **gate the door that starts burning supply; never gate
the payment that resolves a hold a vendor is already sitting on.**

Gated — `book_at_published_rate`, `create_unlock_checkout`, `choose_visit_plan`. All three run
before any vendor has been asked for anything, so a refusal costs a tap and nothing else.

Not gated, and this list is the task rather than an omission: the booking-fee checkout and the
visit-plan checkout (a lead is holding their Saturday; the payment is what releases it either way),
every provider callback (the money has already left), stage and amendment funding, and every refund,
forfeit, payout and cancellation. **A flag that strands a funded stage is worse than no flag**, and a
pause must never make money harder to give back than it was to take.

Three placement decisions inside the gated three, each of which would have been a defect the other
way round:

* The unlock gate sits **after** the resume branch. A Customer returning to a `PENDING` attempt is
  continuing a purchase; refusing them there leaves them holding a charge nobody will honour.
* The A5 gate sits **after** the two "already in progress" guards, so a live plan hears "already in
  progress" rather than "we have paused new bookings" — only one of those is true of it.
* The A3 gate sits **before** the cascade, so no lead's phone rings for a job about to be refused.

New code `m2_purchases_paused` (409, **retryable**), deliberately not `m2_policy_unavailable`: that
one means "nobody has decided", this means "we decided and stopped selling". Time helps with one and
not the other. Not in the frozen 29 — §7 row filed.

The published availability reads now tell the truth **before** the tap: `is_available` on the unlock
goes `false` and `available_tiers` on the visit plan goes empty. Both were already-published fields,
so this costs the client nothing.

#### `M2-BE-806` — the funnel from one call site, and the alarm that had no reader

`README.md` lists fifteen success measures and almost all of them are **ratios of two counts on the
same funnel**. Fifteen emitters would be fifteen things that can drift from the transitions they
claim to count, so the funnel is emitted **once**, from `services.record_transition` — the single
audited write every M2 command already makes — carrying the `reason_code` as a label. The eighty-odd
reason codes already in the vocabulary (`booked_at_published_rate`, `crew_offer_accepted`,
`booking_fee_verified`, `fell_back_to_quote_flow`, `first_visit_slot_confirmed`,
`estimate_delivered`, `day_settled_confirmed`, `cash_demand_reported`) mean every published rate is
two label filters apart downstream, and a command that starts recording a new code is measured the
day it ships without anybody remembering to add a metric.

What a counter cannot express is **elapsed time**, so the two clocks get their own metrics with a
`within_sla` label whose third value is `no_promise` — an unset SLA is neither kept nor broken, and
scoring it either way invents a target.

**`reason` is never a label. `reason_code` is.** The first is free text about a real person's
situation and a metric line is a log line.

**The decline alarm** (coordinator item). The data has been recorded since C4, the threshold has
been an owner-blocked column since C2R, and the sweep has been paging Operations by email — and
**nothing published a reading**, so the one signal that says A3 supply is failing could not be put
on a screen. `GET /api/v1/operations/rate-cards/decline-alarm/` publishes every live card, **armed
or not**, because the most useful thing it can say on the day supply fails is *nothing here is
watching*, and a list that filtered the unarmed cards out would say the opposite by being short.
`armed` is published rather than inferred; `threshold_basis_points` and `minimum_offers` are
nullable, since a `0` would read as "alarm on everything". `DECLINE_ALARM_WINDOW_HOURS` moved from
`tasks.py` to `crew_dispatch.py` so the sweep and the panel cannot describe different windows.

#### `M2-BE-803` — two controls, because neither catches what the other does

`ScopedWriteThrottle` extends the `ScopedRateThrottle` the geocoding routes already use, so the
transport, the `code: "throttled"` envelope and the `Retry-After` all already existed. Six scopes,
thirty-two views, keyed per authenticated user. Every rate is a **ceiling on abuse, not a pacing
limit** — set well above what the fastest honest use of the screen behind it produces, because a
limit that fires on real traffic is a limit somebody turns off.

**`ThrottledWriteMixin` exempts safe methods, and that is load-bearing.** Several M2 routes carry a
`GET` and a `POST` on one class and the `GET` is what a Customer's screen **polls** while the
provider confirms a payment. Mounting `m2_money` at 30/hour without the exemption would rate-limit
the poll that exists to tell somebody their money arrived, precisely while they are watching it.

**It fails open on a cache outage, and emits a counter saying so.** The one deliberate departure
from RULES §4, and the reasoning is that §4 is about *owner-blocked values* — a price, a split, a
window — where guessing charges somebody a number nobody approved. A rate limiter's input is a Redis
connection, not an unmade decision, and refusing every M2 write because the cache blinked converts a
cache incident into a total product outage. `m2.abuse.throttle_cache_unavailable` is the mitigation:
an unenforced limiter that is silent is indistinguishable from a working one.

The clarification cap is **three unanswered per asker per thread**, not a total. A total cap
punishes the long back-and-forth about a complicated site that clarification exists to support; a
cap on the unanswered count is unbounded only for somebody who is not waiting for a reply — which is
the actual shape of the abuse, and a shape a rate cannot express. The rate catches the other half:
one script writing to many threads.

#### `M2-BE-805` — a hold outranks deletion, so the platform redacts and never deletes

Two independent reasons, either sufficient. Legally, the books are not the platform's to waive.
Structurally — and this is the one a reader can check — **every foreign key into
`CustomerRequirement` is `on_delete=PROTECT`**, so `delete()` does not cascade, it raises. There is
no delete command in the module to be tempted by.

`handle_erasure_request` **always redacts and reports the holds** rather than refusing on them. A
hold outranks *deletion*, not the Customer's right to have their personal content removed; one
refusal for both would give them nothing when they could have had most of it.

Removed: the free-text description, free-text *answers* (structured ones are the terms the money was
priced against and stay), both directions of every clarification thread, and the stored bytes plus
the voice transcript. Kept: statuses, timestamps, amounts, and every attachment's **metadata** — a
`RequirementSnapshot` records what a vendor was shown when they quoted, and deleting the rows
underneath it would rewrite that record. The photograph goes; the fact that a photograph existed,
and its hash, stays.

`M2_FINANCIAL_RECORD_RETENTION_DAYS` defaults to `0`, and **`0` means the hold never lapses** — not
"no retention". `apps/identity/retention.py` records the same refusal for verified KYC; a default
here would decide how long this business keeps its books on the day somebody asks for their data
back. For a retention schedule, fail-closed means *keeping* the record.

The daily attachment sweep purges bytes only and skips anything under a hold — a retention schedule
is not an erasure request, and scrubbing somebody's words because time passed is not a decision a
cron entry should make.

#### `M2-BE-808` — and the two defects found on the way

**Correlation stopped at the queue.** `RequestIdMiddleware` has put a request id on every HTTP line
since M1 and nothing carried it into a task, so a command that enqueued an outbox event logged under
one id and the work it caused logged under none. That is the gap that matters most here, because
almost nothing important in M2 finishes inside the request: the fee is verified by a callback, the
engagement is opened by a task, the cascade widens on a beat tick. Two Celery signals, no new
dependency; a beat-published task mints `task:<uuid>` so scheduled work is correlatable and visibly
*not* the tail of a request.

**`JsonFormatter` was discarding every `extra` field.** `metrics.emit` writes the metric name, value
and all labels into `extra` and logs the literal message `"metric"` — so every counter this platform
has ever emitted reached the log as an indistinguishable line reading `"message": "metric"`. Nothing
could be alerted on. That is the same defect class the last six waves kept finding, one layer down:
**a writer with no reader.** Extras are now rendered — and redacted first, because rendering them
without `common/observability/redaction.py` would have turned a missing feature into a leak: the
easiest dictionary to attach to a log record is the request payload.

The watchdog counts seven classes of stuck work and **emits zeros as well as non-zeros**, so an
alert can be written on the *absence* of the series — the failure most likely to hide all the others.
It reports and never acts, for the reason `reconcile_m2_money` does: a watchdog that could fix what
it found would rewrite history whenever its judgement was wrong.

#### The two C6 leftovers

**`reconcile_m2_money` now has a cursor.** It read every settled row of every product on every
hourly tick, so its cost grew with the lifetime size of the books rather than with what changed —
and the hour that becomes unaffordable is the hour the sweep stops, which is indistinguishable from
books that balance. Four independent keyset cursors on `(created_at, id)`, one per product, bounded
by `M2_RECONCILIATION_BATCH_SIZE` (500) and wrapping at the end of each lap. Four rather than one,
because a shared cursor would spend most laps in the largest table and check the smallest by
accident. The cursor lives in the **cache and not a table**: losing it restarts a lap, which
re-reads rows and finds the same answers, and a durable watermark on a reporting job is a migration
plus a row somebody can edit plus a new way to skip work permanently. `find_mismatches()` stays as
the unbounded whole-book read for a cutover.

**The chargeback alarm is now reachable, half-way.** `CHARGEBACK_ALARM_MIN_CHARGES` in the dev seed
went 20 → 2. At 20 the branch could not be demonstrated by hand and the whole `M2-BE-708` path
shipped unexercised in every environment — the state this seed exists to prevent for prices and
clocks, no better for an alarm. Two is still a minimum (one chargeback of one charge is 10,000 basis
points and means nothing), it is marked a dev-seed placeholder like the INR 149 unlock beside it,
and a production threshold is the owner's.

**A seeded chargeback row was judged and rejected, as C6 judged it.** Reaching
`record_fee_chargeback` needs a *captured* `PaymentAttempt` with a real `QuoteUnlock`/`BookingFee`/
`VisitPlan` behind it. Hand-writing one would put a money row nobody paid into the books — the exact
kind of fake data the reconciliation sweep exists to find — so the smoke script walks the real
unlock flow with `PAYMENTS_ALLOW_SIMULATED_CAPTURE` instead. **Recorded as not-done, with the
reason, rather than faked.**

#### The two coordinator items, and two more

**Skill ids.** `m2_rate_card_publish` takes `skill_id` as a uuid and the only endpoint listing
skills published `code`, `name` and `description` — so the form that decides **what every A3
customer in a city is charged** required an operator to type a uuid they had no way to look up.
`PartnerSkillOption` now carries `id`. One line, read-only, additive.

**Assisted-proposal consent was decorative.** `capture_assisted_proposal` has always refused without
`consent_recorded` — its own docstring, the endpoint's published description and `M2-AC-802` all
said so — and the view passed `True` unconditionally, so every assisted quote wrote an audit row
asserting a consent nobody had recorded. Worse than no consent field: a false statement in the
record of a real vendor's price. New `AssistedProposalRequest` (the vendor's own shape plus the
flag; `ProposalCreateRequest` untouched, because a vendor submitting their own quote consents on
nobody's behalf). **Optional on the wire, defaulting to `false`** — additive rather than breaking,
and failing closed in behaviour: an un-updated client now gets a loud `409` instead of silently
writing the false row. **The assisted-proposal form needs a consent checkbox** — §7 row filed.

`TimelineEvent.type` as a published enum was **not** built: it is a response field on a
hand-assembled projection rather than a model field, Session B has already handled it defensively,
and narrowing a published field while two frontend agents are mid-flight is the wrong moment. §7 row
filed.

#### Both RULES §3 audits

**(a) The drifting duplicate — three found and all three closed.** Wave C4 recorded this exact
sweep as *deferred*, because deriving the constraints meant moving a `TextChoices` class named in
`ENUM_NAME_OVERRIDES` by its nested dotted path, which risks renaming a published component. That
reasoning was right about the `TextChoices` and looked past the **status tuples**, which are plain
strings and carry no enum name at all:

| Constraint | Hand-copied list | Now derived from |
|---|---|---|
| `requirements_closed_has_timestamp` | six `CLOSED_*` strings | `REQUIREMENT_CLOSED_STATUSES` |
| `requirements_active_unlock_has_a_timestamp` | `("ACTIVE", "CONSUMED")` | `QUOTE_UNLOCK_READABLE_STATUSES` |
| `requirements_charged_plan_has_a_timestamp` | `("ACTIVE", "SETTLED")` | `VISIT_PLAN_CHARGED_STATUSES` |

Each sat inside a `Meta` body beside an identical class attribute that the code reads, which is the
drift `BOOKING_FEE_NON_BLOCKING_STATUSES` already records the cost of — a nested `Meta` cannot see
its enclosing class's namespace, so a constraint either reads a module-scope list or copies one, and
a copy drifts while `makemigrations --check` stays green. Hoisted to module scope on the pattern C6
established. **`makemigrations --check` prints `No changes detected`**, which is the proof the three
lists agreed today; from now on they cannot disagree. The contract name-diff confirms **zero
components renamed**.

Two other multi-value constraints were checked and are **not** duplicates: `EngagementStage`'s
`("APPROVED", "RELEASED")` and `PartnerApplication`'s `("CHANGES_REQUIRED", "REJECTED")` have no
corresponding Python tuple. Left alone.

**(b) The reader with no writer — the seventh wave, the seventh finding, and this one is the
mirror.** Every previous wave found a *column read by code and written by nothing*. C7's is the
inverse and is worse, because it has a published, audited, reachable writer:

**`KillSwitch` scopes `PAYOUTS`, `DISPATCH`, `SERVICE_AREA` and `SERVICE` are published enum values
that no code reads.** An operator can engage any of them through
`POST /api/v1/operations/kill-switches/`, with a reason and an audit row, and **nothing happens**.
`seed_console_demo_data` engages `SERVICE_AREA` with the reason "flooding reported in the service
area" and dispatch continues into the flood. `PAYMENTS` was in the same state and is now read — by
M2 only; **M1 checkout still does not read it**, and that is named rather than quietly wired.

`SERVICE_AREA` is deliberately **not** consulted by the purchase gate, and the reason is itself a
C2R-shaped trap avoided: the console seed leaves it engaged on `hyderabad-500032`, the same area
`seed_m2_demo` seeds, so wiring it would refuse every M2 purchase in a developer's only seeded city
for a reason invisible from the refusal. "Flooding stops work here" is a dispatch-side rule and
belongs on the offer cascade, where it can also stop offers already out.

The forward sweep over C7's own additions was run and is clean: every new setting has a reader and a
default; both new columns (`redacted_at`, `purged_at`) are written by `retention.py`; every one of
the eleven `M2Metric` names has an emitter and every emitter has a domain call site; every throttle
scope in `DEFAULT_THROTTLE_RATES` is mounted on at least one view. **One function was found with no
consumer** — `purchase_gates.new_purchases_allowed`, written for a screen and read by nothing — and
rather than delete it, it was wired into `unlock_availability` and the visit-plan tier read, which
were both publishing `true` during a pause and sending the Customer into a refusal after they had
committed to paying.

#### A defect the static gate caught, which is worth recording because it is new

`ThrottledWriteMixin` originally had a class docstring. `drf_spectacular.plumbing.get_doc` falls
back through the MRO with `inspect.getdoc`, skipping DRF's own base classes but **not third-party
mixins** — so the first regeneration put the mixin's internal note into the published OpenAPI
**description of nine operations**. Caught by the contract-drift check. The prose moved to the
module docstring and the class now carries a comment saying why it must never have one.

#### Static gates

`.\scripts\quality-static.cmd` — ruff format (366 files), ruff check, strict MyPy (246 source
files), `makemigrations --check` (`No changes detected`), `spectacular --validate` (zero warnings),
contract-drift check. All green, run to completion. `manage.py check` — no issues, 0 silenced.
**No test was written and none was run.**

#### Smoke script — what the owner clicks

Servers are the owner's to run. Backend, worker and beat as usual, then:

```
cd backend
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py seed_m2_demo --i-understand-this-is-dev-only
```

**1. The pause gates new purchases and nothing else.** Sign in as Operations (+918019013032, dev OTP
on screen) and engage the flag:

```
POST /api/v1/operations/kill-switches/
  {"scope": "M2_PURCHASES", "target": "", "reason": "smoke test"}
```

As a Customer, open an A3 workforce request and tap book at the published rate → **409
`m2_purchases_paused`**, and the request stays a `DRAFT` with everything typed still in it. Open the
A5 review screen → the tier chooser offers **nothing**. Now release it:

```
POST /api/v1/operations/kill-switches/release/  {"scope": "M2_PURCHASES", "target": ""}
```

Book again → the cascade goes out. **The half that matters:** re-engage the flag *after* a lead has
accepted and while the fee is unpaid. The booking-fee checkout must still work, and the engagement
must still open. If it refuses, the flag is stranding a held vendor and that is the bug this task
exists to prevent.

**2. The decline alarm answers.** `GET /api/v1/operations/rate-cards/decline-alarm/` → one reading
per published card. With `seed_m2_demo` loaded, `armed` is `true` (the seed writes the threshold);
clear `crew_decline_alarm_basis_points` on the variant configuration and it goes `false` with
`threshold_basis_points: null`. Decline every crew offer from the three seeded vendors, wait for the
cascade to exhaust, and `rate_basis_points` climbs.

**3. Abuse controls bite.** Post the same clarification question four times on one enquiry without
answering any → the fourth is refused, naming the three still waiting. Then request 61 attachment
presigns in an hour → **429** with a `Retry-After`.

**4. Erasure keeps the money and removes the words.** Take a requirement that has a paid unlock:

```
manage.py redact_m2_requirement <uuid> --actor-phone +918019013032 --reason x --holds-only
```

It must list `statutory_retention_unset` (and any live engagement, unsettled fee or open case). Run
it without `--holds-only` → the description and every clarification message read
`[removed at the customer's request]`, the attachments are gone from storage, and the `QuoteUnlock`,
its `PaymentAttempt` and the receipt number are **all untouched**. Confirm with
`GET /api/v1/operations/reconciliation/` — the redaction must open no new exception.

**5. The watchdog and the cursor.**

```
manage.py shell -c "from apps.requirements import watchdog; print(watchdog.report_stuck_async_work())"
manage.py shell -c "from apps.requirements import reconciliation as r; print(len(r.find_mismatches()))"
```

Every count zero, and no mismatches. Then check a worker log line: it must carry a `request_id`
starting `task:` and, for work caused by an HTTP request, **the same id the request carried**.

**6. The chargeback alarm** (the one that needed the seed change). Buy two unlocks with
`PAYMENTS_ALLOW_SIMULATED_CAPTURE` enabled, then record a chargeback against one through
`POST /api/v1/operations/chargebacks/`. One chargeback of two charges is 5,000 basis points against
a seeded threshold of 200 over a minimum of 2 → Operations is paged, once, keyed per variant per
day.

#### Left unbuilt, named

* `M2-BE-802` and `M2-BE-804` — **test tasks. Not written.** Object-level authorization and every
  concurrency invariant in M2 are unproven.
* `M2-BE-812`'s branch-aware coverage — **test task. Not run.**
* Malware scanning. `processing_status` carries `INFECTED` and every read honours it; **no scanner is
  wired.** `VERIFIED` means checksum and type verified, not scanned.
* A review queue for contact-sharing-flagged clarification. The signal is recorded; nobody looks.
* `KillSwitch` scopes `PAYOUTS`, `DISPATCH`, `SERVICE_AREA`, `SERVICE`, and `PAYMENTS` on the M1
  side — engageable, audited, read by nothing.
* Per-view attachment access disclosure rows (the other half of the old §7 `M2-BE-310` row).
* An Operations **API** for erasure. It is a management command; M3.
* `TimelineEvent.type` as a published enum.

---

## Session C tracker

| Wave | Scope | Domain `[~]` | Published `[x]` | Evidence |
|---|---|---|---|---|
| C0 | `M2-BE-013` | n/a | `[~]` **17 paths live at contract 1.21.0** | Ruff, strict MyPy, `makemigrations --check` and `spectacular --validate` all clean; client regenerates; 7 of 8 frontend packages typecheck. **No tests written** — the gate stays open. Attachments deferred. See below. |
| C1 | P1–P3 gap closure | `[~]` 91/91 domain tests + 5 new files written, unrun | `[~]` **16 more paths live at contract 1.22.0 (33 total)** | Ruff, strict MyPy across 218 files, `makemigrations --check` and `spectacular --validate` all clean, zero schema warnings. Four sweeps on beat. **Tests written, not run** — five files, ~160 test functions, queued in `task.md` §"Owner verification queue". CI deferred to M1 by owner decision. Remainder: capability/matching completeness, `M2-BE-317` first. |
| C1 remainder | `BE-102/106/107/110/115/301/303/306/310/317` | `[~]` built — static gates green | `[~]` **4 more paths at contract 1.23.0 (37 total)**, plus two corrected list envelopes | Ruff, strict MyPy across 218 files, `makemigrations --check`, `spectacular --validate` (zero warnings) and the drift check all clean. **The wage-floor guard can now fire**; both list operations declare the envelope they always sent and accept a `cursor`. Migrations `catalog.0007`, `locations.0003`, `partners.0009`. **Tests deferred per the build-first amendment**; two existing fixtures corrected for the fail-closed wage floor. |
| C2 | `BE-215`, `BE-401..428` (revision 3: A3 unlock + A5 visit plan) | `[~]` built — static gates green | `[~]` **14 new paths / 19 new operations at contract 1.24.0 (62 M2 operations)** | Ruff format and check clean across 342 files, strict MyPy across 222 source files, `makemigrations --check` no changes, `spectacular --validate` zero warnings after 11 named enums, drift check clean. Migrations `requirements.0005`, `catalog.0008`, `commerce.0007`, `assignments.0008`; five new beat entries. **The candidate-visit-starts read is published** at `GET /partner/enquiries/{id}/visit-slots/`. All eight §7 serializer gaps landed. **Tests deferred per the build-first amendment** (`BE-417`/`418`/`428`). **1.24.0 needs client regeneration by the orchestrator.** |
| C3 | `BE-501..509` | `[~]` built — static gates green | `[~]` **15 new paths / 16 new operations at contract 1.25.0 (78 M2 operations)** | Ruff format and check clean across 345 files, strict MyPy across 225 source files, `makemigrations --check` no changes, `spectacular --validate` zero warnings after 5 enum entries (one **pin** preventing a rename of the published `ProcessingStatusEnum`), drift check clean. Migrations `requirements.0006`, `catalog.0009`, `commerce.0008`, `fulfilment.0002`; three new beat entries. **One stage spine for both archetypes**; scope amendments run on the M1 engine with `booking` made nullable and two new line kinds. **`M2-BE-113` unblocked and built.** Three defects closed: `simulate_capture` refused every M2 charge, an A3 total was client-supplied, and a new enum would have renamed a published component. **Tests deferred per the build-first amendment** (`BE-509`); smoke script at `docs/runbooks/m2-engagement-spine-smoke.md`. **1.25.0 needs client regeneration by the orchestrator.** |
| C3.5 | Dev seed + the Wave I §7 defects | `[~]` built — static gates green | `[~]` **3 new paths / 3 new operations at contract 1.26.0 (81 M2 operations)** | Ruff format and check clean across 347 files, strict MyPy across 228 source files, `makemigrations --check` no changes, `spectacular --validate` zero warnings after 3 enum entries, drift check clean. Migration `requirements.0007`. **`manage.py seed_m2_demo`** loads every owner-blocked value as dev-only data behind three guards; runbook `docs/runbooks/m2-demo-seed.md`. Vendor cards, two-way clarification, `ProposalMaterialLine` + `EngagementStage.kind`, real verification badge, distance band, `service_name`, visit `timezone`, engagement `access_receipt`, no-show vocabulary. **Two live defects closed: 24 `select_for_update`-over-a-nullable-join `500`s (two of them M1 regressions from C3), and a plan-visit reschedule that abandoned its grid reservation.** `VisitNoShowRequest.reason_code` is now required — breaking for an un-regenerated client. **Tests deferred per the build-first amendment.** **1.26.0 needs client regeneration by the orchestrator.** |
| C2R | `BE-429..435` (revision 4: rate-card A3) | `[ ]` | `[ ]` | New build; the C2 unlock surface is the demoted fallback and stays untouched |
| C4 | `BE-521..533`, `536..539` | `[~]` built — static gates green | `[~]` **10 new paths / 11 new operations at contract 1.30.0 (91 M2 operations)** | Ruff format and check clean across 353 files, strict MyPy across 233 source files, `makemigrations --check` no changes, `spectacular --validate` zero warnings after 9 named enums, drift check clean, `manage.py check` clean. Migrations `catalog.0011`, `partners.0010`, `requirements.0009`; one new beat entry. **The A3 shift-day**: per-stage crew with a cross-agency identity conflict held by a partial unique index, non-OTP arrival, supervisor "n of m", settlement per worker-day present with a UPI deep link and **no rail behind it**, extras at published rates through the M1 amendment engine, `SafetyIncident` and `report_cash_demand` with `PartnerStandingEvent` behind them. **Three runtime defects closed by auditing rather than running**: `EngagementStage.scheduled_on` had a reader and no writer (the whole surface was unreachable), `standing.record_event` deduplicated across partners on a null source, and an unpublished shift length defaulted to 24 hours. **`BookingFee.OFFER_ACCEPTED` now has a writer** and four C2R contract gaps closed with it — `m2_crew_offer_accept` no longer returns the Customer's total to the lead. **Tests deferred per the build-first amendment** (`BE-534`/`535`); smoke script `docs/runbooks/m2-workforce-shift-day-smoke.md`. **1.30.0 needs client regeneration by the orchestrator.** |
| C5 | `BE-541..550` | `[ ]` | `[ ]` | |
| C6 | `BE-701..719` | `[ ]` | `[ ]` | |
| C7 | `BE-801`, `803`, `805`, `806`, `808`–`811`, non-test half of `812` | `[~]` built — static gates green | `[~]` **1 new path / 1 new operation at contract 1.33.0 (124 M2 operations)** | Ruff format (366 files) and check clean, strict MyPy across 246 source files, `makemigrations --check` `No changes detected`, `spectacular --validate` zero warnings, drift check clean, `manage.py check` clean — all run to completion. Migrations `notifications.0003`, `requirements.0012`; two new beat entries. **The flag gates new purchases only** — three doors closed, the booking-fee and visit-plan checkouts deliberately left open so no held vendor is stranded. Six throttle scopes over 32 write views; a three-unanswered clarification cap. Retention **redacts and never deletes**, with the financial hold reported rather than refused on. **Three defects closed by auditing**: `JsonFormatter` was discarding every metric ever emitted, no async work carried a correlation id, and `capture_assisted_proposal`'s consent check was decorative. **`reconcile_m2_money` is now cursored.** §3(a): three drifting constraint/tuple duplicates derived — the sweep C4 deferred. §3(b): **`KillSwitch` scopes `PAYOUTS`/`DISPATCH`/`SERVICE_AREA`/`SERVICE` are published, writable and read by nothing** — the mirror of six waves of findings. **`M2-BE-802`, `M2-BE-804` and `812`'s coverage half are test tasks, left unchecked**; smoke script in §C7 outcome, runbooks `m2-threat-model.md`, `m2-adapter-reliability.md`, `m2-release.md`. **1.33.0 needs client regeneration by the orchestrator.** |

### Already verified (do not rebuild)

| Module | Tests | Date |
|---|---|---|
| `apps/partners/capabilities.py` + 10 models | 26/26 | 2026-08-10 |
| `apps/requirements/{services,sla}.py` + 3 models | 31/31 | 2026-08-10 |
| `apps/requirements/{matching,proposals}.py` + 6 models | 34/34 | 2026-08-10 |
| `apps/notifications/{escalation,transport}.py` | 12 test functions (recorded as "13/13" on 10 August; `test_escalation_ladder.py` defines 12 and parametrises none — corrected 2026-08-12) | 2026-08-10 |

### Blocked / handed off

| Date | Task | Blocked on | Logged where |
|---|---|---|---|
| 2026-08-10 | `M2-BE-113` | ~~C3 engagement aggregate~~ **Cleared 13 August**: `engagements.route_suspended_capability_engagements`, driven by the `m2.capability.suspended` outbox event | This file, C3 outcome |
| 2026-08-10 | `M2-BE-301` language filter | Vendor language not captured in P1 | This file, C1 |
| 2026-08-10 | `M2-BE-321` | No reference price per variant | `02-backend-tasks.md` BE3 |
| 2026-08-10 | 12 policy tasks | Owner decisions in `task.md` P0 | `task.md` P0 |
| 2026-08-12 | Contract validation in CI | **Owner decision: M1 platform work, not M2.** The repository has no pipeline at all. | This file, C0.6 |
| 2026-08-12 | `M2-BE-317` wage-floor derivation | ~~No variant-to-skill mapping exists~~ **Cleared 13 August**: `M2VariantConfiguration.wage_floor_skill` + `ServiceArea.state_code`, both fail closed | This file, C1 remainder outcome |
| 2026-08-13 | Wage-floor **values** | Owner decision 7. The guard is live and fails closed, so A3 quoting is blocked per variant/area until Operations loads a floor | `task.md` P0 |
| 2026-08-13 | Insurance in `assert_capability_active` | Owner decision 6 | This file, `M2-BE-115` |
| 2026-08-12 | Crew archive conflict (0013 criterion 9) | C4's per-stage assignment model | `02-backend-tasks.md` `M2-BE-111` |
| 2026-08-12 | Per-variant `requires_insurance` (0013 criterion 12) | Owner decision 6 | `apps/partners/capability_options.py` |
| 2026-08-13 | `M2-BE-432`/`M2-BE-433` booking-fee value, forfeit split %, free-cancel window T | Owner decision 12 (revision 4). C2R builds the machinery fail-closed | `07-state-machines-and-permissions.md` §9 |
| 2026-08-13 | `M2-BE-429` seed rate values per launch city+skill, decline-alarm threshold, review-calendar owner | Owner decision 13 (revision 4). An unpublished card means `m2_rate_card_unavailable` — no instant A3 at all | `07-state-machines-and-permissions.md` §9 |
| 2026-08-14 | A free re-dispatch after a vendor no-show cannot charge or confirm the replacement crew | Not a blocker on an owner decision but on **C6** (`M2-BE-705`/`719`): the refunded fee occupies the one live-fee slot per booking, so the next lead's checkout refuses and `complete_booking_fee` — the only path that opens an engagement — never runs. ADR-0009 says re-dispatch is free, so the fix is probably confirming without a second charge, which is a money decision and a second engagement-opening path | This file, C4 outcome; `frontend-execution-plan.md` §7 |
| 2026-08-14 | Deriving three pre-existing constraints from the tuples they hand-copy | Needs a published `TextChoices` moved to module scope; all three are named in `ENUM_NAME_OVERRIDES` by their nested dotted path, so moving them risks renaming a published component (RULES §7). Verified to agree today | This file, C4 outcome; `frontend-execution-plan.md` §7 |
| 2026-08-13 | Whether the A3 fallback keeps charging the unlock | Owner decision 14 (revision 4). Until decided, the fallback inherits the built C2 behaviour | ADR-0009 |

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

## Wave C1 remainder — capability and matching completeness

**Start here.** Everything above is done; this is what is left of C1.

- [ ] `M2-BE-102` / `M2-BE-107` service-area scoping on the capability, plus crew availability.
- [ ] `M2-BE-115` extend `assert_capability_active` to check availability, service area and
  insurance — the guard now checks approval, suspension, capability expiry **and expired required
  documents** (C1), and still not availability, service area or insurance. Insurance enforcement is
  blocked on owner decision 6.
- [ ] `M2-BE-301` travel feasibility and language in eligibility. **Vendor language is not captured in
  P1** — add it there first or the filter has nothing to read.
- [ ] `M2-BE-303` real ranking signals. Ordering is currently a stable sort, as A1 does.
- [ ] `M2-BE-306` consult `carts.availability` in the capacity hold. Today an A1 booking and an M2
  hold can overlap on the same day.
- [ ] `M2-BE-317` derive state and skill for the wage floor from the requirement, not from the
  caller. **Highest priority in this list.** `POST /api/v1/proposals/` documents
  `m2_proposal_below_wage_floor` and **cannot currently return it**: `ProposalCreateSerializer`
  carries neither `wage_floor_skill` nor `wage_floor_state_code` and the view passes neither, so a
  below-floor A3 rate is accepted. An endpoint that documents a refusal it cannot make is worse than
  one that documents nothing. Needs a variant-to-skill mapping, which does not exist yet. Confirmed
  independently by Session B — see `frontend-execution-plan.md` §7 under `M2-FE-310`.
- [ ] `M2-BE-110` registration draft/submit/correction/resubmit commands.
- [ ] `M2-BE-310` attachment access expiry for non-selected vendors, plus the decision on whether
  `RequirementSnapshot` copies attachments. Unblocked by C1's upload work and the last attachment gap.
- [ ] Crew archive refusing on a future assignment (proposal 0013 criterion 9). **Not buildable until
  C4** — assignment is per stage and `M2-BE-522` has no model yet, so a guard now would be a check
  that always passes.
- [ ] A per-variant `requires_insurance` override (proposal 0013 criterion 12). The value is
  server-authored and never client-derived, which is the half that matters; no variant can be
  configured to `False` on an A3 archetype, which needs owner decision 6 first.
- [ ] `M2-BE-106` category-specific registration answers on the **versioned question schema** M1
  already has.

### Deferred by dependency, not by choice

- [ ] `M2-BE-321` price-band review signal — needs a reference price per variant.
- [ ] `M2-BE-312` masked callback requests and consented contact disclosure.
- [ ] `M2-BE-117` audit queries and Operations visibility for capability decisions.
- [ ] `M2-BE-113` suspension routing funded engagements to replacement or refund — **genuinely
  blocked until C3 creates the engagement aggregate.** Do not attempt it earlier.

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

## Wave C2 — Unlock, selection, reconfirmation, engagement (`BE4`)

**Depends on:** C1. Frontend Wave A2 integrates against this.

`M2-BE-401..418`. The commercially load-bearing wave:

- [ ] Server-priced unlock in paise with effective dates (`401`, `402`); offered **only when a usable
  quote exists** — `proposals.classify_usability` already decides this.
- [ ] One successful payment grants exactly one unlock under duplicate webhooks, browser close and
  retry (`403`, `404`, `405`). Reuse the M1 payment and ledger infrastructure with a distinct money
  purpose; do not build a second payment path.
- [ ] Non-responsive rejection releases the slot and invites a replacement at no extra charge (`406`).
- [ ] Selection → time-limited vendor reconfirmation that **re-checks** capability, schedule and
  capacity at reconfirmation time (`407`, `408`).
- [ ] Rejection, expiry or changed availability preserves the unlock and offers the next quote free
  (`409`, `410`).
- [ ] A3 completes as a connection with released contact; A5 opens stage funding (`411`, `412`).
- [ ] Server-calculated stage amounts, commission, tax and payout allocation in paise (`413`, `414`).
- [ ] Verification: simultaneous selections, vendor expiry at payment time, suspension between
  selection and payment (`417`, `418`).

**Gate:** money is collected only against delivered value; selection is not a booking until vendor
reconfirmation and the archetype's own confirmation condition both succeed.

---

## Wave C3 — The engagement spine (`BE5`) — **build once, carefully**

**Depends on:** C2. Frontend Wave 3 builds both halves of this spine in parallel, so a misread here
shows up in three places at once.

`M2-BE-501..509`. One `Engagement` + `EngagementStage` for both archetypes. A stage is a shift-day
(A3) or a milestone (A5) with **the same** evidence, approval and money-release semantics.

- [ ] Scope amendments route through the **M1 amendment engine** (`M2-BE-505`). Do not build a second
  one — this is the single largest duplication risk in M2.
- [ ] No scope, amount or completion change through clarification, callback or any unilateral UI
  action (`M2-BE-508`).
- [ ] Unblock `M2-BE-113` here.

**Gate:** both archetypes run on one spine with one set of stage commands, and no duplicate agreement,
amendment or approval subsystem exists. C4 and C5 may not start until this is stable.

---

## Wave C4 — Workforce stages, A3 (`BE5A`)

`M2-BE-521..535`. Thin tail on the C3 spine.

- [ ] Per-**stage** crew assignment so multi-day work rotates legitimately (`522`).
- [ ] **Supervisor-level daily attendance** — "n of m present today", one action. Do **not** build
  per-worker check-in/check-out; per-worker detail is captured only when the Customer disputes
  (`525`, `526`).
- [ ] Missing check-out settles at the agreed shift length, flagged, disputed only on Customer dispute (`527`).
- [ ] Arrival confirmation on the non-OTP fallback as the default path (`524`).
- [ ] Overtime as a scope amendment; unapproved overtime is unpaid (`531`).
- [ ] `SafetyIncident` as a first-class record with its own flow — not a cancellation reason (`530`).

## Wave C5 — Project stages, A5 (`BE5B`)

`M2-BE-541..550`. May run in parallel with C4 once C3 is stable.

- [ ] Milestone stages, funding, evidence, review, approval (`541`, `542`).
- [ ] Material advance as a distinct money purpose with its own recovery rule (`543`).
- [ ] Vendor-abandonment recovery transferring remaining stages with the delta settled (`545`).
- [ ] Warranty retention held back from the final stage, released at warranty close (`546`).
- [ ] Digital deliverable handover with Customer acceptance, for Event and Media (`547`).

---

## Wave C6 — Recovery, refunds, disputes, Operations APIs (`BE6`)

`M2-BE-701..717`. Frontend Wave 4 integrates against this.

- [ ] Policy engine, linked cases, evidence, deadlines, decisions, appeals (`701`–`704`).
- [ ] Idempotent ledger-backed refunds; provider pending, failed and reversed states (`707`).
- [ ] Chargeback on the unlock fee through the standard dispute path (`708`).
- [ ] Scheduled reconciliation of payment, refund, ledger and payout with alerts (`710`).
- [ ] Unified request timeline API (`711`) — one timeline, consumed by both Operations folders.
- [ ] Assisted clarification and **assisted A3 quote capture as a primary path**, attributed to the
  named Partner with consent recorded (`713`).
- [ ] Prove Operations can recover every supported failure **without direct database edits** (`717`).

## Wave C7 — Security, observability, release (`BE7`)

`M2-BE-801..` — threat model, object-level authorization regression tests for every M2 endpoint and
role, rate limits, concurrency tests on quote slots and capacity holds, retention and redaction,
runbooks, dashboards, feature flags that gate new purchases only.

---

## Session C tracker

| Wave | Scope | Domain `[~]` | Published `[x]` | Evidence |
|---|---|---|---|---|
| C0 | `M2-BE-013` | n/a | `[~]` **17 paths live at contract 1.21.0** | Ruff, strict MyPy, `makemigrations --check` and `spectacular --validate` all clean; client regenerates; 7 of 8 frontend packages typecheck. **No tests written** — the gate stays open. Attachments deferred. See below. |
| C1 | P1–P3 gap closure | `[~]` 91/91 domain tests + 5 new files written, unrun | `[~]` **16 more paths live at contract 1.22.0 (33 total)** | Ruff, strict MyPy across 218 files, `makemigrations --check` and `spectacular --validate` all clean, zero schema warnings. Four sweeps on beat. **Tests written, not run** — five files, ~160 test functions, queued in `task.md` §"Owner verification queue". CI deferred to M1 by owner decision. Remainder: capability/matching completeness, `M2-BE-317` first. |
| C2 | `BE-401..418` | `[ ]` | `[ ]` | |
| C3 | `BE-501..509` | `[ ]` | `[ ]` | |
| C4 | `BE-521..535` | `[ ]` | `[ ]` | |
| C5 | `BE-541..550` | `[ ]` | `[ ]` | |
| C6 | `BE-701..717` | `[ ]` | `[ ]` | |
| C7 | `BE-801..` | `[ ]` | `[ ]` | |

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
| 2026-08-10 | `M2-BE-113` | C3 engagement aggregate | `02-backend-tasks.md` BE1 gate |
| 2026-08-10 | `M2-BE-301` language filter | Vendor language not captured in P1 | This file, C1 |
| 2026-08-10 | `M2-BE-321` | No reference price per variant | `02-backend-tasks.md` BE3 |
| 2026-08-10 | 12 policy tasks | Owner decisions in `task.md` P0 | `task.md` P0 |
| 2026-08-12 | Contract validation in CI | **Owner decision: M1 platform work, not M2.** The repository has no pipeline at all. | This file, C0.6 |
| 2026-08-12 | `M2-BE-317` wage-floor derivation | No variant-to-skill mapping exists | This file, C1 remainder |
| 2026-08-12 | Crew archive conflict (0013 criterion 9) | C4's per-stage assignment model | `02-backend-tasks.md` `M2-BE-111` |
| 2026-08-12 | Per-variant `requires_insurance` (0013 criterion 12) | Owner decision 6 | `apps/partners/capability_options.py` |

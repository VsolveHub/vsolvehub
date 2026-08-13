# M2 Backend Tasks

**Owner:** Codex
**Runtime authority:** Django/DRF and PostgreSQL
**Depends on:** M1 identity, Partner review, payments, refunds, ledger, scope amendments, cases and
notifications
**Master status:** [task.md](task.md)
**Execution:** [backend-session.md](backend-session.md) — waves C0–C7, run as the third concurrent
session beside [frontend-session-a.md](frontend-session-a.md) and
[frontend-session-b.md](frontend-session-b.md). **Start at Wave C0 (`M2-BE-013`); it gates all 108
frontend tasks.**
**Revision:** 3 - visit-first A5 per [ADR-0008](../../docs/adr/0008-m2-visit-first-estimation-for-a5.md);
revision 2 simplifications per [06-audit-gaps-and-simplification.md](06-audit-gaps-and-simplification.md)
remain in force. Revision 3 changes only the **unbuilt** BE4 surface plus one BE2 command; A3 and
everything shipped are untouched.

Implement M2 as modules in the existing Django modular monolith. Keep views thin, place state
transitions in explicit domain commands, calculate money in integer paise, and protect invariants with
both application validation and database constraints.

Task IDs were re-issued in revision 2. `GAP-nnn` references point at the audit finding a task closes.

## Backend completion standard

A backend checkbox may be marked `[x]` only when its behavior has:

- authorization and object-level permission tests;
- state-transition, retry, concurrency and failure-path tests;
- database constraints and migrations where an invariant is persisted;
- audit events for commercial or privileged changes;
- documented API errors and a validated generated OpenAPI contract;
- asynchronous recovery or reconciliation where an external system is involved;
- no logging of tokens, raw payment payloads, private crew documents or complete KYC data.

> **Who runs those tests — owner-run since 12 August 2026.** The tests above are still **written** by
> the implementing session and still gate `[x]`. They are **not executed by that session**. See
> [task.md](task.md) §"Verification convention". A session runs `ruff`, strict `mypy`,
> `makemigrations --check` and `spectacular --validate` — never `pytest` — reports
> `[~] built — owner verification pending`, and the owner promotes to `[x]` after running them.
> Writing no test is still a gap and is still recorded as one; the deliverable did not shrink, only
> the feedback loop moved.

## Reuse before building

M2 must not create a second version of a subsystem that M1 already owns. This table was **verified
against the M1 source on 2026-08-10**, not assumed. Each row names the module and the M2 task that
would otherwise duplicate it.

### Infrastructure M2 must call, not re-implement

| Need | Reuse | Otherwise duplicated by |
|---|---|---|
| Idempotent commands and replayed responses | `apps.foundation.services.execute_idempotent` + `IdempotencyRecord`. Already does actor+operation+key uniqueness, request-fingerprint mismatch detection, in-progress detection and response replay. | `M2-BE-010` and every keyed command |
| Post-commit events, retry and re-drive | `apps.foundation.services.enqueue_outbox_event`, `OutboxEvent`, `apps.foundation.recovery` | `M2-BE-211`, `M2-BE-714` |
| Private signed-upload media with server-side verify | `apps.foundation.storage.get_document_storage(bucket=...)`. Explicitly built as one boundary with a bucket per app — partners uses it for KYC, fulfilment for evidence. **M2 adds a bucket, not an adapter.** | `M2-BE-202` |
| API error envelope, retryable flag, safe messages | `common/errors/handler.py` + `PartnerDomainError` shape | `M2-BE-012` |
| Address and service-area resolution | `apps.locations.Address`, `ServiceArea`, `ServiceAreaService` | `M2-BE-201` |
| **Business hours and holiday calendar** | `locations.ServiceAreaOperatingWindow` (weekday, opens/closes, `closes_next_day`) and `ServiceAreaOperatingException` (dated, with reason). Already consumed by `carts.services` and `fulfilment.cancellation`. | `M2-BE-212`, `GAP-014` |

### Domain patterns M2 should copy rather than invent

| Need | Precedent | Notes |
|---|---|---|
| Versioned per-variant configuration carrying a JSON schema | `catalog.A1VariantConfiguration` — `version`, `status` DRAFT/ACTIVE/RETIRED, `scope_schema`, partial unique index on the active row | The A3/A5 variant configuration should be this shape. `M2-BE-203` |
| Validating customer answers against that schema | `carts.item_inputs.validate_scope(schema=..., scope=...)` | Already used by three call sites; M2 answers validate the same way. `M2-BE-203` |
| Customer-facing question definitions | `catalog.ServiceQuestion` + `ServiceQuestionOption` — kind, `validation_rules`, options, ordering, `is_active` | Covers the guided requirement's structured questions. **No `version` field** — versioning comes from the variant configuration above, not from the question row. |
| Explainable candidate ordering with recorded reasons | `assignments.ranking` — `ExclusionReason`, `CandidateEvaluation`, `RANKING_POLICY_VERSION`, and the rule that every passed-over Partner gets a named reason | `M2-BE-303` asks for exactly this. Extend the vocabulary; keep the contract. |
| Bulk capacity/schedule resolution | `carts.availability` (loads a whole grid once) and the shared window rule `partners.selectors.availability_window_contains` | Soft capacity holds must agree with this, not invent a second availability notion. `M2-BE-306`. **Revision 3: A5 visit slots are booked directly against this grid** (`M2-BE-421`), which closes the overlap for visits by construction. |
| Signed-upload evidence with a FAILED processing state | `fulfilment.evidence` | Stage evidence in P5 |
| Scope or price change after agreement | `fulfilment.amendments` | `M2-BE-505`; A3 extensions and A5 change orders both |
| Cancellation policy evaluation | `fulfilment.cancellation` | `M2-BE-701` |
| Refunds and allocations | `commerce.Refund`, `RefundAllocation` | `M2-BE-707` |
| Payment attempts, webhooks, allocations | `commerce` — add purposes to the existing `PaymentAttempt.Purpose` enum, as `SCOPE_AMENDMENT_REVISION` already did | `M2-BE-414` |
| Cases, events, escalation | `cases` | `M2-BE-703` |
| Payouts, ledger and holds | `payouts` | `M2-BE-507`, `M2-BE-709` |
| Partner suspension | `assignments.suspension` | `M2-BE-112` |
| Notification intent, purpose-based consent, kill switch | `notifications.NotificationIntent` / `NotificationDelivery` / `KillSwitch` | `M2-BE-807`. **Channels today are SMS, EMAIL and PUSH only** — the WhatsApp/IVR rungs of the escalation ladder are a genuine extension. |

### Genuinely new in M2

Nothing in M1 covers these, so they are built from scratch: the requirement aggregate and its
`service_by` clock; the invitation snapshot; proposals and their supersession chain; quote teasers and
`QuoteUnlock` (A3); **`VisitPlan` and its per-slot share settlement (A5, revision 3)**; structured
question-and-answer clarification; the engagement/stage spine; duplicate requirement detection;
language routing and transcription; non-responsive rejection; price-band review signals; and the
WhatsApp/IVR notification rungs.

A new aggregate is justified only when the M1 shape genuinely cannot carry the M2 invariant. Record the
reason in the task evidence.

## Payment activation boundary

`milestones.md` excludes payments and OTP from commercial M2. Every money command below is built and
proved against the M1 payment abstractions with **provider test callbacks**, and every arrival command
is proved with the **non-OTP fallback**. Live provider activation is M3 scope. No BE exit gate may
depend on a live provider.

## BE0 - Decisions, domain map and contract

### Decisions

- [x] `M2-BE-001` Record the approved roadmap/ADR decision for bringing A3 and A5 capability slices
  into M2.
  Evidence: [ADR-0007](../../docs/adr/0007-m2-engagement-spine-and-fee-after-value.md), Accepted,
  indexed in `docs/adr/README.md`. Verified 2026-08-10.
- [x] `M2-BE-002` Record the approved commercial model: free requirement, INR 149 unlock charged only
  when a usable quote exists, up to three quotes.
  Evidence: ADR-0007 Decision section; requirement and unlock state machines in
  [07-state-machines-and-permissions.md](07-state-machines-and-permissions.md) §1 and §4.
  Verified 2026-08-10. **Revision 3 (2026-08-12): the A5 half is superseded by ADR-0008 — visit-first,
  tiered visit plan charged at the first confirmed slot. The A3 half stands unchanged. §1, §4, §4a
  and §4b of `07` carry the revised machines.**
- [x] `M2-BE-003` Record the approved fixed mode per archetype (A3 `LEAD_ONLY`, A5
  `MANAGED_PAYMENT_REQUIRED`) and remove per-variant mode configuration from the design.
  Evidence: ADR-0007 Decision and Consequences; no mode field exists on the capability model.
  Verified 2026-08-10.
- [~] `M2-BE-004` Create a service-variant matrix containing lifecycle archetype, question schema,
  quote-delivery SLA, contact policy, payment policy and fulfilment evidence policy.
  Partial: archetype and evidence-policy columns are modelled by the A3/A5 variant configuration.
  **Blocked** on owner decision 2 (SLA per category) before the matrix can be populated.
- [~] `M2-BE-005` Define the usable-quote rule, the out-of-budget rule and the non-responsive rejection
  cap. `GAP-003`, `GAP-009`
  Partial: rule shape and transitions defined in `07-state-machines-and-permissions.md` §3.
  **Blocked** on the owner setting the rejection cap value.
- [x] `M2-BE-006` Define who may cancel at each state, which reasons require evidence, and when
  Operations review or dual confirmation is required.
  Evidence: `README.md` cancellation table plus `07-state-machines-and-permissions.md` §6 and §7.
  Verified 2026-08-10.
- [ ] `M2-BE-007` Approve compliance boundaries for worker data, insurance and injury liability,
  minimum-wage floors, background checks, tax invoices, labour supply, payout onboarding and retention.
  `GAP-022`, `GAP-023`
  **Blocked** on owner decisions 6 and 7. The schema carries the fields; the values and the legal
  position are not engineering's to set.
- [ ] `M2-BE-008` Record the approved commission-visibility rule and single tax basis for competing
  proposals, plus principal-versus-agent invoicing per mode. `GAP-016`, `GAP-017`, `GAP-018`
  **Blocked** on owner decisions 4 and 5.

### State and API design

- [x] `M2-BE-009` Document state machines for requirement, invitation, proposal, unlock, selection,
  engagement, stage, amendment, cancellation, refund and payout.
  Evidence: [07-state-machines-and-permissions.md](07-state-machines-and-permissions.md) §1–§5.
  Verified 2026-08-10.
- [x] `M2-BE-010` Define idempotent commands and idempotency-key behavior for every retryable write.
  Evidence: `07-state-machines-and-permissions.md` §6 command table. Verified 2026-08-10.
- [x] `M2-BE-011` Define actor permissions for Customer, Partner owner, Partner staff, Operations and
  system jobs.
  Evidence: `07-state-machines-and-permissions.md` §7. Verified 2026-08-10.
- [x] `M2-BE-012` Define stable error codes and user-safe recovery instructions for every rejected
  transition.
  Evidence: `07-state-machines-and-permissions.md` §8, 29 codes following the M1 `PartnerDomainError`
  shape. Verified 2026-08-10.
- [~] `M2-BE-013` Review frontend proposals, publish M2 endpoints through generated OpenAPI and add
  contract validation to CI.
  **Proposal 0012 reviewed and implemented; 17 paths published at contract 1.21.0** (2026-08-11).
  `apps/requirements/{selectors,serializers,views,urls}.py` + the `config/urls.py` include; no
  domain module edited. Its open question on `202` refusals is answered in the proposal: refusals
  are always `>=400`, `202` is reserved for acceptance carrying a projection. Ruff, strict MyPy,
  `makemigrations --check` and `spectacular --validate` clean; zero schema warnings after naming
  eight M2 enums; `pnpm contract:generate` regenerates and `contract:check` confirms sync.
  **Wave C1 (2026-08-12): 16 more paths at contract 1.22.0, 33 in total.** Attachments, site-visit
  scheduling and completion, and all of proposal 0013 — business profile, capability
  options/request/list/withdraw, insurance, gates, crew CRUD and the masked demand preview. Both of
  0013's open design questions answered in that file's §Answered. **Object-level authorization tests
  now exist for every published path**, written and not run per the verification convention, in
  `tests/requirements/test_m2_http_authorization.py`. Ruff, strict MyPy across 218 files,
  `makemigrations --check` and `spectacular --validate` all clean with zero warnings.
  **Wave C1 remainder (2026-08-13): contract 1.23.0.** Four more paths — capability submit, partner
  languages (read/write), crew availability and the vendor attachment read — and **two schema
  corrections**: `m2_requirement_list` and `m2_partner_enquiry_list` declared bare arrays while
  returning DRF page envelopes, so a generated client threw on its first real request; both now
  declare a page envelope and publish the `cursor` parameter they never had.
  `POST /proposals/` can finally return `m2_proposal_below_wage_floor`.
  **Remaining before `[x]`:** the owner has not run the tests, so nothing is proven against a real
  request; **contract validation is not in CI, by owner decision — the repository has no pipeline at
  all and standing one up is M1 platform work** (raised and deferred 2026-08-12). See
  [backend-session.md](backend-session.md) §"C0 outcome", §"C1 outcome" and
  §"C1 remainder outcome".

**BE0 gate:** No implementation task depends on an unresolved pricing, legal, lifecycle or permission
decision. The ten blocking decisions in `README.md` are resolved, state diagrams and the initial
validated contract are approved.

## BE1 - Partner capability and registration foundation

**Phase status `[~]`** — the domain layer is implemented and **verified: 26/26 tests pass**
(2026-08-10), with Ruff, strict MyPy and `makemigrations --check` clean. **The whole registration
surface is published at contract 1.22.0** (2026-08-12): business profile, capability options, request,
list and withdraw, insurance, gates, crew CRUD and the masked demand preview — thirteen paths, plus
`GET /api/v1/partner/workspaces/` from 1.21.0. Authorization tests for all of them are **written and
unrun**, which is why individual tasks stay `[~]`: the completion standard requires the owner to have
run them.

### Data model

- [~] `M2-BE-101` Extend Partner business profiles for `INDIVIDUAL`, `WORKFORCE_AGENCY` and
  `PROJECT_VENDOR` without weakening M1 identity/KYC invariants.
  Implemented: `PartnerBusinessProfile` with GSTIN and registration-number check constraints.
- [~] `M2-BE-102` Model requested and approved capabilities separately, with service variant,
  fulfilment archetype, service area, capacity/limits, required resource type, expiry, review status
  and suspension reason. A skill is an eligibility input, not a lifecycle. Commercial mode is derived
  from the archetype and is not stored per capability.
  Implemented: `PartnerCapability` + `PartnerCapabilityTransition`. Mode is the derived
  `commercial_mode` property, so no field exists that Operations could edit. **Service-area scoping
  landed 13 August**: `PartnerCapability.service_areas`, where an empty set means every area the
  Partner serves and a non-empty set can only *subtract* from `PartnerServiceArea` — a capability is
  a narrowing of coverage, never a second coverage record. Read by `assert_capability_active` and by
  `matching.evaluate_candidates`. `[~] built — static gates green, owner manual verification pending`.
- [~] `M2-BE-103` Model crew members with a **global crew identity** and per-Partner membership, so one
  person cannot be double-booked through two agencies on one day; prevent a crew member from being
  assigned through an unrelated Partner. `GAP-027`
  Implemented: `CrewMember` (unique keyed `identity_hash`), `PartnerCrewMembership`, `CrewSkill`, and
  `assert_crew_available` rejecting cross-agency same-day conflicts.
- [~] `M2-BE-104` Model the worker insurance and liability declaration required for workforce
  capability approval. `GAP-022`
  Implemented: `PartnerInsuranceDeclaration` with validity-range and coverage constraints;
  `PartnerCapability.requires_insurance` defaults true for A3. **Enforcement at approval is not
  wired** — blocked on owner decision 6.
- [~] `M2-BE-105` Model identity clustering across Partner accounts sharing phone, PAN, bank account or
  device, and expose the cluster key to matching. `GAP-011`
  Implemented: `PartnerIdentityCluster` + `PartnerClusterMembership` with hashed signal values, and
  `clustered_partner_ids` for the P3 matching module to consume.
- [~] `M2-BE-106` Model category-specific registration answers and documents with versioned schemas,
  retention metadata and restricted access.
  Built 13 August on the schema M1 already has, not a second one:
  `M2VariantConfiguration.registration_question_schema` shares the version and the `ACTIVE`-row rule
  with the Customer-facing `question_schema`, answers are validated through the same
  `carts.item_inputs.validate_scope`, and they are stored on `PartnerCapability.registration_answers`
  — per capability, because "how many scaffolders can you field" is a question about this capability
  and not about the business. Published on `GET /partner/capability-options/` as
  `registration_questions`. Documents remain M1 `PartnerDocument` plus C1's `expires_on`.
  `[~] built — static gates green, owner manual verification pending`.
- [~] `M2-BE-107` Add constraints and indexes for unique active capability, valid service areas,
  capacity ranges, document ownership, cluster membership and active crew identity.
  Implemented: partial unique index on live capability per variant, positive-value checks,
  suspension-needs-reason check, unique crew and cluster membership, three capability indexes.
  13 August: the capability-to-area link carries the through table's own uniqueness, and crew
  availability arrived as `CrewAvailabilityException` with
  `partners_unique_crew_availability_exception` — one statement per worker per date, upserted,
  because two contradictory rows would leave `assert_crew_available` to pick one.
  `[~] built — static gates green, owner manual verification pending`.
- [~] `M2-BE-108` Model the minimum-wage floor reference table by state and skill, with effective dates.
  `GAP-023`
  Implemented: `MinimumWageFloor` with an effective-dated unique key, plus `live_wage_floor` and
  `assert_rate_meets_wage_floor`, which **fail closed** when no floor is loaded rather than defaulting.
  Values are owner-loaded and remain blocked on decision 7.

### Commands and APIs

- [~] `M2-BE-109` Implement progressive registration: browse-level account, KYC required before a first
  enquiry accept, payout details before a first payout, crew roster before a first crew assignment.
  `FLOW-06`, `FLOW-07`
  Implemented: `assert_kyc_complete`, `assert_payout_details_present` (honours M1's verified +
  `effective_from` cooling rule rather than restating a weaker one) and `assert_crew_roster_present`.
  **No HTTP surface yet** — browse-masked-demand arrives with the requirement module in P2.
- [~] `M2-BE-110` Implement registration draft, submit, correction and resubmit commands.
  The M2 delta built 13 August: `submit_capability_for_review` and
  `POST /api/v1/partner/capabilities/{id}/submit/`. Draft is `request_capability` and correction is
  Operations' `transition_capability`; what was missing was the Partner's own way *out* of
  `CHANGES_REQUIRED` — until now only Operations could move that row, so a Partner who fixed exactly
  what was asked had no button and the cycle depended on somebody noticing. One command for submit
  and resubmit because they are one act; it clears the correction note and is idempotent by state.
  Deliberately **not** routed through `transition_capability`, which stamps `reviewed_by` from its
  actor and would record the Partner as their own reviewer.
  `[~] built — static gates green, owner manual verification pending`.
- [~] `M2-BE-111` Implement crew add, edit, archive, skill and availability commands with audit logs.
  Implemented: `add_crew_to_roster` (resolves to one global person, reports created vs reinstated so
  the response can say which), `update_crew_member` (skills and supervisor flag; the display name
  belongs to the global `CrewMember` and is deliberately read-only), `archive_crew_member`, crew
  skills, and a `crew_roster` read model publishing `membership_id` and a four-digit masked phone but
  never `crew_member_id`. Published at 1.22.0 (C1). **Crew availability landed 13 August** as
  `set_crew_availability` + `PUT /api/v1/partner/crew/{membership_id}/availability/`, read by
  `assert_crew_available`, which now names the person and the date rather than silently shortening
  the list. **A crew-edit audit log is still not built.**
  **Archiving does not refuse on a future assignment** — proposal 0013's acceptance
  criterion 9 — because assignment is per stage and `M2-BE-522` has no model until Wave C4; a guard
  against a table that does not exist would be a check that always passes.
- [~] `M2-BE-112` Implement Operations approve, reject, request-correction, suspend and reinstate
  commands with reason codes and notification events.
  Implemented: `transition_capability` with an explicit allowed-transition map, a mandatory reason code
  on suspension, and an immutable `PartnerCapabilityTransition` per move. C1 added a distinct
  **`REJECTED`** status so Operations' refusal is no longer indistinguishable from the Partner's own
  `WITHDRAWN` exit, and made `review_notes` mandatory for `CHANGES_REQUIRED` and `REJECTED` in both the
  command and a check constraint. **Notification events are not emitted.**
- [~] `M2-BE-113` built — static gates green, owner manual verification pending. `GAP-020`
  **Unblocked and built in Wave C3, 13 August**, once the stage money existed to route.
  `transition_capability` emits `m2.capability.suspended` and `apps/requirements/handlers.py`
  consumes it — through the outbox rather than by a direct call, because `apps.requirements` already
  imports `apps.partners` and because a review decision must be recorded even if a refund adapter
  times out. The routing is **per stage**, not per engagement, since a half-finished project is
  exactly where one answer for the whole agreement is wrong: a funded stage nobody started is
  refunded, a stage in progress or awaiting review is flagged for replacement and left to Operations
  to judge, and approved or released work stays settled because it happened. The engagement is **not
  cancelled** — that would take the Customer's dispute rights and their evidence with it.
- [~] `M2-BE-114` Publish Partner and Operations read models as `{workspace_key, actions[]}` plus
  approved capability IDs and archetype. Return stable machine values, never frontend routes or labels,
  and never infer a workspace from a profession/category name. `SIM-09`
  Implemented: `workspace_grants` returns workspace key, derived commercial mode and the authorised
  action list, omitting any archetype with no action list so an unknown key yields nothing.
  Published as `GET /api/v1/partner/workspaces/` at 1.21.0 and consumed by the Partner shell; the
  capability *review-state* read that separates "not applied" from "under review" from "suspended" is
  published as `GET /api/v1/partner/capabilities/` at 1.22.0.
- [~] `M2-BE-115` Prevent invitations and assignments when capability, KYC, payout readiness,
  availability, insurance declaration or service-area rules fail.
  Implemented: `assert_capability_active` covers approval status, suspension, capability expiry and —
  since C1 — **expired required documents**, read from `settings.PARTNER_REQUIRED_DOCUMENT_KINDS`.
  13 August it gained an optional `service_area` and `on_day`: coverage (both `PartnerServiceArea`
  and the capability's own narrowing) and the Partner's published calendar, checked at the moment a
  slot is taken rather than only when the wave was built. Both refusals reuse
  `m2_capability_not_approved` and differ in message, because §8 lists no coverage code and inventing
  one to save a client a string comparison would put a code on the wire the design does not know.
  The calendar rule is deliberately weaker than M1's `partner_available_during` — a dated exception
  is a refusal, and a weekday no rule covers is a refusal only when the Partner has published rules
  for that area at all, because a day-block vendor publishes no hourly calendar and M1's rule would
  have excluded every one of them. **Insurance is still not enforced** — owner decision 6, and
  `requires_insurance` holds a default nobody approved.
  `[~] built — static gates green, owner manual verification pending`.

### Verification

- [~] `M2-BE-116` Test concurrent reviews, resubmission after correction, expired documents,
  suspended capabilities with funded work, unauthorized crew access, cross-agency crew double-booking,
  cluster detection, multi-capability responses and unknown workspace keys.
  26 tests written in `backend/tests/partners/test_m2_capabilities.py` covering progressive gates, the
  transition map, DB-level capability uniqueness, the eligibility guard, the workspace read model,
  global crew identity, cross-agency double-booking, clustering and the wage floor.
  Verified 2026-08-10. Concurrent-review and expired-document cases remain unwritten.
- [ ] `M2-BE-117` Add audit queries and Operations visibility for every capability decision.
  Not started: the transition record exists; no query surface or Operations view is built.

**BE1 gate:** A Partner can browse masked demand before KYC and become eligible only through approved,
auditable capabilities. The same skill may support multiple lifecycles without granting an unapproved
workspace or action, and suspension never strands funded work.

**Gate not passed, and one of its two blockers is gone.** The registration surface **is published**
since 12 August: all thirteen proposal 0013 paths at contract 1.22.0, so browse-masked-demand-before-
KYC is demonstrable — `GET /partner/demand-preview/` answers an account with no application, no
documents and no capability, and `GET /partner/gates/` explains the three gates that will be asked
for. What holds the gate open: **the tests are written and unrun**, so the surface is not proven
against a real request; ~~`M2-BE-113` — suspension not stranding funded work — is genuinely unbuilt
until P5 creates the engagement aggregate~~ **(built in Wave C3, 13 August)**; and the guard still
does not check **insurance**
(`M2-BE-115`), which is owner decision 6. Service area and availability came into the guard on
13 August.

## BE2 - Customer requirements (free) and matching entry

**Phase status `[~]`** — domain layer built and **verified: 31/31 tests pass** (2026-08-10), with
Ruff, strict MyPy and `makemigrations --check` clean. Ten paths published (seven at 1.21.0, three
attachment paths at 1.22.0) with authorization and attachment tests **written and unrun**.

### Requirement capture

- [~] `M2-BE-201` Model requirements with structured answers, requested schedule, a hard `service_by`
  date, location/service area, budget band, language and inferred lifecycle classification. The
  requirement is free; no payment precondition exists on submission. `FLOW-01`, `GAP-001`
  Implemented: `requirements.CustomerRequirement` with 12 statuses, budget-band ordering,
  submitted/closed timestamp checks and four indexes. Reuses `locations.Address` and `ServiceArea`.
- [~] `M2-BE-202` Support attachment metadata for image, video, audio, document and voice note by
  calling `apps.foundation.storage.get_document_storage(bucket=...)` with an M2 bucket.
  Built in C1: `apps/requirements/storage.py` adds a **bucket, not an adapter**, and
  `apps/requirements/attachments.py` implements presign → finalize → scan-result → remove.
  `RequirementAttachmentUpload` records what the client declared so finalization can compare the
  object that actually arrived; a mismatch on size, media type or SHA-256 is refused. Per-kind
  media-type allow-lists and per-kind size ceilings. `INFECTED` added to
  `RequirementAttachment.ProcessingStatus` — separate from `FAILED` because one recovery is "try
  again" and the other is not. Published as three paths at 1.22.0. **The scan adapter itself is a
  seam** — `record_attachment_scan_result` is the command a scanner webhook calls, and no scanner is
  wired. Owner verification pending.
- [~] `M2-BE-203` Implement category-specific question schemas with versioning by following
  `catalog.A1VariantConfiguration` and validating answers through `carts.item_inputs.validate_scope`.
  Implemented: `catalog.M2VariantConfiguration` — version, DRAFT/ACTIVE/RETIRED, one active row,
  `question_schema`, nullable SLA hours, `max_quotes`, rejection cap. Submission validates through the
  shared validator and translates its `ValueError` into `m2_requirement_incomplete`.
- [~] `M2-BE-204` Infer the lifecycle archetype from answers and store it with a plain-language summary;
  never derive it from the category name alone. `GAP-006`
  Implemented: `infer_archetype` — headcount plus duration means A3, a named deliverable means A5, and
  an answer set claiming both stays on the variant's declaration for Operations. **The plain-language
  summary string is not built.**
- [~] `M2-BE-205` Implement an Operations `reclassify_requirement` command that voids open invitations,
  preserves any existing unlock, records a reason and restarts matching without a second charge. `GAP-006`
  Implemented: command, audit transition and `m2.requirement.reclassified` event. **Voiding invitations
  happens in P3** when the matching module consumes that event.
- [~] `M2-BE-206` Detect probable duplicate requirements on Customer, address, date and category, and
  offer merge instead of burning the same vendor pool twice. `GAP-004`
  Implemented: `find_probable_duplicate` over a 3-day window; submission raises
  `m2_requirement_duplicate` carrying the existing id, with an explicit `allow_duplicate` override.
  **Merge itself is not built** — only detection and the override.
- [~] `M2-BE-207` Record requirement language and transcription/translation state so matching and
  Operations can route a voice note the vendor cannot understand. `GAP-007`
  Implemented: `CustomerRequirement.language` and `RequirementAttachment.transcript` /
  `transcript_language`. **No transcription adapter** — the fields are carried, nothing fills them.
- [~] `M2-BE-208` Implement draft create/update, media finalize, preview and submit commands. There is
  no separate immutable-version confirmation step. `FLOW-03`
  Implemented: `create_draft`, `update_draft`, `submit_requirement`, and — since C1 — media presign
  and finalize (`M2-BE-202`). **Preview is not built** and is a read the four-screen flow already
  satisfies from `GET /requirements/{id}/`.
- [~] `M2-BE-209` Allow free editing before any vendor accepts. After acceptance, a material edit
  requires confirmation, notifies accepted vendors, resets their deadlines, pauses the delivery clock
  and permits penalty-free withdrawal. `SIM-05`, `GAP-015`
  Implemented: free editing while DRAFT; `update_draft` refuses afterwards with
  `m2_requirement_locked`. **The post-acceptance edit path — notify, reset deadlines, pause the clock —
  is not built** and needs the P3 invitation model.
- [~] `M2-BE-210` Auto-close matching and refund any unlock in full when `service_by` passes. `GAP-001`
  Implemented: `expired_requirement_ids`, an idempotent `close_requirement`, and — since C1 —
  `tasks.sweep_expired_requirements` on a 15-minute beat schedule. `close_requirement` emits
  `m2.requirement.closed`, which is the event the refund path will consume, so nothing has to be
  re-plumbed. **The refund half waits for P4's unlock** (`M2-BE-705`).

- [~] built — static gates green, owner manual verification pending `M2-BE-215` Implement `choose_visit_plan` (revision 3): A5 only, recorded on the requirement
  from the review screen; tier (1/2/3 visits) and server-priced paise snapshot; charges nothing;
  bounds the invitation wave. An A5 submit without a plan is refused with `m2_visit_plan_required`;
  the command is refused outright on an A3 requirement.

### Matching entry

- [~] `M2-BE-211` Emit outbox events to begin matching on requirement submission with no payment
  precondition.
  Implemented: `m2.requirement.submitted` through `foundation.enqueue_outbox_event`, keyed
  `requirement-submitted:{id}` so a replay cannot start matching twice. No consumer until P3.
- [~] `M2-BE-212` Implement the per-category quote-delivery SLA clock, computed in business hours
  against a holiday calendar, with breach closing the requirement and notifying the Customer.
  `GAP-002`, `GAP-014`
  Implemented: `requirements.sla` advances a deadline only across open hours, reusing
  `locations.ServiceAreaOperatingWindow` and `ServiceAreaOperatingException` — no second calendar. A
  clock started before opening gets no head start; a closed holiday is skipped; a dated short-day
  exception replaces the weekly pattern; an area with no open hours raises rather than looping.
  Deadlines are `None` when the owner has approved no SLA, and submission still succeeds without a
  promise. **The breach sweep runs since C1: `tasks.sweep_sla_breached_requirements` on a 5-minute beat
  schedule, closing to `CLOSED_SLA_BREACH` with reason `quote_delivery_sla_missed`. **The Customer
  notification is still unwired** — the escalation ladder exists and its transport is a fail-closed
  seam waiting on MSG91 (`M2-BE-807`); calling a transport that raises would turn a missed promise
  into a retry storm.

### Verification

- [~] `M2-BE-213` Test requirement edit races, edit after acceptance, snapshot integrity, duplicate
  detection, reclassification with an existing unlock and `service_by` expiry during matching.
  31 tests in `backend/tests/requirements/test_requirement_capture.py`, **all passing** (verified
  2026-08-10). Edit races, snapshot integrity and reclassification-with-unlock need P3/P4 models and
  are unwritten.
- [~] `M2-BE-214` Test SLA arithmetic across business hours, holidays, time-zone boundaries and clock
  pauses caused by requirement edits.
  Covered: overnight rollover, pre-opening start, closed holiday, short-day exception, never-open area,
  absent SLA — all passing, verified 2026-08-10. Clock pauses from edits are unwritten (needs `M2-BE-209`).

**BE2 gate:** A submitted requirement is free, correctly classified, deduplicated and enters matching
exactly once, with an honest delivery promise and a hard expiry.

**Gate not passed, but two of the three reasons are gone.** The domain behaviour is verified and
provably free of any money path; ten requirement paths are published (seven at 1.21.0 plus three
attachment paths at 1.22.0); attachment upload is built; and the expiry and breach sweeps now have
beat entries, so a requirement whose `service_by` passes is closed within fifteen minutes. What holds
the gate open: **the tests are written and unrun**, so no path is proven against a real request; the
plain-language summary and requirement merge are still unbuilt; and no transcription adapter exists,
so a voice note carries a language tag and no transcript.

## BE3 - Matching, clarification and proposals

**Phase status `[~]`** - domain layer built and **verified: 34/34 tests pass** (2026-08-10), with
Ruff, strict MyPy and `makemigrations --check` clean. Enquiry, proposal, clarification, teaser and
site-visit paths published at 1.21.0/1.22.0; the four recovery sweeps are on Celery beat since
12 August. HTTP tests **written and unrun**.

### Matching and invitations

- [~] `M2-BE-301` Build deterministic candidate eligibility filters for lifecycle, approved capability,
  service area, travel feasibility for the requested date, language, schedule, capacity, suspension,
  conflict and workload. `GAP-007`
  Implemented: `matching.evaluate_candidates` covers capability, archetype match, service area,
  already-invited, cluster, responsiveness, committed capacity and roster size. **Language and travel
  feasibility landed 13 August.** Vendor language is now captured — `PartnerLanguage` plus
  `GET`/`PUT /api/v1/partner/languages/` — and compared on the primary subtag, so `te-IN` and `te`
  are one language. **A vendor who declared no language is never excluded**: absence of a declaration
  is not a mismatch, and the opposite rule would have emptied every pool of every Partner registered
  before the field existed. Travel feasibility reuses the M1 commit window and travel estimate
  (`carts.availability.earliest_reachable_by_partner_ids`, extracted from `earliest_reachable` so
  there is one implementation) against the requested start, which means it bites on same-day and
  imminent work and passes silently on anything days out — which is correct. Three named reasons
  gained emitters or entries: `language_mismatch` finally has one, and `calendar_unavailable` and
  `travel_not_feasible` joined the vocabulary.
  `[~] built — static gates green, owner manual verification pending`.
- [~] `M2-BE-302` Include recent responsiveness in eligibility, not only in ranking, so waves are not
  spent on dormant accounts. `GAP-013`
  Implemented: a Partner with no `PartnerOnlineSession` inside `RESPONSIVENESS_WINDOW_DAYS` (21) is
  excluded as `unresponsive`. Presence is a proxy; an invitation-response-rate signal would be better
  and is not built.
- [~] `M2-BE-303` Rank candidates using configurable, explainable signals; store matching reason codes
  and algorithm version without exposing sensitive vendor scores.
  **Reuses the `assignments.ranking` contract** - `ExclusionReason`, `CandidateEvaluation`, a policy
  version and a `provenance()` record naming every passed-over Partner. **Real signals landed 13
  August** and `MATCHING_POLICY_VERSION` moved to 2, because an invitation written under version 1
  was decided by different rules and Operations explaining a past decision needs to know which. The
  order is prior relationship with this Customer, then a coarse 5 km distance band, then least-recent
  invitation, then Partner id as the stable tie-break — bands rather than metres because a vendor
  4.1 km away is not meaningfully closer than one at 4.9 and ranking on the difference would jitter
  with every GPS fix while looking precise. **A Partner with no fresh location fix is scored at the
  pool's median band**, not last: sorting unknowns to the back would hand every M2 enquiry to
  whichever vendors happen to run the technician app, and sorting them first would make deleting a
  location fix a strategy. Per-candidate signals are written to
  `VendorInvitation.ranking_provenance` and **published on no read**, so a vendor cannot learn their
  own ranking inputs. `[~] built — static gates green, owner manual verification pending`.
- [~] `M2-BE-304` Model vendor invitations and quote-slot reservations with unique constraints,
  business-hours deadlines and atomic capacity accounting.
  Implemented: `VendorInvitation` with one invitation per Partner per requirement, a partial unique
  index giving one held slot per identity cluster, and `responds_by` computed through
  `requirements.sla` in business hours.
- [x] `M2-BE-305` Write an immutable `RequirementSnapshot` at each invitation recording exactly what
  that vendor saw. `SIM-05`
  Evidence: `matching.snapshot_requirement` hashes the content and reuses an identical snapshot, so
  vendors invited against unchanged content share one row. Tests cover freezing and sharing.
  Verified 2026-08-10.
- [~] `M2-BE-306` Take a **soft capacity hold** for the requested dates when a vendor accepts, and a
  hard hold at selection, so one vendor cannot win more work than it can staff. `GAP-012`
  Implemented: `CapacityHold` at `SOFT` on acceptance, released on decline, expiry or withdrawal, and
  fed back into eligibility as `capacity_committed`. **The hold consults `carts.availability` since
  13 August.** `carts.availability.reserved_partner_ids` is the public form of the rule the grid
  already applied internally — `TENTATIVE` and `CONFIRMED` reservations overlapping a half-open
  range, exactly as the database's exclusion constraint reads it — and
  `matching.committed_capacity_partner_ids` unions it with M2's own holds. Read at wave time as
  `capacity_committed` **and again at acceptance**, where it raises `m2_capacity_unavailable`,
  because a vendor's diary moves between the two. Until this landed an agency could hold a Saturday
  A1 visit and accept a Saturday workforce enquiry with neither record aware of the other. The day
  range is converted to instants in the **service area's** timezone, so a job on the 14th does not
  read as the 13th. **The hard hold at selection is still P4.**
  `[~] built — static gates green, owner manual verification pending`.
- [~] `M2-BE-307` Implement invitation accept, decline and expiry commands; make repeated commands
  idempotent and prevent acceptance after capacity is exhausted.
  Implemented: accept (idempotent, re-checks slots under a row lock), decline (reason required),
  expire and penalty-free withdraw. Slot exhaustion raises `m2_invitation_slots_exhausted`.
- [~] `M2-BE-308` Implement staged invite waves and automatic replacement while limiting vendor spam
  and requirement overexposure.
  Implemented: `invite_wave` is bounded by both wave size and free slots, numbers each wave, and
  invites one account per beneficial owner. Since C1, **automatic replacement on expiry is wired**:
  `matching.expire_invitation_and_replace` expires the invitation and invites a replacement inside one
  transaction under the requirement's row lock, and `tasks.sweep_expired_invitations` runs it every
  two minutes. A Celery re-drive cannot expire once and invite twice, because the replacement is taken
  only when this call is the one that moved the invitation. **Replacement on an explicit decline is
  still not wired** — `decline_invitation` releases the slot and nothing invites into it until the
  next wave.
- [x] `M2-BE-309` Enforce identity clustering so one beneficial owner cannot occupy more than one slot
  for a requirement. `GAP-011`
  Evidence: cluster key derived from `partners.clustered_partner_ids`; a sibling account is refused at
  acceptance with `m2_proposal_slot_conflict`, backed by a partial unique index, and a wave invites
  only one account per owner. Verified 2026-08-10.
- [~] `M2-BE-310` Expire attachment access with the invitation for non-selected vendors; only the
  selected vendor retains access for the engagement's life. `GAP-008`
  Built 13 August as `attachments.vendor_attachments` plus
  `GET /api/v1/partner/enquiries/{id}/attachments/`. **The coupled decision is settled:
  `RequirementSnapshot` does not copy attachments.** It freezes the answers a vendor quoted against,
  and access is resolved live from the invitation's state — which is what makes expiry
  implementable at all, since a frozen copy would be a second grant surviving the invitation it came
  from. It also answers what a vendor sees when a file is scanned *after* their invitation: the
  currently-`VERIFIED` set, so a photograph that passed its scan an hour later becomes visible and an
  `INFECTED` one never does. Freezing the list would have shown a vendor a `PENDING` file that turned
  out to be malware, or hidden a clean file from the only person who needed it; attachments cannot be
  added after `DRAFT`, so the live list can only gain verdicts on files the frozen answers already
  described. Access holds while the invitation holds a quote slot and ends on decline, expiry or
  withdrawal; only the selected vendor keeps it. **No signed link is minted once access lapses** —
  a signed URL is a bearer credential, so revocation has to mean not issuing one, and the
  fifteen-minute lifetime is what bounds links already handed out. Expiry is published as
  `has_access: false` on a `200` rather than an error, because the vendor still owns their enquiry
  record and an empty list without that flag reads as "the Customer attached nothing".
  `[~] built — static gates green, owner manual verification pending`.

### Safe follow-up

- [~] `M2-BE-311` Model **structured clarification**: a vendor-posted question and a Customer answer,
  both appearing on the shared timeline. Do not build threads, participants, read receipts or a
  moderation queue. `SIM-07`
  Implemented: `RequirementQuestion` plus `ask_question` / `answer_question`, answerable once. No
  threads, no participants table, no moderation queue.
- [ ] `M2-BE-312` Implement masked callback requests, scheduled callbacks and consented contact
  disclosure using an adapter rather than exposing phone numbers by default.
  Not started.
- [~] `M2-BE-313` Implement **paid** site-visit request, scheduling, rescheduling, outcome and
  cancellation, with the fee adjusting against the final price. `SIM-08`, `GAP-005`
  Implemented: `SiteVisit` with a mandatory positive fee, request/schedule/complete commands and the
  `adjusts_against_final_price` flag. Since C1 all three are published: `request_site_visit` on the
  enquiry, and `POST /api/v1/site-visits/{id}/{schedule,complete}/`. Scheduling resolves by
  participation so either party may move a visit; completion is Partner-only, because it is a report
  of what happened. **Cancellation and actually charging the fee are not built** - the charge lands
  with the payment work in P4. Rescheduling is `schedule/` called again, which the command already
  allows from `SCHEDULED`.
- [~] `M2-BE-314` Detect and flag likely contact-sharing or off-platform solicitation for review;
  do not auto-ban solely from a heuristic.
  Implemented: `looks_like_contact_sharing` flags Indian mobile patterns and off-platform handles on
  both questions and answers. It sets a review flag only - the message is still recorded and
  answerable, and nothing is auto-banned.

### Proposals

- [x] `M2-BE-315` Model **append-only** proposals with structured line items, tax, exclusions,
  assumptions, validity, schedule, workforce composition or project stages, and a supersession chain.
  States: `SUBMITTED`, `SUPERSEDED`, `WITHDRAWN`, `EXPIRED`, `SELECTED`, `REJECTED`. `SIM-06`
  Evidence: a revision creates a new row pointing at its predecessor, which becomes `SUPERSEDED` with
  its original figures intact; a partial unique index allows one live proposal per invitation.
  Verified 2026-08-10.
- [x] `M2-BE-316` Validate proposal shape against the requirement lifecycle and service-variant policy,
  using the simple A3 shape and the full A5 shape. `SIM-11`
  Evidence: A3 requires rate, minimum days and headcount and rejects project stages; A5 requires stages
  whose amounts reconcile to the quoted total. Verified 2026-08-10.
- [~] `M2-BE-317` Validate A3 rates against the applicable state and skill minimum-wage floor and reject
  submissions below it. `GAP-023`
  **The live defect is closed as of 13 August.** `submit_proposal` no longer accepts
  `wage_floor_skill` or `wage_floor_state_code` from its caller; it derives the skill from
  `catalog.M2VariantConfiguration.wage_floor_skill` and the state from
  `locations.ServiceArea.state_code`, both new, both nullable/blank, both Operations-owned. A vendor
  who could name their own classification could name the one with the lowest floor, and the platform
  carries that exposure. `ServiceVariant.required_skill_code` was considered and rejected: it is the
  *dispatch* trade slug matched against `PartnerSkill`, and reusing it would tie a statutory wage
  classification to a merchandising decision. An unmapped variant or area raises
  `m2_wage_floor_unavailable` (409) rather than skipping — **this fails closed and therefore blocks
  A3 quoting until Operations loads the mapping and a floor**, which is the intended consequence;
  skipping silently is the defect. `partners.assert_rate_meets_wage_floor` keeps its explicit-inputs
  signature for callers that genuinely name a state and a skill, and no HTTP path can reach it.
  Values remain owner decision 7.
  `[~] built — static gates green, owner manual verification pending`.
- [x] `M2-BE-318` Enforce a single tax basis across competing proposals for one requirement and persist
  the commission-treatment field on every proposal. `GAP-016`, `GAP-017`
  Evidence: the first proposal fixes the basis; a competing quote on the other basis is rejected with
  `m2_proposal_invalid_shape`. `commission_treatment` is stored per proposal. Verified 2026-08-10.
- [~] `M2-BE-319` Implement submit, supersede, withdraw and expire commands; preserve all superseded
  proposals visible to the parties and Operations.
  Implemented: submit, supersede, withdraw, plus `expired_proposal_ids` and — new in C1 —
  `expire_proposal`, which the selector previously had nothing to call. `tasks.sweep_expired_proposals`
  runs every five minutes. It deliberately does **not** move the requirement back from `QUOTES_READY`
  (§1 carries no such transition; the unlock command re-checks) and does not release the invitation's
  slot (`M2-BE-410`'s re-validation is how an expired quote comes back).
- [x] `M2-BE-320` Classify each confirmed proposal as usable, out-of-budget or incomplete, and expose
  only teaser fields before unlock. `GAP-003`, `FLOW-01`
  Evidence: `classify_usability` labels an over-budget quote rather than hiding it; only a usable,
  vendor-confirmed quote promotes the requirement to `QUOTES_READY`. `teasers_for` returns a price
  band, vendor type and verification only - a test asserts the teaser carries no scope, identity,
  total or contact field. Verified 2026-08-10.
- [ ] `M2-BE-321` Raise a price-band review signal for proposals clustered abnormally tightly or sitting
  far outside the reference band. `GAP-010`
  Not started: needs a reference price per variant, which nothing produces yet.
- [x] `M2-BE-322` Implement Operations assisted proposal capture on behalf of a named Partner with
  explicit vendor confirmation before Customer visibility; treat it as a primary A3 path. `SIM-10`
  Evidence: a captured proposal records `captured_by`, stays invisible to the Customer and does not
  promote the requirement until `confirm_captured_proposal` runs. Verified 2026-08-10.

### Verification

- [~] `M2-BE-323` Test concurrent invitation acceptance, capacity-hold contention, duplicate proposal
  submission, supersession after selection, vendor suspension mid-flow, cluster collisions and expired
  proposal selection.
  34 tests in `backend/tests/requirements/test_matching_and_proposals.py`, **all passing**. Covered:
  slot exhaustion, cluster collision at acceptance and within a wave, idempotent acceptance, expiry,
  capacity exclusion, supersession, tax basis, wage floor, budget labelling, assisted capture, teaser
  leakage, clarification and site visits. **True concurrency (two transactions racing) is not tested**;
  the guards are written under `select_for_update` but that is unproven.
- [~] `M2-BE-324` Test clarification authorization, blocked attachments, rate limits, attachment-access
  expiry after invitation close and contact disclosure audit trails.
  Clarification authorization is covered in `tests/requirements/test_m2_http_authorization.py` (a
  Customer cannot answer a question on another Customer's requirement; a vendor cannot ask on another
  vendor's invitation), and blocked attachments in `test_m2_attachments.py` (media-type allow-list,
  size ceilings, checksum mismatch, `INFECTED`). **Rate limits, attachment-access expiry and contact
  disclosure audit trails are unwritten** — the first is `M2-BE-803`, the second needs `M2-BE-310`,
  the third needs `M2-BE-312`. Written, not run.

**BE3 gate:** Usable quotes are delivered inside the declared SLA or replacement and closure proceed
without manual database intervention. Nothing has been charged. (Revision 3: demonstrable end to end
on A3; the A5 estimate path additionally needs BE4's visit surface, since an A5 proposal requires a
completed visit.)

**Gate not passed, and the reason has changed.** The "nothing has been charged" half still holds - no
money path exists anywhere in P3. The delivery half is now mostly true: since C1 an unanswered wave
recovers automatically, `schedule_site_visit` and `complete_site_visit` are published, and every
published path has a written authorization test. **`M2-BE-317` is closed as of 13 August**:
`m2_proposal_below_wage_floor` can be returned, the state and skill are derived from the requirement
rather than the caller, and an unmapped variant or area refuses with `m2_wage_floor_unavailable`
instead of skipping. What holds the gate open: **the tests are unrun**; replacement on an *explicit
decline* is still unwired; and the wage-floor **values** are owner decision 7, so the fail-closed
guard blocks A3 quoting per variant and area until Operations loads them.

## BE4 - Access (A3 unlock · A5 visit plan), selection, reconfirmation and engagement

Revision 3 splits the front door by archetype. The A3 unlock tasks are unchanged from revision 2;
the A5 visit-plan tasks are new and replace the A5 use of the unlock. Nothing in this phase existed
before the split.

### A3 unlock

- [~] built — static gates green, owner manual verification pending `M2-BE-401` Store the unlock price server-side in paise, with effective dates and immutable
  purchase snapshots.
- [~] built — static gates green, owner manual verification pending `M2-BE-402` Model `QuoteUnlock` with the requirement, purchased price, unlocked proposal set,
  rejection count and refund state. Offer it only when at least one usable quote exists. A3 only.
  `FLOW-01`
- [~] built — static gates green, owner manual verification pending `M2-BE-403` Implement unlock checkout, payment-order creation and verified webhook completion
  using existing M1 payment abstractions and provider test callbacks.
- [~] built — static gates green, owner manual verification pending `M2-BE-404` Guarantee one unlock for one successful payment under duplicate webhooks, browser
  retries and delayed provider callbacks.
- [~] built — static gates green, owner manual verification pending `M2-BE-405` Implement payment-pending reconciliation and Customer-visible status; never grant an
  unlock from a client redirect alone.
- [~] built — static gates green, owner manual verification pending `M2-BE-406` Implement non-responsive rejection: release the slot, invite a replacement at no extra
  charge (A3: a quote slot; A5: a free replacement visit), enforce the configured cap and record the
  reason against vendor standing. `GAP-009`

### A5 visit plan (revision 3, ADR-0008)

- [~] built — static gates green, owner manual verification pending `M2-BE-419` Model `VisitPlan`: requirement, tier size, server-priced paise snapshot per tier
  with effective dates, charge state, per-slot shares (`plan price / plan size` in integer paise,
  remainder on the first share) and per-share settlement state (`OPEN`, `COMMITTED`, `EARNED`,
  `REFUNDED`, `REPLACED`).
- [~] built — static gates green, owner manual verification pending `M2-BE-420` Link each A5 `SiteVisit` to one plan share; a share holds at most one live visit.
- [~] built — static gates green, owner manual verification pending `M2-BE-421` Implement `confirm_visit_slot`: books the visit slot against **`carts.availability`**
  — the same grid the A1 technician flow reads — so a visit and an A1 booking cannot double-book;
  refuses with `m2_visit_slot_unavailable` when capacity is gone. The first held slot opens the plan
  checkout; the hold expires harmlessly if the Customer never pays.
- [~] built — static gates green, owner manual verification pending `M2-BE-422` Implement `create_visit_plan_checkout` and `complete_visit_plan` on the M1 payment
  abstractions with provider test callbacks: one verified payment charges exactly one plan under
  duplicate webhooks and retries; the held slot hardens to `SCHEDULED` only on the verified callback;
  later slots book without further payment. Never charge from a client redirect
  (`m2_visit_plan_payment_pending` while waiting).
- [~] built — static gates green, owner manual verification pending `M2-BE-423` Implement visit arrival confirmation on the non-OTP fallback (start OTP is M3
  activation), reusing the same fallback pattern as crew arrival (`M2-BE-524`).
- [~] built — static gates green, owner manual verification pending `M2-BE-424` Enforce the estimate-visit guard: an A5 proposal must reference a `COMPLETED`
  visit; otherwise `m2_visit_not_completed`. Prefill support: expose the requirement + visit context
  the on-site composer reads.
- [~] built — static gates green, owner manual verification pending `M2-BE-425` Implement share settlement sweeps: unfilled shares auto-refund at the visit SLA;
  vendor no-show and estimate-not-submitted-in-window refund or replace the share (free replacement
  visit) and record against vendor standing; customer no-show disposition follows the configured
  policy. All through the M1 `Refund` lifecycle, idempotent under overlapping runs.
- [~] built — static gates green, owner manual verification pending `M2-BE-426` Implement the per-slot split (decided 2026-08-13): each share carries a
  server-calculated **vendor visit payout** and **Vsolve platform share** in integer paise (split
  percentages read fail-closed). An `EARNED` share (completed visit + usable estimate in window)
  makes the vendor payout payout-eligible through the **M1 payout and ledger rails**, gated on the
  progressive payout-details rule; the platform share books as Vsolve revenue. A refunded share pays
  neither. No stage credit exists.
- [~] built — static gates green, owner manual verification pending `M2-BE-427` Reclassification money rules: A5→A3 voids unfilled shares and refunds them (or
  converts per configuration); A3→A5 preserves an unlock as plan credit. No second charge, extending
  `M2-BE-205`.

### Selection and reconfirmation

- [~] built — static gates green, owner manual verification pending `M2-BE-407` Implement Customer selection against a specific proposal with an atomic requirement
  lock. Multiple simultaneous selections are not supported and the "multiple lots" allowance is
  withdrawn. `GAP-021`
- [~] built — static gates green, owner manual verification pending `M2-BE-408` Create a time-limited vendor reconfirmation that rechecks capability, schedule,
  capacity and proposal validity.
- [~] built — static gates green, owner manual verification pending `M2-BE-409` On rejection or expiry, preserve the rejected history, keep the unlock (A3) or
  visit-plan entitlement (A5) valid and offer the next quote, estimate or a replacement visit at no
  additional charge.
- [~] built — static gates green, owner manual verification pending `M2-BE-410` Implement a re-validation request for an expired-validity proposal that reuses the
  existing unlock or plan rather than forcing a second purchase. `GAP-019`

### Engagement creation and money

- [~] built — static gates green, owner manual verification pending `M2-BE-411` For A3 (`LEAD_ONLY`), create a connection engagement that records direct payment,
  limited Vsolve protection and the earned unlock-fee policy.
- [~] built — static gates green, owner manual verification pending `M2-BE-412` For A5 (`MANAGED_PAYMENT_REQUIRED`), create an immutable engagement snapshot only
  after vendor reconfirmation and require a verified funded first stage at face value before work
  may start. Visit money settles per share (`M2-BE-426`) and never discounts a stage.
- [~] built — static gates green, owner manual verification pending `M2-BE-413` Server-calculate stage amounts, commission, tax and payout allocation in paise; reject
  client-supplied totals.
- [~] built — static gates green, owner manual verification pending `M2-BE-414` Reuse M1 ledger and payment infrastructure with distinct money purposes for unlock
  fee, visit-plan fee, site-visit fee, stage funding, material advance, refund, commission and vendor
  payout. `GAP-028`
  Add them to the existing `commerce.PaymentAttempt.Purpose` enum exactly as
  `SCOPE_AMENDMENT_REVISION` did. Do not create a parallel payment path or a second ledger.
- [~] built — static gates green, owner manual verification pending `M2-BE-415` Generate durable invoice/receipt metadata and expose payment status without leaking
  provider payloads.
- [~] built — static gates green, owner manual verification pending `M2-BE-416` Enforce contact and work-start policy from the archetype's fixed commercial mode.

### Verification

- [ ] `M2-BE-417` Test simultaneous selections, vendor expiry at payment time, capability suspension
  immediately after payment, duplicate unlock payment, late webhook, amount tampering and replayed
  commands. `GAP-020`
- [ ] `M2-BE-418` Test that protections and refund eligibility differ correctly between A3 connections
  and A5 managed engagements.
- [ ] `M2-BE-428` Test the visit-plan money paths: duplicate plan webhooks, hold expiry racing the
  checkout, slot contention on the grid against a concurrent A1 booking, share arithmetic in paise
  (remainder on the first share; payout + platform share + refunds reconcile to the plan), unfilled-
  share refund idempotence under overlapping sweeps, estimate-window refusal, vendor payout
  eligibility gating on payout details, and reclassification with a charged plan.

> **`M2-BE-417`, `M2-BE-418` and `M2-BE-428`: tests deferred per the build-first amendment**
> (`task.md` §"Build-first amendment (2026-08-13)"). No test was written or run in Wave C2. These
> three rows are the wave's test debt and are worked off after the owner's manual UI pass.

**BE4 gate:** Money is collected only against a real accepted commitment — a usable quote (A3) or a
confirmed visit (A5). An engagement exists only after valid selection, vendor reconfirmation and the
archetype's own confirmation condition. All amounts, shares, payouts and platform shares reconcile
to immutable engagement terms in integer paise.

## BE5 - Engagement spine

Build this once for both archetypes. Do not create parallel workforce and project agreement families.

- [~] `M2-BE-501` built — static gates green, owner manual verification pending. Created in C2; C3
  added the money envelope (`staged_total_paise`, `amendment_delta_paise` and four running totals)
  and froze the eight commercial terms in `save()`. `SIM-01`
- [~] `M2-BE-502` built — static gates green, owner manual verification pending. Approval state **is**
  `status` and evidence state **is** the `StageEvidence` rows; a third denormalised copy would drift
  from both, so it was deliberately not added. `SIM-01`
- [~] `M2-BE-503` built — static gates green, owner manual verification pending.
  `apps/requirements/stages.py`, plus the Operations dispute decision without which a disputed stage
  was a dead end. `AWAITING_REVIEW → APPROVED` on timeout is refused while `DISPUTED`, guarded twice.
- [~] `M2-BE-504` built — static gates green, owner manual verification pending. **As database
  constraints**: `staged_total_paise = total_paise + amendment_delta_paise` on the engagement, plus
  four engagement bounds and five per-stage bounds. The load-bearing one is `funded − refunded ≤
  staged` — never hold more of a Customer's money than there is agreed work.
- [~] `M2-BE-505` built — static gates green, owner manual verification pending. **One engine, two
  front doors.** `ScopeAmendment.booking` is nullable, `requirements.EngagementAmendment` carries the
  M2 aggregate and a signed delta, and the expiry rule is now shared and public. The four M1 command
  functions resolve through `locked_booking_context` and `current_task_rate` and genuinely cannot be
  called for an engagement — so the extension is `ScopeAmendmentLine.Kind.LABOUR_DAY` and
  `PROJECT_WORK`, exactly as this row anticipated. `SIM-01`
- [~] `M2-BE-506` built — static gates green, owner manual verification pending. New
  `PaymentAttempt.Purpose.M2_SCOPE_AMENDMENT` (enum and check constraint in the same migration);
  a managed positive delta applies only from a verified callback, a negative delta refunds first, and
  `LEAD_ONLY` moves no platform money at all.
- [~] `M2-BE-507` built — static gates green, owner manual verification pending. Approval writes a
  `PENDING` `PartnerLedgerEntry` with no Booking; `release_stage_payout` plus an hourly sweep moves it
  once the dispute window closes and the payout account is verified. `payouts.release_payout_hold`
  resolves **by Booking** and cannot do this — the same reason `access.release_visit_payout_hold`
  exists.
- [~] `M2-BE-508` built — static gates green, owner manual verification pending. Enforced in `save()`
  on both models rather than by convention: `Engagement` refuses a write to its eight frozen terms,
  and `EngagementStage.amount_paise` moves only through `apply_amendment_amount`, whose one caller is
  the amendment module and only after `AUTHORIZED`.

### Verification

- [ ] `M2-BE-509` **Tests deferred per the build-first amendment** (`task.md` §"Build-first amendment
  (2026-08-13)"). This row is Wave C3's test debt, recorded as one line. The smoke script that
  replaces it for the sprint is `docs/runbooks/m2-engagement-spine-smoke.md`.
  **Wave C3.5's debt is recorded on the same line**: the vendor-card disclosure ladder, the
  material-line reconciliation, two-way clarification, the plan-visit reschedule moving its grid
  reservation, and the 24-site `select_for_update(of=("self",))` fix. Its smoke script is
  `docs/runbooks/m2-demo-seed.md`, which also documents the seed both walkthroughs need.

**BE5 gate:** Both archetypes run on one spine with one set of stage commands, and no duplicate
agreement, amendment or approval subsystem exists.

## BE5A - Workforce stages (`A3_TIME_BLOCK`)

### Assignment and attendance

- [ ] `M2-BE-521` Configure A3 stages as shift-days with required roles, worker count, rate, inclusions,
  attendance policy and an immutable pricing snapshot.
- [ ] `M2-BE-522` Model crew assignment **per stage** rather than per engagement, so multi-day work can
  rotate crew legitimately; enforce verified skills, Partner ownership, no overlapping assignments and
  the required crew count. `GAP-024`
- [ ] `M2-BE-523` Expose only policy-approved crew identity and verification summaries to Customers.
- [ ] `M2-BE-524` Implement arrival confirmation with the non-OTP fallback as the default path and an
  Operations override. `SIM-02`
- [ ] `M2-BE-525` Implement **supervisor-level daily attendance confirmation** ("n of m present") with
  one-tap Customer confirm or dispute. Do not build per-worker check-in/check-out with offline sync.
  `SIM-02`
- [ ] `M2-BE-526` Capture per-worker discrepancy detail **only when the Customer disputes**. `SIM-02`
- [ ] `M2-BE-527` Default a missing check-out to the agreed shift length, flagged for review, disputed
  only on Customer dispute. `GAP-025`

### Exceptions and settlement

- [ ] `M2-BE-528` Implement pre-start and same-day crew substitution with Customer notification and
  approval where required by policy.
- [ ] `M2-BE-529` Implement vendor no-show, partial crew, late arrival, Customer unavailable, unsafe
  site and force-majeure commands with evidence and reason codes.
- [ ] `M2-BE-530` Model `SafetyIncident` as a first-class record with its own report flow, evidence,
  severity and Operations routing. It is not a cancellation reason. `GAP-022`
- [ ] `M2-BE-531` Implement overtime as a scope amendment requiring Customer approval, plus a short
  retroactive confirmation window; unconfirmed overtime is unpaid and stated in the vendor terms up
  front. `GAP-026`
- [ ] `M2-BE-532` Compute partial completion and settlement through explicit policy; disputed records
  must open a case rather than auto-complete.
- [ ] `M2-BE-533` Release vendor payout only after the completion/dispute window and ledger checks.

### Verification

- [ ] `M2-BE-534` Test overlapping workers across agencies, same-day replacement, partial attendance,
  contradictory attendance, missing check-out, retroactive overtime and duplicate completion.
- [ ] `M2-BE-535` Test payout hold, partial refund, commission reversal and settlement reconciliation.

**BE5A gate:** Multi-worker and multi-day work can be fulfilled or failed with correct evidence,
Customer remedy and financial settlement, with no per-worker device dependency.

## BE5B - Project stages (`A5_CUSTOM_PROJECT`)

- [ ] `M2-BE-541` Configure A5 stages as milestones from a selected proposal with deliverables,
  exclusions, dates, warranty and stage amounts.
- [ ] `M2-BE-542` Implement stage funding, start, evidence submission, Customer review, approval,
  rejection and timeout through the shared spine commands.
- [~] `M2-BE-543` Model **material advance** as a distinct money purpose with its own recovery rule,
  because material money is spent rather than earned. `GAP-028`
  **Half built in Wave C3.5 (1.26.0), and the half that is built is the half the rest depends on.**
  A material line is now its own wire shape (`ProposalMaterialLine`, distinct from `ProposalStage`)
  and its own kind of engagement row (`EngagementStage.kind = MATERIAL_ADVANCE`), it funds through
  `PaymentAttempt.Purpose.M2_MATERIAL_ADVANCE` rather than `M2_STAGE_FUNDING`, and the first
  recovery rule that can tell the two apart is live: `route_suspended_capability_engagements`
  refunds a funded, unstarted **work** stage and refuses to claw back a funded material advance,
  because the vendor has already bought the goods. **Still open:** the abandonment and
  early-termination recovery rules themselves, which belong with `M2-BE-545` in Wave C5 — this wave
  built the discriminator they will read, not the rules.
- [ ] `M2-BE-544` Implement a Customer-caused delay claim with evidence and a schedule-extension
  request. `GAP-030`
- [ ] `M2-BE-545` Implement vendor-abandonment recovery that transfers remaining stages to a replacement
  vendor at the replacement's price, funding or refunding the difference. `GAP-029`
- [ ] `M2-BE-546` Implement warranty **retention hold-back** from the final stage, released at warranty
  close; a variant either funds retention or does not advertise warranty. `GAP-031`
- [ ] `M2-BE-547` Implement digital deliverable handover with Customer acceptance, so Event and Media
  delivery does not happen off-platform. `GAP-032`
- [ ] `M2-BE-548` Implement final completion and warranty-window transitions without auto-approving an
  actively disputed stage.
- [ ] `M2-BE-549` Preserve the original and amended schedule, deliverables and money allocation for
  Operations and dispute review.

### Verification

- [ ] `M2-BE-550` Test abandoned project transfer, material-advance recovery, retention release,
  deliverable handover, reduced-scope refund and final payout reconciliation.

**BE5B gate:** Every scope and money change is explicit, accepted, funded and auditable; an abandoned
project has a path to being finished; clarification cannot alter the agreement.

## BE6 - Cancellation, refunds, disputes and Operations recovery

### Policy engine and cases

- [ ] `M2-BE-701` Implement policy evaluation that records lifecycle state, actor, reason, evidence,
  contact-disclosure state, fulfilment evidence and calculated remedy, reusing the M1 cancellation
  policy module.
- [ ] `M2-BE-702` Require counterparty confirmation or Operations review for suspicious cancellation
  after contact disclosure or reported work start.
- [ ] `M2-BE-703` Open linked cases for conflicting cancellation, no-show, attendance, safety incident,
  stage, payment, quality and off-platform claims.
- [ ] `M2-BE-704` Implement evidence upload, response deadlines, internal notes, decisions, appeals and
  audited manual overrides.

### Refund and payout integrity

- [ ] `M2-BE-705` Implement unlock-fee outcomes (A3): full refund on `service_by` expiry or exhausted
  vendors, free replacement on non-responsive rejection, earned fee once valid quotes were unlocked.
  `FLOW-01`
- [ ] `M2-BE-718` Implement visit-plan outcomes (A5): full refund of unconsumed value on `service_by`
  expiry; per-share refund on unfilled slots, vendor no-show and missed estimate windows; earned
  shares (vendor payout + platform share) once a completed visit produced a usable estimate; customer
  no-show pays the vendor payout with the platform share per the configured policy. All shares
  reconcile to the plan in paise: `plan = Σ payouts + Σ platform shares + Σ refunds`.
- [ ] `M2-BE-706` Implement service-payment cancellation outcomes by archetype, work state and verified
  completion.
- [ ] `M2-BE-707` Make refund initiation idempotent and ledger-backed; handle provider pending, failed,
  reversed and duplicate test callbacks.
- [ ] `M2-BE-708` Handle a chargeback on the unlock or visit-plan fee itself through the standard
  dispute path and alert on the rate. `GAP-035`
- [ ] `M2-BE-709` Hold payout automatically when a qualifying case opens and release/reverse only
  through authorized commands.
- [ ] `M2-BE-710` Reconcile payment, refund, ledger and payout records on a scheduled job with alerts for
  mismatches.

### Operations workspace APIs

- [ ] `M2-BE-711` Publish a unified request timeline with the requirement, snapshots, matching,
  questions, proposals, unlock, engagement, stages, cases and financial events.
- [ ] `M2-BE-712` Implement safe Operations actions for rematch, reclassification, deadline extension,
  refund review, capability hold, payout hold and case resolution.
- [ ] `M2-BE-713` Implement assisted requirement clarification and assisted proposal capture on behalf
  of a named actor, with consent and audit attribution.
- [ ] `M2-BE-714` Implement stuck-state queues and scheduled recovery for unmatched, under-quoted,
  SLA-breached, unconfirmed, inactive and unreconciled records.
- [ ] `M2-BE-715` Emit the Operations-touches-per-request metric so the workspace design can be checked
  against the approved unit economics. `GAP-033`

### Verification

- [ ] `M2-BE-716` Test every worst-case scenario in `04-acceptance-and-cutover.md`, including collusion
  indicators without automatic guilt.
- [ ] `M2-BE-717` Prove Operations can recover supported failures through APIs without direct database
  edits.

**BE6 gate:** Every failure has an accountable state, deadline, Customer explanation and audited
recovery command; money reconciles after retries.

## BE7 - Security, observability and release

### Production hardening

- [ ] `M2-BE-801` Threat-model object access, ID enumeration, upload abuse, clarification abuse, payment
  replay, staff privilege, vendor collusion, slot squatting and personal-data exposure.
- [ ] `M2-BE-802` Add object-level authorization regression tests for every M2 endpoint and role.
- [ ] `M2-BE-803` Add rate limits and abuse controls for registration, upload, clarification,
  invitations, proposals, callbacks, non-responsive rejection, selection and payment creation.
- [ ] `M2-BE-804` Add database transaction/concurrency tests for quote slots, capacity holds, selection,
  crew assignment, stage approval, refund and payout.
- [ ] `M2-BE-805` Add retention, redaction and deletion workflows consistent with financial and legal
  retention requirements, including attachment-access expiry. `GAP-008`

### Reliability and operations

- [ ] `M2-BE-806` Add structured metrics for the success measures in `README.md`: quote fill rate
  (A3), visit fill rate and visit-to-estimate rate (A5), time to first quote / first confirmed visit
  against SLA, unlock and plan conversion, unlock and visit-plan refund rates, vendor response rate,
  selection-to-confirmation rate, dispute rate and Operations touches per request. `PLN-05`
- [~] `M2-BE-807` Define and implement the notification escalation ladder (in-app, push, SMS, WhatsApp,
  call) so no deadline depends on an unread in-app notice. `PLN-06`
  Build on `notifications.NotificationIntent` / `NotificationDelivery` / `KillSwitch`, which already
  carry purpose-based consent, per-purpose suppression and idempotency. **The WhatsApp and voice
  channels are genuinely new.** Provider integration is MSG91 and lands later; the channels, intents,
  templates, ladder policy and both UIs are built now against a fail-closed adapter.
  Implemented ahead of P7 because P2/P3 deadlines depend on it: `WHATSAPP` and `VOICE` added to
  `NotificationIntent.Channel` and to `KillSwitch.Scope`, with the channel-to-switch mapping now a
  dict rather than an SMS-only branch. `notifications.escalation` holds the ladder — rungs accumulate
  as the deadline nears rather than swapping, so earlier attempts stay on the record — and is
  idempotent per channel through a correlation key. `notifications.transport` is the fail-closed seam
  MSG91 lands in: `MESSAGE_TRANSPORT` defaults to `unconfigured` and raises, production refuses the
  fake outright, and `unreachable_channels` reports the gap instead of letting the ladder degrade
  silently. **13/13 tests pass** (verified 2026-08-10). Sending is still not wired to any provider.
- [ ] `M2-BE-808` Add correlation IDs, structured safe logs, traces and alerts for stuck or failed
  asynchronous workflows.
- [ ] `M2-BE-809` Document timeout, retry, circuit-breaker and reconciliation behavior for payment,
  storage, notification, masked calling, transcription and malware-scan adapters.
- [ ] `M2-BE-810` Ensure feature flags gate **new** purchases only; in-flight requirements and funded
  stages remain reachable and refundable when a flag is turned off. `GAP-036`
- [ ] `M2-BE-811` Create migration, backfill, feature-flag, rollback and data-reconciliation runbooks.
- [ ] `M2-BE-812` Run Ruff, strict MyPy, tests with branch-aware coverage, migration checks and OpenAPI
  validation; attach results to the master board.

**BE7 gate:** All backend acceptance criteria pass, alerts and recovery jobs are active, rollback is
tested and the M2 OpenAPI contract is published.

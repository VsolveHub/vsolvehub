# Proposal 0013 — The Partner capability, progressive-gate and crew surface

**Author:** Claude (M2 frontend Session B, Wave B1)
**Date:** 11 August 2026
**Verified against:** OpenAPI 1.20.0 when written. **Re-checked against 1.21.0 (12 August 2026): none
of this proposal's surface is published.** 1.21.0 covers requirements, enquiries, proposals and
`GET /partner/workspaces/` only; every path below is still absent.
**Status:** Implemented in Wave C1 (backend, 12 August 2026) — see
[§Answered](#answered--both-open-questions-backend-12-august-2026). Both design questions are
resolved: a capability rejection is now its own `REJECTED` status, and document validity lives on a
nullable `PartnerDocument.expires_on`.
**Consuming application:** Partner (`frontend/apps/partner`) — the `/apply` tree and the
capability-driven workspace
**Consuming actions:** Register on a short path; browse masked demand before proving anything;
declare a business type; request a lifecycle capability; declare worker insurance; read why a gate is
being asked for *now*; manage a crew roster at first assignment; read a capability's review state.
**Required authorization:** `cookieAuth`. Registration reads are `IsAuthenticated` (a person who has
not applied holds no `partner` role yet); capability, crew and gate reads require `IsPartnerUser`.

**Design authority:** [07-state-machines-and-permissions.md](../../Django_Next.js_Plan/M2/07-state-machines-and-permissions.md)
and [ADR-0007](../../docs/adr/0007-m2-engagement-spine-and-fee-after-value.md). Where this proposal
and that document disagree, the state machine document wins and this file is wrong.

**Relationship to 0012.** Proposal 0012 §A publishes `GET /api/v1/partner/workspaces/` — the
navigation read. It stops there, deliberately. This proposal is everything a Partner does *before*
that endpoint can return anything: how a capability is requested, how it is reviewed, and which
progressive gates stand between registering and being paid. Neither proposal restates the other.

---

## Problem

`apps.partners` already implements this domain, tested at 26/26. `PartnerBusinessProfile`,
`PartnerCapability`, `PartnerCapabilityTransition`, `PartnerInsuranceDeclaration`, `CrewMember`,
`PartnerCrewMembership` and `CrewSkill` are all migrated (`0006_crewmember_partneridentitycluster…`),
and `apps/partners/capabilities.py` publishes `request_capability`, `transition_capability`,
`assert_kyc_complete`, `assert_payout_details_present`, `assert_crew_roster_present`,
`add_crew_member`, `archive_crew_member` and `workspace_grants`.

**None of it is reachable over HTTP.** There is no serializer, no view and no route, so `M2-FE-101`
through `M2-FE-109` — the entire progressive-registration column — has no endpoint to be built
against. Proposal 0012 does not cover them; it covers the workspace read and the Customer's
requirement path.

That gap is the reason this proposal exists, and it is narrow on purpose: it publishes the service
functions that are already written and tested, and invents no new domain behaviour. Every endpoint
below maps to a function in `capabilities.py` or to a model that is already migrated. If an endpoint
here needs new domain logic, it is in the wrong proposal.

Three constraints drive the shapes below.

1. **Supply is the scarce side.** A Partner browses masked demand after phone, name, one service and
   one city. No gate — not KYC, not payout details, not a crew roster — may stand before that.
   `M2-FE-101`'s flow-weight budget is a hard constraint, and an endpoint that requires a document
   upload to return a lead list breaks it from the server side.
2. **A skill is not a capability.** Selecting a skill must not activate a workspace, and the client
   must be unable to make that mistake. So the capability request is its own command with its own
   review, and the options endpoint says so in server-authored copy rather than leaving the client to
   phrase it.
3. **Each gate explains itself at the moment it bites.** A `403` whose body says only
   "kyc required" forces the client to author the explanation, and a client-authored explanation of a
   server-side rule drifts the first time the rule changes. Every gate below carries its own reason
   and its own next action.

---

## A. Business identity

### A1. `GET /api/v1/partner/business-profile/`

**Response `200`:**

```json
{
  "business_type": "WORKFORCE_AGENCY",
  "legal_name": "Sri Sai Facility Services",
  "registration_number": "AP/2019/0042",
  "gst_registered": true,
  "gstin": "37ABCDE1234F1Z5",
  "years_in_operation": 6,
  "updated_at": "2026-08-11T09:14:22Z"
}
```

**Response `404`** when no business profile exists. That is the ordinary state for every M1 Partner
and must not read as an error — the client renders the individual default and offers the step.

### A2. `PUT /api/v1/partner/business-profile/`

Creates or replaces. A `PUT` rather than a `PATCH` because the three business types have genuinely
different required field sets, and a partial update is how a Partner switches from
`WORKFORCE_AGENCY` to `INDIVIDUAL` while keeping a registration number the model's
`partners_individual_has_no_registration_number` constraint forbids.

**Request:** the A1 body without `updated_at`.

**Errors:**

| Status | Code | Frontend recovery |
|---|---|---|
| `400` | field errors | Mark the field on the business-type step. |
| `400` | `m2_business_type_invalid` | `registration_number` sent for `INDIVIDUAL`, or `gstin` without `gst_registered`. Both are model constraints; publishing them as field errors keyed to the offending field is preferred. |

`business_type` is **read, never inferred**. The client must not derive it from which capability was
requested, and the server must not derive it from the services selected. The three types carry
different tax, liability and payout consequences, and the Partner states which one they are.

---

## B. Capability options and requests

### B1. `GET /api/v1/partner/capability-options/`

What this Partner may ask to be considered for. Server-authored copy throughout.

**Response `200`:**

```json
{
  "business_types": [
    { "value": "INDIVIDUAL", "label": "Just me",
      "consequence": "You take work yourself. No GST or registration number needed." },
    { "value": "WORKFORCE_AGENCY", "label": "I supply a team",
      "consequence": "You send workers to a customer's site and the customer pays you directly." },
    { "value": "PROJECT_VENDOR", "label": "I take on whole jobs",
      "consequence": "You quote for a finished outcome. Vsolve holds each stage until it is approved." }
  ],
  "capabilities": [
    {
      "variant_id": "3f0c…",
      "variant_name": "Housekeeping staff",
      "category_name": "Facility staffing",
      "workspace_key": "A3_TIME_BLOCK",
      "commercial_mode": "LEAD_ONLY",
      "lifecycle_explanation": "You supply people for a period of time. The customer pays you directly.",
      "requires_insurance": true,
      "asks_for": ["max_crew_size"],
      "already_requested": false
    }
  ],
  "server_now": "2026-08-11T09:14:22Z"
}
```

`workspace_key` and `commercial_mode` are the same opaque values 0012 §A1 publishes, and carry the
same rule: never parsed, never derived. `lifecycle_explanation` is server-authored for the same
reason 0012 gives for the requirement's copy — it is the sentence that decides whether a Partner
understands what they are signing up to, and a client-side table would drift from the inference that
produced it.

`asks_for` is what lets one form serve both archetypes without the client owning an archetype branch.
A3 asks for `max_crew_size`; A5 asks for `max_project_value_paise`. The client renders the fields the
server named. **A client-side `if archetype === "A3"` is the per-archetype branch `SIM-09` rejects**,
and this field exists to make it unnecessary.

`already_requested` mirrors the `partners_unique_live_capability_per_variant` constraint so the
control is disabled before the refusal rather than after it.

**Required:** this endpoint answers for a Partner with no application, no documents and no approved
capability. It is a catalog read scoped to eligibility, not a gate.

### B2. `POST /api/v1/partner/capabilities/`

Wraps `capabilities.request_capability`.

**Headers:** `Idempotency-Key` required.

**Request:**

```json
{ "variant_id": "3f0c…", "max_crew_size": 12, "max_project_value_paise": null }
```

**Response `201`:** the B3 record shape at `status: "REQUESTED"`.

**Errors:**

| Status | Code | Frontend recovery |
|---|---|---|
| `400` | `m2_lifecycle_not_supported` | The variant carries no A3/A5 archetype. Show "we don't cover this yet" and return to the options list — not a field error. |
| `409` | `m2_capability_already_requested` | A live request exists for this variant. Re-read B3 and show its real state. |
| `409` | `idempotency_in_progress` | Wait and re-read. Never resend under a new key. |

`request_capability` raises `CapabilityTransitionError` for the duplicate case today. Publishing it
as a distinct code rather than a generic transition error matters: the recovery is "look at the one
you already have", not "try something else".

### B3. `GET /api/v1/partner/capabilities/`

Every capability this Partner holds, in any status. Drives `M2-FE-109`.

```json
{
  "capabilities": [
    {
      "id": "c_88…",
      "variant_id": "3f0c…",
      "variant_name": "Housekeeping staff",
      "workspace_key": "A3_TIME_BLOCK",
      "commercial_mode": "LEAD_ONLY",
      "status": "CHANGES_REQUIRED",
      "review_notes": "The address on your ID does not match the address proof.",
      "suspension_reason_code": "",
      "requires_insurance": true,
      "max_crew_size": 12,
      "max_project_value_paise": null,
      "expires_at": null,
      "reviewed_at": "2026-08-11T07:02:00Z",
      "updated_at": "2026-08-11T07:02:00Z"
    }
  ],
  "server_now": "2026-08-11T09:14:22Z"
}
```

`status` is the model's own enum: `REQUESTED`, `UNDER_REVIEW`, `CHANGES_REQUIRED`, `APPROVED`,
`SUSPENDED`, `WITHDRAWN`.

**`review_notes` must be populated whenever `status` is `CHANGES_REQUIRED`, and
`suspension_reason_code` whenever `status` is `SUSPENDED`.** The model already enforces the second
(`partners_capability_suspension_needs_reason`); the first is the same requirement one state earlier.
`M2-FE-109` must show the exact next permitted action, and "we need a correction" without saying what
is the copy that sends someone back to re-upload the wrong document — the failure the M1 status
banner already names.

**This endpoint is what distinguishes "not applied", "under review" and "suspended".**
`08-frontend-information-architecture.md` §4 lists the last three navigation states as *not
implemented* for exactly one reason: an empty grant list from 0012 §A1 cannot tell them apart, and
inferring a review banner from it would show one to every existing M1 Partner. This read closes that,
and it is the reason it is separate from the workspace grants rather than folded into them —
`/workspaces/` answers *what may I do*, and must stay empty and cheap for the overwhelming majority
of Partners who hold no capability at all.

`expires_at` is published because `assert_capability_active` already refuses on it. A capability that
has expired reports `APPROVED` with a past `expires_at`, and the client must treat that as not
authorized. **Alternative worth the reviewer's opinion:** the server could project the expiry into
the status itself. The frontend prefers the raw field — a computed `EXPIRED` status would be a sixth
value the model does not have, and the two would drift.

**Open question — a rejection currently looks exactly like a withdrawal.**
`_ALLOWED_TRANSITIONS` routes both Operations' refusal and the Partner's own exit to `WITHDRAWN`, and
the record above publishes no actor. Those are different events: "we said no" needs a reason and a
support path, "you closed this" needs an obvious way to ask again. The frontend cannot tell them
apart and will not guess — `capability-status.ts` renders `WITHDRAWN` as "no longer live" and commits
to neither cause, which is honest and worse copy than either deserves.

Two ways out, in the order the frontend prefers them: add a `REJECTED` status to
`PartnerCapability.Status`; or publish `last_transition: {actor_kind, reason_code, reason}` on the
record, since `PartnerCapabilityTransition` already stores all three. The second is strictly more
useful — it also dates the decision — and needs no new state.

**Open question — the expired-document state has nothing to read.** `M2-FE-109` requires an
expired-document state. `PartnerDocument` at contract 1.20.0 carries `status`, `review_reason` and
`reviewed_at`, and no expiry field of any kind. A police verification or a trade licence does expire,
and the Partner must be told before an enquiry is refused rather than after. Where document validity
lives is a backend decision this proposal does not presume to make; it is logged in
frontend-execution-plan.md §7 unfiled for that reason.

### B4. `POST /api/v1/partner/capabilities/{id}/withdraw/`

The Partner's own exit, wrapping `transition_capability` to `WITHDRAWN`. `200` with the updated
record. `409 m2_capability_transition_invalid` from a status that cannot reach it.

---

## C. Worker insurance

### C1. `GET` / `PUT /api/v1/partner/insurance/`

Backs `M2-FE-106`, mapping to `PartnerInsuranceDeclaration`.

```json
{
  "insurer_name": "New India Assurance",
  "policy_reference": "WC/2026/88213",
  "coverage_paise": 50000000,
  "covers_workmen_compensation": true,
  "valid_from": "2026-04-01",
  "valid_to": "2027-03-31",
  "verified_at": null
}
```

**Response `404`** when none is declared — the ordinary state, not an error.

`verified_at` is read-only; only Operations sets it. The client must render an unverified declaration
as *declared*, never as *insured*, because the difference is who carries the liability if a worker is
hurt.

**Errors:** `400` field errors for `valid_to <= valid_from` and non-positive coverage — both are model
constraints (`partners_insurance_valid_range`, `partners_insurance_coverage_positive`) and both must
arrive keyed to the offending field rather than as a non-field error.

**Which capabilities require it** is `requires_insurance` on B1/B3, set by the server. The client must
not infer "A3 means insurance": `request_capability` sets the flag from the archetype today, and that
is a server-side policy which can change per variant tomorrow.

---

## D. Progressive gates

### D1. `GET /api/v1/partner/gates/`

The one read behind `M2-FE-102`. Projects the three `assert_*` functions that already exist.

```json
{
  "gates": [
    { "gate": "KYC", "is_satisfied": false, "blocks": ["enquiry.accept"],
      "reason": "We check identity before you accept your first job, so customers know who is coming.",
      "next_action": "SUBMIT_APPLICATION" },
    { "gate": "PAYOUT_DETAILS", "is_satisfied": false, "blocks": ["payout.receive"],
      "reason": "We need a verified bank account before money can leave Vsolve.",
      "next_action": "ADD_PAYOUT_ACCOUNT" },
    { "gate": "CREW_ROSTER", "is_satisfied": true, "blocks": ["crew.assign"],
      "reason": "", "next_action": null }
  ],
  "server_now": "2026-08-11T09:14:22Z"
}
```

`gate` is a closed enum: `KYC`, `PAYOUT_DETAILS`, `CREW_ROSTER`. `next_action` is a closed enum the
client maps to a route it owns — the same split as the workspace registry, and for the same reason.

**This read is advisory and the client must treat it as such.** The gates are enforced by
`assert_kyc_complete`, `assert_payout_details_present` and `assert_crew_roster_present` at the moment
of the command, and this endpoint only decides what the UI explains *before* the Partner tries. A
client that treated it as authoritative would block someone whose KYC completed thirty seconds ago,
and would let through someone suspended thirty seconds ago. Every command still refuses on its own.

`blocks` names actions, not screens. The Partner keeps browsing; a satisfied `is_satisfied: false`
gate never hides demand, it only explains the one control it stands in front of.

**Corresponding command errors**, already classified in `packages/api-client/src/errors.ts`:
`m2_kyc_required`, `m2_payout_details_required`, `m2_crew_roster_required`, each `403`, each
non-retryable, and each carrying the same `reason` and `next_action` fields as above so the in-context
explanation is identical whether it arrives before the attempt or after it.

### D2. `GET /api/v1/partner/demand-preview/`

The masked live requirement summaries `M2-FE-101` ends on — the thing a Partner sees after phone,
name, one service and one city, before proving anything.

**This payload is sent to a person who has completed no KYC.** It carries the same redaction
discipline 0012 §C1 applies to teasers, in the other direction.

```json
{
  "summaries": [
    { "id": "d_4c…", "headline": "4 housekeeping staff, 12 days",
      "area_label": "Gachibowli, Hyderabad", "starts_on": "2026-08-24",
      "workspace_key": "A3_TIME_BLOCK", "is_eligible": false,
      "eligibility_hint": "Needs an approved Housekeeping staff capability." }
  ],
  "matched_service_count": 1,
  "server_now": "2026-08-11T09:14:22Z"
}
```

**Required to be absent:** customer name, phone, full address, building number, exact budget, and any
identifier that resolves to a requirement the Partner has not been invited to. `area_label` is a
locality, never a street. `id` is a preview identifier and must not be a `Requirement` primary key —
an unapproved Partner holding real requirement ids is a lookup away from the record itself the moment
any other endpoint accepts one.

`is_eligible: false` with a hint is the honest rendering: the demand is real, and the Partner is being
shown what standing between them and it. Hiding ineligible demand would make an empty screen the
first thing most new Partners see, and showing it as actionable would be a lie.

**Empty is a real answer.** No demand in a Partner's city is `200` with `[]`, not a `404`, and the
client renders it as "nothing in your area right now", never as an error.

| Concern | Contract |
|---|---|
| Freshness | `VOLATILE_STATE`. |
| Idempotency | Read. |
| Retry | Safe. |

---

## E. Crew roster

Backs `M2-FE-107`. Entered at first assignment, **never at registration** — the roster endpoints exist
from the moment a Partner holds an A3 capability, and nothing in registration links to them.

### E1. `GET /api/v1/partner/crew/`

```json
{
  "members": [
    { "membership_id": "m_21…", "display_name": "Ramesh K.", "phone_masked": "•••••• 4821",
      "status": "ACTIVE", "is_supervisor": true, "skill_codes": ["HOUSEKEEPING"],
      "documents_verified_at": null, "added_at": "2026-08-01T06:00:00Z" }
  ]
}
```

`phone_masked` rather than the number. The Partner supplied it, so this is not a leak in the 0012
sense — but the roster is read on a shared site phone, and an unmasked list is a contact export
waiting to happen. The Partner who needs the full number has it already.

**`crew_member_id` is deliberately absent.** Identity is global (`CrewMember.identity_hash`), and
publishing the global id to one agency would let two agencies correlate their rosters and discover
that a worker is on both. `membership_id` is per-Partner and is what every command below takes.

### E2. `POST /api/v1/partner/crew/`

Wraps `add_crew_member`. **Headers:** `Idempotency-Key` required.

**Request:** `{ "display_name": "Ramesh K.", "phone_e164": "+91…", "skill_codes": ["HOUSEKEEPING"], "is_supervisor": true }`

**Response `201`:** the E1 member shape.

**Errors:** `400` field errors on the phone; `403 m2_capability_not_approved` when the Partner holds no
approved A3 capability — the roster is not a general address book.

`add_crew_member` already un-archives a returning worker rather than failing. The response must make
that visible: a `201` for a new membership, `200` for a reinstated one, so the UI can say "we put
Ramesh back on your roster" instead of silently succeeding on a name the Partner thought was gone.

### E3. `PATCH /api/v1/partner/crew/{membership_id}/`

Skills and supervisor flag. The display name belongs to the global `CrewMember` and is deliberately
**not** editable here: one agency renaming a shared person would rename them on every other roster.
Publishing it as read-only with that reason is preferred to publishing it as editable and scoping the
write.

### E4. `POST /api/v1/partner/crew/{membership_id}/archive/`

Wraps `archive_crew_member`. `200` with the updated member.

**Errors:** `409 m2_crew_conflict` when the member holds a future assignment. Archiving someone who is
rostered on Thursday must refuse and name the assignment, not silently succeed and leave a shift
short.

---

## Cross-cutting requirements

| Concern | Contract |
|---|---|
| Idempotency | `POST /capabilities/` and `POST /crew/` take `Idempotency-Key`. Replay returns the original response. Wraps `apps.foundation.services.execute_idempotent` — no new mechanism. |
| Object-level auth | Per record. A membership or capability belonging to another Partner returns `404`, never `403`. |
| Errors | The `PartnerDomainError` shape: `code`, user-safe `message`, `status_code`, `retryable`, correlation ID. |
| Clocks | Every deadline is an absolute UTC instant, and every payload carrying one also carries `server_now` (proposal 0010). |
| Money | Integer minor units plus explicit `currency`. `coverage_paise` and `max_project_value_paise` are paise. |
| Retryable | None of the commands here. Every refusal above is a decision, not a transient failure. |

### New error codes this proposal introduces

`packages/api-client/src/errors.ts` classifies 29 `m2_*` codes. Three below are **not** among them:

| Code | Status | Proposed category | Where |
|---|---|---|---|
| `m2_business_type_invalid` | `400` | `fix_input` | A2 |
| `m2_capability_already_requested` | `409` | `choose_again` | B2 |
| `m2_capability_transition_invalid` | `409` | `contact_support` | B4 |

`errors.ts` is frozen for the running frontend sessions
([frontend-execution-plan.md](../../Django_Next.js_Plan/M2/frontend-execution-plan.md) §3), so this is
logged as a frozen-file change request in §7 of that plan rather than edited. Until it lands, all
three fall through to the uncategorized path and present as a generic refusal — honest, and slightly
worse copy than they deserve.

---

## Answered — both open questions (backend, 12 August 2026)

Answered before any endpoint was written, because both are decisions about what a record *is* rather
than about how it is serialized.

### 1. A rejection is now its own state: `REJECTED`

**`PartnerCapability.Status` gains `REJECTED`.** Operations' refusal goes there; `WITHDRAWN` is
reserved for the Partner's own exit and nothing else. The proposal preferred the alternative —
publish `last_transition: {actor_kind, reason_code, reason}` and leave both causes on `WITHDRAWN` —
and that option is rejected for a specific reason the proposal could not have known:

**`actor_kind` cannot be derived reliably from what is stored.** `PartnerCapabilityTransition.actor`
is nullable, and it is null in two unrelated cases: `request_capability` writes
`actor=None, reason_code="partner_requested"`, and a system-driven withdrawal for ineligibility will
also carry no actor. So a null actor already means both "the Partner did this" and "a job did this",
and an `actor_kind` computed from it would confidently mislabel exactly the case the frontend needs
to get right. Adding the field would have published a guess wearing a data field's clothing.

The consequences of the state, spelled out so nobody has to infer them:

| | `REJECTED` | `WITHDRAWN` |
|---|---|---|
| Who caused it | Operations | The Partner |
| Reason | Required — `review_notes` must be non-empty, enforced in the domain **and** by a check constraint | Not required |
| Reachable from | `UNDER_REVIEW`, `CHANGES_REQUIRED` | Every non-terminal status |
| Terminal | Yes | Yes |
| Blocks a fresh request for the same variant | No — neither status is in `ACTIVE_STATUSES`, so re-applying creates a new row and a new review | No |

`last_transition` is published anyway, as `{to_status, reason_code, reason, occurred_at}` and
**without** `actor_kind`. It dates the decision and carries the reason without a second round trip,
which was the proposal's real ask; the status itself now answers who.

One consequence worth naming: **`REJECTED` is a sixth status the frontend's `capability-status.ts`
does not handle.** That is a deliberate, visible break rather than a silent one — an unknown status
should render as "we cannot describe this" and prompt an update, which is strictly better than
`WITHDRAWN` quietly meaning two things. Logged for Session B in
`frontend-execution-plan.md` §7 rather than fixed here.

Acceptance criterion 5 is met by the same change: `review_notes` is now required for
`CHANGES_REQUIRED` as well, by `partners_capability_review_state_needs_notes`. A reviewer cannot
reach either status without saying what is wrong.

### 2. Document validity lives on `PartnerDocument.expires_on`

**A nullable `expires_on = DateField(null=True)` on `PartnerDocument`.** Nullable is the whole
answer: a photograph of a government ID has no platform-tracked expiry, a police verification or a
trade licence does, and a non-null default would have been a policy guess about which kinds expire —
exactly what §P0's twelve open owner decisions forbid.

**Where it is enforced.** `assert_capability_active` now refuses when a document of a kind in
`settings.PARTNER_REQUIRED_DOCUMENT_KINDS` has an `expires_on` in the past. That reuses
configuration M1 already has rather than introducing a new policy knob, and it is not a guess: a
required document that has expired is objectively expired, and refusing work on it is what the word
means. **Nothing changes for any existing Partner** — `expires_on` is null everywhere until someone
sets one, and a Partner with no document at all is unaffected, because document *presence* is the
KYC gate's job and not this one's.

**What is still owner-blocked, and is not being guessed at:** which document kinds each capability
requires beyond `PARTNER_REQUIRED_DOCUMENT_KINDS`, how far ahead of expiry a Partner is warned, and
whether an expired non-required document should warn at all. Those are owner decision 7's territory.

**What B3 publishes.** `expired_document_kinds: []` on the capability record, plus
`documents_expiring_on` — the earliest future expiry across the Partner's required documents, or
`null`. The frontend's preference in the proposal is honoured exactly: raw fields, no computed
`EXPIRED` status, because a seventh status the model does not have is a second source of truth that
will drift from the first.

**No new error code.** An expired required document refuses with `m2_capability_not_approved` (403),
the code `assert_capability_active` already raises for an expired capability, carrying a message that
names the document kind. `07-state-machines-and-permissions.md` §8 is the authority on error codes
and does not list a document-expiry code; inventing one here to save the client a string comparison
would put a code in the wire contract that the design document does not know about. The distinct
*state* the frontend needs is on the capability read, which is where a state belongs.

### Two acceptance criteria are only half met, and are recorded rather than claimed

**Criterion 9 — archiving a crew member with a future assignment returns `409 m2_crew_conflict`.**
Not built, and not buildable yet. Crew assignment is per *stage* (`M2-BE-522`) and the stage model
arrives in Wave C4, so there is no table to consult. A guard written against it now would be a check
that always passes, which is worse than a recorded gap because it reads as done. `archive_crew_member`
says so in its own docstring, and `02-backend-tasks.md` records it under `M2-BE-111`.

**Criterion 12 — a variant configured `requires_insurance = False` on an A3 archetype publishes
`False`.** The half that matters is met: the value is server-authored by
`capability_options.requires_insurance_for` and is never inferred client-side, so a client cannot
make the "A3 means insurance" mistake. The half that is not: no variant can currently be configured
to `False`, because there is no per-variant column. Which capabilities require insurance is owner
decision 6, and adding the column before the decision would be choosing a default for it.

### The three new codes in "New error codes this proposal introduces"

Two are published as proposed. One is not:

| Proposed | Published | Why |
|---|---|---|
| `m2_business_type_invalid` (400) | as proposed | New. |
| `m2_capability_already_requested` (409) | as proposed | New, and the proposal's reasoning is right: the recovery is "look at the one you have", not "try something else". |
| `m2_capability_transition_invalid` (409) | **`m2_capability_transition_not_allowed`** | `CapabilityTransitionError` already emits that code and has since 10 August. Renaming a live code to match a proposal's guess at its name is a breaking change bought for nothing. The proposal's `contact_support` classification is right and applies to the existing name. |

---

## What the frontend does until this is published

- **No query below is mounted.** No route is created for a screen whose endpoint does not exist.
- **No fixtures, no mocks, no placeholder data in application code.** Fixtures live in tests only.
- **Every task stops at `[~] built`.** See frontend-execution-plan.md §2.
- The Partner screens are built against these shapes behind a typed seam. If the published contract
  differs, integration is a re-point at that seam; if any screen cannot be re-pointed in a single file
  change, the seam was drawn wrong and that is a frontend bug.

---

## Acceptance criteria

1. `GET /api/v1/partner/capability-options/` answers `200` for an authenticated user with **no**
   application, no documents and no capability. Regression test: a brand-new account can read it.
2. `GET /api/v1/partner/demand-preview/` returns no customer name, phone, street address or exact
   budget. Backend test asserts the serialized field set **by exhaustive comparison**, so a field
   added later fails the test rather than leaking.
3. `demand-preview` ids do not resolve on any requirement route. Test: the preview id returns `404`
   from `GET /api/v1/requirements/{id}/`.
4. `POST /capabilities/` with a duplicate live request returns `409 m2_capability_already_requested`,
   not a generic transition error.
5. Every `CHANGES_REQUIRED` capability carries non-empty `review_notes`. Test asserts a reviewer
   cannot reach that status without one.
6. `GET /partner/gates/` reports exactly the three gates, and each `is_satisfied: false` carries a
   non-empty `reason` and a non-null `next_action`.
7. Gate reads and gate enforcement agree: a command refused with `m2_kyc_required` carries the same
   `reason` and `next_action` strings the gates read published.
8. `GET /partner/crew/` publishes no `crew_member_id` and no unmasked phone. Exhaustive field test.
9. Archiving a crew member with a future assignment returns `409 m2_crew_conflict` naming the
   assignment.
10. Re-adding an archived member returns `200` and a reinstated membership, not a duplicate.
11. A foreign Partner receives `404` on every `{id}` route here. Regression test per endpoint.
12. `business_type` is never derived from a requested capability, and `requires_insurance` is never
    derived client-side. Test: a variant configured with `requires_insurance = False` on an A3
    archetype is published as `False`.

Items 2, 3 and 8 are the ones worth a reviewer's full attention. The rest are correctness; those
three are the difference between showing a Partner honest demand and handing an unvetted account a
customer's address.

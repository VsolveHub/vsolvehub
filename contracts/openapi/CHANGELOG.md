# API Contract Changelog

> Entries for 1.19.0 and 1.20.0 were never written. This file therefore jumps 1.18.0 → 1.21.0.
> The gap is recorded rather than backfilled, because inventing a description of a change nobody
> documented is worse than an honest hole.

## 1.23.0 - M2 Wave C1 remainder: two schema corrections, a wage floor that can fire, and matching completeness

**Two corrections to declared shapes, four new paths, and several additive fields. No path was
removed and no operation changed its method or route.**

### The two list operations now declare the envelope they always sent

`m2_requirement_list` and `m2_partner_enquiry_list` declared `RequirementSummary[]` and
`EnquirySummary[]` and returned a DRF cursor-page envelope. **A client generated from the contract
threw on its first real request**, which is why both frontend columns carry hand-written narrowing
(`packages/query/src/m2-requirement.ts › readRequirementList`,
`apps/partner/features/enquiry/queries.ts › readEnquiryPage`). They now declare
`RequirementSummaryPage` and `EnquirySummaryPage` — `next`/`previous`/`results`, the shape
`BookingGroupPage` already established — so **the declared type finally matches what Django has
always put on the wire**. Those two compensating narrowings can be deleted.

Both also publish the `cursor` query parameter and refuse a malformed one with `cursor_invalid`,
through `common.pagination.StrictCursorPagination`. That closes a second gap: no cursor parameter
was published at all, so **a Partner with more than twenty enquiries saw a silently truncated inbox
with no way to page past it**.

### `POST /proposals/` can now return the refusal it documents

`m2_proposal_below_wage_floor` was documented and unreachable. The guard only ran when the caller
handed it a skill and a state code, and no HTTP caller did — **a below-floor A3 rate was accepted**.

Both inputs are now **derived from the requirement and never accepted from the caller**, so a vendor
cannot pick the classification with the lowest floor:

| Input | Source | Unmapped behaviour |
|---|---|---|
| Skill | `M2VariantConfiguration.wage_floor_skill` (new, nullable) | `409 m2_wage_floor_unavailable` |
| State | `ServiceArea.state_code` (new, blank) | `409 m2_wage_floor_unavailable` |

**This fails closed, and that is a live behaviour change**: until Operations maps a wage-floor skill
on the variant, sets a state code on the service area, and loads a `MinimumWageFloor` row for that
pair, every A3 quote is refused. Skipping the check silently is the defect being closed. A5
estimates are unaffected — an outcome price has no statutory daily floor.

`m2_wage_floor_unavailable` was previously documented under `400` on this operation; it has always
been a `409` in code, and the schema now says so.

### Accepting an enquiry consults the A1 booking grid

`m2_partner_enquiry_accept` gains `m2_capacity_unavailable` on its `409`. M2's own `CapacityHold`
and the M1 `assignments.Reservation` grid are two records of the same fact, and only the first was
read: **an agency could hold a Saturday A1 visit and accept a Saturday workforce enquiry**, with
neither record aware of the other. Both are now checked, at wave time and again at acceptance.

Acceptance and proposal submission also now pass the requirement's service area — and, for
acceptance, its start date — to `assert_capability_active`, so coverage and the vendor's own
published calendar are checked at the moment a slot is taken rather than only when the wave was
built.

### New paths

| Path | What it is |
|---|---|
| `POST /partner/capabilities/{id}/submit/` | The Partner's own submit and resubmit (`M2-BE-110`). `CHANGES_REQUIRED → UNDER_REVIEW` had no route, so a Partner who fixed exactly what was asked had no way to say so. Idempotent: already `UNDER_REVIEW` returns `200` unchanged. |
| `GET` / `PUT /partner/languages/` | The languages a vendor can work in (`M2-BE-301`). Matching excludes on a declaration that contradicts the requirement's language; **declaring nothing is never a mismatch**, so no existing Partner is dropped from a pool for never filling this in. |
| `PUT /partner/crew/{membership_id}/availability/` | A dated "this worker is off on the 14th". Exception-shaped, because the default for a day labourer is available and a weekly grid would demand a calendar nobody maintains. |
| `GET /partner/enquiries/{id}/attachments/` | The Customer's checked site photographs as short-lived signed links (`M2-BE-310`). |

### Attachment access expires with the invitation, and the snapshot does not copy attachments

`M2-BE-310`'s coupled decision, settled: **`RequirementSnapshot` freezes the answers and never the
attachments.** Access is resolved live from the invitation's state, so a vendor sees the
requirement's currently-`VERIFIED` files — a photograph that finished its malware scan after they
were invited becomes visible, and one that came back `INFECTED` never does. Freezing the list would
have shown a vendor a `PENDING` file that later turned out to be malware, or hidden a clean file
from the only person who needed it. Attachments cannot be added after `DRAFT` anyway, so the live
list can only gain scan verdicts on files the frozen answers already described.

Access holds while the invitation holds a quote slot and ends when it is declined, expired or
withdrawn; only the selected vendor keeps it. **Expiry is `has_access: false` on a `200`, not an
error** — the vendor still owns their enquiry record, and an empty list without that flag would read
as "the Customer attached nothing". No signed link is minted once access lapses, because a signed URL
is a bearer credential and hiding a button is not revocation.

### Additive fields

- `CapabilityOption.registration_questions` — the vendor-facing questions for a variant
  (`M2-BE-106`), from the **same versioned `M2VariantConfiguration`** the Customer's answers are
  validated against rather than a second question subsystem. Empty is the ordinary state.
- `CapabilityRequest.service_area_ids` and `.registration_answers`; `PartnerCapability.service_area_ids`
  and `.registration_answers`. An empty area set means "every area this Partner serves"; a non-empty
  one is an Operations narrowing and can only subtract from `PartnerServiceArea`, never add.
- `m2_partner_capability_request` gains `m2_business_type_invalid` on `400` for a failed registration
  answer set or an area the Partner does not serve.

### Ranking is no longer a stable sort on Partner id

`M2-BE-303`. Invitations are ordered on recorded signals: a vendor this Customer has engaged before,
then a coarse 5 km distance band, then least-recent invitation, then Partner id as the tie-break.
`MATCHING_POLICY_VERSION` is `2`, and the per-candidate signals are written into
`VendorInvitation.ranking_provenance` — which is **not published on any read**, because a vendor
must not learn their own ranking inputs. A Partner with no fresh location fix is scored at the
pool's *median* band, not last: sorting unknowns to the back would hand every enquiry to whoever
happens to run the technician app.

Two new exclusion reasons appear in provenance: `calendar_unavailable` and `travel_not_feasible`.

## 1.22.0 - M2 Wave C1: attachments, site visits, and the Partner registration surface

**Additive. 16 new paths, no existing operation changed. One new status value on an existing enum.**

Wave C0 opened the M2 door and left three rooms locked: a Customer could describe a job but not
attach a photograph of it, a paid site visit could be requested and never scheduled or closed, and
the entire Partner registration surface — every model migrated, every command tested since 10 August
— was unreachable over HTTP. This release is those three, plus the four background sweeps that were
selectors with nothing calling them.

### What is published

| Area | Paths |
|---|---|
| Attachments | `POST /requirements/{id}/attachments/uploads/`, `POST /requirements/{id}/attachments/`, `DELETE /requirements/{id}/attachments/{attachment_id}/` |
| Site visits | `POST /site-visits/{id}/schedule/`, `POST /site-visits/{id}/complete/` |
| Business identity | `GET` / `PUT /partner/business-profile/` |
| Capabilities | `GET /partner/capability-options/`, `GET` / `POST /partner/capabilities/`, `POST /partner/capabilities/{id}/withdraw/` |
| Insurance | `GET` / `PUT /partner/insurance/` |
| Progressive gates | `GET /partner/gates/` |
| Crew roster | `GET` / `POST /partner/crew/`, `PATCH /partner/crew/{membership_id}/`, `POST /partner/crew/{membership_id}/archive/` |
| Masked demand | `GET /partner/demand-preview/` |

### A rejection is now distinguishable from a withdrawal

**`PartnerCapability.Status` gains `REJECTED`.** Until now `_ALLOWED_TRANSITIONS` sent both
Operations' refusal and the Partner's own exit to `WITHDRAWN`, so the Partner app could not tell "we
said no" from "you closed this" and honestly said neither. `REJECTED` is Operations' refusal and is
reachable only from `UNDER_REVIEW` or `CHANGES_REQUIRED`; `WITHDRAWN` is the Partner's exit and
nothing else. Neither blocks a fresh request for the same variant — a terminal state that did would
be a permanent ban dressed as a status.

**This is a visible break for a client that switches on the status**, and deliberately so: an
unknown status should render as "we cannot describe this" and prompt an update, which is strictly
better than `WITHDRAWN` quietly meaning two things. The proposal preferred a computed
`last_transition.actor_kind` instead, and that option was rejected because
`PartnerCapabilityTransition.actor` is null both for a Partner's own action and for a system job — an
`actor_kind` derived from it would confidently mislabel the exact case the client needs right.
`last_transition` is published anyway, without `actor_kind`, because it dates the decision.

`review_notes` is now guaranteed non-empty for `CHANGES_REQUIRED` and `REJECTED`, by both a domain
guard and `partners_capability_review_state_needs_notes`. "We need a correction" without saying what
is the copy that sends somebody back to re-upload the document that was already right.

### Documents can expire, and absence of an expiry is not staleness

`PartnerDocument` gains a nullable `expires_on`, and the capability record publishes
`expired_document_kinds` and `documents_expiring_on`. Nullable is the answer rather than an omission:
a photograph of a government ID has no platform-tracked expiry and a police verification does, and a
non-null default would have been a policy guess about which kinds expire.

`assert_capability_active` now refuses when a document of a kind in
`PARTNER_REQUIRED_DOCUMENT_KINDS` has expired, reusing the existing `m2_capability_not_approved`
rather than inventing a code `07-state-machines-and-permissions.md` §8 does not list. **Nothing
changes for any existing Partner** — `expires_on` is null everywhere until somebody sets one.

### `INFECTED` is not `FAILED`

`RequirementAttachment.ProcessingStatus` gains `INFECTED`, which the frontend has modelled since
Wave B1 and the model lacked. A checksum mismatch is an upload going wrong and the recovery is "try
again"; malware is not, and the recovery is that the file is gone and no vendor ever saw it. One
status for both would have offered a retry button for the second case. `scan_failure_reason` is
published alongside so the Customer is told which.

Bytes never pass through Django. `POST .../attachments/uploads/` records what the client says it is
sending and returns a signed URL; `POST .../attachments/` streams the stored object back and refuses
anything whose size, media type or SHA-256 disagrees. Without the intent row, "verify the upload"
would mean "believe the client", and the client is the party whose file we are suspicious of.
Attachments are refused once the requirement leaves `DRAFT`: a photograph appearing after a vendor
quoted is a scope change arriving through the back door.

### The masked demand preview carries a preview id, not a requirement id

`GET /partner/demand-preview/` is sent to an account that has completed no KYC, and it applies the
teaser rules in the other direction: no customer name, phone, street address or exact budget, and
`area_label` is a locality. `id` is a keyed hash and is **not a `Requirement` primary key** — an
unapproved account holding real requirement ids is one lookup away from the record the moment any
endpoint accepts one, and "no endpoint accepts one today" is not a property that survives the next
endpoint. It is not even a UUID, so the path converters refuse it before a view runs.

Ineligible demand is returned with `is_eligible: false` and a hint rather than hidden. Hiding it
would make an empty screen the first thing most new Partners see; showing it as actionable would be
a lie. An empty list is a real answer and never a `404`.

### The crew roster publishes no global identity

`GET /partner/crew/` returns `membership_id` and never `crew_member_id`. Identity is global, and
handing the global id to one agency would let two agencies compare rosters and discover that a worker
is on both. `CrewMember` gains a four-digit `phone_suffix` and `phone_masked` publishes
`•••••• 4821` — the number itself is still never stored, so this is not a redaction of something we
hold but the whole of what exists, and four digits are what let a Partner tell two people called
Ramesh apart.

`POST /partner/crew/` answers **`201` for a new membership and `200` for a reinstated one**, so the
UI can say "we put Ramesh back on your roster" instead of silently succeeding on a name the Partner
thought was gone. `display_name` is read-only through the roster: one agency renaming a shared person
would rename them on every other roster.

### Gates explain themselves once, on the server

`GET /partner/gates/` publishes `KYC`, `PAYOUT_DETAILS` and `CREW_ROSTER` with the reason each is
asked for and the one action that clears it. The same strings arrive in the `403` from the refused
command, read from one table — two copies of that sentence drift the first time the rule changes.
The read is **advisory**: the commands enforce these at the moment they run, and a client treating it
as authoritative would block somebody whose KYC completed thirty seconds ago.

Four reads answer an account that holds the Partner role but has no `PartnerProfile` yet — a real
state lasting the thirty seconds between the two. `/partner/workspaces/`, `/partner/capabilities/`,
`/partner/crew/` and `/partner/gates/` all return empty rather than `404`, because a `404` on the
registration flow's own reads is a gate, and proposal 0013's first constraint is that no gate stands
before browsing demand.

### Site visits have two participants and both can move one

`POST /site-visits/{id}/schedule/` resolves by participation rather than by role: the vendor proposes
a slot they can travel in, the Customer confirms a time somebody will be on site. `complete/` is
Partner-only — completion is a report of what happened, and the party that travelled is the one who
can make it. A Customer who disagrees has the clarification timeline, not a competing completion.

### New error codes

| Code | Status | Retryable |
|---|---|---|
| `m2_business_type_invalid` | `400` | no |
| `m2_capability_already_requested` | `409` | no |
| `m2_attachment_invalid` | `400` | no |
| `m2_attachment_unavailable` | `503` | **yes** |

`m2_capability_transition_invalid`, which proposal 0013 proposed, is **not** published:
`CapabilityTransitionError` has emitted `m2_capability_transition_not_allowed` since 10 August, and
renaming a live code to match a proposal's guess at its name is a breaking change bought for nothing.

Three new named enums — `PartnerBusinessTypeEnum`, `ProgressiveGateEnum`, `GateNextActionEnum`.
`business_type` is the collision waiting to happen, being a name any future model will reuse.

### Behind the contract: four sweeps now have a schedule

Not an API change, and the largest correctness change in this release.
`expired_requirement_ids`, `sla_breached_requirement_ids`, `expired_invitation_ids` and
`expired_proposal_ids` existed as selectors with **no `CELERY_BEAT_SCHEDULE` entry**, so an
unanswered invitation wave stalled forever and a requirement whose needed-by date had passed was
never closed by anything. `apps/requirements/tasks.py` and five beat entries close that. Every sweep
is idempotent by state, and expiring an invitation invites its replacement inside the same
transaction and requirement lock — so a Celery re-drive cannot expire once and invite twice.

### Not in this release

The unlock checkout and state, the unlocked-quote read, selection, rejection and re-validation — all
of BE4, which has no domain layer to wrap yet. Attachment access still does not expire with a
non-selected vendor's invitation (`M2-BE-310`), and archiving a crew member does not refuse on a
future assignment (`M2-BE-522` has no stage model yet). Named here so their absence is documented
rather than discovered.

## 1.21.0 - M2 opens: the requirement, enquiry and proposal surface

**Additive. 17 new paths, no existing operation changed.**

The M2 domain layer had been built and tested for three phases — capabilities, requirements,
matching and proposals, 91 passing tests — behind no HTTP route at all. `apps/requirements` had
models, services and commands but no `views.py`, and `config/urls.py` did not include it. Every one
of the 108 M2 frontend tasks was capped at "built, not integrated" because of that one gap. This
release is the door on the room.

### What is published

| Area | Paths |
|---|---|
| Customer requirement | `POST/GET /requirements/`, `GET/PATCH /requirements/{id}/`, `POST /requirements/{id}/submit/`, `GET /requirements/duplicate-check/`, `GET /requirements/{id}/timeline/` |
| Quote teasers | `GET /requirements/{id}/quotes/teasers/` |
| Clarification | `POST /requirements/questions/{id}/answer/`, `POST /partner/enquiries/{id}/questions/` |
| Partner enquiries | `GET /partner/enquiries/`, `GET /partner/enquiries/{id}/`, `POST .../accept/`, `POST .../decline/`, `POST .../site-visits/` |
| Proposals | `POST /proposals/`, `GET /proposals/{id}/`, `POST /proposals/{id}/withdraw/` |
| Workspaces | `GET /partner/workspaces/` |

### The requirement is free, and the contract says so

Nothing in the requirement surface accepts a payment, quotes a price or implies one is coming.
`POST /requirements/{id}/submit/` answers `202` with `is_free: true` — read from the server that
enforces the rule rather than hardcoded in a screen, because a literal `true` in a component is a
promise that outlives the policy it describes. The unlock is a separate surface and arrives later.

### A teaser is not a quote

`GET /requirements/{id}/quotes/teasers/` is sent to a Customer who has paid nothing. Vendor name,
contact, scope, line items and the exact total are **absent from the response**, not merely
unrendered — a client cannot un-receive a payload, and cached identity survives a refund. The
serializer is an explicit field list rather than a `ModelSerializer` for exactly that reason: the
two are one `fields` edit apart, and only one of them fails safe.

The price *band* is what is published, plus `usable_quote_count` and `unlock_available`. The last
mirrors the server's own guard so the control can be disabled; the unlock command re-checks
independently, because a stale `true` is the state a duplicate purchase lives in.

### Workspaces authorise, they do not navigate

`GET /partner/workspaces/` returns `{workspace_key, commercial_mode, actions[]}`. No routes, no
labels, no icons — the backend authorises, the frontend owns presentation, and a key the client
does not recognise renders nothing rather than a generic tab. A Partner with no approved capability
receives `200 {"workspaces": []}`, never `403`: registered-but-not-yet-reviewed is a real and
common state and must not render as an error. Suspension is expressed by omitting a workspace or
reducing its `actions`, so navigation degrades in place instead of blanking mid-session.

`commercial_mode` is published rather than derived. ADR-0007 fixes A3 as `LEAD_ONLY` and A5 as
`MANAGED_PAYMENT_REQUIRED`, which makes inferring it from the key tempting and wrong: it is the
field that decides whether the UI promises Vsolve protection or tells a Partner to collect
directly, and a client that computes it keeps promising protection through a policy change.

### 404, not 403, wherever existence is private

Object-level authorization is per record. Another Customer's requirement answers `404` — a `403`
confirms there is a record there to find. The same holds for another Partner's enquiry or proposal.

### Progressive registration is enforced at the accept, not the browse

`POST /partner/enquiries/{id}/accept/` is where `m2_kyc_required` fires. A Partner browses masked
demand freely; proving identity is the price of taking a slot away from another vendor, not the
price of looking.

### Errors

The 29 `m2_*` codes now reach clients through the standard envelope with `code`, user-safe
`message`, `retryable` and a correlation id. `packages/api-client/src/errors.ts` already classifies
every one of them, so publishing changes no frontend code.

`m2_unlock_payment_pending` is settled as **`409`, retryable** — see proposal 0012's answered open
question. A `202` carrying an error body arrives at `openapi-fetch` as `data`, and the unlock screen
is the one place in M2 where reading a refusal as a success would show quotes nobody paid for.
`202` stays reserved for genuine acceptance and always carries a projection, never an error.

### Named enums

Eight M2 choice sets are named in `ENUM_NAME_OVERRIDES`, not only the two that collided on arrival.
An unnamed `status` is published as a positional `StatusD6aEnum` whose digits shift when an
unrelated app adds its own `status` — a silent rename of a component the frontend has imported.

### Not in this release

Attachment upload (`POST /requirements/{id}/attachments/`), the unlock checkout and state, the
unlocked-quote read, selection, rejection and re-validation. The attachment models exist but the
upload command does not; the unlock path is BE4 and has no domain layer yet. They are named here so
their absence is a documented gap rather than something a reader has to discover by 404.

## 1.18.0 - One start time per visit

**Breaking.** `POST /fulfilment-plan-sets/` replaces `preferred_start: datetime` with
`preferred_starts: [{group_key, starts_at}]`.

One time for the whole cart made "electrician on Monday, salon on Friday" inexpressible. The
planner derived every unit by cascading a single clock forward, so a Customer with two unrelated
services could only ask for them back-to-back on one day. Every group the server publishes must
now carry a start, and no group may carry two — a missing one is refused rather than defaulted,
because defaulting picks a time on the Customer's behalf for work they never scheduled.

### The grouping is published before the times

`POST /cart/scheduling-groups/` answers *how many* start times to pick, which the plan-set command
structurally cannot: it takes the times as input. The response is a projection over the grouping
the planner already computes from `ServiceCompatibilityRule`.

It deliberately **ignores Partner availability**. Merging asks two questions — "is this the kind of
work one Partner does in one visit?" and "is someone free at this exact time?" — and only the first
belongs to a slot picker. Including the second would split "Electrician" into two rows because
somebody called in sick, and merge them again an hour later, with nothing on screen to explain the
change. Staffing is still resolved at plan time, where a group no single Partner can cover falls
back to independent visits at the chosen start.

`scheduling_groups_changed` (409) is the refusal when the submitted keys are not the visits the
cart currently makes. Group keys are derived from membership, so editing the cart invalidates them
by construction. Not repaired: re-deriving and reassigning would move a visit to a slot nobody
agreed to.

### Cart suggestions

`POST /cart/suggestions/` returns catalog `ServiceCard`s for variants carrying an active
`SAME_PARTNER_SEQUENTIAL` rule against something already in the cart — the same rule the planner
uses to merge work into one unit, which is what entitles the cart to say "the same professional can
do this in the same visit". `PARALLEL_ALLOWED` is excluded: it means a *second* Partner, and
therefore a second visit and a second minimum-visit floor.

Empty stays empty. There is no popular-services fallback, because the heading is a claim about
compatibility and padding it would make that claim false.

## 1.17.0 - Cases, ledger, payouts and kill switches

18 new paths. `apps/cases`, `apps/payouts` and `apps/notifications` were domain layers behind no
door — the same shape B8 was in before 1.16.0 — and this publishes all three at once for the same
reason: an Operations console cannot be built against half a case lifecycle.

### Operations cases

`GET|POST /operations/cases/`, `GET /operations/cases/{id}/`, and `claim` / `escalate` /
`resolve` / `notes`. Cursor-paginated with `status`, `owner_team`, `kind` and `overdue` filters.

The detail projection publishes **`allowed_resolutions`** — the terminal results this case kind
may close on. That set is a domain rule that differs per kind, and a console carrying its own
copy would offer a button the server refuses the first time the two drift. Same reasoning as
`recovery_action` on Booking Groups: publish the decision, do not make the client infer it.

There is **one** case projection, not three. Unlike a Booking, a case has exactly one audience —
a case can quote a Customer's complaint verbatim and name a Partner in a safety report, so no
Customer-facing or Partner-facing shape exists to publish.

### Partner earnings

`GET /partner/earnings/`, `GET /partner/ledger/`, `GET /partner/payout-account/`. All three
resolve the Partner from the session and take no `partner_id` — the safest filter is the one a
caller cannot supply, which is the same reasoning that keeps `booking_group_id` off the Partner
booking projection.

The balance is **four numbers, not one**. "You have ₹4,200" is not true in any useful sense when
₹1,800 of it is held behind an open quality case, and a Partner planning their week needs to know
which part is actually coming. There is deliberately **no withdraw affordance**: M1 pays through
a reviewed batch, and a button implying otherwise would promise something the platform does not
do.

`PartnerLedgerEntry.calculation_snapshot` is published on purpose. A Partner is entitled to see
why they were paid what they were paid; hiding it turns every payment question into a support
ticket.

### Payout batches

`GET|POST /operations/payout-batches/`, detail, and `approve` / `pay` / `cancel`. Plus
`GET /operations/unpayable-partners/` and `POST /operations/ledger-adjustments/`.

**`approve` and `pay` require `HasRecentOperationsStepUp`** — a fresh OTP on the session.
Maker-checker already means two different people are involved; the step-up means neither of them
can be a stolen session on an unlocked laptop. Approving a payout run is the largest money-moving
action in the platform. `401 step_up_required` when the re-verification is missing or stale.

**`cancel` deliberately does not.** Cancelling only returns money to the pool, and making the
safe direction as heavy as the dangerous one trains people to leave bad batches sitting approved.

`unpayable-partners` exists so a Partner owed money with no verified account is *reported* rather
than silently skipped — a Partner left out of a run with no explanation is a support ticket
waiting to happen.

### Kill switches

`GET|POST /operations/kill-switches/` and `POST /operations/kill-switches/release/`.

Rows rather than settings: an environment variable needs a deploy, and the moment you need to
stop sending is the moment you cannot wait for a release. No step-up on either direction — a
control that is hard to reach during an incident is a control nobody uses. The reason is required
by a check constraint as well as the serializer, because an outage nobody can explain afterwards
is worse than the outage.

### Enum names

Fourteen new choice sets are named explicitly in `ENUM_NAME_OVERRIDES`. Left alone the generator
resolved `status` and `kind` collisions by hashing — `Status112Enum`, `Kind106Enum` — and those
reach the generated TypeScript client, where they mean nothing and change whenever an unrelated
model adds a choice. `status` and `kind` are the two most reused field names in this schema, so
every new one is named on arrival.

### Removed

`HasRecentFinanceStepUp` and `FINANCE_STEP_UP_TTL_SECONDS` are deleted. Refunds moved to the
Operations step-up, payouts use the same, and nothing held the finance role. The control that
mattered — a fresh OTP before money moves — is unchanged and now has one implementation instead
of two. `POST /auth/finance/step-up/` is untouched: it stamps `UserSession.stepped_up_at`, which
is the field both permissions always read.

## 1.16.0 - Booking fulfilment (B8) is published: the door on a room that was already built

26 new paths. `apps/fulfilment` has been a complete, tested domain layer since 1.15.1 with no
`views.py`, `urls.py` or `serializers.py` and no entry in `config/urls.py` — every command
reachable only from Python. This release publishes all of it at once.

### Why all at once

A fulfilment surface is a sequence, not a set. En route without arrived is not a smaller feature,
it is a client that strands a Partner halfway through a visit. Publishing one command per release
would have handed clients a contract they could not build a screen on, so the whole lifecycle
lands together: arrival, start OTP, work, evidence, amendment, abort, completion, dispute,
release and recovery.

### Three actor prefixes, three projections, one Booking

- `/bookings/{id}/…` — the Customer's visit.
- `/partner/bookings/{id}/…` — the same visit as work.
- `/operations/bookings/{id}/…` — both sides plus the audit trail.

They are separate URL families on purpose. The same `Booking` is reachable from all three, and
role-branching inside one view is one wrong `if` away from serving a Partner the Customer's
address. **`booking_group_id` and `order_id` appear only on the Operations projection** — G7
requires that a Partner cannot reach a sibling unit's scope or earnings, and the cheapest way to
guarantee that is to never publish the identifier that would let them ask.

The Customer projection names the Partner by `partner_display_name` and carries nothing else
about them: no id, no phone number, no earnings.

### The start OTP is deliberately split across two actors

`POST /bookings/{id}/start-otp/` is the **Customer's** — they receive the code.
`POST /partner/bookings/{id}/start-otp/verify/` is the **Partner's** — they type it in.

That split is the whole mechanism: the OTP proves the Partner is standing in front of the
Customer. A single endpoint, or a code published on the Partner's projection, would prove
nothing. The response carries `code_length`, never the code.

### Operations-assisted start now enforces the step-up it always described

`POST /operations/bookings/{id}/assisted-start/` is the audited channel-outage workaround for a
Customer who cannot receive an SMS. It requires `HasRecentOperationsStepUp` — a permission class
that already existed, already documented as gating exactly this, and had never been enforced
anywhere because until now there was no view to enforce it in. It is not a general-purpose OTP
bypass: it starts work without the Customer's code and says so in the audit trail. `401`
`step_up_required` when the re-verification is missing or stale.

### Post-payment group commands are new paths, not new meanings for old ones

`POST /booking-groups/{id}/cancel/` (`booking_group_cancel`) is **unchanged** and remains the
pre-payment command, still answering `409` `booking_group_conflict` for a `BOOKED` group. The
post-payment equivalents are:

- `POST /booking-groups/{id}/cancel-booked/` — runs the fee ladder per unit, skips finished
  units and names them, refuses the whole command if one unit is mid-work.
- `POST /booking-groups/{id}/reschedule/` — moves every visit by one offset. The Customer names
  a new start for the earliest visit and the rest shift with it, which preserves the planner's
  sequential ordering, parallel overlap and dependency gaps. Per-unit starts are deliberately
  not offered: they would let a client dissolve a server-authored grouping without any of the
  planning inputs that made it legal.
- `POST /booking-groups/{id}/address/` — group address change.

Two commands rather than one endpoint whose meaning depends on state: one collects nothing, the
other moves money.

### `FulfilmentUnit.booking_id` — without it, none of the above is reachable

One read-only nullable field on the Customer's `FulfilmentUnit` projection. No migration, no new
endpoint: `FulfilmentUnit.booking` is an existing reverse one-to-one that the projection simply
withheld.

Every Customer command in this release is keyed by `booking_id`, and `GET /booking-groups/{id}/`
is the only projection that lists a Customer's units — so without this a group detail could
describe three visits and offer no way to open any of them. That is precisely the break proposal
0011 fixed for payment, where `recovery_action` returned `PAYMENT_REQUIRED` while the group
published neither `checkout_id` nor `checkout_version` to act on it with. Publishing a command
and withholding its key is the same defect twice, so it is called out rather than slipped in.

Null before capture, deliberately: a unit still being matched has no Booking, and a fabricated id
would send a Customer to a `403` on a visit that does not exist.

### Conventions every state-changing operation follows

- **Required `Idempotency-Key`.** Same `execute_idempotent` helper proposal 0009 proved and
  1.15.0 reused. A replay answers with *current* truth and an `Idempotent-Replay: true` header,
  not the frozen body — every projection here carries `server_now` and live deadlines, and
  republishing a stored body would hand a device a stale clock.
- **Required `expected_version`.** Never defaulted. `409` `booking_version_conflict` carries
  `current_version` so the client refetches rather than retrying blindly.
- **`403` for both "not yours" and "does not exist".** Distinct codes would make these an
  existence oracle — a caller could enumerate Booking ids from the status alone. Same decision
  cart-item removal took in 1.13.0.
- **Evidence uploads never stream through Django.** Request a short-lived grant, PUT to the
  private bucket, finalize by object key with a client-computed `sha256` that Django recomputes
  from the bytes and compares. The same three-step shape FE-07 established for KYC.

### Enum names

Six choice sets are now explicitly named in `ENUM_NAME_OVERRIDES`: `ScopeAmendmentStatusEnum`,
`ScopeAmendmentLineKindEnum`, `WorkTaskKindEnum`, `WorkEvidenceKindEnum`, `WorkOutcomeEnum` and
`BookingStatusEnum`. Left alone the generator resolves `status`/`kind` collisions by hashing —
`Status7a2Enum`, `Kind0bfEnum` — and those names reach the generated TypeScript client, where
they mean nothing and change whenever an unrelated model adds a choice.

### Breaking: `DecisionEnum` is now `OperationsDocumentReviewDecisionEnum`

The Operations document-review decision was published as `DecisionEnum` only because nothing else
in the contract had a `decision` field. `CompletionResponse.decision` now does, and the generator
disambiguates both — so a component an existing consumer imports has been renamed.

Called out rather than absorbed, because a rename is a breaking change even when the values are
identical. The new name is the better one and is kept; the single consumer
(`apps/admin/features/partner-review/queries.ts`) is updated in the same commit. Any client
generated from an earlier contract must update the type reference. Values are unchanged:
`APPROVED` / `REJECTED`.

### Method fields publish real types

Nine `SerializerMethodField`s on the new projections are annotated with `@extend_schema_field`.
Unannotated they emit `{}`, which a generated TypeScript client renders as `unknown` — handing
every consumer the least useful type for the most useful data (`work_tasks`, `evidence`,
`active_amendment`, `completion`, `status_history`). A schema test now asserts they stay typed.

### Still not published

Partner ledger, payout and `OperationsCase` remain BE-10. A dispute sets `Booking.payout_hold`
and stops there; the Quality case the failure-outcomes table calls for does not exist yet.

## 1.15.1 - Booking fulfilment (B8): group outcome truth, no new surface

No schema change, no new path and no new operation id. B8 lands as domain commands only, and this
entry exists to record two things a client can observe anyway: one changed value on an existing
published field, and one capability that deliberately has no endpoint yet.

### `BookingGroup.status` can now settle on `CANCELLED` after booking

- The enum is unchanged — `CANCELLED` has always been a published value — but a **booked** group
  can now reach it. Previously a group whose every visit ended up cancelled derived `COMPLETED`,
  because the derivation only asked whether every Fulfilment Unit had finished, not whether any of
  them had actually delivered anything. A Customer who cancelled everything was shown a completed
  booking. That is exactly the hidden success state the quality rules forbid, and it is fixed.
- The rule now: a booked group settles once every unit is terminal, to `COMPLETED` if at least one
  unit was delivered (`COMPLETED`, `PARTIALLY_COMPLETED` or `DISPUTED`) and to `CANCELLED` if none
  were. One delivered visit is enough — a cancelled sibling does not erase the visit that happened,
  and an open dispute still lives underneath a settled group rather than holding it open.
- Clients that treat `COMPLETED` as "there is an invoice to show" were previously wrong for
  fully-cancelled groups and are now correct without changing.

### Group-wide post-payment cancellation exists, but not as an endpoint

- `POST /api/v1/booking-groups/{group_id}/cancel/` (`booking_group_cancel`) is **unchanged**: it
  still answers `409` `booking_group_conflict` with `reason: status_not_cancellable` for a group in
  `BOOKED`. It remains the pre-payment command it always was.
- The post-payment equivalent is implemented as the domain command
  `apps.fulfilment.cancellation.cancel_booked_group` and is not yet reachable over HTTP. The whole
  of B8 is service-layer at this release — start OTP, en route/arrived, completion, dispute and
  Partner release have no published paths either — so publishing one B8 command alone would be a
  contract clients could not build a fulfilment surface on. The API surface for B8 is tracked as an
  open gap in `Django_Next.js_Plan/M1/02-backend-tasks.md`; when it lands it lands as one release.
### Money and safety behaviour fixed before it could be published

Three defects found by the security review of this work, all fixed here rather than shipped
behind a future endpoint:

- **A refund is now raised per `PaymentAttempt`.** A Fulfilment Unit can hold allocations on two
  attempts — the checkout capture and an authorized scope amendment's revision payment. The
  refund split previously wrote one `Refund` against the first attempt with `RefundAllocation`
  rows spanning both, which either asks a provider to return more than that payment was worth or
  marks money returned that never moved. Cancellation and partial-work settlement now return a
  list of refunds, one per attempt, oldest attempt first.
- **A reschedule must name a future time.** Partner availability is evaluated by weekday and
  time of day, so a start one whole week in the past passed it. A backdated visit makes the
  lateness watchdog declare an on-time Partner late, and that flag never clears — it would have
  handed the Customer a permanent full-refund switch, usable even after the Partner arrived.
- **A mid-job Partner release is settled, not cancelled.** A Partner may release before the
  visit, on the way, on site or mid-job, and all four land in the same status. A Customer may
  walk away from the first three for a full refund; once work has started the visit settles line
  by line through the completion report instead, so a cancellation can never refund work that
  was actually performed.
- **Work evidence now checks who is uploading.** Minting a signed upload URL and recording
  evidence both verify the actor is the Booking's Customer or its Partner, and a recorded object
  key must belong to the Booking it is filed against. Evidence gates automatic completion, so
  neither could be left to a view that does not exist yet.

### Error codes reserved, not yet returned

B8's commands raise typed failures already, but no published endpoint can return them yet. They are
recorded here so the codes are fixed before a client ever sees one, not renamed underneath it:

- `booking_command_invalid` (`400`, `retryable: false`) — the command cannot apply to the Booking
  state it found: already en route, already cancelled, an amendment already answered, or a
  group-wide cancel that found one visit mid-work.
- `booking_version_conflict` (`409`, `retryable: true`, `details.current_version`) — the Booking
  changed since the caller read it.
- `partner_unavailable_for_window` (`409`), `outside_serviceable_area` (`409`), `otp_invalid`
  (`400`) and `step_up_required` (`401`) — reschedule, address change, start OTP and the
  Operations-assisted outage start respectively.
- A group-wide cancel refused for a mid-work visit names that visit in the message and changes
  nothing. It is never a partial application, so there is no "which units succeeded" shape to
  publish for a failure.

## 1.15.0 - Operations dispatch override and explainability

Additive and backward compatible. Closes the remaining BE-07 hardening gaps: revoke/release/
manual-recovery are now typed, idempotent, authorized commands rather than an internal-only status
value, and dispatch ordering is now explainable to Operations rather than opaque.

### Dispatch explanation (read)

- Added `GET /api/v1/operations/fulfilment-units/{unit_id}/dispatch-explanation/`
  (`operations_fulfilment_unit_dispatch_explanation`), scoped to `IsOperationsUser`. Returns
  `DispatchExplanation`: the unit's current `status`/`version`, the ranking `policy` and
  `policy_version` that ran, and one `DispatchAttempt` per candidate the unit has been offered to,
  each carrying the full `ranked`/`excluded` provenance (`RankedCandidate`, `ExcludedCandidate`)
  for that attempt.
- The pool is bounded to the Fulfilment Unit's service area and the document names every Partner
  considered and a closed-set reason for every one excluded
  (`application_not_approved` | `variant_not_offered` | `already_attempted` |
  `unavailable_at_start`). There is no business ranking published — `factors` names the one input
  (`tiebreak_partner_id`) that actually decided the order today, not a score no code computes.
- This endpoint discloses Partner ids that are never published to the Partner or Customer
  surfaces, so it is Operations-only; a Partner or Customer session receives `403`.

### Dispatch override commands (write)

- Added `POST /api/v1/operations/offers/{offer_id}/revoke/` (`operations_offer_revoke`) →
  `Offer`. Withdraws a live offer from a Partner and immediately hands the unit to the next
  eligible candidate.
- Added `POST /api/v1/operations/reservations/{reservation_id}/release/`
  (`operations_reservation_release`) → `DispatchReservation`. Frees a Partner's held slot. If the
  Booking Group is still `PAYMENT_PENDING`, releasing one unit's hold compensates the **whole**
  group to `REPLAN_REQUIRED` instead of producing a partial hold the Customer can no longer pay
  for as quoted; otherwise the unit returns to `MATCHING` and dispatch re-offers it.
- Added `POST /api/v1/operations/fulfilment-units/{unit_id}/recover/`
  (`operations_fulfilment_unit_recover`) → `FulfilmentUnitDispatch`. Runs the identical dispatch
  reconciliation Celery beat runs, under an actor, a version guard and a durable audit record,
  rather than a second divergent recovery path.
- All three require the `Idempotency-Key` header and a `DispatchCommandRequest` body of
  `expected_unit_version`, a closed-set `reason`, and an optional `note`. Replaying the identical
  request under the same key answers `200` with the **current** projection (live deadlines,
  `server_now`), not the frozen first response, and writes exactly one audit row regardless of
  how many times it is replayed.
- `note` is operator-authored free text; it is never echoed into any Partner- or Customer-facing
  projection.

### New error codes

- `dispatch_command_invalid` (`400`, `retryable: false`) — the command cannot apply to the
  dispatch state it found: the offer is no longer live, the reservation is already released, or
  the Booking Group has already reached a terminal state.
- `dispatch_version_conflict` (`409`, `retryable: true`, `details.current_version`) — the
  Fulfilment Unit changed since the caller read it. A refused command of this shape burns no
  idempotency key, so the same key can be retried once the console has refetched.

### Ranking provenance (persisted, not newly published as a standalone resource)

- `AssignmentAttempt` now records `ranking_snapshot` internally: the policy, the service-area pool
  considered, and a named reason for every Partner passed over. It is not merged into
  `PartnerOffer.partner_projection_snapshot` and is not published on any Partner or Customer
  surface — only through the Operations explanation endpoint above.

## 1.14.0 - Booking Group payment entry point

Additive and backward compatible. Implements proposal 0011. No new endpoint, no new command, no
migration — three read-only nullable fields on an existing projection.

### Booking Group (proposal 0011)

- `BookingGroup` now carries `checkout_id`, `checkout_version` and `order_id`. They appear on both
  `GET /api/v1/booking-groups/{group_id}/` and the `booking_group_list` page.
- This closes an unexecutable instruction. `recovery_action` has returned `PAYMENT_REQUIRED` since
  1.9.0, but `POST /api/v1/payment-attempts/` requires `checkout_id` and
  `expected_checkout_version`; the group published neither, and there is no
  `GET /api/v1/checkouts/{checkout_id}/` to resolve one. A Customer could therefore pay only from
  inside the browser tab that created the checkout. A reload, a second device or a notification
  link all reached a dead end, and the reservation expired holding capacity the Customer had
  already committed to.
- `checkout_version` is published alongside `checkout_id` on purpose. Sent back as
  `expected_checkout_version`, it is the guard that stops a payment being raised against a checkout
  that has moved. Publishing the id alone would force clients to guess a version and defeat it.
  A stale value still answers `409`, unchanged.
- `order_id` is `null` before capture and names the `Order` after it. `Order` is retrievable by id
  alone — there is no list and no filter — so without this pointer a Customer who had paid could
  not reach their own allocations, invoice or credit note. `GET /api/v1/orders/{order_id}/` remains
  the read and keeps its own ownership check; this field discloses only the identifier.
- All three are `null` when the relation is absent, matching `CheckoutSession.booking_group` and
  `Order.booking_group`, which are both nullable. Clients render no payment affordance on `null`
  rather than building one on a guessed id.
- Authorization is unchanged. `BookingGroupDetailView` already scopes to `customer=request.user`,
  and another Customer's group id still answers `404`. Both list and detail `select_related` the
  two reverse one-to-ones, so the fields cost no query per row.

## 1.13.0 - Cart removal, typed offer commands and bounded list cursors

This is the coherent WIP integration release for proposals 0007, 0008 and 0009. It has not been
consumed as an immutable published client pin; finishing the three contract gaps in one version
avoids an unnecessary 1.14.0 bump.

### Cart-item removal (proposal 0007)

- Added `POST /api/v1/cart/items/{item_id}/remove/` (`cart_items_remove`) with a required
  `CartItemRemoveRequest` body carrying `expected_cart_version` and `expected_item_version`, and a
  `200` response returning the complete updated `Cart`. Authorization is unchanged from the rest of
  the Cart surface: `cookieAuth` or an anonymous session cart.
- No `Idempotency-Key` is required or accepted. The optimistic-version pair is the replay
  protection — a repeat of an accepted removal can no longer match a live row, so a double
  submission cannot remove a second item. This is deliberately unlike checkout, which mints a new
  record and has no version to check against.
- `DELETE /api/v1/cart/items/{item_id}/` is retained for callers already sending a DELETE body and
  runs the identical domain command. Its request shape is still absent from this document, because
  the schema generator does not emit a `requestBody` for DELETE — that omission is the reason the
  POST sibling exists, and generated clients must use the POST.
- Added `cart_item_not_found` as a `409`. A removed, unknown or another Customer's item id all
  answer with it, identically, so the command cannot be used to discover whether an id exists in
  someone else's cart. It replaces the previous `400 validation_error` on the DELETE route; no
  published client called that path, since the request body it required was never publishable.
- `cart_version_conflict` details now carry `conflicting_field`, naming which expectation moved
  (`expected_cart_version` or `expected_item_version`). Both guards keep the same code because both
  recover by refetching the cart. This is an additive key on `add`, `update` and `remove`; existing
  `current_version` handling is unchanged.

### Partner offer commands (proposal 0009)

- `POST /api/v1/partner/offers/{offer_id}/{action}/` now requires `Idempotency-Key`. The key scopes
  to the authenticated Partner, offer id and action. Identical replay returns HTTP `200` with the
  offer's current authoritative projection and performs the transition once.
- `action` is the closed `OfferActionEnum`: `accept`, `decline`, `undo`, `commit`.
- Declared responses are `200` (`Offer`), plus `400`, `403`, `404` and `409` (`ApiError`).
- Reusing a key with a different command returns `409 idempotency_key_reused`. An unfinished
  command returns `409 idempotency_in_progress` (`retryable: true`).
- A genuine reservation race returns `409 offer_reservation_conflict` rather than an expiry-shaped
  refusal. A Partner cannot command another Partner's offer (`404`).

### Bounded list cursors (proposal 0008)

- `GET /api/v1/booking-groups/` and `GET /api/v1/partner/offers/` publish an optional `cursor` query
  parameter (`string`, `minLength: 1`), matching the Operations review-queue precedent.
- Omitting `cursor` returns the first page. An explicitly blank, whitespace-only, malformed or
  poison-position cursor returns `400 cursor_invalid` (`retryable: false`) in the standard error
  envelope. Clients should reset to page one.
- Page size remains server-bounded; clients cannot widen pages through unpublished parameters.

Migration note: regenerate clients at 1.13.0. Cart removal becomes callable through the generated
client for the first time. Offer commands require a stable Idempotency-Key per logical action.
Booking Group and Partner offer lists can traverse with typed `cursor` values parsed from `next`.

## 1.11.0 - Browser-readable server clock

- Added `server_now` to the Partner `Offer` projection and to the Partner offer page envelope.
  A Partner session that opens straight to the offer inbox previously touched no endpoint
  publishing a server instant, so the 45-second offer expiry and the 120-second undo window were
  the only deadlines in the product with no calibration source of their own. The page-level field
  covers an empty inbox, which carries no offer to read a timestamp from.
- No request shape, authorization rule, status code or money field changed. Every added field is
  read-only and server-authored.

Operational change published alongside this version, with no schema effect: `Date` is now named in
`Access-Control-Expose-Headers` for allowed credentialed origins, and production start-up fails if a
deployment removes it. `Date` is not CORS-safelisted, so browser clients previously read `null` from
`response.headers.get("date")` and every countdown silently fell back to the device clock. Clients
should keep the header as their primary calibration source — it refreshes on every response and
tracks drift — and treat `server_now` as the more precise reading where an endpoint publishes it.

Migration note: regenerate clients at 1.11.0. No existing call site requires changes.


## 1.10.0 - Booking Group payments, unit refunds and financial documents

- Added idempotent Customer payment-attempt creation after all required Fulfilment Units have live
  Partner holds, plus Customer-owned attempt and checkout-payment recovery projections.
- Added immutable Payment Allocations for every Fulfilment Unit line. Provider capture, unit refund,
  invoice and credit-note totals reconcile to the selected group quote in integer paise.
- Added raw-body signed Razorpay webhook ingestion using provider event IDs, monotonic payment-state
  reduction and explicit reconciliation for duplicate, out-of-order and browser-redirect-loss cases.
- Added Finance-step-up unit refund creation/reconciliation and Customer-authorized refund reads.
  Failed or ambiguous provider commands remain visible as financial exceptions instead of becoming
  false success states.
- Added Customer-authorized group Order, per-unit Booking, invoice and credit-note retrieval. Live
  collections remain fail-closed until Razorpay credentials, webhook secret and CA/legal approval are
  explicitly configured.

## 1.9.0 - Booking Group recovery and unit-scoped dispatch

- Added Customer-authorized, cursor-paginated Booking Group list/detail projections and a versioned,
  idempotent pre-booking cancellation command with explicit server recovery actions.
- Re-keyed assignment attempts, Partner offers and PostgreSQL range reservations to individual
  Fulfilment Units while retaining nullable legacy Checkout references during migration.
- Partner offer polling is bounded and unit-scoped; each offer exposes only that unit's service
  lines, window and duration and never exposes sibling units or Customer data.
- Booking Group dispatch starts from a transactional outbox event and is reconciled by Celery. Offer,
  undo, group-search and payment-hold deadlines progress without an open browser; partial holds are
  released when any all-or-nothing unit cannot be fulfilled.
- Added Operations manual-offer recovery at Fulfilment Unit scope.

## 1.8.0 - Reviewed compatibility-rule lifecycle

- Added Operations-only compatibility-rule list/detail and draft, independent activation,
  rejection and retirement commands.
- Compatibility responses publish canonical exact-variant pairs, immutable configuration versions,
  effective windows, lifecycle state, maker/checker references and non-secret review reasons.
- Activation fails closed for inactive variants, overlapping windows, self-review, unsupported
  conditions and ordering dependencies on parallel rules.

## 1.7.0 - Multi-item fulfilment planning and Booking Groups

- Replaced the singleton Cart integration target with an optimistic-versioned Cart containing up to
  five independently scoped items. Explicit add/update/remove commands preserve stable item identity;
  a stale cart version fails without applying a partial mutation.
- Added immutable, expiring fulfilment Plan Sets with server-authored sequential, coordinated-parallel,
  independent-visit or mixed alternatives. Each alternative partitions every active Cart Item exactly
  once and exposes visit/professional counts, unit windows, reasons and server-calculated Money.
- Added selected-plan quotes with immutable Quote Units and Lines. Minimum-visit pricing applies per
  unit, the platform fee is charged once per group and allocated deterministically in paise.
- Checkout confirmation now materializes one Booking Group and one Fulfilment Unit per selected Plan
  Unit under the `ALL_OR_NOTHING` policy. Historical invalidated/expired/consumed quotes remain readable.
- Added effective-dated exact-variant compatibility rules. Missing rules fail safely to separate visits;
  same-category membership never proves grouping, and parallel plans require distinct eligible capacity.

Migration note: Customer clients must move from singleton `PUT /cart/`, `/booking/windows/` and
`POST /quotes/` integration to `/cart/items/`, `/fulfilment-plan-sets/` and `/plan-quotes/`. The old
paths remain an expand-phase compatibility surface only. Generate clients from 1.7.0 and do not infer
grouping, schedules, Partner counts, prices or allocations in the frontend.

## 1.6.0 - A1 catalog, arrival windows and complete quotes

- Replaced legacy public duration-picker metadata with the A1 fulfilment archetype, current task
  lines and the effective minimum service subtotal. Displayed starting prices now include the
  minimum-visit floor.
- Added authenticated, server-authored Today/Scheduled arrival windows. Window IDs are signed,
  short-lived and bound to the current cart item and address; availability is explicitly marked as
  preliminary until checkout revalidation.
- Quote creation now accepts only an address and opaque window ID. Responses include server time,
  expiry, immutable task/minimum/platform-fee lines, tax included in the total, the arrival window
  and versioned cancellation-policy bands.
- Singleton-cart replacement now returns `409 cart_item_limit_reached` with safe existing-item
  context and requires an explicit `replace_existing` confirmation.
- Checkout creation now rejects expired quotes and revalidates address, service area, operating
  hours, duration and arrival-window timing before creating the checkout.

Migration note: Customer clients must fetch `POST /booking/windows/` before creating a quote and
must stop sending `requested_start`, price, duration or total fields. Handle cart replacement as an
explicit confirmation flow, refresh windows on `window_no_longer_available`, and refresh the quote
on `quote_expired`.

## 1.5.0 — Private Partner documents and Operations review queue

- Replaced client-supplied document object metadata with a two-step private upload contract:
  Django issues a server-owned random object key and short-lived Supabase upload grant, then accepts
  only an upload ID plus the current application version for finalization.
- Finalization now verifies authoritative byte count, content type and SHA-256 before publishing a
  document. Documents expose fail-closed scan state and cannot be revealed or reviewed until clean.
- Added the bounded, cursor-paginated Operations Partner-application queue and masked detail read,
  including status/assignment filters and optimistic-concurrency claim ownership.
- Added assigned-reviewer-only, short-lived document review access. Application reads, document
  reveals and self-review denials are audited; permanent storage paths are not exposed by detail.
- Added explicit retryable storage failures and stable invalid/expired/replayed upload behavior.

Migration note: Partner clients must first call `POST /partner/application/documents/uploads/`,
upload directly with the returned signed grant, and finalize with
`POST /partner/application/documents/`. Remove any client-authored `object_key` request. Operations
clients must claim an application before revealing or reviewing documents and must treat review URLs
as ephemeral secrets.

## 1.4.0 — Step-wise Partner onboarding

- Added authenticated applicant reference endpoints for accepting service areas, active canonical
  Partner skills and current required consent documents.
- Added explicit Partner-area intake control and skill descriptions without exposing capacity or
  ranking inputs.
- Changed Partner application `PATCH` into a genuine partial optimistic-concurrency command:
  omitted fields are preserved, supplied selection sets are validated together and the complete
  updated application is returned.
- Linked new consent receipts to canonical versioned HTTPS legal-document records. Submission now
  fails closed when required consent configuration is missing, withdrawn or superseded.

Migration note: Partner onboarding clients should replace catalog-derived skill labels and any
locally supplied area/consent identifiers with the three reference endpoints. Existing application
updates must continue sending `expected_version`; only initial draft creation omits it.

## 1.3.0 — Browser session security and role-aware Operations

- Added a typed JSON CSRF bootstrap token for credentialed browser clients while retaining HttpOnly,
  Secure production cookies and explicit origin allowlists.
- Added OTP `code_length` and machine-readable throttle wait details.
- Changed `GET /auth/session/` to an anonymous-safe session projection containing nullable `user`,
  `active_role` and `session_expires_at` fields.
- Added `active_role` to OTP verification responses and kept backend-authored error/role codes in
  lowercase `snake_case`.
- Added representative OTP/session/conflict examples and typed required `Idempotency-Key` headers to
  the Customer and Operations-assisted checkout commands.
- Made customer-safe API exception messages authoritative and added the stable `csrf_failed` recovery
  code.
- Operations APIs now require the session's active Operations role as well as an unrevoked grant;
  authorization decisions are audited and Partner application/document self-review is forbidden.
- Backend quality now fails on migration drift, invalid OpenAPI or Django-to-committed-schema drift.

Migration note: consumers of the old current-session response must read user fields from `user` and
treat `user: null` as the ordinary signed-out state. Browser clients must retain the CSRF response
token in memory and refresh it after login or a `csrf_failed` response.

## 1.2.0 — Partner onboarding, eligibility and presence

- Added Partner application create/update/read and optimistic-version submission endpoints.
- Added versioned KYC document upload metadata and Operations review/state-transition commands.
- Added normalized Partner skill, service and service-area eligibility.
- Added weekly schedules, date exceptions and Redis-first online/heartbeat/offline presence.
- Added `retryable` to the standard API error envelope.

## 1.1.0 — Catalog and locations

- Added public Category, Service list/detail and booking-configuration endpoints.
- Added effective-dated authoritative “starts at” pricing.
- Added authenticated Customer address list/create/read/update/archive endpoints.
- Added reverse-geocoding with normalized response and recoverable provider failure.
- Added serviceability checks for PIN, service variant, full duration and operating hours.

## 1.0.0 — Foundation

- Added liveness endpoint.
- Added database/cache readiness endpoint.
- Added stable request-correlation header.
- Added standard API error-envelope policy.
- Added CSRF bootstrap endpoint.
- Added OTP request and verification endpoints.
- Added current-session and logout endpoints.
- Documented revocable cookie-session authentication.

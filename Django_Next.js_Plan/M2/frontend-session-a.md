# Session A — Customer application

**Application:** `frontend/apps/customer` (+ `frontend/apps/admin/features/m2-cases` from Wave 4)
**Rules of engagement:** [frontend-execution-plan.md](frontend-execution-plan.md) — read §2, §3, §4 before touching a file.
**Task detail:** [03-frontend-tasks.md](03-frontend-tasks.md) · **Master board:** [task.md](task.md)
**Paired session:** [frontend-session-b.md](frontend-session-b.md) — Partner + Operations. Do not edit their files.

## Kickoff prompt for this session

> You are Session A on the M2 frontend — the **Customer application**, `frontend/apps/customer`.
> Read `Django_Next.js_Plan/M2/frontend-execution-plan.md` first: §2 (what is and is not published,
> and what that caps), §3 (the file-ownership map and the frozen list) and §4 (repo setup). Then
> read `task.md` §"Verification convention" — you do not run tests. Then read this file,
> `frontend-session-a.md`, and work it wave by wave.
>
> **Where you are.** Wave A1 is 14 of 15 built. `features/requirement/` holds the full
> `contract-pending/ → model/ → adapters/ → view/` stack: the four screens, the reducer with its
> invalidation cascade, save-and-resume, the duplicate notice, the four optional-extra panels,
> `My requests`, the request timeline and the honest closure states. `pnpm lint` is clean at
> `--max-warnings 0`, `pnpm --filter customer typecheck` is green, and **592/592 customer tests pass**
> — 87 of them in `features/requirement/`, including a `SCREENS.length === 4` assertion that makes the
> flow-weight budget a build failure rather than a Markdown promise. Read the two "Wave A1 progress"
> sections below before writing anything: they record why each decision was made, and re-deriving them
> differently is how the flow drifts.
>
> **What is next, in this order — reordered after the 2026-08-12 audit.** Integration comes first,
> because everything you have built is currently unreachable by a user: `features/requirement/`
> contains **zero** `useQuery`, `app/(flow)/requirements/` does not exist, and the boundary guard
> still lists all three published paths. Building `FE-211` on top of that adds a fifteenth dark
> feature to a column that already has a whole flow in the dark.
>
> 1. Drop the stale entries from `features/booking/contract-pending/boundary.test.ts` — all three:
>    `/api/v1/requirements/` and `/api/v1/proposals/` are published, and `/api/v1/partner/workspaces/`
>    is not the Customer app's to call either way, so the entry is simply wrong now. A guard that is
>    wrong teaches people to ignore guards.
> 2. Write `packages/query/src/m2-requirement.ts` and the feature's query hooks against the generated
>    client. Copy the decisions in `apps/partner/features/workspace/queries.ts` rather than
>    re-deriving them: an unread answer is `null` and never `[]`, and a 401/403 is not retried.
> 3. Re-point the adapters. Three field shapes differ and all three are one-liners at the seam:
>    `flexibility_days` (int, the source of truth) beside `is_date_flexible`, `IMAGE` where you wrote
>    `PHOTO`, and `VERIFIED` where you wrote `CLEAN` — there is no `INFECTED` until the C1 upload
>    command lands.
> 4. Mount `app/(flow)/requirements/` and the `My requests` route, `force-dynamic` and
>    `robots: noindex`, exactly as Session B mounted its seven.
> 5. Then `FE-211`, which is now readable from server state.
>
> **Do not start Wave A2.** `FE-216`, `FE-401..424` (rescoped by revision 3 — A3 unlock + A5
> visits/estimates, see the Wave A2 section below) needs unlock, visit-plan, selection and
> reconfirmation surfaces, and those have no domain layer on the server at all — that is Wave C2,
> not a missing serializer. Finish Wave 1.
>
> **The constraint has changed.** Contract **1.21.0** now publishes the requirement surface — list,
> create, read, patch, submit, duplicate-check, timeline and quote teasers — and the generated client
> is in sync. Attachment upload, unlock, selection and everything in proposal 0013 are still
> unpublished; build those against the proposals and mount no query for them. **No mock or placeholder
> data anywhere in application code** still stands, permanently: fixtures live in tests only. Do not
> mount a route that cannot work — a reachable page that cannot function is the dead link `FE-810`
> forbids. A task reaches `[x]` only with integration evidence against real backend states; until
> then it is `[~] built`.
>
> **Boundaries.** Own `apps/customer/**`, `packages/query/src/m2-{requirement,quotes,engagement-customer}.ts`,
> `e2e/m2-customer-*.e2e.ts`, this file, and your own task ID lines in `03-frontend-tasks.md`. Never
> touch `apps/partner`, `apps/admin` before Wave 4, or anything on the frozen list — need a frozen
> file changed? Log it in execution plan §7 and keep building against the current shape. Do not add
> to `packages/ui` mid-wave; build it under `features/<area>/view/` and request promotion at a gate.
> Never `git add -A`.
>
> Every screen ships loading, empty, validation, pending, offline/retry, forbidden and server-error
> states — a screen without its exception states is not `[~] built`.
>
> **Do not run tests. Any tests. Ever.** Not `vitest`, not a single file, not Playwright. You still
> **write** them to the same standard — an unwritten test is a gap and you record it as one — but the
> owner runs every one. Your gates are `pnpm lint --max-warnings 0`, `pnpm --filter customer
> typecheck` and, at a wave gate, `pnpm build --filter=customer`. Report `[~] built — owner
> verification pending` and end each report with the test files you wrote and the exact command to
> run them. Never write "N/N pass" for a run that did not happen. See [task.md](task.md)
> §"Verification convention". Commit at the wave gate, not per task. Never push to `main`.

## Standing constraints

- **Owned paths only:** `apps/customer/**`, `packages/query/src/m2-{requirement,quotes,engagement-customer}.ts`,
  `e2e/m2-customer-*.e2e.ts`, this file, and your own task ID lines in `03-frontend-tasks.md`.
- **Frozen:** `m2-keys.ts`, `freshness.ts`, `errors.ts`, `error-presentation.ts`, `packages/ui/**`,
  `packages/api-client/src/generated/**`. Need a change? Log it in the execution plan §7 and keep going.
- **Barrel:** append exports only inside `// --- M2 customer surface (session A) ---`.
- **No mock or placeholder data in application code.** Real loading state, then real error state.
- **Flow-weight budget is a hard constraint, not a target:** requirement submission is 4 screens; the
  review screen *is* the confirmation; A3 has one payment before work, A5 has two.
- Every screen ships loading, empty, validation, pending, offline/retry, forbidden and server-error
  states. A screen without its exception states is not `[~] built`.

---

## Wave A1 — Customer requirement (free) and tracking

**Depends on:** Gate 0. **Blocks:** nothing in Session B.
**Gate:** a Customer submits a rich mobile requirement in four screens, pays nothing, and understands
exactly when and whether they will be asked to pay.

### Four-screen guided requirement

- [~] `M2-FE-201` Category-first entry that says in plain language whether they are hiring workers for
  a period or commissioning a defined outcome — without asking them to pick an archetype.
- [~] `M2-FE-202` Screen 1 `What`: service, scale, and the answers the backend infers lifecycle from.
- [~] `M2-FE-203` Screen 2 `Where/When`: location, dates, flexibility, hard `service_by` date.
- [~] `M2-FE-204` Screen 3 `Details`: photos, short video, documents, voice note — preview, upload
  progress, retry, remove, privacy guidance, failure handling.
- [~] `M2-FE-205` Voice as a first-class fast path ("record 30 seconds instead of answering
  questions") beside the structured questions; capture the language.
- [~] `M2-FE-206` Screen 4 `Review` as the single confirmation. Submit happens here. No second
  immutable-version confirmation step.
- [~] `M2-FE-207` Callback preference, site-visit interest, access constraints and preferred
  communication as optional entry points reachable **from** review — not extra steps.
- [~] `M2-FE-208` Optional additional-details text field, secondary to structured answers and voice.
- [~] `M2-FE-209` Save-and-resume, step validation, back navigation.
- [~] `M2-FE-210` Probable-duplicate warning with a merge option before a second requirement is created.
- [ ] `M2-FE-211` Explain when an edit after vendor acceptance notifies vendors and resets deadlines;
  explicit confirmation for material edits.
- [~] `M2-FE-212` State on submission that the requirement is free and nothing is charged until quotes arrive.

### Customer tracking

- [~] `M2-FE-213` `My requests`: matching status, quote teaser count, delivery deadline, latest
  activity, support action.
- [~] `M2-FE-214` Request detail timeline: requirement, matching, invitations **at aggregate level**,
  questions, site visits, quote delivery, recovery.
- [~] `M2-FE-215` Honest empty, no-supply, delayed-match, SLA-breached and service-by-expired states.
  A truthful next step and no fabricated progress.

**Evidence to record:** screen count proof for the 4-screen budget, upload failure/retry behaviour,
duplicate-merge path, expired-requirement state.

---

## Wave A2 — Access (A3 teasers + unlock · A5 visits + estimates), selection and engagement

**Depends on:** A1 and Wave C2. **Gate:** money is only ever requested against a real accepted
commitment — visible delivered quotes (A3) or a confirmed visit (A5).

**Revision 3 (ADR-0008) reshaped this wave before it started.** The A5 journey is visit-first: plan
chooser on review (`FE-216`, an A1-wave follow-up), vendor cards, visit-plan checkout, visit tracker,
on-site estimates readable in full. Teasers and the unlock are A3-only. Reuse the checkout
slot-picker presentation (`features/checkout/view/slots-modal.tsx`) for visit times.

**Revision 4 (ADR-0009, 2026-08-13) reshaped it again — after it shipped.** A3 is rate-card-first,
so the teasers and the unlock below are the **thin-supply fallback**: built, kept, nothing deleted
or reworked. The primary A3 front door — preset, published rate, booking-fee checkout — is
**Wave A2R below**, new and unstarted.

### A3 teasers and unlock (the A3 fallback since revision 4 — built, kept)

- [ ] `M2-FE-401` Quote **teasers**: verification badge, rating, vendor type, headline price band.
  No full scope, no vendor identity, no contact.
- [ ] `M2-FE-402` The INR 149 unlock presented against visible delivered value — what it unlocks, and
  that it is charged once.
- [ ] `M2-FE-403` Checkout on the server-created payment order; UPI pending, failed, cancelled, late
  success and browser-close recovery all handled truthfully.
- [ ] `M2-FE-404` Never show success from the payment redirect alone. Resolve final status from the
  backend; safe retry with no duplicate purchase.
- [ ] `M2-FE-405` Out-of-budget quotes and estimates marked as such, not presented as ordinary options.
- [ ] `M2-FE-406` Non-responsive rejection: reason, remaining rejection allowance, the replacement it
  triggers (A3: quote slot; A5: free replacement visit).

### A5 visits and estimates (revision 3)

- [ ] `M2-FE-216` The visit-plan chooser on the review screen: 1/2/3 professionals at server-published
  tier prices; choosing charges nothing; never renders for A3; never a fifth screen.
- [ ] `M2-FE-419` Vendor cards before any confirmed visit: verification, rating, vendor type, distance
  band — no identity, no contact. Identity appears per vendor at slot confirmation.
- [ ] `M2-FE-420` The visit-plan checkout at `/requests/[id]/book-visits`, opened when the first
  vendor holds a slot; one payment for the whole plan; unfilled visits refund themselves; all payment
  states truthful, never success from the redirect.
- [ ] `M2-FE-421` The visit tracker on the request detail: per-slot states (awaiting, held, scheduled
  + disclosed identity, completed, refunded/replaced), slot times in the checkout picker presentation.
- [ ] `M2-FE-422` Visit-day states: arrival via the non-OTP fallback, reschedule, vendor no-show and
  customer no-show reporting with honest consequences.
- [ ] `M2-FE-423` Estimates readable **in full** — no paywall state anywhere in the A5 journey — each
  linked to its completed visit.
- [ ] `M2-FE-424` Visit money shown truthfully on both sides, server-calculated: Customer sees each
  slot's money paid to the visiting professional or refunded; Partner sees the visit payout in Money
  once the estimate is in, and that a visit without an estimate pays nothing.

### Comparison and selection

- [ ] `M2-FE-407` Each unlocked quote (A3) / delivered estimate (A5): verification summary, validity,
  scope, schedule, taxes, commission treatment, total, exclusions.
- [ ] `M2-FE-408` Accessible comparison view normalising equivalent fields on the single tax basis,
  while clearly showing non-equivalent assumptions.
- [ ] `M2-FE-409` Clarification and revision requests that cannot edit vendor prices or agreement fields.
- [ ] `M2-FE-410` Selection references a specific proposal; final scope/cost summary before confirmation.
- [ ] `M2-FE-411` Vendor reconfirmation shown as a **pending state, not a confirmed booking**.
- [ ] `M2-FE-412` Vendor decline or timeout guides to another quote, estimate or a free replacement
  (visit) — no lost history, no second charge.
- [ ] `M2-FE-413` One-tap re-validation when validity expires, reusing the existing unlock or plan.
- [ ] `M2-FE-414` Prevent double selection; recover from stale-proposal and concurrent-action errors.

### Engagement entry

- [ ] `M2-FE-415` A3: direct-payment responsibility and limited Vsolve protection shown before
  connection completes. Never presented as a protected booking.
- [ ] `M2-FE-416` A5: stages, funding schedule, commission/tax presentation, cancellation terms and
  protection shown before the first stage checkout.
- [ ] `M2-FE-417` Stage-payment pending, failed, retry and late success without creating a false
  confirmed engagement.
- [ ] `M2-FE-418` Durable agreement, receipt/invoice and timeline access for both parties.

**Evidence to record:** payment-pending and late-success traces, duplicate-unlock and duplicate-plan
prevention, the teaser field list proving no identity leaks pre-unlock (A3), the vendor-card field
list proving no identity leaks before slot confirmation (A5), the unfilled-share refund trace.

---

## Wave A2R — the A3 rate-card front door (revision 4)

**Depends on:** backend **C2R** publishing the rate-card contract (rate-card read, book-at-rate,
crew offers, booking-fee checkout/state) — nothing here can start before it exists. **Gate:** an A3
Customer sees the published rate and its inclusion list before booking, and the only charge is the
booking fee, taken against a held accepted crew offer and hardened only by the verified provider
callback.

Nothing in Wave A2 is reworked: the teaser/unlock surface above stays as built and becomes the
thin-supply fallback. The checkout below mirrors `book-visits-screen.tsx` — the same held-commitment
gating, the same pending-with-nothing-to-press, the same callback-only hardening.

- [~] `M2-FE-425` built — static gates green, owner manual verification pending. `/requests/book/
  [service]`, opened by the catalog's new **Book a crew** action, which is offered on
  `A3_TIME_BLOCK` alone and leaves **Get quotes instead** beside it. One screen, never the four —
  and the questions are **rendered from the variant's published list**, so a field Operations stops
  asking for stops appearing.
- [~] `M2-FE-426` built — static gates green, owner manual verification pending. The rate, the
  inclusion list, the overtime rate and the published add-ons are on screen **before** the book
  control exists; an unavailable preview renders the server's own reason and offers the quote flow
  with **no number anywhere**.
- [~] `M2-FE-427` built — static gates green, owner manual verification pending. The holding state
  shows the server's own wave, says nothing has been charged, offers nothing to press and re-reads
  itself; `FELL_BACK` renders the handoff **and** the Wave A2 unlock surface beneath it.
- [~] `M2-FE-428` built — static gates green, owner manual verification pending.
  `/requests/[id]/book-crew`, mirrored from `book-visits-screen.tsx`. **Gated on
  `checkout_available`, not on a fee status** — see the defect below. No branch is built for
  `m2_booking_fee_payment_pending`, which no path raises.
- [~] `M2-FE-429` built — static gates green, owner manual verification pending. Arrival, vendor
  no-show (`party` hard-coded to `VENDOR`), cancel with both money outcomes stated and neither
  predicted, and the forfeit split printed only once the server has settled it.

**Evidence to record:** the rate and inclusion list provably on screen before the book control; the
held-offer gating refusing a checkout with no accepted offer; the pending panel offering no control;
the fallback handoff charging nothing.

---

## Wave A3 — Customer fulfilment (A3 bookings and A5 projects)

**Depends on:** A2. **Watch:** Session B builds the partner half of the same spine this wave. Read
[07-state-machines-and-permissions.md](07-state-machines-and-permissions.md) as the authority for
state names and permitted actions — do not name a state from what your screen calls it.

### Workforce booking (A3)

- [~] `M2-FE-509` `My bookings`: schedule, agreed crew composition, permitted identity summary,
  contact rules, direct-payment reminder, next action. **Built** — `/bookings/workforce`.
- [~] `M2-FE-510` Confirm or dispute the day's attendance in **one tap**. Per-worker detail captured
  only inside the dispute flow. **Built at Wave A3F** — on the stage review, because the stage *is*
  the day. One control and no dialog on a full day; three one-tap choices on a shortfall because the
  server requires one. The not-built-yet block is gone. The generic Approve/Correct/Dispute controls
  now stand down while the attendance answer is open — see the wave section for why that is a
  correctness fix and not tidiness.
- [~] `M2-FE-511` Acknowledge crew changes, approve/reject time extensions, confirm completion or open
  an issue inside the documented window. **Built, minus crew-change acknowledgement (C4).**
- [~] `M2-FE-512` Partial service, replacement, refund, dispute and closure in one chronological timeline.
  **Built** — one feed, `GET /engagements/{id}/events/`, nothing synthesised.
- [~] `M2-FE-514` **Revision 4 — with C4's settlement model. Built at Wave A3F.** The Customer's half
  of the dual tap; Session B builds the supervisor's. Every figure is a published field formatted and
  never multiplied; a one-sided tap renders as *claimed and unanswered*, never as settled; no
  settlement row means no amount rather than ₹0. **The UPI link is read, never assembled — and the
  shift-day read currently answers `null` for it on every request** (plan §7), so the panel prefers
  the command response's link and the absent case never claims the professional has no UPI address.
- [~] `M2-FE-515` **Revision 4. Built at Wave A3F.** One button, one confirmation, and the send works
  with everything blank. Offered on the shift-day *and* on the booking as a whole, because a report
  needing a live shift-day is one nobody could file the next morning. It promises only what the
  server commits to — recorded, counted towards a pattern, and nothing at all happens to the vendor
  while the owner's threshold is unset.

### Project workspace (A5)

- [~] `M2-FE-608` `My projects`: overall progress, active stage, funded amount, next action, issue status.
  **Built** — `/projects`, and the workspace header on `/engagements/{id}`.
- [~] `M2-FE-609` Stage review: evidence viewer, approve, request clarification, dispute. **Built** —
  `/engagements/{id}/stages/{stageId}`. Evidence **cannot be opened**: no download route exists.
- [~] `M2-FE-610` Amendment comparison against the current agreement; explicit acceptance plus
  additional payment or refund handling. **Built.**
- [ ] `M2-FE-611` Deliverable acceptance, project completion, warranty issue reporting — with clear
  deadlines and the retention release date. **Wave III — needs C5.** Not-built-yet block on the
  completion panel.
- [ ] `M2-FE-612` Vendor-replacement path if a project is abandoned: what is funded, what transfers,
  what the price difference is. **Wave III — needs C5.** Not-built-yet block, shown only where it
  is a live question.
- [~] `M2-FE-613` Original and amended agreement versions preserved in a readable history. **Built** —
  money and change lines per version; the *scope* of a version is not published.

**Evidence to record:** the one-tap attendance path (count the taps), that clarification and evidence
upload can never read as approved scope or completed stage.

---

## Wave A4 — Operations: cases, refunds and leakage review

**Depends on:** A3 and Gate 3. **Folder:** `frontend/apps/admin/features/m2-cases/**` — yours alone.
~~Route files under `app/operations/**` belong to Session B; hand them your route needs at Gate 4.~~
**Superseded by the orchestrator's ruling of 2026-08-15**, logged in plan §7: both columns ran
concurrently, so a literal handoff would have left this wave unmounted and unbuildable at its own
gate. The subtree is split instead — Session A owns `app/operations/cases/**` and nothing else under
`app/operations/`; Session B owns every other path there. Disjoint, so the conflict the rule prevents
cannot happen.

- [x] `M2-FE-706` Case intake and review: cancellation conflict, no-show, attendance, safety incident,
  stage, quality, payment, off-platform claims.
- [x] `M2-FE-707` Reason, evidence and confirmation before high-impact actions; show the server's
  calculated remedy before authorized confirmation. *(The remedy is the one half Operations cannot
  read — §7.)*
- [x] `M2-FE-708` Refund and payout states from ledger-backed APIs: pending, failed, reversed, reconciled.
- [x] `M2-FE-709` Dual-confirmation cancellation after contact disclosure; disagreement routes to review.
  *(Operations half. The confirm-or-dispute itself is the parties' surface.)*
- [x] `M2-FE-710` Leakage, slot-squatting and price-band indicators as **review signals with evidence
  and history** — never an automatic guilt label. *(Two of the four have no published read; named as
  absences.)*
- [x] `M2-FE-711` Surface the Operations-touches-per-request measure so the design can be checked
  against the approved unit economics.

All six **built — static gates green, owner manual verification pending.** See the Wave A4 section in
the tracker below.

---

## Wave A5 — Customer-app quality (runs alongside Wave 5)

- [ ] `M2-FE-802` (customer share) WCAG 2.2 AA across the requirement form, uploader, timeline, quote
  comparison and payment state announcements.
- [ ] `M2-FE-803` (customer share) Small mobile, large mobile, tablet, desktop.
- [ ] `M2-FE-804` (customer share) Slow network, offline transition, timeout, duplicate click, refresh
  and back navigation for every financial or state-changing flow.
- [ ] `M2-FE-807` (customer journeys) A3 and A5 happy paths, teaser→unlock, unlock payment pending,
  plan chooser→visit-plan checkout, visit no-show and unfilled-share refund, on-site estimate→selection,
  non-responsive rejection, cancellation conflict, refund.
- [ ] `M2-FE-808` (customer share) Long content, empty and exception state coverage.

Per the standing preference: no routine full-matrix Playwright runs. Focused specs plus typecheck and
lint during the waves; the browser suite runs once at the wave gate.

---

## Session A tracker

| Wave | Scope | Built `[~]` | Integrated `[x]` | Evidence |
|---|---|---|---|---|
| A1 | `FE-201..215` | `[~]` 15 of 15 | `[ ]` | Four screens, duplicate notice, the four optional panels, `My requests`, the timeline, the honest closure states and `FE-211`. **Wired and reachable** — 4 routes, queries against the generated client, guard retired. Owner verification pending; see the 2026-08-12 wiring section. |
| A2 | `FE-216`, `FE-401..424` (revision 3: A3 unlock + A5 visits) | `[~]` 17 of 17 | `[ ]` | Both money doors, the visit tracker, full estimates, comparison, selection and the engagement. **Wired and reachable** — 3 new routes, 3 new features, 2 new query modules. Owner verification pending; see the 2026-08-13 section and `apps/customer/features/access/SMOKE.md`. **Revision 4 (ADR-0009) demotes the A3 teasers/unlock half to the thin-supply fallback — kept as built.** Wave J (2026-08-14) closes `FE-418`'s receipt from `Engagement.access_receipt` and moves `FE-421`'s slot times onto `SiteVisit.timezone`. `FE-419` and `FE-409` are now publishable and unstarted. |
| A2R | `FE-425..429` (revision 4: rate-card front door) | `[~]` 5 of 5 | `[ ]` | The preset, the published rate before booking, the cascade holding state and its fallback handoff, the booking-fee checkout and the forfeit/refund surfaces. **Wired and reachable** — 2 new routes, 1 new feature, the rate-card half of `m2-quotes.ts`. Built against 1.29.0. Owner verification pending; see the 2026-08-14 A2R section and `apps/customer/features/crew/SMOKE.md`. The Wave A2 unlock surface is untouched and is now the thin-supply fallback the `FELL_BACK` handoff routes to. |
| A3 + A3F + A5P | `FE-509..512`, `FE-514..515`, `FE-608..613` | `[~]` 12 of 12 | `[ ]` | **Wave J (2026-08-14) consumed `EngagementStage.kind`** across the list, the workspace and the stage review, and re-pointed the event and amendment reads onto the factory's own keys and tiers — see the Wave J section. The shared spine's Customer half: two lists, the stage review, amendments, the agreement history, the event record and completion. **Wired and reachable** — 3 new routes, plus the header links that were missing for three waves. Owner verification pending; see the 2026-08-13 Wave A3 section and `apps/customer/features/engagement/SMOKE.md`. **Wave A3F (2026-08-14) closes `FE-510` and adds revision 4's `FE-514`/`FE-515`** — the Customer's side of the A3 shift-day at 1.30.0: one-tap attendance with the three shortfall choices, the evening dual tap with the server's own UPI deep link and the per-worker-day figure, and the one-tap cash-demand report. `FE-510`'s not-built-yet block is gone, and the generic stage controls now stand down while the attendance answer is open, because `approve_stage` would close the day with no settlement. See the Wave A3F section and `apps/customer/features/shift-day/SMOKE.md`. **Wave A5P (2026-08-14) closes `FE-611` and `FE-612`** — the Customer's side of the A5 project at 1.31.0: deliverable acceptance with the refusal that keeps delivery on the platform, completion that names its three blockers instead of offering a control that refuses, warranty retention stated as payout-side money accruing cumulatively (never "held from the last stage"), and the vendor-replacement decision — Operations proposes, the Customer accepts, priced per milestone, **no checkout**. `not-built-yet.tsx` is deleted from this app with no reference surviving. See the Wave A5P section and `apps/customer/features/project/SMOKE.md`. |
| A4 | `FE-706..711` | `[ ]` | `[ ]` | |
| A5 | quality share | `[ ]` | `[ ]` | |

### Wave A1 progress — 2026-08-10

**Built (model and type layers, no screens yet).** `features/requirement/` follows the existing
`features/booking/` layering exactly — `contract-pending/` → `model/` → `adapters/` → `view/` — rather
than inventing a second convention for the same problem:

- `contract-pending/README.md` + `types.ts` — the proposal-0012 requirement surface as wire-shaped
  types: draft, attachment + scan status, duplicate, submitted, summary, timeline. Quarantined; the
  view layer may never import them.
- `model/screens.ts` — the four-screen sequence as a closed constant with `SCREEN_BUDGET = 4`, so a
  fifth screen has to be an argument somebody makes rather than a file somebody adds. `OPTIONAL_DETAILS`
  models the four `FLOW-02` extras as data reachable from review, never as steps.
- `model/state.ts` — the draft reducer state and every guard: required answers (server-owned, never
  recomputed), address, `service_by` in the future, in-flight and failed attachments, unresolved
  duplicate, and the re-asserted submit guard on review. Back navigation to any visited screen is
  lossless; forward jumps are refused.
- The app-wide boundary guard in `features/booking/contract-pending/boundary.test.ts` now registers
  `/api/v1/requirements/`, `/api/v1/partner/workspaces/` and `/api/v1/proposals/` as unpublished, so a
  request to any of them fails the build today. **7/7 boundary tests pass.**

**Built (screens).** `model/machine.ts`, `adapters/index.ts` and the `view/` layer:

- `machine.ts` — the reducer. Its load-bearing rule is the invalidation cascade: **changing an answer
  clears the verdict it produced.** The server's lifecycle sentence and its `missingRequiredAnswers`
  are both derived from the exact answer set that was sent, and `missingRequiredAnswers` is what the
  "Next" guard reads — so keeping it across an edit would gate the Customer on a question set that may
  no longer apply. Same discipline as the M1 booking machine.
- `requirement-context.tsx` — one reducer for all four screens, so back is a *screen change* rather
  than a navigation and nothing is lost or refetched. Save-and-resume through `sessionStorage`, Customer
  intent only: no verdict (a stale server reading), no requirement id (a restored tab could patch a
  draft submitted elsewhere), no attachment (a dead `File` handle). `FE-209`.
- `what-screen.tsx` — `FE-201`, `FE-202`. Questions come from the server; the archetype is never
  rendered, only the server's plain-language sentence, in a polite live region.
- `where-when-screen.tsx` — `FE-203`. The `service_by` consequence is written into the field's own
  description, because a Customer who reads it as a preference will have their request closed on that
  date. Flexibility is a separate control so it cannot extend the expiry.
- `details-screen.tsx` — `FE-204`, `FE-205`, `FE-208`. Voice leads the screen as an equal option.
- `review-screen.tsx` — `FE-206`, `FE-212`. Review *is* the confirmation; the workspace deliberately
  renders no "Next" on the final screen so a second confirm cannot appear beside it. `isFree` is read
  from the server, and until it can answer the screen says nothing about price at all.
- `duplicate-notice.tsx` — `FE-210`. Offers a merge, does not block; the override is explicit.
- `requirement-workspace.tsx` — Stepper, back, and one forward control. The button is disabled **and**
  the block reason is stated; a disabled control with no explanation is how a form dead-ends someone.

**Verified:** `pnpm lint` clean at `--max-warnings 0`; `pnpm typecheck` green across all 9 packages;
**11/11 boundary tests pass** (4 new + 7 existing). The new suite includes a `SCREENS.length === 4`
assertion, so the flow-weight budget is enforced by the build rather than by a Markdown table.

**Not built yet:**

- `FE-211` — material-edit-after-acceptance confirmation. Needs the requirement's server state to know
  whether a vendor has accepted. **Unblocked as of contract 1.21.0** — see the note below.
- **No route is mounted.** `app/(flow)/requirements/` does not exist. The feature is complete enough to
  mount, and the contract has now landed; mounting is the first integration step, not a build one.

**Standing:** no query is mounted and no fixture exists in application code. Nothing here exceeds
`[~] built`, per the execution plan §2.

### Wave A1 progress — 2026-08-11 · `FE-207` and `FE-213..215`

`pnpm lint` clean at `--max-warnings 0`; `pnpm --filter customer typecheck` green; **592/592 customer
tests pass**, of which 87 are in `features/requirement/` (44 new this pass). Still `[~] built`: no
query is mounted and every fixture lives in a `.test` file.

**`FE-207` — the four optional extras now have forms behind them.** The entry points existed; the
panels did not, and an entry point to an empty room is not an option a Customer has.

- `model/optional-details.ts` — the value shapes, defaults, normalisers and one validation rule.
  Every read is normalised because the bag round-trips through `sessionStorage`, so what comes back is
  whatever was in storage; an unnormalised cast puts `undefined` into a control's `value` and turns it
  uncontrolled on the first keystroke. Falls back **field by field**, so one bad key does not lose a
  page of typed access notes.
- `isOptionalDetailSet` is stricter than "the key exists". Three of the four panels open on a default,
  and reporting that default back on the review row would be the screen telling the Customer they
  asked for a call they never asked for.
- **One validation rule, and it earns its place.** "Entry is restricted to certain hours" without
  *which* hours is worse than silence: a vendor prices a constraint they cannot plan around, then
  arrives outside it. It is the only optional field that can block submit, and only for someone who
  opened the panel — leaving all four alone can never reach it.
- `view/block-copy.ts` is new because review has no "Next" for the workspace to explain, so the
  disabled-*and*-explained pairing had to be repeated on the submit control. Review was the one screen
  where a Customer could dead-end with nothing to read.
- Optional details now persist through save-and-resume (`RESTORE_INTENT`, `PersistedIntent`), with the
  key optional on the way *in* so a draft written by an older build still restores.

**`FE-213..215` — tracking.** Presentational, taking what a query would give them, so integration is a
call site rather than a rewrite:

- `model/request-state.ts` — `MATCHING_DELAYED`, the only derived state and the reason the module
  exists. When the quote-delivery deadline passes and the requirement is still `MATCHING`, "Finding
  professionals" is the fabricated progress `FE-215` forbids, and "SLA breached" asserts a server
  transition with a refund attached that nobody authorised. The third thing is the honest one.
- `model/timeline.ts` — the event kinds this build has copy for, re-declared so the server's list can
  grow without this one changing.
- `adapters/` — `toRequestRow` now carries the status as a **code**; the old version mapped it to a
  sentence, which put customer copy in the adapter and flattened away the status-plus-deadline pair
  `FE-215` turns on. `toTimelineEvents` sorts oldest-first rather than trusting wire order.
- **`DETAIL_ALLOWLIST` is the privacy rule, enforced rather than trusted.** `MATCHING_WAVE_SENT`
  permits exactly one key and it is a count. The serializer is supposed to withhold identities too;
  the allowlist is what happens when it stops. An unrecognised event type carries **no** detail at all.
- `view/request-state.tsx` — one copy table read by the list row and the detail, so a Customer never
  sees two explanations of one request. Five closures read differently on purpose.
- `view/requests-list.tsx`, `view/request-timeline.tsx`, `view/request-detail.tsx` — loading, empty,
  offline/retry, forbidden and server-error all arrive through `categorizeError` + `describeError`.
  Forbidden fails closed. A failed read with rows already on screen keeps them and says they are stale.
  On the detail the header and the timeline fail **separately**, so a timeline that will not load
  cannot hide that the request closed and a refund is owed.

**Evidence recorded:** four-screen budget still asserted by the build (`SCREENS.length === 4`, plus a
component test that the four panels add no screen); the delayed-match state proved to claim neither a
breach nor a refund; the allowlist proved to drop `vendor_names`, `vendor_ids` and `vendor_phone` from
a `MATCHING_WAVE_SENT` event; unknown event types proved to render as a dated row with empty detail.

### The contract published mid-wave — 2026-08-11

Verified independently, not taken from the log: `contracts/openapi/v1.yaml` is at **1.21.0** and
publishes `/api/v1/requirements/` (list, create, read, patch), `/submit/`, `/duplicate-check/`,
`/timeline/`, `/quotes/teasers/`, `/questions/{id}/answer/`, plus `/partner/workspaces/` and the
proposal paths. `packages/api-client/src/generated/schema.d.ts` is in sync.

Everything above was built against proposal 0012 and that was still the right call — the seam holds,
and integration is the re-point §2 describes. What changes now:

- `FE-211` is **no longer blocked**. The requirement's server state is readable.
- `apps/customer/features/booking/contract-pending/boundary.test.ts` lines 71–73 are stale. They are
  deliberately left in place until the route is mounted: removing the guard first would lower the bar
  without raising anything.
- Three field shapes differ from `contract-pending/types.ts` (`flexibility_days`, `IMAGE` for `PHOTO`,
  `VERIFIED` for `CLEAN` with no `INFECTED` yet). All adapter one-liners.
- Attachment upload is **not** published (deferred to Wave C1), so `FE-204`'s uploader integrates
  later than the rest of the flow.

### Blocked / handed off

| Date | Task | Blocked on | Logged in plan §7 |
|---|---|---|---|
| 2026-08-10 | `FE-201..206` | Resolved — screens built. | n/a |
| 2026-08-11 | `FE-207` | Nothing. Built against client-owned shapes; no wire field exists for the four extras. | yes — contract gap |
| 2026-08-11 | `FE-211` | Unblocked by contract 1.21.0. Not started. | n/a |
| 2026-08-11 | `FE-204` uploader | `POST /requirements/{id}/attachments/` deferred to Wave C1. Built; integrates later than the rest. | n/a |

### Audit note — 2026-08-12

Re-checked against the codebase. Nothing above is overstated; the caveat is that **none of it is
reachable**. `features/requirement/` contains 17 source files and zero `useQuery`;
`grep -rn "useQuery" features/requirement/` returns nothing outside tests, `app/(flow)/requirements/`
does not exist, and the boundary guard still lists all three published paths.

Session B faced the same situation on 11 August and closed it in one pass — endpoint wired, guard
entry retired under its own rule, routes mounted. **This column's next task is the same move, and it
is blocked on nothing:**

1. Drop `/api/v1/requirements/` and `/api/v1/proposals/` from `UNPUBLISHED_PATHS` in
   `features/booking/contract-pending/boundary.test.ts`. Leave `/api/v1/checkout-sessions/`, and drop
   `/api/v1/partner/workspaces/` too — the Customer app has no business calling it either way, but
   the entry is now factually wrong and a wrong guard teaches people to ignore guards.
2. Add `features/requirement/queries.ts` against the generated client, following
   `apps/partner/features/workspace/queries.ts` — in particular its `null`-not-`[]` rule for an
   unread answer, and its decision not to retry a 401/403.
3. Mount `app/(flow)/requirements/` and `app/(flow)/requests/`, `force-dynamic` and
   `robots: noindex`, as Session B did for its seven.
4. Apply the three adapter one-liners (`flexibility_days`, `IMAGE`, `VERIFIED`) at the seam.
5. `FE-211` — now readable from server state, still not started.

Until step 3 lands, Wave A2 should not be started: `FE-401..418` has no domain layer on the server
(Wave C2), so starting it would add more dark code to a column that already has a flow's worth.

> **Closed 2026-08-12.** All five steps done. The audit note is left in place because it is the
> record of how a whole wave came to be finished and invisible, and the answer — mount it before
> building the fifteenth thing — is the part worth keeping.

### Wave A1 wiring — 2026-08-12 · the flow is reachable

`pnpm lint` clean at `--max-warnings 0`; `pnpm typecheck` **9 of 9 green** at contract 1.21.0;
`pnpm build --filter=customer` green with **four new dynamic routes**. **No tests were run** — per
[task.md](task.md) §"Verification convention" they are written and the owner runs them. The files
and the command are in the report and in that file's owner-verification queue.

**Four routes, and the flow is no longer dark.**

| Route | What it is | Rendering |
|---|---|---|
| `/requests` | `My requests` — `FE-213`, `FE-215` | `force-dynamic`, `robots: noindex`, `loading.tsx` + `error.tsx` |
| `/requests/[requirementId]` | The request, its timeline and `FE-211` | `force-dynamic`, `robots: noindex` |
| `/requests/new` | Category-first entry — `FE-201`, `?category=` as its second state | `force-dynamic`, `robots: noindex` |
| `/requests/new/[service]` | The four screens — `FE-202..212` | `force-dynamic`, `robots: noindex` |

`app/(flow)/requests/layout.tsx` gates the whole tree with `CustomerShell`, including `/requests/new`
— unlike `/cart`, deliberately. The anonymous cart is a product decision; a requirement is filed
against a Customer and goes out to named professionals, and `POST /requirements/` is
`IsAuthenticated`. Letting somebody fill in four screens and discover that at the end is worse than
asking first.

**The guard was retired under its own rule.** `features/booking/contract-pending/boundary.test.ts`
lost all three M2 entries. `/api/v1/requirements/` and `/api/v1/proposals/` are published and the
first is now reached through the generated client, which is exactly the condition the file's own note
sets for deleting an entry; `/api/v1/partner/workspaces/` was never this app's to call and had
stopped being a rule. Attachment upload is genuinely still absent and is deliberately **not** listed
in its place — the raw-fetch rule and the generated client's own types already cover it, and a bare
`/attachments/` entry would fail the build on any comment that named the path, which is how a guard
starts being worked around.

**`contract-pending/` is gone, and its rule is not.** The README's own deletion instructions ended
with "delete this directory", and the adapters no longer import it. What replaced it is
`features/requirement/boundary.test.ts`: `view/` and `model/` may not name the generated client,
through either `@vsolve/api-client` or the aliases `@vsolve/query` now re-exports. That was always
the real rule — the quarantine was about the wire shape reaching a component, not about the endpoint
being unpublished — and it is easier to break now that the types are two imports away in every file
rather than behind a directory named after a warning. The `SCREENS.length === 4` assertion moved
across unchanged.

**The seam held.** Not one component under `view/` changed to make the queries work, except where a
*contract fact* forced it (below). `requirement-flow.tsx` is the whole integration and it holds no
copy, no layout and no validation rule — only when to write and what to do with the answer. Four
writes for four screens, each on the way forward and each *before* the screen changes, so a failed
save leaves the Customer looking at the field it was about.

**Three field shapes re-pointed, as the handover said, plus two it did not mention.**

| Was | Is | Where |
|---|---|---|
| `is_date_flexible: boolean` | `flexibility_days: number` | Read via the server's own derived boolean; written through `flexibilityDaysFor` |
| `PHOTO` | `IMAGE` | The model's union renamed — those values are *bound for* the wire enum |
| `CLEAN` / `INFECTED` | `VERIFIED`, and no `INFECTED` | `toServerAttachmentItems`; anything unrecognised fails **closed** |
| — | `answers` and `detail` arrive as `unknown` | Narrowed in the adapter; a non-object reads as empty rather than reaching the reducer |
| — | `size_bytes`, and **no `file_name` at all** | A stored attachment is named by what it is. Inventing `document-3.pdf` would be worse than "Document" |

`FLEXIBLE_WINDOW_DAYS = 3` is the one value in this feature that is neither the Customer's nor the
server's: the wire wants an integer and screen 2 asks a yes/no question, deliberately, because "how
many days" is not answerable about an unscoped job. Three is what "a few days" means in the copy the
Customer reads, and it is named in the adapter so that if either the copy or the contract changes,
the other is visible in the same file.

**One field was missing from a screen, and it would have been invisible until a real submit.**
`_assert_submittable` refuses a requirement with no `requested_start` ("when it should start") and
`find_probable_duplicate` matches within ±3 days of it — so `GAP-004` could not work either.
`M2-FE-203` always said "dates", plural; the built screen had one of them. Screen 2 now asks for a
start **day**, encoded to the start of the Customer's local day at the seam, with a guard for a
needed-by date that precedes it. Four new `BlockReason` codes, one shared `blockedDates` helper read
by both the screen-2 guard and the submit guard on review.

**`FE-211` — built, and half of it is deliberately unmounted.** `update_draft` raises
`RequirementLockedError` for anything that is not `DRAFT` and no route amends a submitted
requirement, so the *action* does not exist. `view/material-edit-notice.tsx` states the consequence
before anything is offered — everyone who was asked is told, and their reply deadline restarts — and
separates a material edit from a correction so the warning stays credible. `onConfirmEdit` is the
seam and the request detail does not supply it, so a vendor-visible request shows the explanation and
the route to support rather than collecting a confirmation that would reach a 409. A confirmation
wired to a command that refuses is worse than none: it teaches a Customer that confirming does
nothing. When the amend command publishes, the route passes one prop.

**Two things the flow cannot do, said out loud rather than faked.**

- **Attachments and the voice note.** `onAttachFiles` is now nullable like `onRecordVoice`, and both
  are null. Screen 3 says attaching is not available yet and points at the text field that works. A
  greyed-out "Add files" would leave the Customer guessing whether it was them or us; a control that
  opens a picker and drops the file would be worse.
- **The merge.** No merge endpoint exists in 1.21.0 or in 0012, though `merge_duplicate_requirement`
  is in the invalidation table. The duplicate notice links to the request that already exists — which
  is where the Customer would go to decide anyway — instead of a button labelled "Add to this one"
  over an action nothing performs. They would otherwise believe the two were joined and stop watching
  one of them.

**`M2-FE-212` lands one moment later than the task wants, and the reason is on the screen.**
`is_free` exists only on the submit *response*, so before the Customer presses Send the server has
not said it. Review therefore says nothing about price — its documented honest state — and
`view/requirement-sent.tsx` makes the promise from the server's own field. That panel is not a fifth
screen: `SCREENS` is four and the budget is on the form, and this is the outcome of a command. It
also refuses to invent a delivery window when the server carries no deadline, which is a real answer
— an area with no open hours carries no promise.

**The list read does not match its own schema, and that is absorbed in one named function.**
`m2_requirement_list` declares `RequirementSummary[]`; `RequirementCollectionView.get` returns a
cursor envelope. Found from the view, and Session B logged the identical defect on the enquiry list
the same day from the opposite end — two columns, one bug, no type check on either side.
`readRequirementList` accepts both shapes; its envelope branch is marked for deletion when the schema
is corrected. It is the one place in this wave where a server defect is compensated in the client,
and it was taken because the alternative was mounting `My requests` in a state that provably cannot
work.

**Eleven rows added to the execution plan §7.** The two worth reading first: **no merge endpoint**,
and **the two question schemas** — screen 1 renders `catalog.ServiceQuestion` (the same source the A1
booking workspace uses) while `submit_requirement` validates against `M2VariantConfiguration.
question_schema`, which nothing publishes. Their kind vocabularies differ, `validate_scope` refuses
an unknown code, and a mismatch is invisible until the Customer presses Send on screen 4. The same
split exists in A1, so it is a pre-existing convention rather than a new defect — it is materially
worse here because this flow is four screens long. `MULTIPLE_CHOICE` cannot be answered at all under
that validator, so `toQuestionSet` reports it and screen 1 says the service is not fully set up
rather than rendering a dead end.

**Tests written, not run.** `packages/query/src/m2-requirement.test.ts`,
`features/requirement/queries.test.tsx`, `features/requirement/model/state.test.ts`,
`features/requirement/adapters/draft.test.ts`, `features/requirement/adapters/tracking.test.ts`
(rewritten), `features/requirement/boundary.test.ts` (replaces the quarantine's),
`features/requirement/view/material-edit-notice.test.tsx`,
`view/duplicate-notice.test.tsx`, `view/requirement-sent.test.tsx`, and
`e2e/m2-customer-requirement.e2e.ts` with `e2e/support/requirement-api.ts`.

The e2e spec covers `/requests` and `/requests/{id}` and **not the four-screen flow**: its catalog
reads happen during a server render, where `page.route` cannot reach. Faking them would need a second
stand-in that proves nothing about either half. That belongs in `django.e2e.ts` against a real
backend and is an open gap, stated in the spec's own header rather than left as a silent absence.

### Wave A2 progress — 2026-08-13 · both money doors, built against 1.24.0

`pnpm lint --max-warnings 0` clean; `pnpm typecheck --filter=customer --filter=@vsolve/query` green
(re-run with `--force`, and `tsc --listFiles` checked, to confirm the eighteen new files are actually
in the programme rather than passing on a stale cache); `pnpm build --filter=customer` green with
**three new dynamic routes**. **No tests were run and none were written** — the build-first
amendment. What replaces them is `apps/customer/features/access/SMOKE.md`: the exact clicks that
prove the A3 unlock and the A5 visit plan end to end, including the one step that cannot happen in a
browser.

**Three routes.**

| Route | What it is | Rendering |
|---|---|---|
| `/requests/[requirementId]/quotes` | Full quotes and estimates, comparison, rejection, re-validation, selection — `FE-407..414`, `FE-423` | `force-dynamic`, `robots: noindex` |
| `/requests/[requirementId]/book-visits` | The A5 visit-plan checkout — `FE-420` | `force-dynamic`, `robots: noindex` |
| `/engagements/[engagementId]` | The agreement and stage funding — `FE-415..418` | `force-dynamic`, `robots: noindex`, own `CustomerShell` layout |

The first two sit inside the existing `app/(flow)/requests/layout.tsx` gate. `/engagements` gets its
own layout rather than living under `/requests`, because an engagement **outlives the request that
produced it and is addressed by its own id** — somebody reaches it from a notification months later
with no requirement id in hand. The requirement is on the record, so the route passes
`requestHrefFor` and the screen applies it once the engagement has loaded.

`FE-216` mounts no route at all, deliberately: it is a control **inside** the review screen, and
`SCREENS.length === 4` still passes.

#### The rule the whole wave is built on, and the thing that made it the only option

**Only a verified provider callback grants anything.** `unlockPhase` and `visitPlanPhase` in
`packages/query/src/m2-quotes.ts` derive from the `unlock` / `plan` object on the state read and from
nothing else. There is no redirect handler, no success route, and no place where an `AccessCheckout`
response is read as a purchase — the checkout responses are used for exactly what they are, proof
that an attempt exists.

That turned out to be the *only* available design, not merely the correct one. **A Customer cannot
read an M2 payment attempt at all**: `GET /api/v1/payment-attempts/{id}/` resolves ownership through
`checkout__customer`, and every M2 access charge is created by
`commerce.services.initiate_standalone_payment_attempt` with `checkout=None`. The read answers `404`,
`reconcile` answers `404`, and `simulate_capture` raises `PermissionError` and answers `403`. So the
M1 payment feature — `paymentPhase`, `usePaymentAttempt`, the simulated-capture control — is unusable
here and none of it is imported. The state read polls instead, `boundedPoll` stops the moment the
server has an answer, and §5 of the smoke script drives capture from the Django shell because there
is no other way to complete a charge in dev. Logged in the execution plan §7.

The pending panels therefore **offer nothing to press**. Every control that could exist on a pending
charge is a way to pay twice. The retry appears only on a server-confirmed `FAILED`, where it first
clears the stored idempotency key so the press is a genuinely new command rather than a replay of the
persisted `201` describing the attempt that already failed — the same move the attachment uploader
makes on a spent upload intent.

#### The prices are not in the code, and that is the feature

`price_paise` is nullable and `available_tiers` can be empty, because the unlock price and the visit
tiers are blocking owner decision 1 and `apps.requirements.pricing` fails closed. **Neither 149 nor
49/99/199 appears anywhere in this wave.** A null price renders "we cannot offer this yet"; an empty
tier list renders the same for visits.

`m2_access_price_unavailable` and `m2_policy_unavailable` are the command-side twins, and both are
`409`s that arrive on a **well-formed** request. Both are missing from the frozen `errors.ts`, so
`describeError` offers "Choose another option" — the one piece of advice that is wrong here, because
there is no other option and nothing the Customer presses changes the answer.
`features/access/view/access-refusal.tsx` is the single component every refusal in this wave routes
through; it names those two codes explicitly and renders them with **no action at all**. Requested in
§7 — when they land in the table, that component's first two branches collapse.

#### Four seams worth recording

**The visit tracker is driven by shares, not visits.** The shares are the slots the Customer chose and
paid for; an unfilled one is exactly the row `FE-421` calls "awaiting" and exactly the row whose
refund they most need to see. Driving it from `visits` would make that row vanish. Shares and visits
are joined **by position**, because the server publishes no key between them and position is what the
plan's own `price / size` arithmetic is defined on.

**`held` is not a status.** A visit reads `REQUESTED` both while a plan is unpaid and immediately
after it is charged, and only the plan can tell the two apart — so `visitSlotState(visit,
planIsCharged)` takes the plan as a parameter. Rendering a held slot as scheduled would promise a
vendor a job nobody has bought, and promise the Customer a visit that lapses harmlessly if they never
pay.

**The no-show party is hard-coded.** You report the other party's absence, never your own, and the
server answers `403` to the reverse. `useReportVendorNoShow` sends `VENDOR` at the one call site that
could set it, so there is no party control anywhere in this app to get wrong.

**Slot times use the checkout picker's own formatter.** `formatVisitSlot` reproduces
`features/booking/adapters/windows.ts` — `en-IN`, weekday/day/month, lowercased 12-hour, booking
timezone — because an A5 visit is booked against the *same* `carts.availability` grid as an A1 visit,
and two formatters over one grid is how one reservation reads two ways on two screens.

#### One Wave A1 defect, found by reading the enum

**`VISITS_BOOKED` was missing from the client's status union, and it silently deleted requests.**
`RequirementStatusEnum` has carried it since 1.21.0, and revision 3 made it the state most A5 requests
sit in. `toRequestRow` drops a row whose status it cannot name — by design, and correctly — so an A5
Customer whose first professional had confirmed a visit watched their request **disappear from `My
requests`** until an estimate landed. Nothing errored; a filter did its job. Fixed in
`model/request-state.ts`, `adapters/index.ts` and the copy table, where it now reads "A visit is
booked" and deliberately not "Quotes ready": the Customer has bought a visit, not a price.

#### What could not be built, and was not faked

- **`FE-419` vendor cards.** `VendorCardSerializer` exists in the backend with exactly the right
  disclosure shape and is published on **no path**; `SiteVisit` carries no partner either, and no
  rating or distance band exists anywhere on the wire. So no card list exists. The tracker names a
  professional only where a delivered estimate carries one (`CustomerProposal.vendor` joined on
  `site_visit.id`), every other slot says the name is given before they arrive, and the panel states
  the disclosure rule so a Customer reads it as policy rather than as a fault.
- **Reschedule (`FE-422`).** `POST /site-visits/{id}/schedule/` exists, and nothing published lets a
  *Customer* see candidate starts for a specific vendor — `visit-slots/` is Partner-scoped. A picker
  over times we cannot confirm would be worse than none.
- **A receipt (`FE-418`).** `Engagement` publishes no order id and no tax-document id.
- **Cancellation terms (`FE-416`).** No field carries them, and quoting them from the proposal the
  engagement froze would be this client authoring the agreement.
- **Customer-initiated clarification (`FE-409`).** Clarification runs one way at 1.24.0. The invariant
  the task exists for — no control edits a vendor price or an agreement field — holds absolutely.

#### Keys and freshness, without touching the frozen file

`m2-keys.ts` predates revision 3 and has no visit-plan or selection key.
`packages/query/src/m2-quotes.ts › m2AccessKeys` composes them **from** the frozen factory, nested
under `m2QueryKeys.requirements.detail(id)` — the same construction `requirements.timeline` uses — so
`M2_INVALIDATION`'s existing `requirementScope` clears them by prefix without a single row being
edited in the file nobody may edit. The plan read borrows `M2_FRESHNESS.unlock`, which is the tier
that module argues for. Promotion requested in §7.

#### Files

- `packages/query/src/m2-quotes.ts`, `packages/query/src/m2-engagement-customer.ts`, and the
  append-only block in `packages/query/src/index.ts`.
- `apps/customer/features/access/**` — `queries.ts`, `adapters/index.ts`, `view/{access-refusal,
  unlock-panel,visit-plan-chooser,visit-tracker,book-visits-screen,request-access-panel}.tsx`,
  `SMOKE.md`.
- `apps/customer/features/quotes/**` — `queries.ts`, `adapters/index.ts`, `view/{quote-card,
  quote-comparison,reject-quote-dialog,selection-status,quotes-screen}.tsx`.
- `apps/customer/features/engagement/**` — `queries.ts`, `adapters/index.ts`,
  `view/engagement-screen.tsx`.
- Touched in `features/requirement/`: `model/request-state.ts`, `adapters/index.ts`,
  `view/{request-state,request-detail-screen,review-screen,requirement-flow}.tsx`.
- Routes: `app/(flow)/requests/[requirementId]/{quotes,book-visits}/page.tsx`,
  `app/(flow)/engagements/{layout.tsx,[engagementId]/page.tsx}`.

**Ten rows added to the execution plan §7.** The two to read first: **no M2 payment attempt is
readable or capturable by its own Customer**, which makes every money path uncompletable from a
browser in any environment; and **`VendorCardSerializer` exists with no route**, which leaves `FE-419`
one view away from finishable.

### Blocked / handed off — Wave A2

| Date | Task | Blocked on | Logged in plan §7 |
|---|---|---|---|
| 2026-08-13 | `FE-403`, `FE-404`, `FE-420`, `FE-417` | Not blocked for building. Blocked for *demonstrating*: no M2 payment attempt is readable or capturable by its Customer, so the smoke script captures from the Django shell. | yes |
| 2026-08-13 | `FE-419` | `VendorCardSerializer` is published on no path; `SiteVisit` carries no partner. Built to the disclosure the wire allows. | yes |
| 2026-08-13 | `FE-409` | No Customer-asks-a-question endpoint exists. Built as re-validation plus an honest statement. | yes |
| 2026-08-13 | `FE-418` receipt | `Engagement` carries no order or tax-document id. | yes |
| 2026-08-13 | `FE-422` reschedule | No Customer-scoped candidate-slot read. | yes |

### Wave A3 progress — 2026-08-13 · the shared spine, Customer half, at 1.25.0

`pnpm lint --max-warnings 0` clean; `pnpm typecheck --filter=customer --filter=@vsolve/query` green
(re-run with `--force`, and `tsc --listFiles` checked, to confirm the twelve new files are in the
programme rather than passing on a stale cache — the same false green Wave A2 caught); `pnpm build
--filter=customer` green with **three new dynamic routes**. **No tests were run and none were
written** — the build-first amendment. What replaces them is
`apps/customer/features/engagement/SMOKE.md`: the exact clicks that prove the stage spine, including
the two negative checks that matter more than the happy path.

**Three routes.**

| Route | What it is | Rendering |
|---|---|---|
| `/bookings/workforce` | `My bookings` for A3 — `FE-509` | `force-dynamic`, `robots: noindex`, inside the existing `/bookings` `CustomerShell` gate |
| `/projects` | `My projects` for A5 — `FE-608` | `force-dynamic`, `robots: noindex`, own `CustomerShell` layout + `loading.tsx` + `error.tsx` |
| `/engagements/[engagementId]/stages/[stageId]` | Stage review — `FE-609` | `force-dynamic`, `robots: noindex` |

#### Two nouns for the lists, one route for the detail

The information architecture files A3 under a booking noun and A5 under `/projects`, and its reason
is the only one that matters here: **one set of words cannot cover two different promises about who
holds the money.** That reason bites at the list, where a Customer decides what kind of thing they
are looking at — so there are two list screens with two headings, two empty states and two money
columns, fed by one `GET /engagements/` and split on `commercial_mode`.

It does **not** bite at the detail, because `/engagements/{id}` already branches every promise it
makes on that same field, and because the noun a reader sees is the `<h1>` rather than the URL. So
Wave A2's route stays the one engagement workspace and this wave extended it. Two detail routes for
one aggregate would have been two screens each claiming to be the record.

The IA's own `/bookings/[engagementId]` **cannot be built**: `/bookings/[groupId]` has been the M1
Booking Group detail since Milestone 1 and Next.js refuses two slug names at one path level. A static
`/bookings/workforce` segment beside it is legal and reads correctly. Logged in §7 as an IA
correction, since that document is Session C's.

#### The rules the screens are built on, and where each one shows

**Approval releases money, so the screen says what each button does before it is pressed.** Not a
warning — a sentence per control, derived from `commercial_mode` and repeated in the confirmation.
The same `POST .../approve/` writes the vendor's earning *held* on A5 and moves nothing at all on A3,
where nothing was ever collected and the Customer still owes the professional directly. Two
sentences, one command, and an unknown mode says nothing about money at all rather than picking the
friendlier reading.

**A correction is not an amendment**, and the panel says so in the same breath as offering it: it
asks for the *agreed* work to be done properly, moves no money, and anybody wanting something
different is pointed at a change order the professional has to agree to. Without that sentence a
correction becomes the cheap amendment, and `m2_amendment_required` becomes a refusal nobody
understands.

**A dispute stops only the disputed allocation.** Every screen that mentions it says the rest of the
job carries on and anything already paid out stays paid out. Nothing renders a disputed stage as a
frozen engagement.

**Review timeouts auto-approve, so the deadline is on the screen — and so is its absence.** Three
states, modelled as `reviewClock` rather than as a nullable date, because the nullable date is what
gets rendered as time in hand:

| State | What it means | What the screen says |
|---|---|---|
| `auto_approves` | `AWAITING_REVIEW`, window configured | The date, plus that silence approves it and that only a dispute stops it |
| `no_deadline` | `AWAITING_REVIEW`, `review_due_at` **null** | “No deadline is set — nothing is approved automatically.” Never a countdown, never a synthesised default |
| `stopped` | `DISPUTED` | “The clock is stopped.” The server clears `review_due_at` and refuses the timeout, so this is a fact rather than a reassurance |

The countdown is `useServerCountdown` and is **presentation, never authority**: reaching zero locally
replaces the actions with “this window has closed — check what happened” and one refetch, rather
than asserting an approval the server may not have made.

**A5 stages fund at face value.** Nothing in this wave subtracts visit money from a stage, and the
managed panel says out loud that the visit money is already spent on the visits.

#### The one thing `M2-FE-610` exists to prevent, and the four things that prevent it

A proposed amendment must never read as approved scope. So: it is drawn in its own bordered block
with a **“Requested — not agreed”** badge; it is absent from the agreement's own totals, which keep
showing `staged_total_paise`; it is absent from the version history until the server stamps
`applied_at`; and an **unrecognised status offers nothing at all** rather than falling through to
decidable, which would be one keystroke from the failure itself.

The comparison is three rows — agreed now, this change, **if you accept** — and the third is
labelled as a projection because nothing publishes a would-be total. It is formatted at the call site
rather than in the adapter, deliberately, so it cannot be filed among the real totals.

Money before scope is rendered as the three routes the contract defines. `checkout: null` on a
`LEAD_ONLY` extension applies at once; `null` on a managed reduction refunds *before* the scope
shrinks, so there is no instant in which the Customer owns less work than they have paid for; and a
`PaymentAttempt` renders as **waiting with nothing to press**, because every control on a pending
charge is a way to pay twice.

#### Money is read, not re-added

1.25.0 publishes six running totals on the engagement and four per stage. `fundedTotalPaise` — the
1.24.0 helper that summed `FUNDED` stage amounts, and the §7 row that forced it — is **deleted**, not
deprecated. `staged_total_paise = total_paise + amendment_delta_paise` is a database constraint, so
“agreed, then changed by, now owed” is three published numbers side by side and a mismatch is a
server bug visible in the right place.

One derivation survives and it is deliberately not money: **progress is counted in stages.** A money
ratio reads 0% for a finished `LEAD_ONLY` booking, because Vsolve collects nothing on A3, and a bar
that tells somebody their completed job has not started is worse than no bar.

#### The two frozen-file changes were used, not worked around

- **`m2-keys.ts` gained `visits`.** `m2AccessKeys.visitPlan` now delegates to
  `m2QueryKeys.visits.plan(requirementId)` instead of composing under `requirements.detail`. Two
  names for one cache entry is how the tracker and the server's own invalidation stop agreeing, and
  `visits.plan` joining `requirementScope` is what makes a `NON_RESPONSIVE` rejection refetch the
  plan whose share it just sent back to owing a free replacement visit.
- **`errors.ts` gained both fail-closed codes as `contact_support`.** `access-refusal.tsx` lost both
  hand-authored branches, exactly as the Wave A2 note promised it would. What is left is the one rule
  the error layer cannot express: an action is rendered only when the call site passes one, because
  `describeError` always returns one.

#### Three things this wave was told not to build, and did not

`FE-510` (attendance), `FE-611` (deliverable acceptance, warranty, retention release) and `FE-612`
(vendor replacement) need C4 and C5. Each renders a dashed, labelled block with **no control**, at
the exact place the feature will sit, saying what will be there and what to do meanwhile. An
attendance control wired to nothing teaches a Customer that confirming does nothing; a retention date
invented here is a promise the platform has not made; and rendering *nothing* would read as “this
product does not do that” — which on the warranty panel reads as “I have no cover”.
`view/not-built-yet.tsx` is deleted when they land and is deliberately ugly to leave in place.

#### The wave's largest hole, and it is not a missing screen

**Stage evidence cannot be opened by the party being asked to approve it.** `object_key` is correctly
unpublished and 1.25.0 ships no download route for `StageEvidence`, though `RequirementAttachment`
has one. So a Customer is asked to release money against evidence whose metadata they can read and
whose content they cannot. The viewer says so plainly rather than offering a control that 404s, and
the scan status still gates: `PENDING` means the checksum matched and the safety question is
unanswered, and anything unrecognised fails closed.

#### One defect fixed that predates this wave

**The whole Customer M2 surface was dark from the chrome.** `/requests` was never in the site header,
so three waves of screens — requests, quotes, the visit tracker, the engagement — were reachable only
by typing a URL. That is the identical defect `site-header.tsx`'s own note records about `/bookings`
in M1, and this column had now shipped it twice. `My requests` and `My projects` are private header
links; `/bookings/workforce` is linked from `/bookings` rather than taking a fifth tab, since
`startsWith` already marks `My bookings` as current for it.

#### Files

- `packages/query/src/m2-engagement-customer.ts` (rewritten at 1.25.0), the one-line key change in
  `packages/query/src/m2-quotes.ts`, and the export block in `packages/query/src/index.ts`.
- `apps/customer/features/engagement/**` — `queries.ts`, `model/stage-review.ts`,
  `adapters/index.ts`, `view/{engagement-status,engagement-list-screen,stage-review-screen,
  stage-evidence,agreed-work-panel,amendment-panel,agreement-history,engagement-timeline,
  completion-panel,not-built-yet,engagement-screen}.tsx`, `SMOKE.md`.
- Touched: `features/access/view/access-refusal.tsx` (two branches deleted),
  `features/session/view/site-header.tsx`, `app/(flow)/bookings/page.tsx`,
  `app/(flow)/engagements/[engagementId]/page.tsx`.
- Routes: `app/(flow)/bookings/workforce/page.tsx`, `app/(flow)/projects/{layout,page,loading,error}.tsx`,
  `app/(flow)/engagements/[engagementId]/stages/[stageId]/page.tsx`.

**Twelve rows added to the execution plan §7.** The two to read first: **no stage-evidence download
route**, which is the one gap that changes what a Customer is being asked to consent to; and
**`/bookings/[engagementId]` cannot exist**, which the information architecture still claims.

### Blocked / handed off — Wave A3

| Date | Task | Blocked on | Logged in plan §7 |
|---|---|---|---|
| 2026-08-13 | `FE-510` | C4's attendance model. Nothing publishes an attendance record. Not-built-yet block rendered. | yes |
| 2026-08-13 | `FE-611` | C5. `Engagement` carries no retention amount and no warranty window. Not-built-yet block rendered. | yes |
| 2026-08-13 | `FE-612` | C5. Nothing publishes what transfers or what the price difference would be. Not-built-yet block rendered. | yes |
| 2026-08-13 | `FE-609` evidence viewer | No download route for `StageEvidence`. Metadata renders; the file cannot be opened. | yes |
| 2026-08-13 | `FE-509` crew and identity | Not on the engagement projection. Read back off the accepted quote, degrading to a link. | yes |
| 2026-08-13 | `FE-613` scope per version | No proposal snapshot on the engagement. Money and change lines only. | yes |

### Wave J — 2026-08-14 · the 1.28.0 consumption pass

`pnpm lint --max-warnings 0` clean; `pnpm typecheck` **9 of 9 green** (run with
`--force` on `customer` + `@vsolve/query` first, so nothing passed on a stale
cache, then the full workspace); `pnpm build --filter=customer` green with the
same 31 routes — **no route was added or removed this pass**, which is the point:
this was a consumption pass, not a build. **No tests were run and none were
written**, per the build-first amendment. What replaces them is the **Wave J
addendum** appended to both existing smoke docs — `features/engagement/SMOKE.md`
§J1–J3 and `features/access/SMOKE.md` §J4–J5.

Four things published between 1.26.0 and 1.28.0 that this column was still
working around. All four are consumed and every workaround is deleted rather than
left beside its replacement.

#### 1. `EngagementStage.kind` — a bag of cement had been arriving as a milestone

The screens rendered a `MATERIAL_ADVANCE` as an ordinary fundable work stage,
with **"This is done properly"** over the approve button and *"funding this is
what starts it"* over the funding button. Neither sentence is true of materials,
and the second is the consequential half: what a Customer consents to when they
fund a milestone is work that can be left undone and refunded, and what they
consent to here is **goods that will exist**.
`route_suspended_capability_engagements` already encodes exactly that difference
— it refunds a funded, unstarted *work* stage and refuses to claw back a funded
material advance — so the platform's own recovery rule and the screen's own copy
had been disagreeing since 1.26.0.

`stageKind` in `packages/query/src/m2-engagement-customer.ts` is the seam, and it
returns a three-member union rather than the wire enum. The third member is the
whole reason it is not a boolean: **an unrecognised kind fails closed**, the same
rule `isKnownCommercialMode` follows, because the optimistic fallback for a third
kind is "ordinary work milestone" — precisely the reading `kind` was published to
prevent. On screen that means **no funding control at all** and a sentence saying
why. Asking somebody to pay for something this app cannot name is worse than
making them wait for a newer build.

`view/engagement-status.tsx › stageKindCopy` is the one table, beside the status
and noun tables already there, so a materials row cannot be worded one way on the
list and another on the review. **Two things it deliberately does not do:**

- **It removes no control.** The server runs one spine and permits approve,
  correction and dispute on a materials row. Hiding the dispute would take away
  the Customer's only objection to a delivery that never arrived, and hiding the
  correction would leave "only 30 of the 40 bags came" with nowhere to go.
- **It subtracts nothing.** A material advance funds at face value like every
  other row. Nothing in this column has ever credited visit money against a stage
  and nothing here starts.

The list row's one sentence moved with it, through `nextActionCopy`'s new third
parameter: "Fund the next stage to start it" is false of a materials line, and
that line is what a Customer reads before deciding whether to open anything. The
kind it names is the **next fundable** stage for funding and the **earliest
awaiting review** for a review — two different rows, and reading either off
`activeStage` would have named the wrong one on a project where a milestone is in
progress while a materials line waits to be paid for.

#### 2. `Engagement.access_receipt` — `M2-FE-418` closes, and it is not a link

The screen said a receipt was not available. It is, and the shape decides how it
is rendered: `AccessReceipt` is `{kind, number, series, sequence, amount_paise}`
with **no document id and no URL**, because `TaxDocument.order` is not nullable
and an access fee has no `Order`. So the panel shows the gapless `M2A-` number a
Customer quotes to support, and offers nothing to download — a download control
over a field that carries no document is the dead link `FE-810` forbids.

It also does not use the word **invoice**, and that is the contract's own
instruction rather than caution: GST treatment of both access fees is blocking
owner decision 5, and calling a receipt reference an invoice would be this client
making a tax claim.

`number` is carried through verbatim and never re-assembled from `series` and
`sequence`. The server formats it precisely so every app quotes the same string,
and a second assembly here is how support ends up being read two different
numbers for one payment.

**`null` is three states, not one** — no fee charged, a plan covered entirely by a
reclassification credit, or a row predating receipt numbering — and the panel
cannot tell them apart, so it says there is no number rather than asserting
nothing was ever paid.

#### 3. The two frozen-file grants, consumed, with the workarounds deleted

- **`engagements.events(id)`.** The local `detail(id) + "events"` composition is
  gone. It was correct by construction and *unreviewable*, which is the argument
  the factory's own new doc comment makes: a key nobody can find in the factory
  is a key nobody can check the invalidation of. The read also moved to
  `M2_FRESHNESS.engagementEvents`, the tier written for it.
- **`engagements.amendments(id)` + `M2_FRESHNESS.amendments`.** The amendment
  list had been borrowing `engagements.agreement(id)` and then **refusing that
  key's tier** — which was the tell that one key was carrying two reads with
  opposite freshness. The agreement is written once and never changes, which is
  what earns it `SESSION_STATE`; a proposed amendment is a live change request
  with a deadline and a money delta, decided from two devices, and serving one
  from a session-long cache is how a Customer approves a delta that expired an
  hour ago. `agreement` keeps `SESSION_STATE` for the immutable terms and
  **nothing in this app reads amendments off it any more** — checked with a
  workspace grep, not assumed.

Prefix nesting was **verified rather than trusted**: both keys are
`[...engagements.detail(id), tail]`, `detail(id)` is a strict prefix of each, and
every invalidation in `features/engagement/queries.ts` targets
`engagements.detail(engagementId)` or `engagements.list("customer")`. So a stage
command still clears the timeline and the amendment panel in one call.

#### 4. The sweep

- **`VisitNoShowRequest.reason_code` was already fixed** at the orchestrator's
  1.26.0 regeneration commit (`212d119`): `VisitNoShowReason` is typed off
  `Schemas["VisitNoShowRequest"]["reason_code"]` and the one call site sends
  `VENDOR_DID_NOT_ARRIVE`. Verified by reading the call site rather than trusting
  the §7 row, since the prediction was that it would be a live `400`. It is not.
  Smoke step J5 exists so a regression is caught by a person rather than by a
  Customer.
- **`SiteVisit.timezone` (1.26.0) is now read.** `formatVisitSlot` was formatting
  every slot in `BOOKING_TIME_ZONE` — the deprecated single-city constant — which
  was correct while the platform was Hyderabad-only and silently wrong the day it
  is not. It now takes the visit's own zone, memoised per zone the way
  `formattersFor` is on the A1 side, because a three-slot tracker re-renders on
  every poll. It falls back to the booking zone and **never to the device's**: a
  Customer travelling must not watch their visit move. An unknown zone string
  throws `RangeError` out of `Intl.DateTimeFormat`, so the fallback sits inside a
  `catch` — the alternative is a blank tracker.

#### What was found available and deliberately not built

Two 1.26.0 paths are published and unconsumed, and neither is a workaround this
column can re-point in a small change — both are new surfaces, which is exactly
the seam test the brief sets:

- **`GET /requirements/{id}/vendor-cards/`** finally gives `M2-FE-419` its data
  source. That is a **new list view** on the A5 pre-visit surface, not a
  re-point, and it is A5-only (`400 m2_lifecycle_not_supported` on A3). The
  tracker's honest degraded copy stays correct meanwhile.
- **`POST /requirements/{id}/quotes/{proposal_id}/questions/`** closes
  `M2-FE-409`'s Customer-asks half. Also a new surface: a compose control, a
  thread, `asked_by_role` rendering, and the archetype paywall gate.

Both are logged in §7 as available-and-unstarted rather than carried silently.

#### Files

- `packages/query/src/m2-engagement-customer.ts` (`StageKind`, `stageKind`,
  `isMaterialAdvance`) and the append-only export block in
  `packages/query/src/index.ts`.
- `apps/customer/features/engagement/` — `queries.ts` (both keys, both tiers),
  `adapters/index.ts` (`kind`, `accessReceipt`, `nextFundableStageKind`,
  `actionStageKind`), `view/engagement-status.tsx` (`stageKindCopy`,
  `stageRowNoun`, `StageKindBadge`, `nextActionCopy`'s third parameter),
  `view/engagement-screen.tsx` (`AccessReceiptPanel`, the stage row),
  `view/stage-review-screen.tsx`, `view/engagement-list-screen.tsx`, `SMOKE.md`.
- `apps/customer/features/access/` — `adapters/index.ts` (`formatVisitSlot`,
  `VisitSlotRow.timeZone`), `view/visit-tracker.tsx`,
  `view/book-visits-screen.tsx`, `SMOKE.md`.

**Three rows added to the execution plan §7.** The one to read first: the two
published-and-unstarted paths above, because they are the only remaining M2
Customer surface where the contract is ahead of the app.

### Blocked / handed off — Wave J

| Date | Task | Blocked on | Logged in plan §7 |
|---|---|---|---|
| 2026-08-14 | `FE-419` vendor cards | Not blocked. Published at 1.26.0 and unstarted — a new list surface, not a re-point. | yes |
| 2026-08-14 | `FE-409` Customer questions | Not blocked. Published at 1.26.0 and unstarted — a new compose-and-thread surface. | yes |
| 2026-08-14 | `FE-609` evidence viewer | Still no download route for `StageEvidence` at 1.28.0. Unchanged. | already logged |

### Wave A2R progress — 2026-08-14 · the A3 rate-card front door, at 1.29.0

`npx eslint <changed paths> --max-warnings 0` clean; `npx turbo run typecheck --filter=customer
--filter=@vsolve/query --force` green; `npx turbo run build --filter=customer --force` green with
**two new dynamic routes**. All three re-run after the fixes below, none off a cache hit
(`Cached: 0 cached`, no `FULL TURBO`), and no `os error 112`. **No tests were run and none were
written** — the build-first amendment. What replaces them is
`apps/customer/features/crew/SMOKE.md`.

> The filter is `customer`, not `@vsolve/customer`. Only the `packages/*` workspaces carry the
> scope, and `turbo --filter=@vsolve/customer` matches nothing and **exits 0 having run nothing** —
> a gate that lies rather than fails. `--force` on typecheck for the same reason: turbo will serve a
> cache hit over new files and report success.

**Two routes.**

| Route | What it is | Rendering |
|---|---|---|
| `/requests/book/[service]` | The A3 preset and the published rate — `FE-425`, `FE-426` | `force-dynamic`, `robots: noindex` |
| `/requests/[requirementId]/book-crew` | The booking-fee checkout — `FE-428` | `force-dynamic`, `robots: noindex` |

`book` is a **static** segment beside the existing `new`, because the level already carries
`/requests/[requirementId]` and Next refuses two different dynamic slug names at one path level —
the build fails. A static segment wins the match over its dynamic sibling and leaves
`[requirementId]` untouched. Same lesson `/bookings/workforce` was built on after
`/bookings/[groupId]` blocked `/bookings/[engagementId]`.

`FE-427` and `FE-429` mount no route: they are panels **inside** `/requests/[id]`, which is where a
Customer looks when they want to know what is happening to their crew.

#### What was inherited, and what was done with it

A stopped predecessor left A2R roughly two-thirds built and uncommitted. Audited against 1.29.0 and
ADR-0009 line by line before extending, on the standing rule that a good design is worth keeping and
somebody's lines are not.

**Kept, essentially as written** — it was right, and the reasoning in it was better than a rewrite
would have produced: the whole `m2-quotes.ts` rate-card block (phases, refusal predicates,
`isRateCardSettled`'s two-unsettled-states argument, the `CUSTOMER_REPORTS_CREW_PARTY` constant),
`features/crew/queries.ts`, `adapters/index.ts`, `rate-disclosure.tsx`, `preset-questions.tsx`,
`crew-address-picker.tsx`, `crew-dispatch-panel.tsx`, both route files, and the catalog and
request-detail wiring.

**Rewritten:**

1. **`CheckoutAction` in `book-crew-fee-screen.tsx` — the wave's blocking defect.** Detailed below.
2. **`useBookAtPublishedRate`'s duplicate override.** Also below.
3. **`isPresetIncomplete`** now requires a *named* code rather than merely not one of the two
   fail-closed ones. `unavailable_code` is nullable, and a null meant "send them back to the form" —
   the worse of the two wrong answers, because it is a loop. A null now falls to the fail-closed
   branch, which at least tells the truth and hands over a route that works.
4. **`handlePrice`** wrote the answers twice on every press after the first (a `PATCH` for the
   answers, then a `PATCH` for the address and dates). One `PATCH` now, with the answers on it only
   when the create did not already carry them.
5. **`CrewConfirmed`** gained the link to `/bookings/workforce`. A screen that says the crew is
   confirmed and offers no way to reach the booking is a dead end.

**Deleted:** nothing. Nothing in it fought the spec.

#### The defect that every static gate passed over, and it was the whole wave

**`BookingFee.Status.OFFER_ACCEPTED` is unreachable, and the checkout's pay button was gated on it.**

Session C recorded the server half in the execution plan §7 on 14 August: `accept_crew_offer`
creates no `BookingFee` row at all, and the one construction site overwrites the status to `PENDING`
before saving. So `OFFER_ACCEPTED` is a model default that nothing ever persists.

The consequence for this column was total. `bookingFeePhase` maps it to `awaiting_payment`, and
`CheckoutAction` offered **Pay Rs.X and confirm the crew** on that phase alone. At the one moment a
lead is holding the job, the read carries no fee, the reachable phase is `none`, and the screen
rendered its `none` copy:

> No supervisor has accepted this job yet, so there is nothing to pay for.

A sentence that is confident, well-worded, grammatical and the exact opposite of the truth. **The
Customer could never pay the booking fee** — which is the only money on the A3 path and the only
thing `M2-FE-428` exists to do. Lint green, typecheck green, build green, route rendered, no
exception anywhere.

The fix is not to add a branch. It is that **a fee status cannot answer "may I pay now"**, and
`RateCardState.checkout_available` can — it is the server's own answer to "is a lead holding this
right now and is the fee unsettled", checked again under the booking's row lock when the command
runs. The control now turns on `canCheckOutBookingFee` and nothing else; the fee status decides only
what to say *afterwards*, which is a different question and the one it can answer.

`OFFER_ACCEPTED` stays mapped in `bookingFeePhase`. A status published in the enum is part of the
contract, and dropping it would send a real value to the fail-closed branch the day the server
starts writing it. What must not exist is a *screen* gated on it.

**The general shape is worth naming, because it is the frontend twin of the rule that produced the
sprint's two backend blockers.** Wave C2R's were a check constraint duplicating a Python tuple, and
a config column with a reader and no writer. This is *a reader with no writer* one layer up: an enum
value with a mapping, a phase, a branch and a fully written sentence — and no server that ever sends
it. Every static gate on both sides of the wire agreed, because the type exists. The check that
catches it is not a gate; it is asking, of each branch, **who sends this**.

#### The second thing that could not work, and why it looked correct

**Overriding a duplicate warning was a dead end.** `book_at_published_rate` takes a stable
idempotency key, correctly: booking is a once-per-requirement `DRAFT` to `MATCHING` transition, so
replaying it after a dropped connection is the behaviour wanted. `allow_duplicate` travels in the
**body**, not the key.

So the sequence was: press Book, get `409 m2_requirement_duplicate`, press **These are different
jobs**, press Book again — and the override is sent under the key the refused attempt already spent,
with a changed payload, and `execute_idempotent` fingerprints the payload and refuses the mismatch.
The Customer presses the override button and is told the same thing forever. The inherited comment
argued this was *correct* — "overriding a duplicate warning is a second, different decision and must
not silently replay the first answer" — which is exactly right about the semantics and exactly
backwards about what to do with them. It is a second, different decision, so it needs a **second
key**.

`clearBookAtRateKey` spends the stored key at the **moment of the decision** — in the "these are
different jobs" handler — rather than inside the mutation. Clearing on every `mutate` would give a
dropped-connection retry of the override a third key, which is the failure the stable key exists to
prevent. Safe because the server is what stops a double booking here, not the key: a second
`DRAFT` to `MATCHING` is refused by state, and this command charges nothing.

#### The rate is the server's, in four separate ways

`M2-FE-426` turns on one rule — **never compute a number the server did not send** — and the wire
was designed to make it easy, so the code should be boring. It is:

- `RatePreview` publishes `day_rate_paise`, `total_customer_paise`, `lead_receipt_paise` and
  `booking_fee_paise` as four independent fields with `total = lead_receipt + booking_fee` calculated
  server-side. `grep` for arithmetic on `paise` across `features/crew/` returns **only** null checks
  and `formatMoney` calls.
- **The supervision margin is not on the Customer's read and is not reconstructed.** `RateCard`
  carries three components; `RatePreview` publishes the two the Customer is entitled to — what goes
  to the crew and what comes to Vsolve — because the lead's own margin is the lead's business. The
  disclosure shows two and does not subtract its way to the third, which is the inference those
  fields were split apart to prevent.
- **The booking freezes its own rate.** Post-booking screens read `RateCardBooking`, never the live
  preview, because the preview re-prices against whatever card is in force *now* and a booking made
  last week reconciles against the number it was made at.
- **The add-on labels are derived from the server's own keys**, not from a dictionary in a
  component. A hardcoded map would go stale the first time Operations adds a row, and the staleness
  would show up as a Customer charged for something the screen never named.

#### Three owner-blocked values are absent from the UI rather than invented

All three logged in §7.

**The cascade's expected wait.** `RateCardBooking` publishes `wave` and `hold_expires_at` and no
wave timeout, widening step or fallback threshold. So the holding state shows the server's own wave
number — "Asking nearby supervisors" / "Search widened", which is the honest version of "we are
still looking" — carries the task's own sentence, *"Confirming your crew — usually within 2 hours"*,
and shows **no countdown**. `hold_expires_at` *is* published, and the held-offer panel runs a real
`useServerCountdown` against it, so the one deadline the server actually knows is the one deadline on
screen.

**The free-cancel window T.** On no read. The cancel confirmation therefore states **both** money
outcomes — inside the window the fee comes back whole, outside it the fee forfeits and part of it
pays the supervisor for turning other work down — with no hours, no date and no prediction. The
server decides and says which happened. With T unset the command refuses `m2_policy_unavailable`,
which `AccessRefusal` renders as a support path rather than a retry.

**The forfeit split ratio.** Never shown as a percentage. `toFeeMoneyView` returns the two halves as
`null` until the fee is actually `FORFEIT_SPLIT`, deliberately: both fields are `0` on an `ACTIVE`
fee, and "Rs.0 to the supervisor" printed beside a live booking would describe a settlement that has
not happened.

#### Two doors on one request, and never both at once

The A3 request detail now has two money surfaces, and the rule that keeps them from contradicting
each other is that **the server's own `RateCardBooking` chooses**:

| Booking | Renders |
|---|---|
| none | The Wave A2 unlock surface, exactly as before. This request never used the instant path |
| `MATCHING` / `OFFER_HELD` / `CONFIRMED` / `CANCELLED` | The crew panel only |
| `FELL_BACK` | The handoff paragraph **and** the unlock surface beneath it |

Rendering both in the ordinary case would give one request two money controls and two different
promises about what happens next. Rendering neither while the rate-card read is in flight is why
`isResolvingDoor` feeds the unlock panel's own loading state instead of the quote surface appearing
and then being replaced — flashing a paywall at somebody who has a crew booked is worse than a
spinner.

**The unlock surface is untouched.** Not one line of `features/access/**` changed except
`request-access-panel.tsx`, which gained the door-chooser and passes its A3 half straight through to
the component that already existed. It is the thin-supply fallback now and it stays.

#### What the screens say about what this is

A3 is `LEAD_ONLY` and the copy says so **before the money**, not only on the engagement afterwards.
`RateDisclosure` ends in a warning-toned block badged **Not a Vsolve booking**: we find you a
supervisor and his team, we publish the rate, and we help if the connection fails — we do **not**
hold the wage money, so payment for the work, any refund on it and any guarantee about it are
between you and them. The booking fee is the only payment that comes to us. The checkout repeats it
next to the amount.

Nowhere does any screen call this a protected booking, and no screen implies Vsolve backs the work.
That is the defect `M2-FE-415` exists to prevent, moved one screen earlier.

#### What was audited for, and what was found

Per the sprint rule that static gates pass on code that cannot run:

- **(a) The drifting duplicate — a hand-copied list beside its own source.** Nothing in this diff
  duplicates a server-owned list. The preset questions render from the variant's published list, the
  inclusions from the card's own strings, the add-on labels from the card's own keys, the no-show
  reason from the published enum, and the archetype gate from `request_archetypes`. The one literal
  is `A3_TIME_BLOCK` on the catalog page, which is a contract enum value and not a list.
- **(b) The reader with no writer.** Found, and it was the wave. `OFFER_ACCEPTED` — mapped, phased,
  branched, worded, and sent by nothing. Fixed as above. A second instance was avoided rather than
  found: `m2_booking_fee_payment_pending` is declared, described in the contract as the refusal that
  gates confirmation, and raised by no path — the pending state is derived from the `BookingFee`
  record's own status, and no branch anywhere waits for that code.
- **The seed.** This wave adds no configuration column, so (b)'s seed rule does not bite here. The
  columns it *depends* on are C2R's ten, and Session C's §7 row records `_seed_a3_configuration`
  writing all of them and `_seed_rate_card` publishing a card **through `publish_rate_card`** so the
  seed is held to the wage-floor guard Operations is held to. The smoke script's section 0 names
  every one as a precondition with its symptom, so an unseeded environment is diagnosable from the
  screen.

#### Files

- `packages/query/src/m2-quotes.ts` (the rate-card block) and the session-A marker block in
  `packages/query/src/index.ts`.
- `apps/customer/features/crew/**` — `queries.ts`, `adapters/index.ts`,
  `view/{book-crew-screen,book-crew-fee-screen,crew-dispatch-panel,rate-disclosure,preset-questions,
  crew-address-picker}.tsx`, `SMOKE.md`.
- Touched: `features/access/view/request-access-panel.tsx` (the door chooser),
  `features/requirement/view/request-detail-screen.tsx` (one prop), `lib/routes.ts` (two builders),
  `app/(shop)/catalog/[category]/[service]/page.tsx` (the `Book a crew` action).
- Routes: `app/(flow)/requests/book/[service]/page.tsx`,
  `app/(flow)/requests/[requirementId]/book-crew/page.tsx`.

**Seven rows added to the execution plan section 7** — two frozen-file requests, five contract gaps.
The one to read first: **`OFFER_ACCEPTED` is unreachable and a screen was built on it**, because the
server half of that row is still open and the next column to consume `BookingFee` will make the same
assumption unless it is warned.

### Blocked / handed off — Wave A2R

| Date | Task | Blocked on | Logged in plan §7 |
|---|---|---|---|
| 2026-08-14 | `FE-425` preset schema | `a3_preset_question_schema` is what the server validates against and has no read endpoint; the screen renders the catalog questions, which are the only published preset schema. A mismatch surfaces as an unpriceable form the Customer cannot fix. | yes |
| 2026-08-14 | `FE-427` cascade clock | No wave timeout, widening step or fallback threshold on any read. The holding state carries the task's own sentence and no countdown; `hold_expires_at` is the one real deadline and it is used. | yes |
| 2026-08-14 | `FE-428` fee status | `BookingFee.OFFER_ACCEPTED` unreachable. Built against `checkout_available`, which is correct regardless of whether the server half changes. | yes |
| 2026-08-14 | `FE-428` engagement link | `RateCardState` publishes no engagement id. The confirmed panel routes to `/bookings/workforce`. | yes |
| 2026-08-14 | `FE-429` cancel before payment | No published way to call off a booking that is out to the cascade — `booking-fee/cancel/` needs a fee row and no requirement-level cancel exists for `MATCHING`. Nothing is charged in that window. | yes |
| 2026-08-14 | `FE-428` demonstrating any charge | Unchanged from Wave A2: no M2 payment attempt is readable or capturable by its own Customer, so the smoke script captures from the Django shell. | already logged |

---

### Wave A3F progress — 2026-08-14 · the Customer's side of the A3 shift-day, at 1.30.0

`M2-FE-510`, `M2-FE-514`, `M2-FE-515`. Built against contract **1.30.0**, whose ten shift-day paths
all hang off a **stage id**, and against the frozen-file grants that landed at Gate 1 (`4e25b40`):
`m2QueryKeys.shiftDays.forStage`, the `stageScope` fix, and the `confirm_day_settled` /
`report_cash_demand` command rows.

Session B built the **vendor's** half of the same evening concurrently (`FE-513`). One file was
contested and is dealt with below.

#### Where it lives, and why there is no new route

On a workforce booking **the stage is the day** — one shift-day per stage is the mapping 07 §5 sets
— so the whole of this wave hangs below the existing stage review at
`/engagements/{engagementId}/stages/{stageId}`. A separate `/shift-days/{id}` route would have given
a Customer two addresses for one evening and two places to look for one button. Nothing was added to
`app/`.

```
features/shift-day/
  queries.ts                       one read, three commands
  adapters/index.ts                the wire -> ShiftDayView; the one rupee input in the feature
  view/shift-day-panel.tsx         the evening, in order; the crew list; the waiting states
  view/attendance-decision.tsx     FE-510 — confirm, the three shortfall taps, the dispute
  view/day-settlement.tsx          FE-514 — the amount, the UPI link, the dual tap
  view/cash-demand-report.tsx      FE-515 — one tap
  SMOKE.md                         the owner's script
```

The durable half is the shift-day section appended to `packages/query/src/m2-engagement-customer.ts`
— phases, permissions and refusals, no React — on the same split every other M2 feature in this app
uses.

#### The defect this wave was one merge away from shipping

**`approve_stage` and `respond_attendance` are not two ways to do the same thing, and the stage
review offered both.** A workforce shift-day sitting in `AWAITING_REVIEW` has two server routes to
`APPROVED`: the generic **Approve** button this column shipped in Wave A3, and the attendance
confirm this wave adds. Only the second records the Customer's answer to the count, creates the
`DaySettlement`, and — on a shortfall — takes the choice the server *requires*. Pressing the generic
Approve would have left the day approved, the attendance still reading `SUPERVISOR_CONFIRMED`, and
**no amount to settle at all** — closing the stage against the exact evening `M2-FE-514` exists to
open.

So `StageActions` now takes `deferToShiftDay` and stands its three controls down while the
attendance answer is open, replacing them with one sentence pointing down the page. It stands down
**only** in that window; every other state keeps all three, and A5 is untouched. This is the client
agreeing with the server about which command answers a shift-day — not a screen hiding a control it
dislikes — and the reasoning is written on the prop rather than in this file alone.

#### `M2-FE-510` — one tap, and the tap count is the requirement

- A full day is **one primary button and no confirmation dialog**. A dialog there would be a
  flow-weight regression against `SIM-02`, which asks for one action.
- A shortfall becomes **three one-tap choices**, because `respond_attendance` refuses a bare confirm
  when workers are missing. The sentence above them is the load-bearing one: the day settles at the
  present workers' rate **whichever is chosen** — the choice decides what happens to the missing
  worker-days, not to the money for the ones who came. `ADD_DAY` says plainly that it records a
  **request** and that the extra day is the professional's to offer, because promising it would be
  the platform committing a vendor's labour.
- **Per-worker detail is behind the dispute disclosure and nowhere else.** C4 has no per-worker
  check-in and no per-worker check-out, deliberately, so a routine Customer form asking who was
  there would be inventing a record the server does not hold. Inside a dispute the same question is
  legitimate: what is captured is the Customer's *account*, evidence in a case, and nothing derives
  a count from it.
- The dispute requires content — a note or a named worker — because the server's own fallback
  sentence ("the customer disputed the attendance count") tells Operations nothing the status did
  not already say.
- The idempotency key is scoped **by the response**, not just the stage: `execute_idempotent`
  fingerprints `{stage_id, response}`, so a stored key reused across a changed mind would be refused
  as key reuse with a different payload. A dropped connection replays the same decision; an
  abandoned dispute followed by a confirm is a genuinely new command.

#### `M2-FE-514` — the money, and the two sentences that matter more than the money

Every figure is a **published field, formatted**. `amount_paise` is displayed beside
`per_worker_paise`, `workers_present`, `workers_expected` and `extras_paise` — read out, never
multiplied. The three reconcile by a database check constraint
(`requirements_day_settlement_reconciles`), which is exactly why reproducing that arithmetic here
would buy nothing and cost the only thing that matters: a client that computes "3 of 4" keeps paying
the old formula straight through a change to the real one.

Two sentences carry the wave:

1. **Vsolve is not holding this money and never has.** A3 wages are direct, daily and peer-to-peer;
   no endpoint in this contract can move one. The tap is a record that both sides agree, not a
   payment rail, and the panel says so above the button and again inside the dispute confirmation.
2. **A one-sided tap is not a settled day.** `CUSTOMER_CLAIMED` renders as *you said it was settled
   and they have not answered*, explicitly **not** as "it was not paid". The reverse state nudges
   the other way and is the one worth reading twice: *if you did not pay them, do not confirm it.*

Where no settlement row exists there is **no amount**, said in words, rather than a Rs 0 that would
read as a day worth nothing — and the disputed branch says outright that a count nobody agrees on is
not an amount either.

The Customer's tap is only offered once an amount exists. The server permits it a step earlier (it
creates the settlement itself), but offering a "confirm you settled" button at an amount the screen
cannot show is the same defect as computing one.

#### `M2-FE-515` — a tap, not a form

One button, one confirmation, and **the send works with everything blank**. The amount and note sit
inside the confirmation, marked optional, and the confirm button is never gated on them — because a
required amount turns "they demanded extra" into a form, and the form is what stops it being
reported.

It promises **only what the server commits to**: recorded immutably, counted towards a pattern, and
while the owner's removal threshold is unset **nothing at all happens to the vendor**. So no
removal, warning, fine or contact is implied anywhere in the copy — this client cannot know whether
that threshold is set. Genuine extras are signposted to the amendment panel by name, priced by the
server at the card's published add-on rates.

Offered in **two** places: on the shift-day (with the day attached) and on the engagement as a whole
(with none), because the endpoint takes the stage as optional precisely so a report does not need a
live shift-day to attach to — somebody asked for cash on Friday reports it on Saturday. The
idempotency key is scoped to engagement + day, so a double tap replays rather than counting one
complaint twice towards a threshold that can end somebody's trade.

#### The RULES §3 audit — both classes, and what each found

**(a) The drifting duplicate — one found, reported, kept deliberately.**
`MAXIMUM_DISPUTED_WORKERS = 40` is hand-copied from `workforce.MAXIMUM_DISPUTED_WORKERS` because the
cap is enforced and **not published on any read**. It is a guard rail only: the screen stops offering
*Add somebody* past it and the server stays the authority, so a copy that drifts high surfaces as a
visible refusal on submit and one that drifts low merely offers fewer lines. Neither silently
corrupts a dispute — which is the distinction from the wave-C2R defect, where model and migration
agreed with each other and both disagreed with the code. Logged in §7 with the one-field fix.

The two other candidates are **not** instances, checked rather than assumed: `SHORTFALL_CHOICES` is
typed `readonly ShortfallChoice[]` off the generated enum and is consumed through two
`Record<ShortfallChoice, ...>` copy tables, so a fourth server value is a `tsc` failure at both call
sites rather than a blank cell; and `SHORTFALL_CHOICES.includes(...)` narrows the wire value without
a cast and fails **closed**.

**(b) The column with no writer — one found, and it is this wave's headline gap.**
**`DaySettlement.upi_payment_link` is `null` on every shift-day read.** Verified rather than
inferred: `DaySettlementSerializer` declares it as `CharField(read_only=True, allow_null=True)`, the
`DaySettlement` model has no such field and no `@property`, and DRF's `Field.get_attribute` returns
`None` for a missing attribute whenever `allow_null` is set — so the read never raises and never
carries a link. The **only** writer is `EngagementStageSettlementView.post`, which injects it into
the response body by hand. A field with a reader, a schema entry, a wire type, and no writer on the
read path: exactly shape (b).

The seed writes a VPA on every demo vendor, so this is visible in dev rather than latent. The
consequence for `M2-FE-514` is that the deep link is unavailable *before* the tap — which is when
somebody would use it to pay — and gone again after a reload. Handled honestly at the call site
rather than worked around: the panel prefers the command response's own link, and the absent case
says *we do not have a UPI link for this one* and never *this professional has no UPI address*,
because `null` has two causes this build cannot tell apart. **Nothing anywhere assembles a
`upi://pay` string** — verified by grep, which finds the scheme only in comments. Session B's
`M2-FE-513` reads the same serializer and inherits the same gap.

#### The one contested file, and how it was left

`packages/query/src/index.ts` is the append-only shared barrel. Both sessions independently wrote
`settlementAmountPaise` and `settlementPaymentLink` this wave — Session A in
`m2-engagement-customer.ts`, Session B in `m2-engagement-partner.ts` — with behaviourally identical
bodies, and two exports of one name is a `tsc` failure rather than a style question. It surfaced as
four `TS2300 Duplicate identifier` errors on the first typecheck.

Neither session may edit the other's marker block, so **Session A dropped both from its own block**
and its adapter reads `settlement.upi_payment_link` directly; the two functions stay in
`m2-engagement-customer.ts`, documented and dormant, with the reason written above them. The barrel's
own rule decides the fold — *"everything both parties read the same way ... is exported above from
`m2-engagement-customer` and is deliberately not re-exported here. One name, one home"* — so the gate
should delete the partner twins and restore Session A's two export lines; **Session B's call sites
need no change**, because the barrel name resolves to whichever home survives. Logged in §7.

Session B's file was not touched, read-only, at any point.

#### Two judgement calls worth recording

- **The orchestrator's `m2_booking_fee_not_chargeable` classification is right and this column does
  not contest it.** `await_confirmation` over the `choose_again` asked for in Wave A2R: nothing on
  that screen picks the crew, so there is no other option to choose, and the call site already
  renders it with no retry because waiting is the only true next step.
- **No poll anywhere in this feature.** Every transition on a shift-day is a person acting — a
  supervisor recording the day, the other party tapping settled — on the scale of an evening, and a
  timer on it would be a timer on somebody else's hands. Contrast `features/crew/queries.ts`, which
  does poll because a booking fee settles on a verified provider callback in minutes. **No money is
  in flight here at all**, so there is nothing a clock could be waiting for. `M2_FRESHNESS.attendance`
  (`EXPIRING_STATE`) gives the refetch that matters — the one when the Customer comes back to look.

#### Static gates

From `C:\dev\vsolve\frontend`, on real runs rather than cache hits:

| Gate | Result |
|---|---|
| `npx eslint <changed paths> --max-warnings 0` | clean |
| `npx turbo run typecheck --filter=customer --force` | **1 successful, 1 total** — cache bypass, `tsc --noEmit` |
| `npx turbo run build --filter=customer` | **1 successful, 1 total** — cache miss, 34 routes, no new route added |

**No test was written and none was run.** The smoke script is
`apps/customer/features/shift-day/SMOKE.md` — it starts where `features/crew/SMOKE.md` finishes (a
confirmed booking whose engagement was opened by the verified callback, which is also what creates
one `EngagementStage` per booked day), counts the taps on the happy path, checks the 3-of-4
settlement against the server's own `amount_paise`, and reaches five refusals on purpose.

**Four rows added to the execution plan section 7** — one barrel collision, three contract gaps. The
one to read first is `upi_payment_link`: it is a one-line backend fix and it is currently the
difference between the deep link existing and not.

### Blocked / handed off — Wave A3F

| Date | Task | Blocked on | Logged in plan §7 |
|---|---|---|---|
| 2026-08-14 | `FE-514` UPI deep link | `GET .../shift/` answers `null` for `upi_payment_link` on every request — a serializer field over a model attribute that does not exist. The panel prefers the command response's link and states the absence honestly meanwhile. One-line backend fix. | yes |
| 2026-08-14 | `FE-510` shortfall choice | `DaySettlement.shortfall_choice` is published as the bare enum but rests at `""`; the request shape gets this right and the response shape does not. Membership-tested rather than compared, failing closed. | yes |
| 2026-08-14 | `FE-510` dispute cap | `MAXIMUM_DISPUTED_WORKERS` is enforced and unpublished, so the 40 is hand-copied as a guard rail. The server stays the authority and both drift directions are visible rather than silent. | yes |
| 2026-08-14 | barrel collision | `settlementAmountPaise` / `settlementPaymentLink` written by both sessions in one wave. Dropped from Session A's block; the fold is the orchestrator's at the gate. | yes |

---

### Wave A5P progress — 2026-08-14 · the Customer's side of the A5 project, at 1.31.0

**Built — static gates green, owner manual verification pending.** `M2-FE-611` and `M2-FE-612`, the
two rows Wave A3 was told to leave alone until C5 landed. They are the last of the three placeholder
blocks, and **`features/engagement/view/not-built-yet.tsx` is deleted** with them — no reference
survives anywhere in `apps/customer/**`. (The Partner app keeps its own copy; Session B owns it and
still needs it for `M2-FE-605`/`606`.)

New: `apps/customer/features/project/` — `queries.ts`, `adapters/index.ts`, four view files and
`SMOKE.md`. Changed: the project section at the foot of `packages/query/src/m2-engagement-customer.ts`,
this column's barrel block, `features/engagement/{adapters/index.ts, view/completion-panel.tsx,
view/engagement-screen.tsx, SMOKE.md}`.

#### One read, two slots, and why it is not one block

`GET /engagements/{id}/project/` answers the milestones, the money, the retention, the handover and
whatever recovery is in flight **together**, on the server's own reasoning: they are one project at
five moments, and a client assembling them from separate reads renders four of them against a state
the fifth has left. So the read is issued **once**, in `EngagementScreen`, and handed to three
consumers — `ProjectDecisions`, `ProjectWarranty` and the completion panel, whose third refusal lives
on it. Two hooks would have shared one cache entry and cost nothing extra, but they would also have
produced two loading states and two error messages for one failed request.

The two slots sit at different heights because they are different kinds of thing. `ProjectDecisions`
goes **above** the final acceptance, beside the amendment panel: a proposed replacement carries a
deadline and reprices every unfinished stage, and an unaccepted handover is the thing stopping the
project closing — both are answers owed now, and a Customer who reads prices below a proposal that is
about to change them has read the wrong numbers. `ProjectWarranty` goes **below** it, because the
hold-back is the story after the work is done.

It is gated on `commercial_mode === "managed"`, the same shape `useShiftDay` takes on the other
archetype: the read refuses on an A3 engagement with `m2_stage_transition_not_allowed`, and mounting
it there would put a refusal behind every workforce booking. `isNotAProject` renders that as **nothing
at all** — a screen that should not have mounted is not an error to show anybody.

#### `M2-FE-611` — three things it had to get right and one it had to refuse

**Retention is payout-side money, and the panel says so.** The Customer funds every milestone at
**face value** — nothing in this app subtracts anything from a stage, and the funding controls further
up the same screen would have contradicted any other wording on the same render. What retention
changes is how much of an approved milestone the *vendor* may draw before the warranty ends.

**It is allocated cumulatively and no milestone is named.** The brief was explicit and the backend's
own docstring gives the reason: "held back from the final milestone" stops being computable the moment
an amendment appends one, and a retention released out of what turned out not to be the last milestone
cannot be un-released. So the copy is that it **builds up as each stage is approved and is complete
when the last one is**, and `retention_paise` / `retention_withheld_paise` are rendered as two
published numbers side by side rather than a percentage applied to anything.

**No retention is not "no cover".** `phase: "none"` renders as *"Vsolve is not holding any money back"*
and goes on to say that this is not the same as saying there is no guarantee — the terms are the
estimate's, and this app was never given them. The optimistic error here costs the Customer, and so
does the pessimistic one; the honest sentence is narrower than both.

**A null `warranty_ends_at` renders "we do not have an end date on file", never a date.** The window is
read from the variant's configuration at completion, and an engagement whose configuration was retired
keeps its retention held and waits for Operations. A date invented by this client is a promise the
platform has not made, and a Customer who reads a wrong warranty date reports a fault a week too late.

**Completion names its blocker instead of offering a control that refuses.** Wave A3 offered the button
on `COMPLETING` alone, which meant a project with a newly appended stage showed a control that answers
`409`. `completionBlocker` reads the engagement's own stages in the order the server checks them, and
the handover blocker comes off the project read. The panel is an explanation in all three cases, and
**it approves nothing on the way past** — an accepted amendment can append work after `COMPLETING`, and
that stage keeps its own review. The status is read **from the response**, so `WARRANTY` is worded as
"finished, warranty running" and never as closed.

**The handover is accepted explicitly, and the uncomfortable part is stated.** A `FILE` deliverable
**cannot be opened** — no download route exists for the evidence rail — and that is worse here than on
the evidence viewer, because here the Customer is being asked to *accept* it. The row is joined to the
engagement's own evidence (the project read carries only the file's id) so the panel can report what
the record knows: checked, still scanning, rejected, or **not found at all**, which is its own state
and tells you not to accept on the strength of a filename. A `LINK` says out loud that it is recorded
rather than hosted and that clicking it leaves the platform.

**Warranty issue reporting is a contract gap and is built as the route that exists.** There is no
endpoint at 1.31.0: `m2_stage_dispute` takes only `AWAITING_REVIEW`, and by the time a warranty runs
every stage is settled; `POST /operations/cases/` is staff-only. So the panel names what Vsolve is
still holding, when it releases, that the report goes through support, and that it must be done before
the date because the money is released after it. Deliberately **not** dressed as a missing feature —
the platform has no warranty-claim workflow at all (Wave C6's case machinery), and a "coming soon"
block would imply the money is unreachable meanwhile. It is not. Logged in plan §7.

#### `M2-FE-612` — read C5's code, not the summary, and it changed three decisions

**It is not a checkout, and a screen that presented one would be inventing a charge.** Accepting
refunds what was funded and unearned, drops each unfinished milestone back to unfunded and reprices it,
with `amendment_delta_paise` moving by exactly the difference. The money asked for afterwards is **the
ordinary stage funding that was always coming**. The panel says that in as many words, and there is no
Pay control anywhere on it.

**Operations proposes; the Customer accepts.** Confirmed against the contract and 07 §7 before
building. There is no Customer-side initiation in this app — the only commands are accept and decline
on `POST /project-transfers/{id}/decision/`. On a stalled project with no proposal, the explainer
offers **no control**: a button that only wrote a support ticket would be dressed up as one.

**Nothing predicts a refund.** `refunded_paise` is what *actually* went back and is **zero on a
proposal**. The unearned funding a transfer would return is knowable — `funded − refunded − released`
per transferable milestone — and it is deliberately absent from the client: a conditional number
rendered as a figure is a promise, and this one is conditional on a decision not yet taken. The rule is
stated in words instead.

**The per-milestone table is the point of the screen.** Priced per milestone and never as a lump,
because a replacement who names one number for "the rest of it" has not said which milestones they are
doing. `stage_prices` is an untyped `JSONField` (`unknown` in the client), so `transferStagePrices`
narrows it strictly — plain object, every value a positive safe integer — and **fails closed to null on
one bad entry rather than dropping the entry**, because a table that silently drops a row restates less
work than the two totals are sums over. The fallback renders the two published totals and says the
breakdown is unavailable.

**A cancelled material advance is not refunded; a cancelled work stage's unearned funding is.** One
sentence cannot be true of both, so `isMaterialAdvanceLeftWithVendor` checks **both** the cancellation
and the published reason code — a cancelled *unfunded* material advance cost the Customer nothing, and
calling that a loss would invent one. `material_advance_outstanding_paise` renders as an open question
for support, never as a pending refund and never under a refunded heading.

#### The exclusion trap, caught where the brief said to look

`EngagementStageStatusEnum` gained `CANCELLED` at 1.31.0, and the completion work needed a "does this
stage still owe work?" predicate — precisely the shape that absorbs a new status silently. Written as
**`STAGE_OWES_WORK`, a `Record` over the generated union**, so a ninth value is a `tsc` error here
rather than a change of meaning nobody sees, with a runtime fallback of `true` so an unrecognised value
**blocks** completion instead of being swept past. That is the fail-closed direction: the server is the
authority either way, and the cost of being wrong towards "still open" is one refusal the panel already
explains.

#### RULES §3 audit — both classes, and what was found

**(a) The drifting duplicate.** Three hand-copies, all found and all logged in plan §7:

- `STAGE_OWES_WORK` mirrors the server's `EngagementStage.OPEN_STATUSES`, which is **enforced and
  published nowhere**. The `Record` shape catches a *new* status; what it cannot catch is the server
  **reclassifying an existing one**. Requested as a published field.
- `MATERIAL_ADVANCE_LEFT_WITH_VENDOR` mirrors `projects.CANCELLED_MATERIAL_OUTSTANDING`;
  `cancellation_reason_code` is a bare `string` with no enum. **Fail-soft rather than fail-dangerous**:
  if it drifts the per-milestone block stops rendering and the transfer's own outstanding figure still
  carries the number and the warning, so the money statement survives. Requested as an enum.
- `KNOWN_TRANSFER_STATUSES` is a deliberate runtime list on the existing `KNOWN_AMENDMENT_STATUSES`
  precedent — detecting unknowns at runtime is its whole job, and it fails closed to "we cannot
  describe this" with no controls.

**(b) The column with no writer.** Swept every field this wave reads, and **found none** — checked
rather than assumed, because the 1.30.0 `upi_payment_link` defect was a reader with no writer that four
waves walked past:

- `retention_paise` is written at engagement creation (`engagements.py`), from the frozen warranty terms
  and **only when the estimate advertised a warranty**;
- `retention_withheld_paise` accumulates in `_hold_stage_payout`; `warranty_ends_at` is stamped by
  `_open_warranty_window`;
- **the seed writes both owner-blocked config values** — `warranty_retention_basis_points` and
  `warranty_window_days`, 5% for 90 days, marked dev-only — so the walkthrough runs;
- `stage_prices` / `refunded_paise` are written in `propose_project_transfer` / `decide_project_transfer`;
- `ProjectDeliverable` rows are written by `submit_project_handover`.

One **product-level** near-miss worth recording: the retention path is only reachable end to end because
the Partner's A5 composer actually sends `warranty_terms` (`proposal-draft.ts`, `onsite-draft.ts`) —
verified rather than assumed. The seed does **not** create an estimate carrying warranty terms, so a
seeded walkthrough alone lands on the honest "nothing held" panel and never exercises the other three
phases. The smoke script says so in §0 rather than leaving the owner to discover it.

#### Static gates

```
npx eslint apps/customer/features/project apps/customer/features/engagement
           packages/query/src/m2-engagement-customer.ts packages/query/src/index.ts --max-warnings 0
npx turbo run typecheck --filter=customer --force     # 1 successful, 1 total
npx turbo run build --filter=customer                 # 1 successful, 1 total
```

All three green. **No tests were written and none were run**, per the build-first amendment.

#### Smoke script

**`apps/customer/features/project/SMOKE.md`** — six sections with their seeded preconditions: the
retention panel before completion and its no-warranty variant, the handover and the refusal that keeps
delivery on the platform, the three completion blockers, `WARRANTY` then release, the full transfer
(propose from the shell as Operations, decline, accept, materials left behind), and eight exception
states worth forcing. `features/engagement/SMOKE.md` §10 is rewritten: it listed these as three
not-built blocks and now **inverts the check** — a dashed block appearing anywhere on a Customer
engagement screen means something was reverted.

**Seven rows added to plan §7** — one frozen-file request (`m2-keys.ts`: a `projects` namespace, a
freshness tier, and the two command rows) and six contract gaps. The one to read first is the warranty
claim: `M2-FE-611`'s task row asks for issue reporting and **no endpoint in this contract can carry
one**, which is a C6 proposal rather than a frontend workaround.

### Blocked / handed off — Wave A5P

| Date | Task | Blocked on | Logged in plan §7 |
|---|---|---|---|
| 2026-08-14 | `FE-611` warranty claim | No endpoint at 1.31.0 can take a fault reported after completion — `m2_stage_dispute` accepts only `AWAITING_REVIEW`, `/operations/cases/` is staff-only. Built as the support route plus what is still held; no control that would 404. | Yes — needs a C6 proposal |
| 2026-08-14 | `FE-611` completion blocker | `EngagementStage.OPEN_STATUSES` is enforced server-side and published nowhere, so it is hand-copied as a `Record` over the generated union. A *new* status is a `tsc` error; a **reclassified** one is not. | Yes — additive field request |
| 2026-08-14 | `FE-612` per-milestone prices | `ProjectTransfer.stage_prices` is an untyped `JSONField`, and it is the authoritative list of what transfers. Narrowed strictly at the call site, failing closed to the two published totals. Not blocking. | Yes — shape request |
| 2026-08-14 | `FE-612` cancellation reason | `cancellation_reason_code` is a bare string with no enum, and it is not on `EngagementStage` at all — so the engagement workspace words a cancelled row from `kind` alone. Fail-soft. | Yes — two rows |
| 2026-08-14 | project cache keys | `m2-keys.ts` has no `projects` namespace, no project freshness tier and no row for `accept_handover` / `decide_project_transfer`. Composed from the factory and invalidated by hand at exactly the prefixes `stageScope` returns, so the two cannot drift. | Yes — frozen-file request |
| 2026-08-14 | Customer's delay claim | **Plan gap, not a contract gap.** `m2_project_delay_claim_decide` is the Customer's command and `ProjectPlan.delay_claims` is published for them, but no Customer task row owns it — `M2-FE-605` is the vendor's raise. A `SUBMITTED` claim shifts every later milestone on acceptance and **expires on silence**, with no Customer surface in any wave. Out of scope here and **not** half-built. | Yes — needs a plan row |

### Wave A4 progress — 2026-08-15 · Operations cases and money, at 1.32.0

**Built — static gates green, owner manual verification pending.** `M2-FE-706` through `M2-FE-711`,
in the **admin** app (product label Operations), against contract 1.32.0. This is Session A's only
wave outside `apps/customer/**`; the ownership swap is the brief's, and the route half of it is the
orchestrator's ruling recorded in the wave stub above and in plan §7.

New: `apps/admin/features/m2-cases/` — `queries.ts`, `model/{cases,money}.ts`, five view files and
`SMOKE.md`. New routes: `app/operations/cases/{money,signals,touches}/page.tsx`. Changed: one file,
`app/operations/cases/page.tsx`, re-mounted. Nothing else in `apps/admin/**` was opened for writing,
and nothing in `apps/customer/**`, `apps/partner/**` or `packages/**` was touched at all.

#### The first decision: this is not a second case system

`08-frontend-information-architecture.md` §3 lists `/operations/cases` as an **existing route** and
says in as many words that "M2 case kinds join it rather than forking a second case system". Wave C6
agrees from the other side: it added no `/operations/m2-cases/` path. It widened
`OperationsCaseKindEnum` from nine values to fourteen, widened the subject from three nullable ids to
five, widened `OperationsCaseEventKindEnum` from eight to fourteen, and hung three commands off the
case paths that already existed.

So the mount changed and the endpoints did not. `features/m2-cases/queries.ts` **imports** the queue,
detail, claim, escalate, resolve and note hooks from `features/cases/queries.ts` and adds only what
1.32.0 published. Two query modules over one endpoint would have been two caches of one case, and the
second one invalidated would have been the one on screen. It also means the M1 console's two rules —
`allowed_resolutions` is the server's, and a note never moves a case — are inherited rather than
re-argued, which is the right way round.

`features/cases/**` is not this session's to delete and is left exactly as it was. `CaseConsole` is
now unreferenced by any route; `features/dashboard/dashboard-view.tsx` still imports its *queries*,
which is why the queries file is the one that had to stay shared. Retiring the old view is an
orchestrator call at the gate, not a mid-wave edit to another column's file.

#### Four screens behind one nav entry

The sidebar lives in `features/session/operations-shell.tsx`, which is Session B's file. Rather than
ask for three more rows in a nav that is already thirteen long, the four A4 screens hang off the
single existing **Cases** entry as in-page tabs: the queue, **Refunds and holds**, **Review signals**
and **Touches**. They belong together anyway — all four are one job seen from four angles: somebody
looking at a claim, the money behind it, the signals around it, and what it cost to work. Logged in §7
as a decision rather than left as an omission somebody helpfully "fixes" later.

The selected case is a **query parameter**, not component state. A case id is a thing operators paste
to each other in chat, and `?case=<id>` survives a reload and a handover. That is also why the money
screen's chargeback result and every signal row link to `/operations/cases?case=<id>` rather than
telling somebody to go and find it.

#### The four traps 1.32.0 named, and where each one is answered

The C6 changelog was written as this wave's briefing and calls out four. Each is answered in a
specific place, so a reviewer can check them one at a time.

**1 — kinds and subjects widened.** Every map in `model/cases.ts` is `Record<GeneratedEnum, …>`:
`CASE_KIND_COPY`, `CASE_STATUS_LABEL`, `SEVERITY_TONE`, `TEAM_LABEL`, `EVENT_COPY`,
`EVIDENCE_PARTY_LABEL`, `BOOKING_FEE_READING`, `TIMELINE_TONE`. The next widening is a `tsc` failure
in one file rather than a blank badge in production. The queue's kind filter and its status filter are
**derived from those maps' keys** rather than hand-listed, so a new value cannot be visible in the
queue and unreachable from the filter meant to find it.

The subject is `caseSubjects()`, which enumerates **all five** nullable ids and returns every one that
is set. The reader that would have shipped without thinking — check `booking_id`, then `order_id`,
then `partner_id`, give up — renders every cancellation conflict, attendance dispute and disputed
milestone as a case about nothing, because those are exactly the kinds whose subject is the
requirement or the engagement. Zero subjects gets its own sentence rather than an empty row.

**2 — six new event kinds.** `EVENT_COPY` covers all fourteen and `eventCopy()` falls back to the raw
code for a fifteenth. The six C6 added carry their meaning in `context` rather than `body`, which is
precisely why a trail keyed on `body` alone showed six kinds of blank line — so `eventContextPairs()`
renders the context object as labelled pairs. It reads `unknown` defensively and never asserts a
payload shape it was not told.

**3 — `WAIVED` is not a charge.** `BOOKING_FEE_READING` gives every one of the eight statuses a
sentence and a `collected` flag, and the money card prints an amount as money only when `collected` is
true. `WAIVED` — the free re-dispatch after a vendor no-show — renders as "Replacement crew — no
charge" with **"Published amount ₹X — not collected."** So do `OFFER_ACCEPTED`, `PENDING` and
`FAILED`, which have the same shape of problem and were not on the changelog's list.

**4 — `within_budget: null` is not `false`.** `BudgetVerdict` has three branches for three states,
and the null one says the owner has not set a budget, that the touch count is the measurement, and in
so many words that "This is not a pass and it is not a breach." Rendering it green would report a
design as inside an economics envelope nobody has drawn; rendering it red would page somebody about
every request on the platform. The smoke script has a shell one-liner to force the state, because it
is the assertion most likely to rot.

#### The Gate 3 predicate, checked deliberately

The brief names it: a predicate that decides membership **by exclusion** absorbs a new enum value and
no exhaustive map catches it. Three places in this wave could have taken that shape and none does.

- `isCaseClosed` lists `RESOLVED` and `CANCELLED` rather than testing "not open".
- Payout holding is read from the server's own `holds_payout` and never re-derived from the kind,
  even though nine kinds hold and the list is knowable. The server owns which; this renders it.
- `MONEY_EVENT_TYPES` is an **inclusive** whitelist of four timeline event types. This one has no
  enum to key on — `TimelineEvent.type` is a bare string (§7) — so it is kept safe in the only
  direction available: everything unrecognised is **counted and reported** as "N other events on this
  request are not money", never absorbed into the money list. A new money type arrives
  under-reported, which is visible, rather than mis-labelled, which is not.

#### `M2-FE-707`: what the consequence sentence actually says

The task row asks for "the server's calculated remedy before authorized confirmation". Operations
cannot read that remedy — see the gap below — so the consequence copy is built from documented server
behaviour instead, which is the part that can be stated truthfully:

- **Resolve** says what is recorded, that the payout hold is released, and that an overturned appeal
  brings the hold back but not the money that moved in the meantime.
- **Overturn an appeal** says the case reopens to in-progress and its resolution is *cleared* — it
  does not get a new outcome from this — and that the hold returns "because the reason the money was
  released, this case being finished, has just stopped being true".
- **Move the response deadline** says who gets until when, and that it cannot be moved back. The
  field pre-checks against `server_now` and the existing deadline, and the server refuses a backwards
  move rather than clamping it.
- **Override** requires the word `override` typed to unlock, says it is permanent and under your name,
  and says that money already moved does not move back on its own.
- **Record a chargeback** says a case opens, that it freezes the vendor earnings funded from that
  payment, and that the fee row is deliberately left where it is.

`ConfirmAction` from `packages/ui` requires `consequence`, which is why every one of these has a real
sentence rather than "Are you sure?".

#### `M2-FE-708`: three reads, three questions, not merged

`GET /operations/reconciliation/` answers *what is outstanding across the business*. The case queue
summary answers *how much is frozen behind an open claim*. The request timeline answers *what happened
to the money on this one request*. They are rendered as three panels because they are three questions;
one merged "money" figure would have no owner and no statement behind it.

Nothing on the screen is arithmetic. Every number is a server integer formatted once by `formatMoney`
or a server count printed as it arrived. The forfeit split prints its two shares underneath the fee
and does not add them. The one conversion in the feature is rupees→paise on the operator's own
chargeback input, which is a unit conversion on typed input rather than a derived figure.

**There is still no staff read of an individual refund** and 1.32.0 did not add one —
`GET /refunds/{id}/` filters on `order__customer=user`. 1.32.0 added the aggregate. The screen says so
and links to `/finance`, rather than showing an empty panel labelled "Refunds", which reads as "there
are none" — a claim about money made from no data at all. That is the M1 refund console's own
argument, reused.

#### `M2-FE-709`: the honest half and the missing half

The dual confirmation happens between the parties, in their own apps: one side cancels, the other
confirms or disputes, disputing settles nothing, and silence settles nothing either — a lapsed window
arrives in Operations through the same machinery a dispute uses, carrying `confirmation_lapsed`. What
lands here is the `CANCELLATION_CONFLICT` case, which is a payout-holding kind, so **opening the case
is the hold**. Its three outcomes are `CANCELLATION_UPHELD`, `CANCELLATION_REVERSED` and `SETTLED` — a
documented finding either way, never "reviewed".

What is missing is not small. `contact_disclosed` is the field that makes a cancellation
dual-confirmation in the first place, and Operations cannot read it: every published read of a
cancellation goes through a party check, and the request timeline's `CANCELLATION` detail publishes
only the id, status, actor role, reason code and remedy code. So does `work_reported_started`, so does
`confirmation_due_at`, and so does the per-product `remedy` breakdown — on the screen where somebody
decides who keeps the money. The panel **says that on screen** rather than inferring it from the case
summary, and §7 carries the fix: widen the timeline's `CANCELLATION` detail, which needs no new path
and no new permission surface.

#### `M2-FE-710`: two signals, and two absences that are the point

`GAP-009` and `GAP-010` both end with the same instruction — "not automatic punishment — a review
signal, consistent with the plan's own stance" — so the screen opens by saying what a signal is here
and never delivers a verdict. Off-platform claims and chargebacks are live queues over the case list
filtered by kind; every row ends at a case, and a case ends by naming what happened, including when
what happened is that the account was not borne out. Even `SUBSTANTIATED` records only that the
evidence bore the account out; what follows is a separate decision against a threshold nobody has set.

Slot squatting and price-band clustering have **no published read whatsoever**, and the two panels say
so, with the reason. The temptation was to approximate one — count `NON_RESPONSIVE` rejections, or
compare teaser bands — and both are the fabricated-signal failure the plan forbids. A made-up number
on a screen somebody judges a vendor from is worse than a gap, because it looks like evidence.

#### Static gates

| Gate | Result |
|---|---|
| `npx eslint apps/admin/features/m2-cases apps/admin/app/operations/cases --max-warnings 0` | **clean** |
| `npx turbo run typecheck --filter=admin --force` | **1 of 1**, real run, cache bypassed |
| `npx turbo run build --filter=admin` | **1 of 1** — and the route table names all four: `/operations/cases`, `/operations/cases/money`, `/operations/cases/signals`, `/operations/cases/touches`, every one `ƒ` (dynamic) |

Worth recording because it is the kind of thing that reads as a failure to whoever runs it next: for
most of this wave the project-wide gate was **red on a file this wave never opened** —
`features/m2-requests/view/assisted-capture.tsx:346`, Session B's, mid-edit, `tax_paise` missing from
an assisted-proposal body union. `tsc` reports every error in the project, so a concurrent column's
in-flight file makes the shared gate unusable as evidence about either half. This wave's half was
therefore proved in isolation first, with a scratch `tsconfig` restricted to `features/m2-cases/**`
and `app/operations/cases/**` — clean, and **not committed**. Session B's fix landed before the gate
and both runs above are the real, green, whole-app ones.

Session B's `/operations/requests/[requirementId]` is in that same route table, which matters here:
the cancellation-conflict panel, the money screen and the case subject row all link to it. Those links
are live rather than aspirational.

#### The two-class audit (`RULES.md` §3)

**(a) The drifting duplicate.** The frontend form of this is a hand-copied enum that the compiler
cannot see. Audited every list in the feature. Eight maps are keyed on generated enums and cannot
drift. Two lists were hand-written and both were fixed during the wave: the status filter is now
`Object.keys(CASE_STATUS_LABEL)` and the kind filter is `Object.keys(CASE_KIND_COPY)`. Three maps are
deliberately `Record<string, …>` **with a fallback** rather than exhaustive — resolution meanings,
financial-exception kinds, and the timeline's money types — because none of those has a published
enum; each falls back to the raw code and none can render blank. One genuine hand-copy remains and is
logged: `MONEY_EVENT_TYPES`, discussed above, safe by inclusion.

**(b) The column with no writer.** Traced every configuration value this wave reads back to a writer
in `seed_m2_demo`. All five C6 values have one: `case_response_window_hours`,
`case_appeal_window_hours`, `chargeback_alarm_basis_points`, `chargeback_alarm_min_charges` and
`operations_touch_budget_per_request`, written onto **both** variant configurations from one
`_C6_RECOVERY_POLICY` mapping so the two cannot drift. No reader in this wave is unfed. Two related
findings worth recording rather than fixing: the seeded demo case deliberately passes
`response_due_at=None` (a partner-subject case has no requirement to read a window from), and
`_hold_m2_payouts` returns early for a case with no requirement and no engagement — so the seeded case
is correctly `holds_payout: true` with an empty held list. Both are rendered as what they are; the
copy for zero held entries was rewritten mid-wave once this was traced, because "0 entries frozen"
under a **Holding payout** badge reads as a bug and is not one.

#### Smoke script

**`apps/admin/features/m2-cases/SMOKE.md`** — eight sections with their seeded preconditions, and a
table at the top of what the seed deliberately does **not** create, because two of the six screens are
supposed to be empty on a fresh database and an empty screen that is meant to be empty is otherwise
indistinguishable from a broken one. The two sections to run first are §3's `WAIVED` check and §6's
budget-clearing one-liner: they are the two traps whose wrong answer is silent.

**Nine rows added to plan §7** — one frozen-file request (`m2-keys.ts`: an `operations` namespace for
the four 1.32.0 reads, with the freshness tier each was given and why), six contract gaps, and two
cross-session records (the route-split ruling, and the `useRequestTimeline` fold request). The one to
read first is the cancellation gap: it is the only one where the screen has to tell an operator that
it cannot see something they need.

### Blocked / handed off — Wave A4

| Date | Task | Blocked on | Logged in plan §7 |
|---|---|---|---|
| 2026-08-15 | `FE-709` cancellation facts | Operations has no read of a cancellation record — every published one is party-scoped, and the timeline's `CANCELLATION` detail omits `contact_disclosed`, `work_reported_started`, `confirmation_due_at` and the `remedy` breakdown. Built fail-closed: the panel names the gap on screen. | Yes — widen the timeline detail |
| 2026-08-15 | `FE-707` server remedy | Same root cause. The task row asks for the calculated remedy before confirmation; it is on the cancellation record. Consequence copy is built from documented server behaviour instead, which is truthful and is not the same thing. | Yes — same row |
| 2026-08-15 | `FE-710` slot squatting | No Operations read exists for `NON_RESPONSIVE` rejections or any per-vendor count of them (`GAP-009`). Rendered as a named absence, deliberately with no number. | Yes |
| 2026-08-15 | `FE-710` price band | No reference band per variant and no clustering read (`GAP-010`); the band is a Customer-facing teaser field. Rendered as a named absence. | Yes |
| 2026-08-15 | `FE-708` one refund | `GET /refunds/{id}/` is still Customer-scoped at 1.32.0. The aggregate is rendered; the record links to `/finance`. Not blocking. | Yes |
| 2026-08-15 | `FE-708` money event types | `TimelineEvent.type` is a bare string with no enum, so the money whitelist is hand-copied from `operations.py`. Safe by inclusion — unrecognised types are counted and reported, never absorbed. | Yes |
| 2026-08-15 | Operations query keys | `m2-keys.ts` publishes no Operations namespace and `keys.ts` belongs to no session. Defined locally under `queryKeys.operations.all` so broad invalidation still reaches them; the M1 case cache is shared rather than forked. | Yes — frozen-file request |
| 2026-08-15 | admin project gate | **Cleared.** `turbo typecheck` and `turbo build --filter=admin` were red for most of the wave on `features/m2-requests/view/assisted-capture.tsx` (Session B, in flight). B's fix landed before the gate; both now run green whole-app, 1 of 1, with all four A4 routes in the table. | Not a §7 row — a sync note |

### Wave A4 secondary — 2026-08-15 · the Customer's delay-claim decision (`M2-FE-614`)

**Built — static gates green, owner manual verification pending.** The one plan gap this column
logged at Wave A5P and nobody owned, closed after A4 was gated. It is a **new task row**, not an
existing one: `03-frontend-tasks.md` now carries `M2-FE-614` under FE5B beside the other three
project rows (613 was already taken by the amendment-version panel).

New: `apps/customer/features/project/view/delay-claim-panel.tsx`. Changed: the project section at
the foot of `packages/query/src/m2-engagement-customer.ts` (this column's file), this column's block
in the shared barrel, `features/project/{queries.ts, adapters/index.ts, view/project-panels.tsx,
SMOKE.md}`. Nothing frozen was touched and no new contract need was found.

#### Why this was the gap worth closing rather than deferring

`m2_project_delay_claim_decide` is published as the **Customer's** command and
`ProjectPlan.delay_claims` is published for them to read. The screen was simply missing. What makes
that more than an omission is the direction the claim fails in: `sweep_delay_claims` **expires** an
unanswered claim and the agreed dates stand. That is the right default and it is deliberate —
treating silence as consent would let a professional move somebody's schedule by filing on a Friday
afternoon — but it is a protection *for the Customer* only if the Customer was asked. With no
screen it is a deadline running against somebody who was never shown it, and the honest claims lapse
beside the opportunistic ones. The vendor loses their extension and the Customer never learns their
dates were in question.

#### What the panel says, and the four sentences that carry it

**"Answering costs nothing either way."** First, above everything, because it is the first question
anybody reads a request-for-days with. There is no amount on the request, none on the record and
none in the adapter — a delay that costs money is extra work, extra work is an amendment the
Customer accepts and pays for, and one record that could do both would let "the site was locked"
arrive as a bill. `DelayClaimView` has no money field and none may be added.

**"This milestone and every milestone after it move by N days."** Stated before the tap and repeated
in the confirmation, because `_shift_schedule_from` moves the whole tail: a project is a sequence and
a week lost on the first fix is a week lost on everything after it. A milestone with no date is said
to stay without one, and the originally agreed dates are said to stay on record, because
`original_terms` is untouched and the difference between agreed and due is the extension somebody
accepted.

**"Turning it down cancels nothing and penalises nobody."** A Customer who reads "no" as a complaint
will choose "yes" to avoid making one, and a schedule moved out of politeness is worse for both
parties than a refusal.

**"If you do not answer, the request lapses and the dates you agreed stand."** The expiry is stated
as what it is rather than left as a silent default, and the professional's ability to ask again is
stated with it — that constraint (one live claim per *milestone*) is what stops the re-ask becoming
a queue.

#### Where it sits, and why every claim renders

Above the transfer and the handover in `ProjectDecisions`. Of the three answers a Customer can owe on
a project, this is the only one they **lose** by not scrolling: a transfer left unanswered keeps the
current vendor, an unaccepted handover keeps the project open, and an unanswered delay claim expires
in the Customer's favour but without them knowing they were asked.

Every claim renders, live and settled. One live claim per milestone is a database constraint, so a
three-milestone project can genuinely have three at once; answering two of three while the screen
implied the project was settled would be the screen lying about a clock that is still running. The
settled ones read from `applied_days` rather than `extension_days` — what the schedule actually moved
by is the number a dispute about lateness turns on, and it is published rather than assumed equal to
what was asked.

#### The fail-closed rules this reused rather than re-argued

- `isKnownDelayClaimStatus` is a named list of five, and an unknown sixth renders **no controls** —
  `isKnownTransferStatus`'s rule, for a sharper reason here: the optimistic fallback is "a live
  request you can accept" and accepting moves every remaining date on the project.
- `settledDelayClaims` names the four settled states rather than spelling itself as "not
  `SUBMITTED`". An exclusion would make a sixth status arrive as *history* on the surface where a
  new state most likely means somebody still has to answer.
- Expiry is **not** checked against the device clock. `expires_at` is presentation; the sweep and
  the command decide server-side, and a claim hidden early by a fast clock is a claim the Customer
  never got to accept. `isAmendmentDecidable` and `isTransferDecidable` both already work this way.
- The idempotency key carries the answer, not the note. A dropped connection replays the same
  decision; a changed mind is a genuinely different command; a corrected typo in the note is not.
- Evidence is joined off the engagement read and worded in the **handover panel's** words for the
  same scan states. Two screens describing one scan status differently is the failure that wording
  exists to prevent. An id with no record on this engagement is counted and reported, never dropped.

#### Static gates

| Gate | Result |
|---|---|
| `npx eslint apps/customer/features/project packages/query/src/m2-engagement-customer.ts packages/query/src/index.ts --max-warnings 0` | **clean** |
| `npx turbo run typecheck --filter=customer --force` | **1 of 1** |
| `npx turbo run build --filter=customer` | **1 of 1** |
| `npx turbo run typecheck --filter=@vsolve/query --filter=admin --filter=partner --force` | **3 of 3** — run because the helpers landed in a shared package |

One caveat, and it is not this column's: `npx turbo run typecheck` across **all** packages fails at
`@vsolve/api-client:generate:check` — *"Generated types are stale. The published OpenAPI contract has
changed since schema.d.ts was generated."* `contracts/openapi/v1.yaml` has uncommitted modifications
from the concurrent backend wave, timestamped after the client was last generated. `generated/**` is
frozen and RULES §7 puts `pnpm contract:generate` with the orchestrator at the gate, so it was left
alone. Everything built in this session compiles against the **committed** client.

#### Smoke script

`apps/customer/features/project/SMOKE.md` §7, with the shell snippet that raises a claim as the
vendor and eight forced states — expiry, answering an expired one, an unknown status, two live claims
at once, evidence in each scan state, an evidence id with no record, and a claim with no description.

**Two rows appended to plan §7**: one closing the gap, one recording two shapes worth knowing —
`reason_code` is an open slug and is carried verbatim rather than mapped (a display map falls through
on exactly the interesting cases), and the claim's evidence inherits `M2-FE-611`'s open gap, so a
Customer deciding a delay can be told a photograph is checked and held and still not be able to look
at it.

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

- [ ] `M2-FE-425` The preset capture: skill, headcount, dates and the 3–4 price-moving facts —
  opened from the catalog's `Book a crew` action, never the four-screen flow.
- [ ] `M2-FE-426` The published rate and its inclusion list on screen **before** booking; fails
  closed on `m2_rate_card_unavailable` — never a guessed price.
- [ ] `M2-FE-427` The cascade holding state ("confirming your crew — usually within 2 hours") and
  the honest fallback handoff past the configured threshold — nothing charged, the quote flow takes
  over.
- [ ] `M2-FE-428` The booking-fee checkout: held-offer gating (`m2_booking_fee_not_chargeable`),
  pending as `m2_booking_fee_payment_pending` (202) with nothing to press, verified-callback-only
  hardening — the callback also creates the engagement.
- [ ] `M2-FE-429` Forfeit and refund states: the free-cancel window until T hours before the slot;
  the forfeit split on customer no-show / locked gate / late cancel (lead travel compensation +
  platform share); full auto-refund plus free re-dispatch on vendor no-show.

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
- [ ] `M2-FE-510` Confirm or dispute the day's attendance in **one tap**. Per-worker detail captured
  only inside the dispute flow. **Wave III — needs C4's attendance model.** An honest
  not-built-yet block sits where it goes.
- [~] `M2-FE-511` Acknowledge crew changes, approve/reject time extensions, confirm completion or open
  an issue inside the documented window. **Built, minus crew-change acknowledgement (C4).**
- [~] `M2-FE-512` Partial service, replacement, refund, dispute and closure in one chronological timeline.
  **Built** — one feed, `GET /engagements/{id}/events/`, nothing synthesised.
- [ ] `M2-FE-514` **Revision 4 — with C4's settlement model.** The Customer's evening "Day settled?"
  one-tap with the UPI link at the exact published amount, and the per-worker-day settlement view: a
  3-of-4 day settles at 3 workers' published rate, with the shortfall choices — continue short, add
  a day, or cancel the shortfall free.
- [ ] `M2-FE-515` **Revision 4.** The one-tap "extra demanded in cash" report — a standing hit,
  removal on a pattern; genuine extras route to the amendment panel at the card's published add-on
  rates.

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
Route files under `app/operations/**` belong to Session B; hand them your route needs at Gate 4.

- [ ] `M2-FE-706` Case intake and review: cancellation conflict, no-show, attendance, safety incident,
  stage, quality, payment, off-platform claims.
- [ ] `M2-FE-707` Reason, evidence and confirmation before high-impact actions; show the server's
  calculated remedy before authorized confirmation.
- [ ] `M2-FE-708` Refund and payout states from ledger-backed APIs: pending, failed, reversed, reconciled.
- [ ] `M2-FE-709` Dual-confirmation cancellation after contact disclosure; disagreement routes to review.
- [ ] `M2-FE-710` Leakage, slot-squatting and price-band indicators as **review signals with evidence
  and history** — never an automatic guilt label.
- [ ] `M2-FE-711` Surface the Operations-touches-per-request measure so the design can be checked
  against the approved unit economics.

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
| A2R | `FE-425..429` (revision 4: rate-card front door) | `[ ]` | `[ ]` | Not started — blocked on backend C2R publishing the rate-card contract. The Wave A2 unlock surface stays as the fallback. |
| A3 | `FE-509..512`, `FE-608..613` | `[~]` 7 of 10 | `[ ]` | **Wave J (2026-08-14) consumed `EngagementStage.kind`** across the list, the workspace and the stage review, and re-pointed the event and amendment reads onto the factory's own keys and tiers — see the Wave J section. The shared spine's Customer half: two lists, the stage review, amendments, the agreement history, the event record and completion. **Wired and reachable** — 3 new routes, plus the header links that were missing for three waves. `FE-510`/`611`/`612` are Wave III by instruction and render honest not-built-yet blocks. Owner verification pending; see the 2026-08-13 Wave A3 section and `apps/customer/features/engagement/SMOKE.md`. Revision 4 adds `FE-514`/`FE-515` (Day-settled tap, settlement view, cash-demand report) — not started, with C4. |
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

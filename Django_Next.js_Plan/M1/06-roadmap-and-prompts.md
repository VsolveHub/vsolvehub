# M1 Roadmap and Execution Prompts

Companion to [`task.md`](./task.md). That file says **what** the state is. This one says **what to
do next, in what order, with what prompt, under which skills**.

Every prompt below is copy-pasteable into a fresh session. Each one is self-contained on purpose —
paste it cold and it will still work.

---

## 0. Standing rules for every task in this roadmap

Put these in front of any prompt you run. They are the difference between "it works on my machine"
and industry-ready.

```text
STANDING RULES (apply to every task):

1. Invoke the skills named in the task. Announce "Using [skill] to [purpose]" before starting.
2. Django owns pricing, authorization, assignment, payment and workflow. The browser derives
   none of them. If a number, deadline, fee, status or permission is not in the response,
   it does not get rendered.
3. Never invent an endpoint, field, enum value, error code or status. If the generated
   TypeScript or contracts/openapi/v1.yaml does not have it, stop and say so.
4. No mock, placeholder, sample or fallback data in any production path. Real server data or
   an honest empty state. Legitimate error handling is not fallback data and stays.
5. Do NOT run the full Playwright suite or the whole test matrix on every iteration.
   Per iteration: the focused unit tests for files you touched + `pnpm typecheck` + `pnpm lint`.
   Browser tests run ONCE, at the task's final gate.
6. Never store OTPs, session/CSRF tokens, exact address text, KYC, bank data or payment
   payloads in browser storage, logs or analytics.
7. Mutations never auto-retry unless the command is idempotent AND the identical request
   carries a stable key. Version conflicts refetch server truth before another decision.
8. Read the existing pattern before writing a new one. This repo has one way to do auth
   guards, one query-key factory, one error presenter, one idempotency helper. Match them.
9. Commit at the end of the whole task, not after each file.
```

### The skill chain, and when each link fires

| Phase | Skill | Fires when |
| --- | --- | --- |
| Shape the work | `superpowers:brainstorming` | Any task with unresolved product/UX decisions — FE-10, FE-14, BE-09. Skip for mechanical work. |
| Write the plan | `superpowers:writing-plans` | Any task over ~3 files. Produces the checkpointed plan the next phase executes. |
| Isolate | `superpowers:using-git-worktrees` | Any task you want kept off the current very dirty tree. |
| Build | `superpowers:test-driven-development` | Every backend command and every money/state calculation. Non-negotiable for BE-09/BE-10. |
| Build UI | `frontend-design:frontend-design` | New customer-facing surfaces — FE-10, FE-14, FE-15. |
| Execute a written plan | `superpowers:executing-plans` | Running a plan produced earlier, with review checkpoints. |
| When it breaks | `superpowers:systematic-debugging` | Any failure. Before proposing a fix, not after. |
| Before claiming done | `superpowers:verification-before-completion` | Every task. Evidence before assertions. |
| Review | `superpowers:requesting-code-review` → `/security-review` | Every task gate. `/security-review` is mandatory for FE-10 and all of BE-09/BE-10. |
| Tidy | `/simplify` | After a task lands, before commit. |
| Land it | `superpowers:finishing-a-development-branch` | End of each numbered step. |

`/code-review ultra` is user-triggered and billed — run it yourself at the end of FE-10 and BE-09.
Claude cannot launch it.

---

## The order, and why

| # | Task | Backend dep | Effort | Why here |
| --- | --- | --- | --- | --- |
| 0 | Commit FE-13 | none | minutes | 21 untracked files are one `git clean` from gone |
| 1 | **FE-10 Customer payment** | **none — published since 1.10.0** | L | Your reported gap. Closes the money loop. Highest value in the repo. |
| 2 | **FE-14 Customer shell** | none | M | Customers cannot click to cart, bookings or login today. FE-10's redirect return needs a real landing. |
| 3 | BE-07 hardening | — | M | BE-09 trusts its outputs |
| 4 | BE-OPS worker/beat + `docs/adr/` | — | M | BE-09/BE-10 both assume it; eager-Celery tests hide real failures |
| 5 | FE-15 account · FE-16 ops surfaces | none | M each | Published contracts with no UI. Parallelisable. |
| 6 | **BE-09 fulfilment (B8)** | — | **XL** | Largest remaining body. Everything post-payment is dark without it. |
| 7 | FE-11 active booking + partner work | BE-09 | L | Unblocked by 6 |
| 8 | BE-10 cases/ledger/payout | BE-09 | XL | Financial + operational closure |
| 9 | FE-12 ops + partner earnings | BE-10 | L | M1 completion gate |

Steps 1 and 2 have **zero backend dependency**. Start today.

---

# Step 0 — Commit FE-13 (Partner shell)

```text
The Partner signed-in shell is built but entirely untracked — 21 files including
app/login/, app/dashboard/, features/session/, e2e/partner-shell.e2e.ts.

Using superpowers:verification-before-completion:

1. Run ONLY the focused checks: the unit tests under apps/partner/features/session,
   plus `pnpm typecheck` and `pnpm lint`. Do not run the full suite.
2. Run `pnpm exec playwright test e2e/partner-shell.e2e.ts` — this once, since it has
   never been executed and gates a commit.
3. Rename Django_Next.js_Plan/M1/FE-11-partner-shell-brief.md to
   FE-13-partner-shell-brief.md and update the ID inside it. FE-11 already means
   "Customer active booking + Partner fulfilment UI" on the board.
4. Report actual output. If anything fails, stop and show me — do not fix and re-claim.

Then commit the Partner shell work as one commit. Do not commit the unrelated
modified files in the tree.
```

---

# Step 1 — FE-10: Customer payment ★ START HERE

**This is the missing "Continue to Payment".** The backend has been ready since OpenAPI 1.10.0 and
has **zero frontend consumers** — `grep` for `payment-attempts` across `frontend/**` returns nothing.

### Contract you are integrating (all in generated types, all live)

| Endpoint | Use |
| --- | --- |
| `POST /api/v1/payment-attempts/` | Create an attempt for a confirmed Booking Group |
| `GET /api/v1/payment-attempts/{id}/` | Poll/read attempt truth after return |
| `POST /api/v1/payment-attempts/{id}/reconcile/` | Resolve an ambiguous outcome |
| `POST /api/v1/checkouts/{id}/payment/` | Checkout-scoped payment entry |
| `GET /api/v1/orders/{id}/` | Order + per-unit `PaymentAllocation` |
| `GET /api/v1/refunds/{id}/` | Refund state |
| `GET /api/v1/tax-documents/{id}/` | Immutable invoice / credit note |

Provider is the **fake adapter** until Razorpay live credentials land. Build against the published
boundary, not against Razorpay's SDK docs.

### The prompt

```text
[paste STANDING RULES]

TASK: FE-10 — build the Customer payment surface in frontend/apps/customer.

Skills, in order:
  1. superpowers:brainstorming — settle the flow before any code. Specifically:
     where payment lives as a route, what happens on provider redirect return,
     what the customer sees while a webhook has not yet arrived, and what
     "ambiguous" looks like on screen.
  2. superpowers:writing-plans — write the plan to a file with checkpoints.
  3. frontend-design:frontend-design — this is a money screen; it must not look
     templated. Match the existing @vsolve/ui token system.
  4. superpowers:test-driven-development — every state transition gets a failing
     test first.
  5. superpowers:verification-before-completion, then /security-review.

READ FIRST, do not skip:
  - frontend/apps/customer/features/booking/group/view/workspace.tsx  (where the
    journey currently ends — handleConfirm / createCheckout)
  - frontend/apps/customer/features/booking/group/view/group-result.tsx  (the
    screen to replace; its "Payment genuinely does not exist yet (BE-08)" comment
    is now FALSE and must go)
  - frontend/apps/customer/features/bookings/queries.ts  (the polling + cursor
    pattern to copy)
  - frontend/apps/partner/features/offers/queries.ts  (the stable-key idempotency
    pattern to copy)
  - packages/api-client/src/idempotency.ts, packages/query/src/{polling,server-clock,
    error-presentation}.ts
  - backend/apps/commerce/{models,views,services,providers}.py  (server truth)

BUILD:
  1. Route: app/(flow)/bookings/[groupId]/pay/page.tsx — dynamic, no-store, noindex.
     Payment belongs to a confirmed group, not to a floating /checkout.
  2. features/payment/queries.ts — typed hooks over the endpoints above, keys from
     the shared factory, ONE stable idempotency key per logical payment attempt
     (a changed group version mints a new key).
  3. The CTA: a real "Continue to payment" in group-result.tsx, enabled ONLY when
     the server says the group is payable (ALL_UNITS_HELD / PAYMENT_PENDING).
     Never enable it from a status string the client guessed.
  4. Provider boundary: redirect out, return to a dedicated return route. Treat
     return as UNKNOWN until the server confirms — the redirect is not the receipt.
  5. Ambiguity recovery: on unknown/timeout/lost redirect, poll the attempt with
     the bounded visibility-aware policy, then offer the reconcile command.
     NEVER render "paid" or "failed" from anything but server state.
  6. Reservation-expiry restart: if holds lapsed while paying, say so plainly and
     route back to replan. Do not silently retry payment against dead holds.
  7. Receipt: per-unit allocations from the Order, plus invoice/credit-note
     retrieval. Render server amounts verbatim — no client-side arithmetic,
     no summing, no fee derivation.

REFUSE TO:
  - compute any amount, tax, fee or deadline in the browser
  - auto-retry a payment mutation
  - show a success state the server has not confirmed
  - put a payment payload, provider token or order id in localStorage/sessionStorage

GATE (run once, at the end):
  focused unit tests + pnpm typecheck + pnpm lint + customer production build,
  then a NEW e2e/payment.e2e.ts covering: happy path, redirect loss, duplicate
  submission, expired reservation, ambiguous outcome. Then /security-review.
```

---

# Step 2 — FE-14: Customer signed-in shell, root page and `/login`

The exact defect FE-13 just fixed for Partner. Today the customer app has **no `/` page (the root
404s), no `/login` route, no header and no navigation.** Nothing anywhere links to `/bookings` —
it is reachable only by typing the URL.

```text
[paste STANDING RULES]

TASK: FE-14 — Customer signed-in shell, root page and /login route.

Skills: superpowers:brainstorming (nav shape + what the root page is),
        frontend-design:frontend-design, then
        superpowers:verification-before-completion.

THE REFERENCE IMPLEMENTATION ALREADY EXISTS. Copy it, do not invent a second pattern:
  frontend/apps/partner/features/session/partner-shell.tsx
  frontend/apps/partner/app/login/page.tsx
  frontend/apps/partner/features/session/model/redirect.ts
  frontend/apps/admin/features/session/operations-shell.tsx

DEFECTS TO FIX:
  1. frontend/apps/customer/app/ has NO page.tsx. The site root 404s.
  2. There is no /login route. Login exists only inline inside the booking
     workspace (features/booking/group/view/group-login.tsx).
  3. app/layout.tsx still carries the comment "No signed-in shell here yet".
  4. Zero links to /bookings anywhere in the app.
  5. /cart and /bookings have no auth redirect — they just render whatever they get.

BUILD:
  1. app/page.tsx — a real customer home. Server-first. Entry into /catalog.
  2. app/login/page.tsx — force-dynamic, noindex, ?next= return path, Suspense
     boundary above the screen (useSearchParams suspends).
  3. features/session/customer-shell.tsx — ONE useAuthGuard for the whole
     signed-in tree: checking / unauthenticated / error / authenticated branches,
     header with Cart, Bookings, Account and sign out.
  4. Unauthenticated visits to /cart and /bookings redirect to /login?next=<path>.

PRESERVE, DO NOT DUPLICATE:
  The booking workspace's login *interrupt* is deliberate and correct — a customer
  mid-scope must not lose their intent to a full-page redirect. Keep it. The shell
  handles whole-app session decisions; the interrupt handles mid-flow ones.

GATE: focused unit tests + typecheck + lint + customer build. One e2e run at the end
covering: root renders, marketing→login→cart→bookings all clickable, ?next= returns
to the right place, sign out clears the session.
```

---

# Step 3 — BE-07 hardening

```text
[paste STANDING RULES]

TASK: BE-07 remaining hardening in backend/apps/assignments/.

Skills: superpowers:test-driven-development (failing test first for every race),
        superpowers:verification-before-completion, then /security-review.

Proposals 0007–0010 are closed. What remains, from 02-backend-tasks.md B6:
  1. Idempotency for revoke, release and manual-recovery commands — identical
     replay returns the authoritative result exactly once, same as the offer
     commands already do.
  2. Ranking explainability: persist WHY a candidate was ordered as it was, in a
     form Operations can read. No opaque score with no provenance.
  3. Concurrency hardening across accept / offer-expiry / payment-hold. Prove with
     real PostgreSQL tests (the repo already has this pattern), not with mocks:
       - two partners accept the same unit simultaneously
       - accept lands exactly as the offer expires
       - payment hold and reservation expiry collide
       - a worker dies mid-command

Every command: typed, versioned, idempotent, with an immutable audit row.
Celery owns every timer — a closed browser must never stop progression.

GATE: focused pytest for the modules touched, ruff format/check, strict mypy,
branch coverage at or above the current 86.47%. Regenerate OpenAPI from Django —
never hand-edit v1.yaml — and update contracts/openapi/CHANGELOG.md.
```

---

# Step 4 — BE-OPS: worker topology, recovery sweep, `docs/adr/`

Tracked separately because **BE-09 and BE-10 both assume it exists.** Building them on eager-Celery
tests will hide exactly the failure modes that matter in production.

```text
[paste STANDING RULES]

TASK: BE-OPS — asynchronous topology and the missing operational documentation.

Skills: superpowers:writing-plans, superpowers:test-driven-development,
        superpowers:verification-before-completion.

1. A runnable worker/beat topology, documented and reproducible locally.
2. An outbox recovery sweep covering PENDING / PROCESSING / FAILED. A killed worker
   mid-command must recover to a correct terminal state — prove it with a test that
   actually kills the worker.
3. An integration suite against real Redis, not locmem with CELERY_TASK_ALWAYS_EAGER.
   Eager mode has never proven anything about ordering, retries or crash recovery.
4. Runbooks in docs/runbooks/: queue outage, replay procedure, stuck command.
5. CREATE docs/adr/ — it does not exist at all. Backfill ADRs for the decisions
   already made and load-bearing: Booking Group over singleton cart, outbox +
   Celery dispatch ownership, allocation-based money model, fail-closed provider
   selection, server-clock calibration.

GATE: the recovery tests pass against real Redis with a real worker. ruff, mypy,
coverage threshold.
```

---

# Step 5 — FE-15 and FE-16 (parallelisable)

Both integrate contracts that are **already published and have no UI**. Independent of each other —
run them in two worktrees if you want them concurrently.

### FE-15 — Customer account surfaces

```text
[paste STANDING RULES]

TASK: FE-15 — Customer account surfaces in frontend/apps/customer.
Skills: frontend-design:frontend-design, superpowers:verification-before-completion.
Depends on FE-14's shell existing (that is where these routes hang).

Published and unconsumed: /api/v1/addresses/, /api/v1/addresses/{id}/,
/api/v1/auth/privacy/consents/, /auth/privacy/preferences/, /auth/privacy/requests/,
/api/v1/auth/sessions/, /auth/sessions/{id}/

BUILD: saved address book (list/add/edit/delete — reused by FE-10 checkout rather
than reimplemented), communication preferences, consent receipts, privacy requests,
active session list with revoke.

HARD RULE: exact address text never reaches browser storage, logs or analytics.
Deletion confirms against server truth — never optimistic.
```

### FE-16 — Operations surfaces with contracts but no UI

```text
[paste STANDING RULES]

TASK: FE-16 — Operations surfaces in frontend/apps/admin.
Skills: frontend-design:frontend-design, superpowers:verification-before-completion,
        then /security-review (this is a maker-checker authorization surface).

The admin app has only / and /reviews. These are published and unbuilt:
  /operations/compatibility-rules/ + {id}/activate|reject|retire   (maker-checker)
  /operations/assisted-checkouts/
  /operations/checkouts/{id}/offers/ and /operations/fulfilment-units/{id}/offers/
  /operations/partners/{id}/availability/

Copy the queue/detail/claim/masked-reveal pattern already proven in
apps/admin/features/partner-review/.

HARD RULE: an Operations actor cannot approve their own proposal — the server
enforces it and the UI must never present the affordance. Mask sensitive data by
default; every reveal is an audited disclosure.
```

---

# Step 6 — BE-09: Booking fulfilment (B8) ★ largest remaining body

Nothing exists. `commerce.Booking` is a thin record with no state machine. This is the whole
post-payment product.

```text
[paste STANDING RULES]

TASK: BE-09 / B8 — booking fulfilment.

Skills, in order:
  1. superpowers:brainstorming — the state machine and its failure edges BEFORE code.
  2. superpowers:writing-plans — write the plan to a file; this is too large for one pass.
  3. superpowers:using-git-worktrees — isolate it.
  4. superpowers:test-driven-development — MANDATORY. Every transition, every race,
     every money movement gets a failing test first.
  5. superpowers:executing-plans with review checkpoints.
  6. /security-review and /code-review ultra at the end.

READ FIRST: Django_Next.js_Plan/M1/01-scope-and-flow.md (the M1 state path and the
failure-outcomes table are the specification), 02-backend-tasks.md section B8,
03-lifecycle-and-state-machines.md, 06-fulfilment-safety-quality-and-disputes.md.

BUILD, per Fulfilment Unit — never per group:
  1. Fulfilment state machine + history + expected-version commands, plus the
     DERIVED Booking Group projection. Group state is derived from units, never
     written directly.
  2. Idempotent Customer cancel / reschedule / address-change with the frozen
     revalidation, reacceptance, recovery and no-silent-mutation rules.
  3. En route, Arrived, Customer-unavailable, lateness watchdogs, and the restricted
     Operations-assisted outage start.
  4. Start OTP, WorkTask, WorkEvidence, scope amendment, revision payment.
  5. Abort, line-level outcomes, completion submission, Customer confirm/dispute,
     evidence-gated timeout, partial-work refund/ledger, Partner release/recovery.
  6. Group-wide and unit cancellation WITHOUT hidden partial success. Unaffected
     units retain independent truth. Every financial change goes through the
     existing unit PaymentAllocation — do not add a second money path.

The cancellation fee ladder is frozen in 05-initial-configuration.md and is
snapshotted onto quote and booking. A later config change must not rewrite history.

GATE: the full failure-outcomes table from 01-scope-and-flow.md passes as tests,
per unit, reconciling group truth, with idempotency and audit. ruff, strict mypy,
coverage threshold. Regenerate OpenAPI from Django; update CHANGELOG.md.
Then FE-11 unblocks.
```

---

# Step 7 — FE-11: Customer active booking + Partner work UI

```text
[paste STANDING RULES]

TASK: FE-11 — post-payment UI for Customer and Partner. Requires BE-09 published.
Skills: frontend-design:frontend-design, superpowers:test-driven-development,
        superpowers:verification-before-completion, /security-review.

Specification: 03-frontend-tasks.md sections F3 and the open items in F5.

CUSTOMER: group summary + per-unit authoritative status, partner, appointment,
text ETA (no map). Group/unit cancel/reschedule/address-change/support ONLY when
backend state allows, with cross-unit impact shown before confirmation. SLA-breach
delay + fee-free recovery. Secure arrival/start-OTP display. Amendment approve/
decline + revision payment. Completion with Confirm and Report a problem. Unit-level
partial/refund/dispute without making unaffected units look failed.

PARTNER: release with reason (no threat, no opaque score). En route, Arrived,
Customer unavailable, start OTP, contact/support. Tasks/evidence/upload status.
Scope amendment. Abort and line-level completion outcome.

The Partner offer inbox is DONE. Do not rebuild the inbox, offer card, accept
mutation, undo timer or polling policy — extend from the committed offer, forward.

HARD RULE: only backend-authorized actions render. A partner must not be able to
query or render a sibling unit's scope, partner identity or earnings — the FE-09
unit-scope privacy boundary test must keep passing.
```

---

# Step 8 — BE-10: cases, ledger, payout, notifications, observability

```text
[paste STANDING RULES]

TASK: BE-10 / B9 + B10.
Skills: superpowers:writing-plans, superpowers:test-driven-development,
        superpowers:executing-plans, /security-review, /code-review ultra.
Assumes BE-OPS (step 4) landed — this is where the worker topology gets used hard.

B9: typed OperationsCase (owner, severity, SLA, evidence, communication, allowed
commands, immutable audit) covering assignment, late/no-show, unavailable customer,
partial/abort, quality, safety, payment, refund and payout case types. Immutable
Partner ledger entries/adjustments. Operations-reviewed payout batches. Ledger
reservation, frozen RazorpayX adapter, idempotent sandbox payout, payout-account
verification, account-change cooling.

B10: notification intent/delivery/failure records with bounded retry and SMS/
transactional fallback. Offer, checkout, reservation, lateness, completion,
reconciliation and retention jobs. Service/area/payment/payout kill switches with
maker-checker. Metrics/alerts for conversion, assignment, lateness/no-show, partial/
dispute, money ambiguity, case SLA, outbox depth, worker queues.

GATE: financial maker-checker, provider ambiguity, worker crash/replay and
production-readiness drills pass. Then FE-12 unblocks.
```

---

# Step 9 — FE-12: Operations resolution + Partner earnings

```text
[paste STANDING RULES]

TASK: FE-12. Requires BE-10 published.
Skills: frontend-design:frontend-design, superpowers:verification-before-completion,
        /security-review.

OPERATIONS: case list/detail with owner, SLA, evidence, communication and allowed
commands. Booking Group dependency view with unit offer/reservation/payment/refund/
ledger/payout timelines. Kill switches, maker-checker, audit references.

PARTNER: pending/available/paid ledger states, payout account and status. NO
on-demand withdrawal — it is not supported and must not be implied.

HARD RULE: KYC, bank data, exact address and sensitive evidence are masked by
default. Every reveal is audited. Every financial action carries its published
authorization and audit reference.
```

---

## External blockers — escalate now, not at cutover

None of these are solved by writing code. Each one gates a release, and each has lead time.

| Blocker | Gates | Raise with |
| --- | --- | --- |
| MSG91 / DLT template approval | Real OTP + notification delivery | Telecom vendor |
| Malware-scan vendor approval | BE-05 production KYC acceptance | Security/procurement |
| Verified-KYC retention & deletion policy | BE-05 production release | Legal |
| Razorpay live credentials | BE-08 live activation; FE-10 runs on the fake provider until then | Finance |
| CA / Finance / legal sign-off | Invoice, credit note, payout release | Finance + CA |
| Durable Redis + worker/beat deployment | BE-08 live, BE-09, BE-10, BE-OPS crash proof | Infra |

---

## Definition of done, per task

A task is done when **all** of these are true — not when the code runs:

- [ ] Focused regression tests for the behaviour, written before the implementation where the skill required it
- [ ] `pnpm typecheck` and `pnpm lint --max-warnings 0` clean (frontend) / ruff + strict mypy clean (backend)
- [ ] Affected production build passes
- [ ] Coverage threshold held (backend, currently 86.47%)
- [ ] Browser acceptance run **once** at the gate, with real output pasted — not summarised
- [ ] `/security-review` clean for anything touching money, auth, PII or authorization
- [ ] OpenAPI regenerated **from Django** and CHANGELOG updated, if the contract moved
- [ ] `task.md` status row updated with evidence, not with intent
- [ ] One commit for the task

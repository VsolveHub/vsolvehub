# M1 — Scheduled A1 Technician Vertical Slice

## Objective

Deliver production-capable multi-service planning for one-person Technician work from discovery to
allocated Partner settlement, including sequential, coordinated-parallel and separate-visit outcomes.
M1 activates a narrow catalog but implements the product-wide Cart → Booking Group → Fulfilment Unit
relationships; later milestones extend them rather than replace them.

## Included

- Customer, Partner and Operations Next.js applications using Django APIs.
- Identity, OTP/session, role and basic privacy/consent foundations.
- A small, reviewed set of one-person `A1_TASK_VISIT` Technician variants.
- Address confirmation, serviceability and Scheduled/Today windows.
- A versioned multi-item cart and explicit login merge/edit conflict recovery.
- Server-authored fulfilment alternatives showing final service grouping, visit count, professional
  count, unit windows and complete group/unit pricing before confirmation.
- Explicit Partner availability and offer/accept before payment.
- One Booking Group with one or more Fulfilment Units; every unit has one lead Partner and booking.
- Group/unit task quote, allocated payment, refund, invoice and pending Partner ledger.
- Arrival, start OTP, work tasks/evidence, catalog scope amendment and completion.
- Partner release, Customer cancellation, delay/no-show, partial work, abort and dispute.
- Operations cases, manual dispatch recovery, refund reconciliation and payout batch.
- Security, accessibility, observability, runbooks and cutover.

## Excluded

- Instant and live Partner location.
- A2 inspection-first.
- Crews/helpers or services that cannot safely be completed by one person.
- Partner-procured materials and same-day advances.
- A3, A5, A7-A10 archetypes.
- Warranty promise/callback booking; linked quality support is included.
- Provider picker, preferred Partner, ratings-based ranking, automatic reliability penalties.
- COD, part-pay, pay-on-completion, coupons, wallet, surge and on-demand payout.
- Native mobile apps and additional languages unless the pilot recruitment gate requires them.

## M1 launch limits versus final-product architecture

M1 is allowed to activate a narrow configuration; it is not allowed to encode a relationship that
later milestones must replace. This inventory is the explicit boundary:

| Choice | M1 launch position | Product-wide treatment |
|---|---|---|
| Cart cardinality | Up to 5 items | Many-item versioned Cart is permanent; limits are configuration |
| Group structure | Up to 5 units, 2 concurrent Partners | Booking Group/Fulfilment Unit cardinality is permanent and limits may expand |
| Address | One confirmed address per group | Planner may later partition multi-address intent; units always own explicit location |
| Confirmation | `ALL_OR_NOTHING` | Partial confirmation may be added only as explicit quoted Customer choice |
| Active archetype | A1 task visits | A2-A10 keep native engines and link compatible outputs without flattening lifecycles |
| Active catalog | Six reviewed one-person Technician variants | Catalog/configuration expands; no schema assumes only these services/categories |
| Geography | Hyderabad `500032` | Service areas are configuration; no hidden city/radius fallback |
| Timing | Today/Scheduled, 7-day horizon | Instant and longer horizons extend unit timing without replacing group relationships |
| Partner model | One lead Partner per A1 unit | Multi-line unit requires common eligibility |
| Assignment | Sequential offers per unit, bounded candidates | Coordinator may evolve delivery/ranking; explicit Partner acceptance remains permanent |
| Customer choice | No provider picker | Preferred/provider choice may be introduced without bypassing eligibility |
| Transport | Bounded polling observation | Push/SSE/native delivery may replace transport; browser never owns transitions |
| Payment | One all-unit-held group payment | Other payment modes must preserve unit allocations and reconciliation |
| Pricing | Task price, per-unit minimum, one group fee | Policies are versioned; group/unit/line reconciliation remains permanent |
| Materials | Customer/platform scope only | Partner procurement arrives with approval/receipt/return/reimbursement controls |
| Quality | Support/dispute, no advertised warranty | M2 adds funded callback/warranty without changing original unit history |
| Payout | Weekly Operations-reviewed batch | Automation/on-demand payout may evolve on the same immutable ledger |
| Providers | Razorpay, MSG91, Supabase; scanner unresolved | Providers remain adapters and can change without domain-schema replacement |
| Language/client | English web surfaces | Locales/native apps add presentation and delivery, not separate business truth |
| Tracking | No continuous home-service tracking | A8 trip tracking is separate purpose-bound consented capability |
| Risk/ranking | Deterministic/manual review | Data-driven policy requires evidence, explanation and appeal before activation |

### Superseded implementation that must be migrated before FE-08G

The following already-built 1.6.0 relationships were M1-only shortcuts and are no longer acceptance
targets:

- `CartItem.cart` one-to-one and the `replace_existing` flow;
- no real Customer `/cart` surface;
- `Quote` belonging to one CartItem rather than a selected plan;
- assignment attempts, offers and reservations belonging directly to one Checkout;
- Order storing one Partner and having one Booking;
- no unit-level payment/refund/document allocation.

BE-06G owns an expand/migrate/contract replacement. Historical data and tests are preserved; the
frontend must not compensate for these shortcuts locally.

## Documents

1. [Scope and flow](./01-scope-and-flow.md)
2. [Backend tasks](./02-backend-tasks.md)
3. [Frontend tasks](./03-frontend-tasks.md)
4. [Acceptance and cutover](./04-acceptance-and-cutover.md)
5. [Frozen initial configuration](./05-initial-configuration.md)

Implementation evidence is reconciled in the dated audit snapshots and status markers in the backend
and frontend task files. `Done` requires implementation, integration and verification; a model,
screen, fixture or accepted proposal alone remains `Partial` or `Blocked`. The current cross-agent
execution order is maintained in [task.md](./task.md).

## Release statement

M1 may launch only in explicitly enabled service areas and variants. A Customer must be able to book,
receive, dispute and financially close every unit in a real multi-service group with eligible Partners
while all browsers are closed. A demo-only happy path is not M1 completion.

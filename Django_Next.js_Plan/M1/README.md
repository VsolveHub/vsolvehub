# M1 — Scheduled A1 Technician Vertical Slice

## Objective

Deliver a production-capable one-person Technician task visit from discovery to Partner settlement,
including the failure paths that prove the platform foundation. M1 is the first delivery slice of the
complete product plan; it does not define or limit the final product.

## Included

- Customer, Partner and Operations Next.js applications using Django APIs.
- Identity, OTP/session, role and basic privacy/consent foundations.
- A small, reviewed set of one-person `A1_TASK_VISIT` Technician variants.
- Address confirmation, serviceability and Scheduled/Today windows.
- Explicit Partner availability and offer/accept before payment.
- One service, one visit, one Partner and one checkout.
- Task/minimum-visit quote, payment, refund, invoice and pending Partner ledger.
- Arrival, start OTP, work tasks/evidence, catalog scope amendment and completion.
- Partner release, Customer cancellation, delay/no-show, partial work, abort and dispute.
- Operations cases, manual dispatch recovery, refund reconciliation and payout batch.
- Security, accessibility, observability, runbooks and cutover.

## Excluded

- Instant and live Partner location.
- A2 inspection-first.
- Crews/helpers or services that cannot safely be completed by one person.
- Multiple services in one order.
- Partner-procured materials and same-day advances.
- A3-A10 archetypes.
- Warranty promise/callback booking; linked quality support is included.
- Provider picker, preferred Partner, ratings-based ranking, automatic reliability penalties.
- COD, part-pay, pay-on-completion, coupons, wallet, surge and on-demand payout.
- Native mobile apps and additional languages unless the pilot recruitment gate requires them.

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
receive, dispute and financially close real work with a real eligible Partner while all browsers are
closed. A demo-only happy path is not M1 completion.

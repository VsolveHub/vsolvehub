# Vsolve Hub Product and Delivery Plan

**Status:** Authoritative product-wide plan
**Effective date:** 31 July 2026
**Scope:** The complete Vsolve Hub platform, delivered through bounded milestones

This directory is the single source of planning truth for the Django and Next.js rebuild. The plan
covers the complete product, not only Milestone 1. Milestone folders translate the product-wide
design into executable scope without redefining global policy.

## Reading order

1. [Product scope and principles](./00-product-scope-and-principles.md)
2. [Platform architecture](./01-platform-architecture.md)
3. [Domain model](./02-domain-model.md)
4. [Lifecycle and state machines](./03-lifecycle-and-state-machines.md)
5. [Availability, assignment and dispatch](./04-availability-assignment-and-dispatch.md)
6. [Pricing, payments and settlement](./05-pricing-payments-and-settlement.md)
7. [Fulfilment, safety, quality and disputes](./06-fulfilment-safety-quality-and-disputes.md)
8. [API, events and Operations](./07-api-events-and-operations.md)
9. [Security, privacy, quality and production](./08-security-quality-and-production.md)
10. [Delivery roadmap](./09-delivery-roadmap.md)
11. [Decision register](./10-decision-register.md)
12. [Feature and edge-case register](./11-feature-and-edge-case-register.md)
13. [Milestone 1](./M1/README.md)

There is no document-precedence chain. If two active documents disagree, the plan is defective and
must be corrected in the same change. The decision register explains *why* a rule exists; the domain
documents define *what to build*; milestone files define *when to build it*.

## Product rule

Vsolve Hub is a multi-category local-services marketplace. Shared platform capabilities are built
once, while each fulfilment archetype gets only the workflow it genuinely needs. A category is not
launched until its archetype, safety policy, settlement policy and Operations recovery are complete.

## Delivery rule

The whole product is planned now and delivered incrementally. A future feature belongs in the global
design and roadmap, not as an unused Milestone 1 database field. Schema is added when the owning
capability is scheduled, before production data depends on it.

## Non-negotiable invariants

- Django/DRF is the only business backend and database-migration authority.
- PostgreSQL is business truth. Redis coordinates ephemeral work but is never the final correctness
  boundary for money, capacity or assignment.
- Frontends consume the generated OpenAPI client and never connect to PostgreSQL.
- The server calculates all monetary amounts in integer paise.
- Payment redirects are presentation; verified webhooks and reconciliation are authoritative.
- Every retryable command is idempotent and every state-changing business action is auditable.
- A Partner explicitly accepts work. Assignment is not made consensual by renaming Accept to
  Acknowledge.
- A booking is never described as confirmed until payment policy and Partner commitment both support
  that statement.
- Customer and Partner failures are attributed separately from platform failures.
- A Partner can release before work and abort during work; neither path may trap a person or silently
  abandon the customer.
- Partial work, disputes, refunds and settlement are first-class states, not undefined support cases.
- Home-service archetypes do not expose continuous Partner tracking. Trip services design tracking
  separately with explicit consent.
- Operations uses domain commands, not database edits.

## Archive

The previous multi-document design exploration is retained locally under `archive/` as temporary
historical evidence. The directory is intentionally Git-ignored and is not part of the authoritative
repository or implementation input. It may be removed after the active plan has been accepted and any
needed history is preserved elsewhere.

# Delivery Roadmap

## Delivery model

The complete product is designed in the root documents and delivered as independently releasable
vertical capabilities. Milestone numbers express dependency order, not calendar promises. A milestone
may be split for team capacity, but its launch gate cannot be bypassed.

Every milestone includes backend, Customer, Partner, Operations, contract, data migration, security,
observability, runbooks and acceptance. A backend engine without a real fulfilment and recovery path is
not complete.

A milestone may limit activated categories, areas, policies or operating modes, but it may not encode
a contradictory cardinality or ownership model that a later milestone must replace. Shared durable
relationships—multi-item cart, Booking Group, Fulfilment Unit, unit money allocation and archetype
ownership—are introduced with their first use and extended compatibly.

## M1 — Scheduled A1 Technician foundation

Purpose: prove honest multi-service task-priced planning and one-or-more A1 visits from discovery
through allocated settlement.

Scope:

- Django platform, identity, catalog, address/serviceability and Partner onboarding foundations;
- a deliberately small set of one-person Technician `A1_TASK_VISIT` variants;
- a versioned multi-item cart and server-authored alternatives for one-Partner sequential,
  coordinated parallel or separate-visit fulfilment;
- Scheduled and Today windows only;
- explicit Partner availability and offer/accept before Customer payment;
- Booking Group coordination with one Partner/reservation/booking per Fulfilment Unit;
- group/unit task quote, minimum visit charge, payment allocation, webhook/refund and invoice;
- arrival, start OTP, task outcomes, evidence, amendment, partial/abort/completion-dispute flow;
- cancellation, late/no-show and Partner recovery;
- Partner pending earnings and Operations-reviewed payout batch;
- Operations case workspace and production controls.

Excluded: Instant, A2, crews, Partner-procured materials, automatic
reliability penalties, provider picker, live tracking and on-demand payout.

Detailed execution is in [M1](./M1/README.md).

## M2 — Technician diagnostics, materials and quality

Purpose: cover the Technician work that cannot be honestly priced before inspection.

Scope:

- `A2_INSPECTION_FIRST` and linked A1 follow-up bookings;
- immediate same-visit conversion only when capacity and payment succeed;
- catalog/platform materials and capped Partner-procured reimbursement with receipt/return controls;
- warranty/callback product, quality metrics and dispute refinement;
- preferred prior Partner request;
- inspection-aware grouping rules and same-visit A2-to-A1 conversion using the existing Booking Group
  and Fulfilment Unit architecture;
- automated payout provider/reconciliation, with account-change cooling and maker-checker.

Gate: inspection outcomes, delayed quote acceptance, material fraud/return and callback funding must pass
end-to-end acceptance.

## M3 — Time blocks

Purpose: expand into services whose product is time.

Scope:

- `A3_TIME_BLOCK` timer, extension and attendance settlement;
- eligible Beauty, Cleaning, Maid, Elder Care, Gardening and Pet service configurations;
- Partner language packs required by the actual recruitment cohort;
- optional Customer language packs based on demand.

Gate: time-block timer, extension, overtime/abort and attendance outcome must pass end-to-end
acceptance.

## M4 — Instant dispatch and mobile supply reliability

Purpose: offer a genuinely rapid booking only where supply and Partner delivery can support it.

Scope:

- native Partner application or equivalently proven background delivery;
- explicit Go Online, fresh presence and purpose-bound latest location;
- payment authorization/capture strategy validated per supported payment method;
- bounded explicit offers, first-valid acceptance and paid-unassigned recovery only where unavoidable;
- Instant cancellation, lateness, dispatch compensation and refund Operations;
- area/service enablement from measured eligible pool and acceptance latency.

Gate: notification reliability, p50 eligible pool, acceptance latency, paid-assignment failure,
refund/reconciliation and safety support thresholds are met in production-like pilot. Instant is not
built merely because a feature flag can hide it.

## M5 — Projects

Purpose: support quoted outcomes rather than forcing them into visit bookings.

Scope:

- `A5_CUSTOM_PROJECT`: request, proposal, comparison, agreement, milestones, evidence, change orders,
  dispute and compliant fund release.

Gate: legal/payment review of milestone funds.

## M6 — Rentals and trips

Purpose: add asset custody and journey workflows.

Scope:

- `A7_RENTAL`: inventory, availability, deposit, delivery/handover, extension, return, damage/loss and
  deposit settlement;
- `A8_TRIP`: driver/vehicle eligibility, route/toll/waiting price, pickup/start/end, emergency support,
  consented live tracking and retention;
- vehicle/rental category configurations only after the relevant engine passes.

Gate: deposit disputes, asset condition evidence, route/tracking consent, driver safety and transport
compliance.

## M7 — Stays and listings

Purpose: complete inventory-based accommodation and non-booking marketplace products.

Scope:

- `A9_STAY`: property/unit inventory, guest policy, booking, check-in/out, cancellation/no-show,
  deposit/damage and documents;
- `A10_LISTING`: posting, moderation, search, application/lead, messaging/contact protection, reports,
  spam/abuse and expiry;
- Rooms/PG/Hotel, Career/Jobs and other true listing subcategories.

Gate: accommodation compliance and listing moderation/abuse operations are staffed and tested.

## Cross-milestone capabilities

These evolve in every milestone:

- identity, sessions, consent, privacy rights and account recovery;
- tax/legal configuration for each new business model;
- safety, damage, disputes, blocks and support case SLAs;
- notification and dependency adapters;
- ledger, invoice, refund, credit-note and reconciliation;
- analytics grounded in real funnel and operational data;
- accessibility, localization, mobile reliability and performance;
- backup, restore, incident response and audit.

## Expansion rule

Before declaring a new category “configuration only,” seed and execute one representative subcategory
with zero new backend lifecycle code. If code changes, the archetype or shared capability is incomplete
and the roadmap must name it.

## Milestone definition of done

- Scope and explicit exclusions agreed.
- Database migrations and seed from zero pass.
- OpenAPI and generated client compile.
- Happy, failure, concurrency, security and recovery acceptance pass.
- Customer, Partner and Operations experiences are complete.
- Money reconciles to the paise and legal documents are approved.
- Metrics, alerts, case ownership and runbooks exist.
- Production-like performance and accessibility gates pass.
- No critical/high defect remains unresolved.
- Rollback/cutover is rehearsed.

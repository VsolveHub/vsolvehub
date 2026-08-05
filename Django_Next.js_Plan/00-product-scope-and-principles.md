# Product Scope and Principles

## Product outcomes

Vsolve Hub must let a customer discover a service, obtain an honest price or quote process, book an
eligible professional or asset, receive the service safely, resolve changes or failures, pay the
correct amount and obtain evidence and documents. It must let Partners understand work before they
accept it, perform it safely, receive transparent earnings and dispute incorrect decisions. Operations
must be able to recover every non-terminal state without editing database rows.

## Product surfaces

- **Customer:** public discovery, account, cart/checkout, active bookings, support, documents and
  reviews.
- **Partner:** acquisition, application/KYC, availability, offers and schedule, work execution,
  earnings, payouts and support.
- **Operations:** catalog and service areas, Partner review, dispatch recovery, booking support,
  safety, disputes, payments, refunds, payouts, configuration and audit.
- **Django Admin:** emergency/internal data inspection only. Normal business mutations use Operations
  commands.

## Fulfilment archetypes

`ServiceVariant.fulfilment_archetype` is the sole lifecycle discriminator.

| Code | Customer buys | Required engine | Example categories |
|---|---|---|---|
| `A1_TASK_VISIT` | Defined task units | Visit, task price, scope outcomes | Technician repair, beauty, cleaning |
| `A2_INSPECTION_FIRST` | Diagnosis followed by optional repair | Inspection fee, follow-up quote | AC/RO/computer diagnostics |
| `A3_TIME_BLOCK` | A block of professional time | Timer, extension, attendance | Maid/elder-care ad hoc help |

| `A5_CUSTOM_PROJECT` | Accepted project proposal | Bid, agreement, milestones, change orders | Events, interiors, shifting |

| `A7_RENTAL` | Temporary possession of an asset | Inventory, deposit, handover, return | Tools, generators, vehicles |
| `A8_TRIP` | A journey | Driver/vehicle dispatch, route and consented tracking | Taxi and goods movement |
| `A9_STAY` | Nights in a property | Inventory, guest policy, check-in/out | Rooms, PG, hostel, hotel |
| `A10_LISTING` | Discovery/contact/application | Listing, moderation and lead/application flow | Jobs, property listings, adoption |

An archetype may reuse identity, catalog, money, evidence, messaging and Operations infrastructure,
but it may not be forced through another archetype's booking state machine.

## Product-wide feature map

| Capability | Why it exists | Simplest acceptable form | Failure rule |
|---|---|---|---|
| Catalog | Describe what can actually be bought | Effective-dated variants and scope questions | An incomplete variant cannot activate |
| Serviceability | Prevent impossible demand | Confirmed address plus area/variant rules | Never invent a city, coordinate or fallback |
| Cart | Preserve editable intent and login continuity | One active versioned cart with independently scoped items | Concurrent merge/edit is explicit; local state is not truth |
| Planning | Turn multiple requests into executable work | Server-authored Booking Group alternatives and Fulfilment Units | Never guess compatibility, capacity or silent splitting |
| Quote | Keep every displayed amount consistent | Immutable group, unit and line calculations | Expired/invalidated quote requires visible reconfirmation |
| Availability | Avoid promising unavailable service | Explicit Partner working periods plus reservations | False availability fails closed before charge |
| Assignment | Obtain informed Partner commitment | Explicit offer/accept with a deadline | Decline/expiry moves to the next candidate |
| Payment | Collect and reconcile money | Provider adapter, webhook, idempotency | Ambiguous state is reconciled, never guessed |
| Fulfilment | Prove arrival, start, work and outcome | Audited commands, OTP, evidence | Offline/retry does not duplicate transitions |
| Amendment | Authorize additional scope or time | Immutable revision and approval | No approval/payment means no chargeable work |
| Completion | Separate submission from final settlement | Partner submission plus customer dispute window | Silence cannot block payout forever |
| Cancellation | Allocate real costs fairly | Fixed/line-level policy, not punitive percentages | Platform/Partner failure never charges Customer |
| Ledger/payout | Make Partner money explainable | Immutable entries and idempotent payout | Gateway ambiguity goes to reconciliation |
| Safety/dispute | Protect both parties | Incident, evidence, restricted case workflow | Safety can stop work without financial coercion |
| Notifications | Deliver actions and status | Durable record plus bounded retries | Delivery failure never becomes user fault |
| Operations | Recover exceptional states | Typed case with owner, SLA and commands | No unresolved financial/booking state silently expires |

## Deliberate simplicity rules

- Start ranking with eligibility, travel feasibility, nearest/least-recently-assigned and a stable
  tie-break. Add statistical weighting only after data proves a need.
- Do not automatically punish Partner declines. Measure accepted work, late releases, stalls and
  incidents separately; introduce an approved risk policy only with sufficient volume and appeal.
- Do not silently move work that a Partner has accepted. Reassignment after commitment is visible to
  the Partner and, once identity was disclosed, to the Customer.
- Keep fulfilment planning deterministic, bounded and explainable. Do not add continuous repacking,
  statistical scheduling, surge pricing, tiers or personalized incentives before ordinary planning
  and assignment produce measured constraints.
- Do not add nullable foreign keys to nonexistent future models. Future schema belongs to the
  milestone that builds the feature.
- Do not expose toggles, statuses, payment modes or languages that do not function end to end.

## Definition of an industry-ready feature

A feature is ready only when its happy path, authorization, idempotency, concurrent transitions,
timeouts, dependency failure, user cancellation, Operations recovery, customer/Partner copy,
observability and regression tests are all defined. A support escalation is a valid outcome only when
the case type, evidence, settlement rule, owner and SLA are specified.

# Decision Register

Only current decisions appear here. Rejected alternatives remain in Git history and the archived design
exploration, not as crossed-out active policy.

| ID | Decision | Rationale |
|---|---|---|
| ADR-001 | Next.js remains Customer, Partner and Operations web framework | Preserve working platform and support public SSR plus client workspaces |
| ADR-002 | Django/DRF is the only business backend and migration authority | One transaction, permission and schema boundary |
| ADR-003 | PostgreSQL is business truth; Redis is ephemeral | Correctness survives cache/coordination loss |
| ADR-004 | Modular monolith before microservices | Lower operational cost and strong transactional boundaries |
| ADR-005 | Generated OpenAPI is the frontend contract | Prevent DTO and validation drift |
| ADR-006 | One `fulfilment_archetype` selects lifecycle | Avoid incompatible pricing/lifecycle enums |
| ADR-007 | One operational visit is one booking | One address, slot, lead, start contract and outcome |
| ADR-008 | A1 is task-priced; duration is capacity estimate | Customers buy outcomes, not hidden labour time |
| ADR-009 | A2 is inspection first with a linked follow-up | Diagnostic work cannot be honestly priced upfront |
| ADR-010 | Partner availability is explicit | False availability harms paid Customers more than conservative supply display |
| ADR-011 | Partners receive explicit Accept/Decline offers | Commitment requires informed consent; “acknowledge” is not a substitute |
| ADR-012 | Scheduled/Today Partner acceptance precedes Customer payment | Avoid paid-unassigned refunds and involuntary assignments in the initial engine |
| ADR-013 | Accepted time uses Partner-specific PostgreSQL reservations | Exact duration and overlap are protected without a pool counter |
| ADR-014 | Customer has no provider picker initially | Thin supply and eligibility are better handled by assignment |
| ADR-015 | Accidental acceptance has confirmation plus 120-second undo | Correct mistakes without a reliability bureaucracy |
| ADR-016 | Release remains possible; pilot consequences are manual | Prevent silent no-show and premature algorithmic punishment |
| ADR-017 | Ranking starts deterministic and explainable | Data does not yet justify Bayesian weights, tiers or exploration systems |
| ADR-018 | Instant is a separate later milestone | Background delivery, location, refund and density costs are material |
| ADR-019 | Home visits do not use continuous location tracking | Status/ETA meets need with less privacy and false precision |
| ADR-020 | A8 trips design consented tracking separately | Live journey position is part of that product |
| ADR-021 | Payment webhooks and reconciliation are authoritative | Redirects and process success are ambiguous |
| ADR-022 | Cancellation uses fixed/line-level cost recovery | An En-route tap cannot justify retaining an unperformed full service price |
| ADR-023 | Partial work and abort are first-class launch states | Physical work does not always end in binary completion/cancellation |
| ADR-024 | Completion submission precedes final settlement | Customer dispute rights and Partner payout certainty both need a deadline |
| ADR-025 | Additional work requires immutable revision, approval and payment | No unauthorized labour/material charge |

| ADR-027 | Partner-procured materials require approval, receipt and outcome | Bound fraud, returns and reimbursement risk |
| ADR-028 | Operations is case-oriented and command-driven | Every exceptional state needs owner, SLA and terminal result |
| ADR-029 | Future models ship with their capability | Avoid unusable nullable seams and speculative migrations |
| ADR-030 | Automatic Partner/customer risk restrictions require evidence and appeal | Capability decisions must be attributable, explainable and reversible |
| ADR-031 | Tax, privacy and regulated business rules are reviewed configuration | Laws and provider obligations change independently of deployments |
| ADR-032 | M1 is a complete Scheduled/Today A1 Technician slice on the product-wide group/unit model | Prove ordinary fulfilment before Instant and future archetypes without shipping singleton architecture |
| ADR-033 | One active Cart contains multiple independently scoped items | Customer intent must not be destroyed merely because fulfilment is planned later |
| ADR-034 | The server publishes immutable Fulfilment Plan alternatives before confirmation | Compatibility, capacity, visit count, Partner count, time and money are business decisions, not frontend arithmetic |
| ADR-035 | A Booking Group contains one or more Fulfilment Units; one unit has one lead Partner and one booking | Preserve Customer grouping while assignment, work, cancellation and settlement remain operationally recoverable |
| ADR-036 | Group confirmation is all-or-nothing unless the Customer explicitly accepts a published partial policy | Never turn one confirmed structure into hidden partial success |
| ADR-037 | Same category never proves combination; a multi-line unit requires exact compatibility and common Partner eligibility | Prevent unsafe or impossible work from category-level assumptions |

## Decision change process

A changed decision requires:

1. the new decision and reason in this register;
2. updates to every affected active domain and milestone document in the same change;
3. schema/API/migration implications;
4. rollout and rollback impact;
5. tests that prove the new invariant.

Adding another higher-precedence planning document is not an acceptable change process.

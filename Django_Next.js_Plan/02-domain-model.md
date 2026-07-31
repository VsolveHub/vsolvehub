# Domain Model

## Modelling rules

- Models represent durable business facts, not screens.
- Shopping, money, assignment and physical work have separate state.
- Immutable snapshots preserve what was offered, accepted, paid and performed.
- Derived summaries may be cached but never become competing truth.
- Database constraints protect invariants in addition to service validation.
- Future capability models are introduced with their milestone, not as unused schema seams.

## Identity and access

Core records:

- `User`, `Role`, `UserRole`
- `CustomerProfile`, `PartnerProfile`, `OperationsProfile`
- `OtpChallenge`, `Session`, `Device`
- `ConsentReceipt`, `CommunicationPreference`, `PrivacyRequest`

One user may hold multiple roles, but every request uses an explicit active role. A Partner cannot be
assigned to their own Customer booking. Sessions are revocable and rotated after authentication or
privilege changes.

## Catalog and geography

Core records:

- `Category`, `Subcategory`, `Service`, `ServiceVariant`
- `ServiceQuestion`, `ServiceQuestionOption`, `ServiceMedia`, `ServicePolicy`
- `TaskRate`, `TimeRate`, `InspectionPolicy`
- `Address`, `ServiceArea`, `PostalCode`, `ServiceAreaOperatingWindow`, dated exceptions

`ServiceVariant` is the activatable unit. It declares one `fulfilment_archetype`, skill and equipment
requirements, service areas, evidence policy, tax category and effective period. Activation validates
the configuration required by that archetype.

Addresses store customer-entered text, normalized text and coordinates separately. The customer
confirms the service address. Access instructions, apartment/gate/landmark and parking or access-fee
expectations are distinct fields with restricted disclosure.

## Partner eligibility

Core records:

- `PartnerApplication`, `PartnerDocument`, `PartnerConsent`, `PartnerBackgroundCheck`
- `PartnerSkill`, `PartnerService`, `PartnerServiceArea`, `PartnerEquipment`
- `PartnerAvailabilityRule`, `PartnerAvailabilityException`
- `PartnerPresence`, `PartnerDevice`, latest `PartnerLocation` for Instant only

Application states are `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `CHANGES_REQUIRED`, `APPROVED`,
`SUSPENDED`, `OFFBOARDED`. Documents and decisions are versioned. Approval alone does not grant every
service: service eligibility is the intersection of approved identity, skill, area, equipment,
policy and current account state.

Availability is explicitly published by the Partner or an authorized Operations user with recorded
consent. Busy time is derived from active reservations and work. Acknowledgment, heartbeat or historic
behaviour never silently creates future availability.

## Shopping and checkout

Core records:

- `Cart`, `CartItem`, `CartItemScope`
- `PriceQuote`, `PriceQuoteLine`
- `CheckoutSession`

The cart owns editable intent. One cart item represents one intended operational unit: a visit,
series, project, shift request, rental, trip, stay or listing action depending on archetype.

`CheckoutSession` snapshots item versions, quote, address and policy acceptance. It may own an active
Partner offer/reservation for visit archetypes. Editing a snapped input invalidates checkout; it never
mutates an accepted quote in place.

## Availability and assignment

Visit-archetype records:

- `PartnerOffer`: one bounded request for an informed Partner decision
- `PartnerReservation`: occupied calendar range after acceptance
- `JobAssignment`: the accepted Partner/role linked to a booking
- `AssignmentAttempt`: audit of candidate selection and outcome

Offer states:

```text
OFFERED → ACCEPTED_PENDING_UNDO → COMMITTED | UNDONE
       → DECLINED | EXPIRED | REVOKED | SUPERSEDED
```

Reservation states:

```text
TENTATIVE   provisional/committed Partner, customer payment pending
CONFIRMED   payment/booking policy satisfied
RELEASED    expired, cancelled, reassigned or completed
```

Both active states participate in the PostgreSQL overlap exclusion constraint. A Partner never gets a
future calendar reservation merely because the system assumes they are available.

`JobAssignment` keeps history when a Partner releases and a replacement is found. A partial unique
constraint permits at most one active lead assignment for a booking. Crew archetypes add named members
only when their milestone builds the workforce domain.

## Orders and booking

Core records:

- `Order`, `OrderBooking`
- `Booking`, `BookingScopeItem`, `BookingStatusHistory`
- `BookingOtp`, `WorkSession`, `WorkOutcome`
- `PriceRevision`, `ScopeAmendment`, `TimeExtension`
- `Invoice`, `InvoiceLine`, `CreditNote`, `DocumentSeries`

`Booking` is the operational aggregate. `Order` groups collections. A quote/revision chain records
what was agreed; invoice lines record the issued legal document. Do not introduce a redundant mutable
order-line copy of the same amount.

The booking stores separate dimensions:

- `fulfilment_status`
- `payment_summary_status` as a projection of payment attempts/refunds
- active assignment relation
- support/safety hold flags derived from open cases

One visit has one address, slot, lead Partner, start contract and outcome. Quantity within the same
visit is represented by scope lines. Independent visits are independent bookings even when one order
groups them.

## Work and evidence

Core records:

- `WorkTask`, `WorkEvidence`, `WorkOutcome`
- `CompletionSubmission`, `CompletionResponse`
- `ServiceIncident`, `OperationsCase`

Start OTP creates the authoritative work start. Completion is two-step: Partner submission followed by
Customer confirmation, dispute, or time-bounded automatic finalization. Each scope line records
`COMPLETED`, `PARTIAL`, `NOT_STARTED`, `BLOCKED` or `NOT_APPLICABLE` with quantity and reason.

Evidence is private, purpose-bound, access-audited, malware-scanned and retained by policy. A failed
upload cannot be represented as completed evidence.

## Money

Core records:

- `FeeRule`, `TaxRule`, `CommissionRule`, `CancellationPolicy`
- `PaymentAttempt`, `PaymentEvent`, `Refund`, `ReconciliationRecord`, `PaymentDispute`
- `PartnerLedgerEntry`, `PayoutAccount`, `PayoutAttempt`

Money is integer paise. Percentage calculations use decimal arithmetic and persist rounded lines.
Every booking, amendment, refund, compensation and payout points to the immutable rule/version that
produced it.

Partner earnings progress through `ESTIMATED`, `PENDING_COMPLETION`, `PENDING_DISPUTE_WINDOW`,
`AVAILABLE`, `RESERVED_FOR_PAYOUT`, `PAID` or `REVERSED`. A cached balance is never the ledger.

## Safety, quality and support

Core records:

- `SafetyReport`, `DamageClaim`, `QualityDispute`, `WarrantyClaim`
- `CustomerPartnerBlock`
- `OperationsCase`, `CaseAction`, `CaseSla`

All exceptional work enters a typed case with severity, owner, deadline, evidence and allowed domain
commands. Case types cover assignment failure, late/no-show, unsafe work, property damage, partial
work, quality dispute, refund failure, payment ambiguity, payout ambiguity, KYC, privacy and abuse.

A mutual block affects future matching and never rewrites historic assignments. Safety access is more
restricted than ordinary booking support.

## Archetype-owned aggregates

The following appear only when their milestone begins:

- `A4`: `BookingSeries`, `SeriesVisit`, pause/skip/substitution and billing cycle
- `A5`: `ProjectRequest`, `PartnerProposal`, `ProjectAgreement`, `Milestone`, `ChangeOrder`
- `A6`: `ProviderOrganization`, `Membership`, `Shift`, `AttendanceEvent`, wage rule
- `A7`: `RentalAsset`, `InventoryReservation`, `Handover`, `ReturnInspection`, deposit
- `A8`: `Trip`, `Vehicle`, `DriverAssignment`, `Route`, tracking consent and position retention
- `A9`: `Property`, `UnitInventory`, `StayReservation`, guest and check-in/out policy
- `A10`: `Listing`, `Application`/`Lead`, moderation and contact policy

No nullable foreign key to one of these aggregates is added before its model exists.

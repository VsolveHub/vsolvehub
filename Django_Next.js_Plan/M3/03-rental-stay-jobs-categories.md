# A7 Rental, A9 Stay, A10 Listing/Careers — M3 Phase D

**Status:** Planning — no implementation started
**Depends on:** Phase B (real Razorpay on staging — checkout for A7/A9 needs a live capture path);
Phase C schema only where noted (V Coins/wallet burn on new-category checkout is `M3-BE-304`, after
Phase C's checkout integration exists)
**Blocks:** Phase E analytics for these three categories; Phase F staging acceptance's "11 web
categories demonstrable" claim

This document is the design authority for Phase D until an ADR
(`docs/adr/0011-a7-a9-a10-archetype-engines.md`) is merged. If they disagree, fix the defect in the
same change.

---

## 1. Scope boundary

**In scope — exactly three archetypes, each with its own native lifecycle engine:**

| Archetype | Customer buys | Categories (M3 launch) |
| --- | --- | --- |
| `A7_RENTAL` | Temporary possession of a physical asset | Tools, generators, vehicles, equipment |
| `A9_STAY` | Nights in a property unit | Rooms, PG, hostel, hotel |
| `A10_LISTING` | Discovery, contact and application against a posting | Career/Jobs (launch subcategory); designed to generalize |

**Out of scope for this document (owned elsewhere):**

| Excluded | Owner |
| --- | --- |
| Customer wallet, V Coins, referral domain design | [`01-wallet-vcoins-referral.md`](01-wallet-vcoins-referral.md) — this document only names the checkout **integration point** (§6) and reserves `M3-BE-304` |
| Live Razorpay/MSG91 activation mechanics | `02-real-payments-and-otp.md` (not yet written) — this document assumes Phase B's payment/OTP primitives exist and only names the new `PaymentAttempt.Purpose` values A7/A9 need |
| Operations analytics, exports, GST/TDS reports | `04-operations-analytics.md` (not yet written) |
| Mobile apps, Rapido, AI chatbot, public go-live | M4, per the top-level roadmap and `M3/README.md` |
| A8 trip (driver/vehicle dispatch, consented tracking) | Not in M3's commercial scope; excluded per `09-delivery-roadmap.md` |
| Vendor subscription **charging** mechanics (Razorpay collection for a recurring plan) | Overlaps `01-wallet-vcoins-referral.md`'s checkout integration; this document defines the subscription **domain model** only (§5.6) and reuses the same `PaymentAttempt` path — no parallel billing system |

**Dependencies — what must already exist:**

- Identity/OTP/session/role infrastructure (M1 `identity`) — Customer, Partner and Operations actors
  are unchanged; A7/A9/A10 add no new actor type.
- `PaymentAttempt` / `PaymentAllocation` / `Refund` / `RefundAllocation` (`apps/commerce`, ADR-0003) —
  every archetype in this document is a **new consumer** of the existing allocation model, following
  the M2 precedent of adding `Purpose` values for post-cart charges (§6.1).
- `PartnerLedgerEntry` / `PayoutBatch` (`apps/payouts`) — rental/stay vendor earnings and job-listing
  vendor billing settle through the same ledger, not a parallel earnings table.
- `OutboxEvent` (`apps/foundation`) — generic `aggregate_type`/`aggregate_id` outbox; A7/A9/A10 emit
  through it with no schema change required.
- `PartnerCapability` / `PartnerBusinessProfile` (`apps/partners/models/capabilities.py`) — the M2
  capability-per-archetype model. A7/A9/A10 vendors (rental asset owners, property hosts, employers)
  register as a **new capability per archetype**, reusing this exact table by adding archetype enum
  values (§2, §3).
- `Category` / `Subcategory` / `Service` / `ServiceVariant` (`apps/catalog`) — the three new
  categories are new catalog rows; `ServiceVariant.BookingArchetype` gains three new members.
- `KillSwitch`, `NotificationIntent`/`NotificationDelivery` (`apps/notifications`) — reused unchanged;
  A7/A9/A10 add new notification templates, not a new delivery mechanism.
- `Address` (`apps/locations`) — reused for rental pickup/delivery address and stay property address;
  no new geocoding path.

**Explicit non-goals for M3 Phase D:**

- No public go-live. Staging only, same as the rest of M3.
- No search engine (Elasticsearch/OpenSearch/pgvector). The codebase has none today (verified: no
  full-text search infrastructure exists anywhere in `backend/apps/`); A10 listing search is ORM
  filtering over indexed columns, matching how `catalog` public discovery already works.
- No messaging/chat system. The codebase has none today. A10 contact protection (§5.4) is masked
  reveal + rate limiting on top of the existing masked-calling adapter pattern from
  `08-security-quality-and-production.md`, not a new inbox product.
- No automatic cashback, coupon or promo-code engine beyond what `01-wallet-vcoins-referral.md`
  already scopes for coins/referral.
- No Booking Group / Fulfilment Unit / Fulfilment Plan participation. A7, A9 and A10 do not go
  through the multi-service planner (`12-booking-groups-and-fulfilment-planning.md` is explicit that
  "rentals, trips, stays and listings are not forced through visit planning merely to appear in a
  universal cart").

---

## 2. Reuse vs Extend vs New

Classification is cross-checked against the actual models read in `backend/apps/` on 2026-09-01.
"Reuse" means the existing table/service is used with zero schema change. "Extend" means an existing
enum, model or service gains new members/branches but keeps its identity. "New" means a table or
service does not exist today under any name that represents the same concept.

| Capability | Classification | Evidence |
| --- | --- | --- |
| Actor identity, OTP, sessions, roles | **Reuse** | `apps/identity` — no new actor type; a rental owner, a property host and a job vendor are all `PartnerProfile` with a new `PartnerCapability.archetype` |
| Partner/vendor capability review and workspace grant | **Extend** | `PartnerCapability.archetype` is `ServiceVariant.BookingArchetype` verbatim (`workspace_key` property returns `self.archetype`); adding `A7_RENTAL`/`A9_STAY`/`A10_LISTING` to the enum extends this table with zero new columns |
| Business identity for a vendor with a registered entity | **Reuse** | `PartnerBusinessProfile` already models `INDIVIDUAL` / `WORKFORCE_AGENCY` / `PROJECT_VENDOR`; extend `BusinessType` with `RENTAL_OWNER`, `PROPERTY_HOST`, `EMPLOYER` where GST/registration fields differ, or reuse `INDIVIDUAL`/existing types where they do not — decided per-category in Wave D1 |
| Payment capture, webhook, reconciliation | **Reuse** | `apps/commerce` `PaymentAttempt`/`PaymentWebhook`/`Refund` — new `Purpose` values only, exactly the M2 precedent (`M2_QUOTE_UNLOCK`, `M2_BOOKING_FEE`, etc. added without a second payment aggregate) |
| Money-to-work allocation | **New, parallel to `PaymentAllocation`** | `PaymentAllocation` has **required, non-null** FKs to `FulfilmentUnit` and `FulfilmentUnitLine` (verified in `apps/commerce/models.py`) — A7/A9/A10 have no Fulfilment Unit. A new `RentalPaymentAllocation` / `StayPaymentAllocation` / listing equivalent is required, following the *same allocation pattern and the same ADR-0003 invariant* (sum of allocations reconciles to the transaction) but pointing at `RentalBookingLine` / `StayReservationLine` instead. This is "new schema, reused architecture" — see §6 |
| Partner/vendor earnings ledger | **Extend** | `PartnerLedgerEntry.booking` is nullable and already `PROTECT`-only to `Booking`; it cannot reference a `RentalBooking` or `StayReservation` today. Add nullable `rental_booking` / `stay_reservation` FKs (mutually exclusive with `booking` and each other via the same "exactly one scope" check-constraint pattern `Reservation.site_visit` already uses) rather than inventing a second ledger table |
| Partner/vendor payout batching | **Reuse** | `PayoutBatch` / `PayoutBatchItem` operate on `PartnerLedgerEntry.status`, which is archetype-agnostic once the extension above lands |
| Asset/unit calendar locking (overlap prevention) | **New, same pattern as `Reservation`** | `assignments.Reservation` uses a partner-scoped PostgreSQL `ExclusionConstraint` over `occupied_range`. A7 needs asset-scoped exclusion (not partner-scoped — two customers cannot rent the same *asset*, regardless of which vendor employee handles it) and A9 needs unit-scoped exclusion. These are **new models** (`AssetReservation`, `UnitReservation`) using the **identical constraint technique**, not a widening of `Reservation` itself (a rental asset is not a Partner and forcing it through `Reservation.partner` would misrepresent who is "busy") |
| Outbox/domain events | **Reuse** | `OutboxEvent` is generic (`aggregate_type`, `aggregate_id`); A7/A9/A10 emit through it unchanged |
| Idempotency records | **Reuse** | `IdempotencyRecord` keyed by `(actor, operation, key)`; unchanged |
| Notification delivery | **Reuse** | `NotificationIntent`/`NotificationDelivery`; new templates only |
| Catalog taxonomy | **Extend** | `Category`/`Subcategory`/`Service`/`ServiceVariant` — three new categories, `ServiceVariant.BookingArchetype` gains `A7_RENTAL`, `A9_STAY`, `A10_LISTING`; new `A7VariantConfiguration`/`A9VariantConfiguration`/`A10VariantConfiguration` companion models follow the exact shape of `A1VariantConfiguration`/`M2VariantConfiguration` (archetype-specific config lives beside catalog, not inside it) |
| A7 product-type browse taxonomy | **Reuse** | The owner's category spreadsheet's "Rental Services" section (verified rows: `Category="Rental Services"`, `Subcategory` values `Event Furniture Rental`, `Tent/Shamiana`, `Lighting Rental`, `Sound System Rental`, `Décor Items Rent`, `Catering Equipment`, `Construction Equipment`, `Home Appliance Rental`, `Furniture Rental (Home/Office)`, `Camera & Media Equipment`, `Tools & Machinery`, each with many `Service` rows, e.g. `AC` under `Home Appliance Rental`, `Drilling Machine` under `Tools & Machinery`) maps onto `Category → Subcategory → Service` exactly as A1 already uses it — **no separate rental taxonomy or filter engine is built**; customer browse for A7 is a `Service`/`ServiceVariant` selection, identical in mechanism to A1's (§4.1a) |
| A9 filter/attribute taxonomy | **Reuse** | The spreadsheet's "Rooms / PG / Hostel / Hotels" section (subcategories `Rooms`, `PG Accommodation`, `Hostels`, `Bed Space`, `Co-Living Spaces`, `Apartments`, `Rental Properties`, `Short Stay`, `Student Accommodation`, `Worker Accommodation`, `Property Listing`, `Premium Stays`) supplies both the `Category/Subcategory/Service` rows for stay-type browse **and** the structured filterable attributes (sharing type, AC/non-AC, food included, budget/luxury tier, stay-duration mode) that map onto `ServiceQuestion`/`ServiceQuestionOption` — the same structured-attribute model A10 already uses for `structured_fields`, applied here to `Unit`/`UnitPricingRule` filtering (§5.1a) instead of invented afresh |
| A7 customer-facing listing de-duplication | **New, read-optimized rollup — same technique as `catalog.selectors.public_categories`'s `service_count` annotation** | No table stores this; `public_categories()` already computes a display rollup via `Subcategory.objects.annotate(service_count=Count("services", filter=...))` (verified `backend/apps/catalog/selectors.py`) rather than a denormalized count table. `RentalListingGroup` follows the identical precedent: a query-time `GROUP BY (partner, variant, price_paise, condition_grade)` over `RentalAsset` with a `quantity_available` aggregate, not a new persisted table (§4.1a, §11) |
| A9 room-type de-duplication | **New, same technique as A7's `RentalListingGroup`, parallel pattern** | `UnitType` groups `Unit` rows sharing identical bookable attributes (sharing count, AC, bathroom type, furnishing, base rate) under one `Property`. Unlike `RentalListingGroup` this **is** a persisted table, not a query-time rollup, because `UnitPricingRule` and `PropertyPolicy` attach more naturally at the room-type level than per-physical-`Unit` (§5.1a decides the reasoning explicitly) — the two archetypes reach different reuse-vs-new answers for a structurally similar problem, and §5.1a states why |
| Address / geocoding | **Reuse** | `apps/locations.Address` for rental pickup/delivery and stay property address; A9 additionally needs a `Property` model that **owns** an address (see §4.1) rather than reusing the Customer-owned `Address` table directly |
| Search / discovery | **New, minimal** | No search infra exists anywhere in the codebase today. A10 (and A7/A9 browse) is ORM filtering with database indexes, matching how `catalog` public discovery already works — not a new search product |
| Messaging / contact reveal | **New, minimal** | No messaging system exists. A10 contact protection reuses the *masked-calling adapter pattern* named in `08-security-quality-and-production.md`, applied to phone reveal; it does not build a chat/inbox product |
| Deposit / damage financial sub-lifecycle | **New** | Nothing in M1/M2 models a refundable hold distinct from a service fee. New `RentalDeposit` / `StayDeposit` records, settling through the same `PaymentAttempt`/`Refund` machinery as a capture-then-partial-refund, per §6 |
| Operations case workspace | **Extend** | `apps/cases` (`OperationsCase`, `CaseAction`, `CaseSla` per `02-domain-model.md`) gains new `case_type` values (§8); the case model itself is archetype-agnostic |

### 2.1 Do NOT reuse — explicit boundary list

| Confusion to avoid | Why it is wrong | What to use instead |
| --- | --- | --- |
| **Rental = Visit** | A `Booking` (`apps/commerce`) is one operational visit: one address, one slot, one lead Partner, one start-OTP contract, one work outcome. A rental is temporary **possession of a fungible or serialized asset** across a date range with no "arrival"/"start OTP"/"scope line completion" semantics — the closest A1 concept (arrival) does not exist; handover does. Forcing a rental through `Booking`/`WorkSession`/`BookingOtp` would fabricate an OTP-gated "work start" for an act of custody transfer | `RentalBooking` (new, §4.1) |
| **Stay = Visit** | Same reasoning: a stay is occupancy of a **unit** across nights, not a Partner performing task work at an address. There is no Partner "arrival" to the Customer's location — the Customer arrives at the property. `EN_ROUTE`/`ARRIVED`/`WorkOutcome` do not apply | `StayReservation` (new, §4.2) |
| **Listing = Booking** | A listing has no operational fulfilment at all — no assignment, no work, no completion. Forcing it through `Booking` to "reuse tables" (a mistake `03-lifecycle-and-state-machines.md` explicitly names and forbids for A10) would create dead columns (`fulfilment_status`, assignment relation) on every job post | `Listing` + `Application` (new, §5) |
| **Asset availability = Partner calendar** | `assignments.Reservation`'s exclusion constraint is scoped to `partner` — it answers "is this *person* busy". An asset (a specific drill, a specific car) is busy independent of which employee of the rental vendor currently holds the keys; two different employees cannot rent out the same drill simultaneously even if both are personally "available" | `AssetReservation` scoped to `asset`, not `partner` (§4.1) |
| **Property inventory = Partner availability** | Same distinction for A9: a unit's occupancy is a property fact, not a fact about the host's personal schedule. A host with 20 rooms is never "busy" in the `PartnerAvailabilityRule` sense; individual **units** are reserved | `UnitReservation` scoped to `unit`, not `partner` (§4.2) |
| **Deposit = Service fee** | `PriceRevision`/`ScopeAmendment` model *additional chargeable work*; a deposit is a **refundable hold against a future contingent liability** (damage, loss, late return) that is fully or partially returned when the contingency does not occur. Modelling a deposit as a service-fee line would make it non-refundable-by-default and would show it as platform revenue, which it structurally is not | `RentalDeposit`/`StayDeposit` (new, §4.1/§4.2/§6) |
| **Application = Booking** | An `Application`/`Lead` against a listing has no payment, no assignment, no fulfilment — it is a **contact/interest record** between two Customer-type actors (applicant and employer/vendor), neither of whom is necessarily a `PartnerProfile`. The platform is not a party to the outcome the way it is to a booking | `Application` (new, §5.3) |

---

## 3. Vendor/Partner identity across the three archetypes

All three archetypes reuse `PartnerProfile` + `PartnerCapability` + `PartnerBusinessProfile` for the
supply-side actor — a rental asset owner, a property host, and a job-posting employer/vendor are all
Partners with a new `archetype` value on their capability, exactly as an A3 workforce agency or A5
project vendor already are. This is the single most load-bearing reuse decision in this document: it
means Partner onboarding, KYC, document review, suspension/offboarding, and the workspace-grant
mechanism (`GET /api/v1/partner/workspaces/`) all extend automatically once the enum gains three
members — no new registration pipeline.

`commercial_mode_for_archetype` (currently `LEAD_ONLY` for A3, `MANAGED_PAYMENT_REQUIRED` for A5)
gains three branches:

| Archetype | Commercial mode | Rationale |
| --- | --- | --- |
| `A7_RENTAL` | `MANAGED_PAYMENT_REQUIRED` | Platform collects payment and deposit, then settles the vendor via ledger — same shape as A5 |
| `A9_STAY` | `MANAGED_PAYMENT_REQUIRED` | Same — platform collects the stay payment/deposit at reservation time |
| `A10_LISTING` | `NOT_APPLICABLE` | No booking payment exists; the only money is the vendor's own subscription/premium-listing purchase (§5.6), which is a *B2B* charge from vendor to platform, not a marketplace transaction the platform mediates between two customers |

---

## 4. A7_RENTAL

### 4.1 Domain model

```text
RentalAsset               one physical or serialized item, or a fungible unit-count line
  ├─ RentalAssetCategoryProfile   category-specific attributes (JSON-schema validated, A7VariantConfiguration-driven)
  ├─ RentalAssetMedia             condition photos at onboarding
  └─ RentalMaintenancePeriod      vendor-declared unavailability (service, repair)

RentalBooking              one confirmed rental of one asset (or asset-quantity) for one date range
  ├─ RentalBookingLine            quantity/asset reference, price, deposit component
  ├─ AssetReservation             the exclusion-constrained hold (see §4.2 concurrency)
  ├─ RentalHandover                outbound condition check + evidence
  ├─ RentalReturnInspection        inbound condition check + evidence
  ├─ RentalDeposit                 authorization/hold/consumption/refund sub-lifecycle
  └─ RentalExtension                immutable extension revision (new dates, new price/deposit delta)
```

`RentalAsset` fields (planning): `id`, `partner` (FK `PartnerProfile`), `variant` (FK
`ServiceVariant`, `booking_archetype=A7_RENTAL`), `title`, `asset_identifier` (serial/plate number,
blank for fungible pooled assets), `is_serialized` (bool — a specific asset vs. an interchangeable
pooled quantity), `quantity_available` (used only when `is_serialized=False`), `condition_grade`,
`current_status` (`ACTIVE`, `UNDER_MAINTENANCE`, `RETIRED`), `pickup_address` (FK `Address`, nullable
for delivery-only assets), `service_areas` (M2M `ServiceArea`, same pattern as
`PartnerCapability.service_areas`), `created_at`, `updated_at`. Immutable once a booking references
it except `current_status`, `condition_grade` (post-inspection) and `quantity_available`.

`RentalBooking` carries its own `status` enum (§7.1), a `customer` FK, `asset` FK (or
`asset_category` + `quantity` for fungible pooled rentals), `rental_start`/`rental_end` (date range,
not `DateTimeRangeField` — a rental is day-granular unless the category configuration says
otherwise), `pickup_or_delivery_mode`, `price_paise` breakdown (base + delivery + tax), and a
`deposit` FK to `RentalDeposit`.

### 4.1a Browse/search model — product-type first, then owner list

**This is a correction to the browse model, made explicit here because it governs how §4.1's
domain model is queried, not because the domain model itself changes.**

Customer discovery for A7 is two-step, and the two steps use different levels of the existing
catalog hierarchy:

1. **Product type first.** The customer browses/searches `Category → Subcategory → Service`
   exactly as A1 already works (§2's "A7 product-type browse taxonomy" row) — e.g. Category
   "Rental Services" → Subcategory "Home Appliance Rental" → Service "AC Rental", or Subcategory
   "Tools & Machinery" → Service "Drill Machine". No new taxonomy, filter engine or search index is
   introduced; this is the same `public_categories()`/`public_services_for_category()` ORM-filter
   pattern `catalog/selectors.py` already implements for A1.
2. **Owner list second.** Having picked a `Service`/`ServiceVariant`, the customer sees a list of
   *different vendors* (`PartnerProfile`s) each offering that product type — their own branding
   (business name, rating, photos) and their own price, because each vendor's `RentalAsset` rows
   against that variant are independently owned and independently priced. The customer explicitly
   chooses which vendor's listing to book.

**This is deliberately not A1's model, and the difference is load-bearing, not incidental.** In A1
(`04-availability-assignment-and-dispatch.md` §"Scheduled and Today assignment", §"Ranking"), the
backend ranks eligible Partners and sends a bounded offer to one at a time — the customer "sees unit
count... but not Partner identity before disclosure policy permits it." Vendor identity is dispatch
machinery, invisible to the customer until assignment is final. A7 does the opposite on purpose: the
vendor's identity and branding is exactly what the customer is choosing between, because a rental
asset has no "arrival"/"assignment" step to protect the customer from premature disclosure — the
customer is picking a specific seller's specific priced item, closer to a marketplace-of-sellers
(one product, many storefronts) than to A1's single-dispatch-target model. No ranking/offer/accept
machinery from `04-availability-assignment-and-dispatch.md` is reused for A7 vendor selection; the
customer's own choice *is* the selection mechanism.

**De-duplication — `RentalListingGroup`.** If one vendor lists several identical items (e.g. 5
identical Bosch drills, same condition grade, same price), the browse/search result for that vendor
under that product type must be **one card with `quantity_available`**, not five cards. This
introduces two distinct levels, both already implied by §4.1's `is_serialized`/`quantity_available`
fields but not previously surfaced as a display concept:

- **Display/browse level — `RentalListingGroup`** (query-time rollup, not a stored table; see §2
  and §11): a `GROUP BY (partner, variant, price_paise, condition_grade)` over `RentalAsset`,
  annotated with `quantity_available = Sum/Count` of matching active `RentalAsset` rows (fungible)
  or a count of un-reserved serialized rows for that group (serialized). This is what the customer
  sees and selects — it has no independent identity, status or lifecycle; it is a read projection.
- **Locking level — the existing `AssetReservation`/fungible-pool mechanism (§4.2), unchanged.** The
  actual specific serialized asset, or a slot decremented from the fungible pool, is allocated only
  at booking-hold time, behind the selected `RentalListingGroup` card. §4.2's exclusion-constraint
  and `select_for_update` logic is exactly as already documented and remains the sole authority for
  "is this rentable right now" — `RentalListingGroup` never itself holds or blocks availability.

### 4.2 Availability model

- **Scope of the hold is the asset, not the vendor.** `AssetReservation` uses a PostgreSQL
  `ExclusionConstraint` identical in technique to `assignments.Reservation` but keyed on `asset`
  instead of `partner`:

  ```text
  ExclusionConstraint(
      expressions=[("asset", EQUAL), ("occupied_range", OVERLAPS)],
      condition=Q(status__in=("TENTATIVE", "CONFIRMED")),
  )
  ```

  For a fungible pooled asset (`is_serialized=False`), the exclusion constraint cannot express
  "no more than N concurrent holds" — that is a count invariant, not an overlap invariant. Fungible
  assets use a `select_for_update` row lock on the `RentalAsset` row plus a application-level
  capacity check inside the same transaction that creates the reservation, following the documented
  pattern in `01-platform-architecture.md` ("Conditional updates or `select_for_update` resolve
  competing transitions") rather than a second constraint family.

- **Three distinct states, matching the top-level design's availability/reservation/confirmed
  vocabulary:** availability is the asset's calendar with no hold; a `TENTATIVE` `AssetReservation`
  is a checkout-in-progress hold (short TTL, same expiry-driven release as `Reservation.TENTATIVE`);
  a `CONFIRMED` `AssetReservation` backs a paid `RentalBooking`.

- Maintenance periods (`RentalMaintenancePeriod`) block asset availability the same way a Partner
  `PartnerAvailabilityException` blocks Partner time — vendor-declared, Operations-auditable, and
  checked at both display time (advisory) and checkout time (authoritative, same
  "false availability fails closed before charge" rule as document 00).

- **Relationship to §4.1a's `RentalListingGroup`:** the group is a display-layer aggregate only —
  it never participates in the exclusion constraint or the `select_for_update` capacity check above.
  A hold/booking always resolves to one concrete `RentalAsset` (or one decremented unit of a
  fungible `RentalAsset.quantity_available`) at creation time, using exactly the two-branch locking
  strategy already described in this section. `RentalListingGroup`'s own `quantity_available` figure
  is therefore always a read-time recomputation from the same `RentalAsset` rows the lock operates
  on, never a separately maintained counter that could drift from the authoritative lock state.

### 4.3 Booking lifecycle

```text
DRAFT (browsing)
  → HELD              tentative AssetReservation created, checkout in progress
  → PAYMENT_PENDING    price + deposit authorization requested
  → CONFIRMED          payment captured, deposit authorized/held, AssetReservation CONFIRMED
  → HANDED_OVER         vendor releases custody, RentalHandover recorded with condition evidence
  → ACTIVE              rental period in progress
  → EXTENDED            (loops back to ACTIVE; RentalExtension revision recorded)
  → RETURN_PENDING       customer/vendor initiates return
  → RETURNED             asset physically back with vendor, RentalReturnInspection begun
  → INSPECTED             condition check complete, settlement matrix applied (§4.5)
  → SETTLED              deposit consumed/refunded per matrix outcome
  → COMPLETED            terminal, no open deposit or dispute

Cancellation/failure branches:
  DRAFT|HELD → EXPIRED | CANCELLED
  PAYMENT_PENDING → FAILED (release hold, no booking)
  CONFIRMED → CANCELLED (before handover; refund policy per §4.6)
  ACTIVE|RETURN_PENDING → DISPUTED (damage/loss claim opened, settlement blocked pending Operations)
  Any pre-handover state → RECOVERY_REQUIRED (asset became unavailable — vendor pulled it, maintenance
    discovered) → reassignment to an equivalent asset if the category supports substitution, or refund
```

`RECOVERY_REQUIRED` mirrors A1's semantics from `03-lifecycle-and-state-machines.md`: it makes the
loss of the specific committed asset explicit rather than pretending the booking is still healthy.

### 4.4 Deposit sub-lifecycle

The deposit is modelled as its own state machine, not a boolean flag on `RentalBooking`, because it
has independent timing (it may be released before the booking is `COMPLETED`, e.g. on early return
with no damage) and independent actors (Operations can intervene on the deposit without touching the
booking's fulfilment state):

```text
NOT_REQUIRED | REQUIRED
  → AUTHORIZED           captured at checkout via a distinct PaymentAttempt.Purpose (A7_DEPOSIT_HOLD)
  → HELD                 handover complete, deposit stays authorized through the rental period
  → PARTIALLY_CONSUMED    return inspection found chargeable damage/lateness less than full deposit
  → FULLY_CONSUMED        return inspection found chargeable amount ≥ deposit
  → RELEASED              no chargeable finding — full refund to original funding source
  → DISPUTED               customer contests the consumption decision — Operations case opens
  → RESOLVED               Operations decision applied, terminal
```

Deposit is **authorized, not captured**, at checkout wherever the payment provider supports an
auth/capture split (Razorpay order + later capture, mirroring the A8/Instant
"authorization-before-dispatch" pattern in `04-availability-assignment-and-dispatch.md` applied to a
different risk: asset-return risk instead of Partner-acceptance risk). Where the configured payment
method cannot support hold-without-capture, the deposit is captured immediately and "release" means
an actual refund, not an authorization void — the domain records which mode was used
(`RentalDeposit.capture_mode`) so settlement logic and Customer-facing copy stay honest about
provider mechanics.

### 4.5 Settlement matrix

| Case | Who initiates | Who approves | Money calculation | Deposit consumed? | Extra payment needed? | Refund | Dispute path | Operations role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Normal return, on time, no damage | Vendor (return inspection) | Auto-approved on vendor confirmation + no customer dispute within response window | 0 | No | No | Full deposit released | Customer may still dispute within window | None unless disputed |
| Late return | Vendor (records actual return time) | Auto-approved from configured per-day late fee rate | `late_fee = per_day_rate x days_late`, capped at deposit unless configured to bill beyond | Partial, up to fee | Only if fee exceeds deposit | Deposit minus fee | Customer disputes lateness cause (e.g. vendor delay accepting return) | Reviews disputed lateness attribution |
| Minor damage | Vendor (return inspection + evidence) | Auto-approved up to a configured minor-damage cap; above cap requires Operations | `repair_estimate` from vendor-declared catalog of common damage types (configuration, not free text — same rule as "Uncatalogued work becomes... an Operations-assisted quote, not a hidden free-text charge" in document 05) | Partial | Only if estimate exceeds deposit | Deposit minus estimate | Customer disputes the damage claim itself | Reviews uncatalogued or capped-exceeding claims |
| Major damage | Vendor (evidence-required declaration) | **Always** Operations (maker-checker above a configured threshold, per `08-security-quality-and-production.md`) | Assessed value, may require third-party estimate reference stored as evidence | Full, likely insufficient | Likely yes — new `PaymentAttempt` (`A7_DAMAGE_SETTLEMENT`) against customer, off-platform recovery if declined | None or partial deposit remainder | Standard dispute/appeal per document 06 | Owns the case end-to-end |
| Lost asset | Vendor (after configured missing-return grace period) | Always Operations | Full replacement value (asset's declared value at onboarding) minus deposit already held | Full | Yes if replacement value exceeds deposit | None | Escalates to `SafetyReport`/fraud review if pattern suggests theft | Owns; may block customer account pending resolution |
| Missing accessory | Vendor (return inspection line-item) | Auto-approved from catalog accessory replacement cost, same as minor damage | Catalogued accessory cost | Partial | Only if exceeds deposit | Deposit minus cost | Customer disputes | Reviews disputed lines |
| Disputed damage (customer denies) | Customer (dispute action within response window) | Operations | Frozen pending investigation — no auto-settlement | Held, not consumed, during dispute | Deferred | Deferred | This *is* the dispute path — `QualityDispute`/`DamageClaim` per document 02 | Adjudicates using handover + return evidence comparison |

Every row's evidence requirement follows the existing rule "no evidence means no [charge]" from
document 06 (§ "Arrival and Customer unavailable"): a vendor damage claim without photographic
evidence at both handover and return cannot auto-settle and routes to Operations regardless of
amount.

### 4.6 Handover, extension, return

- **Handover** (`RentalHandover`): vendor records outbound condition (required photo evidence per
  configured policy), customer or vendor confirms receipt; this is the rental's equivalent of A1
  "arrival + start" collapsed into one event because there is no separate "work start" — custody
  transfer *is* the start of the rental period. No OTP is used (there is no scope-line "work" to
  authorize); the record is timestamp + evidence + optional signature capture, matching the general
  evidence rules in document 08 (private, purpose-bound, access-audited).
- **Extension**: `RentalExtension` is an immutable revision, not an edit to `RentalBooking` — the
  same "immutable revision and approval" discipline as A1 scope amendments (ADR-025). It requires:
  asset availability re-check for the extended range (may fail if another `AssetReservation` already
  claims the extended window — this is the "extension conflict" Operations-recovery scenario, §8),
  new price line, and payment before the extension takes effect.
- **Return** (`RentalReturnInspection`): mirror of handover — condition photos, vendor-declared
  findings against the catalogued damage/accessory list, drives the settlement matrix.

### 4.7 Partner (vendor) workspace

Not a copy of A1's Offers/Jobs shape — a rental vendor manages **inventory and calendar**, not
per-visit offers, because there is no Partner-acceptance step (the vendor *is* the supply; there is
no dispatch/ranking/offer-decline cycle for a specific vendor's own asset).

| Section | Contents | Why different from A1 |
| --- | --- | --- |
| **Home** | Active rentals due for handover/return today, pending extension requests, open deposit disputes | No "offers to accept" — a rental booking against the vendor's own asset confirms directly on payment, there is no acceptance step |
| **Assets** | CRUD for `RentalAsset`, condition photos, maintenance period calendar, per-asset booking calendar | A1 has no equivalent — a Technician has skills, not owned inventory |
| **Bookings** | List/detail of `RentalBooking` by status, handover/return actions, extension approval | Replaces A1's "Jobs" — no en-route/arrived/start-OTP actions exist here |
| **Money** | Deposit-holds outstanding, settled deposit history, ledger entries, payout batch status | Same `PartnerLedgerEntry`/`PayoutBatch` reuse as A1's Earnings, but line items are rental-specific (`kind` values distinguish rental earning from deposit-consumption pass-through) |

---

## 5. A9_STAY

### 5.1 Domain model

```text
Property                   one physical building/compound, owned by one Partner (host)
  ├─ PropertyMedia
  ├─ PropertyPolicy         check-in/out times, guest limits, cancellation policy, ID requirements (§5.3)
  └─ UnitType               one room-configuration group within the property (§5.1a) — sharing
       │                     count, AC/non-AC, bathroom type, furnishing, base rate; what the
       │                     customer filters/selects
       └─ Unit               one bookable physical room/bed/apartment, belonging to exactly one
            ├─ UnitPricingRule    UnitType; nightly rate + date-specific overrides attach at the
            └─ UnitMedia           UnitType level and apply to every Unit under it (§5.1a)

StayReservation             one confirmed stay of one unit for one date range
  ├─ StayReservationLine     nights x rate + fees/taxes breakdown
  ├─ UnitReservation         the exclusion-constrained hold (§5.2)
  ├─ StayCheckIn / StayCheckOut  arrival/departure records + condition evidence
  ├─ StayDeposit              same sub-lifecycle shape as RentalDeposit (§4.4), reused structurally
  └─ StayExtension             immutable late-checkout/extended-stay revision
```

A Partner (host) can own multiple `Property` rows; each `Property` can have multiple `Unit` rows.
This is the explicit distinction from the service model: a Technician's "capacity" is time, a host's
capacity is **inventory** — N units, each independently bookable, none of which are "the Partner
personally doing work."

### 5.1a Browse/search model and room-type grouping

**Two entry paths, one underlying inventory.** The customer reaches the same `Property`/`UnitType`/
`Unit` data through either:

- **Property-first** (Booking.com/OYO-style): browse/search by property name, land on the
  property's page, see its branding and its list of `UnitType` cards.
- **Filter-first**: apply structured filters (e.g. "2-Sharing" + "PG" + "Monthly") and get a flat
  list of matching `UnitType` cards across *all* properties — each card still shows which property
  it belongs to, so branding is visible in the flat view too, never anonymized.

Both paths are different orderings/groupings of the same query surface — a UI/query difference, not
two data models or two availability engines. Neither path bypasses §5.2's lock.

**Filter taxonomy — reuse, not a new engine, extending §6.4's principle to A9.** Filters are the
same `ServiceQuestion`/`ServiceQuestionOption` structured-attribute pattern already verified in
`backend/apps/catalog/models.py` and already used for A10's `structured_fields` (§6.4's "reuse the
existing ORM-filter discovery pattern... not a new search architecture" applies identically here —
this is the explicit cross-reference §6.4 asks for). The filter option values are drawn from the
owner's category spreadsheet's "Rooms / PG / Hostel / Hotels" section (subcategories `Rooms`,
`PG Accommodation`, `Hostels`, `Bed Space`, `Co-Living Spaces`, `Apartments`, `Rental Properties`,
`Short Stay`, `Student Accommodation`, `Worker Accommodation`, `Property Listing`, `Premium Stays`;
row-level values such as `Gents PG`, `AC PG`, `Food Included PG`, `Double Sharing PG`,
`Dormitory Hostel`, `Monthly Stay`, `Hourly Stay`). These become structured, filterable fields on
`UnitType` (sharing type, AC/non-AC, food included/not, furnished/semi/unfurnished, budget/luxury
tier) plus the stay-duration mode field added to pricing in §5.3 — not free-text, not a new filter
model.

**De-duplication — `UnitType` is a real domain model, not a display trick.** If a property has 100
identical "2-Sharing, AC, attached bathroom, ₹9,000/month" rooms, the customer sees one card
("2-Sharing AC Room — ₹9,000/mo, 12 available"), not 100. Unlike A7's `RentalListingGroup` (§4.1a,
a query-time rollup), `UnitType` is a **persisted table**, because:

1. it is what the customer filters and selects — the unit of search/booking, not merely a display
   grouping over an existing table;
2. `UnitPricingRule`/`UnitPricingOverride` attach more naturally at the room-configuration level
   than per-physical-`Unit` — 100 identical rooms should not carry 100 duplicate pricing-rule rows;
3. the individual physical `Unit` remains what §5.2's exclusion-constraint lock operates on — the
   grouping layer sits strictly above it for display/selection, never replacing the lock.

This parallels A7's `RentalListingGroup` in *purpose* (both solve "one owner's many identical items
must show as one card with a count") but differs in *implementation* because A9's identical-items
carry rules (pricing, policy) that are more economically modelled once per configuration than
computed at query time over potentially thousands of `Unit` rows per large property.

**Room assignment and host-initiated reassignment.** Booking a `UnitType` card for specific dates
auto-assigns one specific available `Unit` behind it — the customer never sees or picks a room
number (mirrors A1's "assignment becomes firm... " principle: the *system*, not the customer, picks
the physical resource). The host **can** reassign a confirmed `StayReservation` to a different `Unit`
of the *same* `UnitType` (identical attributes) at any point before check-in, at no cost to the
customer and with no change to price, room-type, or any booked attribute — a deliberate,
zero-cost, like-for-like operational swap (e.g. the originally-assigned room needs last-minute
maintenance). This command (`operations_reassign_unit`'s host-initiated sibling — planning name
`host_reassign_unit`, §10.1) re-runs the same `UnitReservation` exclusion-constraint check against
the candidate `Unit` inside one transaction and is rejected if that `Unit` is not actually free for
the reservation's date range — it is concurrency-safe by construction, not a special-cased bypass of
§5.2's lock. This is explicitly **not** the same case as "host blocks/removes unit after reservation"
(§7.3, §8.2): that is an unrecoverable-without-Operations failure when no equivalent unit exists at
all; `host_reassign_unit` is a benign, always-available swap precisely because an equivalent unit
does exist and the host is choosing to use it.

### 5.2 Inventory/locking strategy

Identical technique to A7 (§4.2), scoped to `unit` instead of `asset`:

```text
ExclusionConstraint(
    expressions=[("unit", EQUAL), ("occupied_range", OVERLAPS)],
    condition=Q(status__in=("TENTATIVE", "CONFIRMED")),
)
```

`occupied_range` is a night-granular date range (checkout date is exclusive, matching standard
hospitality inventory semantics — a unit checked out on day N can be checked in again the same day
N). No fungible-pool exception is needed here (unlike A7's pooled-asset case) because every `Unit`
row is already a distinct database row representing one physical bookable inventory item — the
exclusion constraint alone is sufficient.

**Relationship to §5.1a's `UnitType`.** `UnitType` is the customer-facing search/selection and
pricing-attachment layer; it never appears in the exclusion constraint. Every `UnitReservation` and
every `StayReservation` still resolves to one specific `Unit` row, and this exclusion constraint
remains the sole authority for "is this room actually free" — including for the host-initiated
reassignment command in §5.1a, which re-checks this exact constraint against the candidate `Unit`
before switching.

### 5.3 Pricing model

`UnitPricingRule` attaches to `UnitType` (§5.1a), not per-physical-`Unit`: `duration_mode`
(`NIGHTLY`/`WEEKLY`/`MONTHLY`/`HOURLY` — a structured field, not a free-text label, matching the
"Monthly Stay"/"Hourly Stay" rows in the owner's spreadsheet's "Short Stay" subcategory and the
"filterable attribute" discipline of §5.1a), `base_rate_paise` (the unit rate for the selected
`duration_mode` — a nightly rate for `NIGHTLY`, a monthly rate for `MONTHLY`, etc., not a single
nightly figure with ad-hoc multiplication), effective-dated, plus `UnitPricingOverride` for
date-specific pricing (weekend/festival rates, `NIGHTLY` mode only — the other modes do not carry a
per-date override concept) — same effective-dating discipline as `TaskRate`/`CommissionRule` in
document 05. A `UnitType` may offer more than one `duration_mode` (e.g. a PG room bookable monthly
or, at a different rate, nightly) — each `duration_mode` is its own `UnitPricingRule` row, not a
computed conversion between modes, because per-night and per-month pricing for the same room are
independently set by the host, not mechanically derived from one another. Fees (cleaning, extra
guest) and taxes follow the same `FeeRule`/`TaxRule` reuse as every other archetype — no new tax
engine. Discounts: the codebase has **no promo/coupon engine today** (verified —
`01-wallet-vcoins-referral.md` explicitly defers cashback/coupons as an open question, OQ-05); A9
does not build one. Any "discount" a host wants to offer at launch is expressed as a lower
`UnitPricingOverride`, not a coupon code redemption system.

### 5.4 Full lifecycle

```text
search → availability check → HELD (tentative UnitReservation) → PAYMENT_PENDING
  → CONFIRMED (payment + deposit captured, UnitReservation CONFIRMED)
  → CHECKED_IN (StayCheckIn recorded, ID verification per policy)
  → IN_STAY
  → CHECKED_OUT (StayCheckOut recorded, condition evidence)
  → INSPECTED (damage/settlement matrix, mirrors §4.5 structurally)
  → SETTLED
  → COMPLETED

Branches:
  HELD → EXPIRED | CANCELLED
  PAYMENT_PENDING → FAILED
  CONFIRMED → CANCELLED (per cancellation policy band, §5.5) | NO_SHOW (grace period elapsed, no check-in)
  CONFIRMED → RECOVERY_REQUIRED (host blocks/removes unit after reservation — §8)
  IN_STAY → EARLY_CHECKOUT (guest leaves before booked end; settlement per policy)
  IN_STAY → EXTENDED (loops to IN_STAY; StayExtension revision, late-checkout is the 1-day case of this)
  CHECKED_OUT|INSPECTED → DISPUTED (damage claim)
```

Allowed transitions are enforced the same way as `03-lifecycle-and-state-machines.md`'s concurrent
transition rule: "the first committed valid transition wins," with no universal Customer/host
priority — financial correction after the fact uses refund/adjustment, never history rewriting.

### 5.5 Configurable guest policy

`PropertyPolicy` is Operations/host-configured data, matching how A1's `ServicePolicy` and A3's
attendance policy are configuration rather than hardcoded product rules:

| Field | Notes |
| --- | --- |
| `check_in_time` / `check_out_time` | Default times; early/late requests handled via `StayExtension` |
| `max_guests_per_unit` | Enforced at booking time |
| `id_verification_required` | Bool + which ID types accepted (matches KYC evidence-policy pattern) |
| `cancellation_policy` | Effective-dated, versioned, snapshotted at booking — same discipline as A1's `CancellationPolicy` (document 05), banded by days-before-checkin rather than days-before-visit |
| `no_show_policy` | Grace period + charge treatment (typically forfeits deposit, may forfeit first-night rate) |
| `deposit_policy` | Required/optional, amount or percentage, per property or per unit type |

### 5.6 Damage settlement financial recovery path

Structurally identical to §4.5's matrix (deposit consumption tiers, auto-approval threshold,
Operations-required tier, evidence-required-or-no-charge rule, audit trail via
`calculation_snapshot`-style JSON on the settlement record). The distinguishing case unique to stays
is **early checkout**: the settlement calculates a partial refund for unconsumed nights per the
cancellation-policy band in effect, which is a pricing recalculation, not a damage assessment — kept
as a separate settlement reason code so Operations reporting does not conflate "guest left early" with
"guest damaged the unit."

### 5.7 Partner (host) workspace

| Section | Contents | Why different from A1 |
| --- | --- | --- |
| **Home** | Arrivals/departures today, pending extension/early-checkout requests, open disputes | No offer-accept queue — same reasoning as A7 |
| **Properties** | CRUD `Property`, `Unit`, pricing rules, policy configuration, per-unit calendar | New concept entirely — A1 has no multi-unit inventory |
| **Reservations** | List/detail `StayReservation`, check-in/out actions, ID verification recording, reassign to an equivalent `Unit` within the same `UnitType` before check-in (§5.1a's `host_reassign_unit`, no cost/attribute change to the customer) | Replaces "Jobs"; the reassignment action has no A1 equivalent — A1 has no concept of the Partner swapping their own committed resource for an identical one |
| **Money** | Deposit holds, settled history, ledger, payout batch — same reuse as A7 §4.7 | Unchanged pattern |

---

## 6. A10_LISTING

### 6.1 Design principle

**Listing + Application is not Listing + Booking.** A `Listing` has no payment from the applicant, no
assignment, no fulfilment, no completion. Two independent Customer-type actors (poster and applicant)
interact through a moderated, rate-limited, contact-protected contact/interest record. The only money
in this archetype flows from the **poster** (vendor/employer) to the **platform**, for
posting/subscription/premium features — never between poster and applicant through the platform.

### 6.2 Domain model

```text
Listing                     one posting (career/job at M3 launch; generalized fields for future listing types)
  ├─ ListingMedia
  ├─ ListingModerationEvent  append-only moderation history
  └─ ListingReport            abuse/spam report against this listing

Application                 one applicant's interest against one Listing
  ├─ ApplicationAttachment    resume/portfolio (reuses evidence upload infra)
  └─ ApplicationStatusEvent   append-only status history

VendorSubscriptionPlan       Operations-configured plan (price, duration, listing limits, premium capabilities)
VendorSubscription           one vendor's active/expired subscription instance
```

`Listing` fields (planning): `id`, `poster` (FK `PartnerProfile` — the employer/vendor, using the
same capability-gated onboarding as every other archetype), `variant` (FK `ServiceVariant`,
`booking_archetype=A10_LISTING`), `title`, `description`, `structured_fields` (JSONField, validated
against a `ListingTypeSchema` from an `A10VariantConfiguration`, so "career/jobs" and a future
"property listings" or "adoption" subcategory share the model without a rigid fixed-column schema),
`status` (§6.3), `is_premium`, `expires_at`, `published_at`, `moderation_status`.

### 6.3 Lifecycle

```text
DRAFT → SUBMITTED_FOR_MODERATION → MODERATION_APPROVED → PUBLISHED → ACTIVE
  → EXPIRED (auto, at expires_at)
  → CLOSED (poster-initiated, e.g. position filled)
  → ARCHIVED (terminal, retained for audit/history)

Branches:
  SUBMITTED_FOR_MODERATION → MODERATION_REJECTED → DRAFT (poster edits and resubmits)
  PUBLISHED|ACTIVE → REMOVED (Operations takedown, e.g. abuse report upheld)
  ACTIVE → REPUBLISHED (explicit poster action after EXPIRED/CLOSED, creates new moderation cycle
    unless configuration allows fast-track republish for a clean-history poster)
```

| Action | Who can do it |
| --- | --- |
| Publish | Poster submits; Operations moderation gate before it becomes publicly visible (`MODERATION_APPROVED` required before `PUBLISHED`) — same "no unmoderated content goes live" discipline the safety chapter (document 06) requires for evidence and incidents |
| Moderate (approve/reject) | Operations only, with reason code on rejection (matching the `REVIEW_STATUSES_NEEDING_NOTES` pattern already enforced on `PartnerCapability`) |
| Edit | Poster, while `DRAFT` or after Operations sends it back; editing a `PUBLISHED` listing materially re-triggers moderation (no silent edit-around-moderation) |
| Republish | Poster, after `EXPIRED`/`CLOSED` |
| Expire | System, automatic at `expires_at` (Celery sweep, same family as offer/reservation expiry jobs in document 07) |
| Close | Poster |
| Remove | Operations only, always with reason and audit trail |
| Report abuse | Any authenticated Customer or applicant, via `ListingReport` |

### 6.4 Search

**Reuse the existing ORM-filter discovery pattern**, not a new search architecture. `catalog`'s
public discovery today is category/subcategory browse plus filtered queries over indexed columns
(verified — no search library or full-text index exists in the codebase). A10 listing search is the
same shape: filtered/paginated `Listing` queries over `structured_fields` JSON keys that the category
configuration declares as filterable (e.g. job category, location, salary band), with database
indexes added for the fields actually used to filter, matching document 08's performance guidance
("Profile query plans, add real indexes... first"). No Elasticsearch/OpenSearch dependency is
introduced in M3. The real subcategory taxonomy behind these filterable job-category values is the
owner's category spreadsheet's "Career Opportunity / Job Opportunities" section — roughly 30
subcategories (`Retail & Shop Staff`, `Health Care Jobs`, `IT & Software Jobs`, etc.), each with many
specific role rows — mapped onto `Category`/`Subcategory` exactly as every other archetype's catalog
browse, with the role-level detail captured in `structured_fields` rather than as a fourth catalog
tier; §5.1a applies the identical `Category/Subcategory` + structured-field reuse principle to A9's
filters, and §2's "A7 product-type browse taxonomy" row applies it to A7 — all three archetypes
source their real taxonomy from the same spreadsheet-backed catalog hierarchy, not three separate
schemes.

### 6.5 Application/lead domain model

`Application` fields (planning): `id`, `listing` (FK), `applicant` (FK `User` — **not** necessarily a
`PartnerProfile` — an applicant is an ordinary Customer-type actor applying for a job, so this uses
the Customer identity, not the Partner capability system), `status`, `applicant_snapshot` (frozen
contact/profile data at apply time — same "immutable snapshot" discipline as `CartItemScope`),
`cover_note`, `duplicate_of` (nullable self-FK, set by spam/duplicate detection), `withdrawn_at`.

```text
SUBMITTED → UNDER_REVIEW (poster viewed it)
  → SHORTLISTED
  → CONTACTED (contact reveal occurred — tracked for conversion metrics)
  → REJECTED (poster reason, optional)
  → WITHDRAWN (applicant-initiated)
  → EXPIRED (listing expired/closed with application still SUBMITTED/UNDER_REVIEW)
```

Spam/duplicate prevention: a rate limit on applications-per-applicant-per-time-window (reusing the
same rate-limiter primitive as OTP throttling, document 08) plus a duplicate-detection check (same
applicant + same listing within a cooldown window rejects with a stable error code) — no ML-based
spam scoring in M3; that is measurement work, not a launch requirement, matching the "Do not
automatically punish... before data proves a need" principle from document 00.

### 6.6 Contact protection design

Calibrated deliberately small — **no messaging/inbox product**:

- Applicant and poster contact fields (phone/email) are **masked** in both directions until an
  explicit **reveal** action.
- Reveal is rate-limited per actor per day (reusing the OTP-style throttle primitive).
- A reveal event is recorded (`ApplicationStatusEvent` kind `CONTACT_REVEALED`) for audit and
  conversion tracking.
- No masked calling proxy is built new — the platform already names "masked calling" as an external
  adapter category in document 01; A10 reuses that same adapter interface if/when voice contact is
  offered, rather than building a second telephony integration.
- Reporting: `ListingReport` and a parallel `ApplicationReport` (for applicant-on-poster or
  poster-on-applicant abuse) feed the same `OperationsCase` workspace as every other abuse case type
  (§8).

### 6.7 Moderation/abuse/reports plan

Every `Listing` requires `MODERATION_APPROVED` before `PUBLISHED` (§6.3). Reports open an
`OperationsCase` with `case_type=LISTING_ABUSE` or `APPLICATION_ABUSE`, following the exact
case-ownership table shape in document 06 §"Case ownership and SLAs" — owner: a "Moderation" team,
terminal result: listing stays live / listing removed / poster suspended, with audit trail via
`ListingModerationEvent`. Recovery: a wrongly-removed listing can be reinstated by Operations with a
reason, never by the poster unilaterally re-publishing around a takedown.

### 6.8 Vendor subscription plans + premium listings

**Domain-only in this document; charging mechanics cross-reference `01-wallet-vcoins-referral.md`
rather than duplicating them.** `VendorSubscriptionPlan` (Operations-configurable: `name`,
`price_paise`, `duration_days`, `max_active_listings`, `premium_capabilities` — a set flag like
`FEATURED_PLACEMENT`, `EXTENDED_EXPIRY`, `PRIORITY_MODERATION`) and `VendorSubscription` (one
poster's purchased instance, `status`: `ACTIVE`/`EXPIRED`/`CANCELLED`, `starts_at`/`ends_at`).

The purchase itself is **the same `PaymentAttempt` path as every other archetype** — a new
`Purpose` value (`A10_VENDOR_SUBSCRIPTION`, `A10_PREMIUM_LISTING`) with **no `CheckoutSession`**
(added to `CHECKOUT_FREE_PURPOSES`, matching exactly how M2's `M2_QUOTE_UNLOCK`/`M2_BOOKING_FEE`
were added — see §6.1 of this document). There is no parallel billing system. Whether a
subscription can be paid **from wallet/coins** (in addition to Razorpay) is the same checkout-split
mechanism `01-wallet-vcoins-referral.md` builds for every other checkout in Phase C §4 — this
document reserves the integration point but the wallet/coin split logic itself is not re-specified
here.

### 6.9 Partner (poster) workspace

| Section | Contents |
| --- | --- |
| **Home** | Active listing count vs. plan limit, pending moderation, new applications summary |
| **Listings** | CRUD, moderation status, publish/close/republish actions, premium toggle (gated by active subscription capability) |
| **Leads** | Application inbox per listing — status board (submitted/shortlisted/contacted/rejected), contact reveal action |
| **Billing** | Current `VendorSubscription`, plan comparison, purchase/renew (routes to the shared payment path), invoice history (reuses `TaxDocument`) |

---

## 7. State machines — consolidated

The three lifecycles above are restated here as the single normative source for implementation,
matching how `03-lifecycle-and-state-machines.md` is the top-level normative source and
`07-state-machines-and-permissions.md` is M2's normative source. A transition not listed does not
exist; a command not listed is not a domain command — same rule M2 states verbatim.

### 7.1 A7 `RentalBooking.status`

`DRAFT → HELD → PAYMENT_PENDING → CONFIRMED → HANDED_OVER → ACTIVE → (EXTENDED loops to ACTIVE) →
RETURN_PENDING → RETURNED → INSPECTED → SETTLED → COMPLETED`, with `EXPIRED`/`CANCELLED`/`FAILED`
from pre-confirmation states, `DISPUTED` from `ACTIVE`/`RETURN_PENDING`/`INSPECTED`, and
`RECOVERY_REQUIRED` from any pre-`HANDED_OVER` state (§4.3).

### 7.2 A7 `RentalDeposit.status`

`NOT_REQUIRED|REQUIRED → AUTHORIZED → HELD → (PARTIALLY_CONSUMED|FULLY_CONSUMED|RELEASED) →
(DISPUTED → RESOLVED)` (§4.4).

### 7.3 A9 `StayReservation.status`

`HELD → PAYMENT_PENDING → CONFIRMED → CHECKED_IN → IN_STAY → (EXTENDED loops to IN_STAY) → CHECKED_OUT →
INSPECTED → SETTLED → COMPLETED`, with `EXPIRED`/`CANCELLED`/`FAILED`/`NO_SHOW` from
pre/at-`CONFIRMED`, `EARLY_CHECKOUT` from `IN_STAY`, `DISPUTED` from
`CHECKED_OUT`/`INSPECTED`, `RECOVERY_REQUIRED` from `CONFIRMED` (§5.4).

**Note — host-initiated unit reassignment (§5.1a) is not a `StayReservation.status` transition.** It
changes only which `Unit` row a `CONFIRMED`/`CHECKED_IN`/`IN_STAY` reservation's `UnitReservation`
points at; the `StayReservation.status` value is untouched by the swap. It is listed here only to be
explicit that no new state was added for it — it is a mutation of an existing state's backing
resource, distinct in kind from `RECOVERY_REQUIRED` (§8.2), which *is* a status transition because no
equivalent unit exists.

### 7.4 A10 `Listing.status`

`DRAFT → SUBMITTED_FOR_MODERATION → (MODERATION_APPROVED|MODERATION_REJECTED)` →
`PUBLISHED → ACTIVE → (EXPIRED|CLOSED) → (REPUBLISHED loops to SUBMITTED_FOR_MODERATION | ARCHIVED)`, with
`REMOVED` reachable from `PUBLISHED`/`ACTIVE` only by Operations (§6.3).

### 7.5 A10 `Application.status`

`SUBMITTED → UNDER_REVIEW → SHORTLISTED → CONTACTED → (REJECTED|WITHDRAWN|EXPIRED)` (§6.5).

---

## 8. Operations recovery

Every scenario below opens a typed `OperationsCase` per document 06's rule that "every exceptional
path creates an owned case with a deadline and allowed recovery commands." Cases are read/acted on
through the existing Operations case workspace (document 07); no new case UI shell is required, only
new `case_type` values and their allowed-command sets.

### 8.1 A7 rental

| Scenario | What Operations sees | Can change | Cannot change | Audit trail | Retry/idempotency | Customer notification |
| --- | --- | --- | --- | --- | --- | --- |
| Asset unavailable after booking (vendor pulled it, maintenance found) | `RentalBooking` in `RECOVERY_REQUIRED`, original asset, alternative-asset candidates if category supports substitution | Reassign to equivalent asset, or cancel with refund | Cannot silently swap without customer notification once handover has not occurred | `RentalBooking` status history | Reassignment command is idempotent by booking id | Always — "changed" notice, same rule as Partner-change disclosure in document 04 |
| Asset damaged | `RentalReturnInspection` evidence, settlement matrix outcome | Override auto-settlement tier, adjust chargeable amount with reason (maker-checker above threshold) | Cannot bypass evidence requirement | `RentalDeposit` transaction history + `calculation_snapshot` | Settlement command keyed by booking id, safe to retry | On settlement decision |
| Asset lost | Case with grace-period-elapsed trigger | Charge replacement value, block customer pending resolution, escalate to fraud/safety review | Cannot charge beyond declared asset replacement value without a second approval | Case timeline | N/A (manual) | On charge |
| Late return | Auto-computed late fee, dispute if any | Waive/adjust fee with reason | — | Ledger + case | Fee calc is deterministic and safe to recompute | On charge |
| Deposit dispute | Handover vs return evidence side-by-side | Resolve in customer's or vendor's favor, partial split | Cannot resolve without evidence review | Case + `RentalDeposit.DISPUTED to RESOLVED` | — | On resolution |
| Extension conflict (asset already booked for extended window) | Conflicting `AssetReservation`, alternative windows | Offer partial extension, alternate asset, or deny | Cannot force an overlapping reservation (constraint blocks it at the database) | Extension attempt log | Extension request idempotent by request id | Always |
| Payment succeeds but confirmation fails | `PaymentAttempt.CAPTURED` with no `CONFIRMED` `RentalBooking` (webhook/DB ambiguity) | Trigger reconciliation: retry confirm, or void/refund | Cannot leave ambiguous — same "reconciled, never guessed" rule as document 00 | `ReconciliationRecord`-equivalent for this path | Reconciliation job is the same family as existing payment reconciliation (document 07) | On resolution |

### 8.2 A9 stay

| Scenario | What Operations sees | Can change | Cannot change | Audit trail | Retry/idempotency | Customer notification |
| --- | --- | --- | --- | --- | --- | --- |
| Unit unavailable after reservation | `StayReservation` `RECOVERY_REQUIRED`, alternative units in same property/nearby | Reassign unit, upgrade at no charge, or full refund | Cannot silently change unit without notice | Status history | Reassignment idempotent by reservation id | Always |
| Double reservation | Should be structurally impossible (exclusion constraint) — case exists only for a reconciliation-path race (payment captured just as expiry released the hold) | Same reconciliation path as A7's payment/confirmation ambiguity | — | Reconciliation record | Same job family | On resolution |
| No-show | `StayReservation.NO_SHOW` after grace period | Waive no-show charge with reason | Cannot un-expire a `UnitReservation` that already released — must create a fresh one | Status history | Grace-period sweep is idempotent (checks current status before acting) | On charge |
| Early checkout | `EARLY_CHECKOUT` with partial-refund calculation per cancellation policy | Adjust refund with reason | — | Settlement record | — | On settlement |
| Damage dispute | Same shape as A7 §8.1 | Same | Same | Same | Same | Same |
| Payment/refund mismatch | Same reconciliation shape as every other archetype | Retry/void/refund | — | `ReconciliationRecord` | Same job family | On resolution |
| Property blocks unit after reservation (host removes availability) | `StayReservation` `RECOVERY_REQUIRED`, host's block reason | Same as "unit unavailable" above; may also flag host for standing review if pattern repeats | Cannot let a host silently cancel a confirmed reservation without this case existing | Status history + host standing note | — | Always |
| Host reassigns to an equivalent unit before check-in (§5.1a) — **benign, not a failure** | Nothing routes to Operations by default; this is a self-service host action, listed here only to distinguish it from the row above | Host reassigns any `CONFIRMED`/pre-check-in reservation to another `Unit` of the same `UnitType`, subject to §5.2's exclusion-constraint re-check | Cannot change price, `UnitType`, dates or any booked attribute; cannot proceed if the exclusion-constraint check finds the candidate `Unit` unavailable | `UnitReservation`/`StayReservation` audit log records old and new `Unit` | Reassignment command is idempotent by reservation id | Customer notified which room number is assigned, but not that a change occurred if the room-type/experience is identical (mirrors "changed" notice threshold — this is a genuinely no-impact swap, not a "Partner changed" disclosure event under document 04's rule) |

### 8.3 A10 listing

| Scenario | What Operations sees | Can change | Cannot change | Audit trail | Retry/idempotency | Customer notification |
| --- | --- | --- | --- | --- | --- | --- |
| Fraudulent listing | `ListingReport` queue, moderation history | Remove listing, suspend poster capability | Cannot remove without a reason recorded | `ListingModerationEvent` | — | Poster notified of removal reason; applicants of affected listing notified it is no longer available |
| Spam applications | Rate-limit trigger log, duplicate-detection flags | Manually mark applicant restricted, review pattern | Cannot auto-restrict without minimum evidence (document 08's abuse-control principle) | Access-audit-style event | Detection is idempotent (same window check every attempt) | — |
| Duplicate listing | Two listings with high content similarity (simple heuristic, not ML, at M3) | Merge/flag/request poster clarification | — | Moderation event | — | Poster notified if action taken |
| Moderation failure (stuck `SUBMITTED_FOR_MODERATION`, no reviewer action within SLA) | SLA-breached queue entry | Assign reviewer, expedite | Cannot silently auto-approve past SLA — document 06's rule "cases may escalate... may not close merely because a notification was sent" | Case SLA record | — | Poster sees pending status |
| Subscription payment failure | `PaymentAttempt.FAILED` for `A10_VENDOR_SUBSCRIPTION` | Retry, offer alternate plan | — | Payment history | Reuses standard payment-failure recovery | Poster notified |
| Premium purchase succeeds but feature not activated | `PaymentAttempt.CAPTURED`, `VendorSubscription` not `ACTIVE` (webhook/activation ambiguity) | Manually activate with reason, or refund | Cannot leave charged-but-unactivated silently | Reconciliation record | Same reconciliation job family | On resolution |
| Listing expires mid-application | `Application` in `SUBMITTED`/`UNDER_REVIEW` on a listing that hit `expires_at` | Allow poster a grace window to still act on in-flight applications before listing fully archives, or mark applications `EXPIRED` | Cannot revive an expired listing's public visibility without full republish/re-moderation | Status history on both `Listing` and affected `Application` rows | Expiry sweep is idempotent (checks `status` before transitioning) | Applicant notified their application's listing expired |

---

## 9. Concurrency and idempotency

| Race | Idempotency key | Unique/exclusion constraint | Transaction boundary | Locking strategy | Retry behavior |
| --- | --- | --- | --- | --- | --- |
| Two customers reserving the same serialized asset/time | Checkout `idempotency_key` per customer attempt | `ExclusionConstraint` on `(asset, occupied_range)` scoped to `TENTATIVE`/`CONFIRMED`, same technique as `assignments.Reservation` | Reservation insert is one transaction; constraint violation raised at commit | Database-enforced — no application lock needed, matching the existing A1 pattern ("PostgreSQL exclusion constraint... Candidate retries handle normal contention") | Losing request receives `WINDOW_NO_LONGER_AVAILABLE`-equivalent and refreshed alternatives, same UX rule as document 04 |
| Two customers reserving the same fungible pooled asset quantity | Same | No exclusion constraint possible (count, not overlap) — `select_for_update` on `RentalAsset` row + application-level remaining-quantity check inside the reservation transaction | Row lock held for the duration of the reservation-create transaction only | Pessimistic row lock | Losing request retried against refreshed quantity or told of unavailability |
| Two customers reserving the same unit/date | Same idempotency-key discipline | `ExclusionConstraint` on `(unit, occupied_range)` | Same as above | Database-enforced | Same |
| Duplicate application submission | `IdempotencyRecord` keyed `(actor, "submit_application", listing_id)` for the literal duplicate-click case, **plus** a separate business-rule duplicate check (same applicant + listing within cooldown) that is not an idempotency replay but a domain rule returning a stable `APPLICATION_DUPLICATE` error | `UniqueConstraint` on `(listing, applicant)` for **active** (non-withdrawn/non-expired) applications | Single insert transaction | None needed beyond the constraint | Second attempt returns the existing application's reference, not a new one |
| Payment webhook replay | `PaymentWebhook` unique on `(provider, provider_event_id)` — reused unchanged | Existing `commerce_unique_provider_event` constraint | Existing webhook-reduction transaction | Existing pattern | Existing dedup-and-ignore behavior, unchanged for A7/A9/A10 purposes |
| Double deposit deduction | `RentalDeposit`/`StayDeposit` settlement command carries its own idempotency key derived from `(deposit_id, settlement_attempt_id)`; the settlement transition itself is a conditional update (`status` must be `HELD` to move to `PARTIALLY_CONSUMED`/`FULLY_CONSUMED`/`RELEASED`) | Conditional-update guard: a deposit can only be in one terminal-settlement branch — enforced via the same "conditional update... resolve competing transitions" primitive already used for offer/reservation transitions | Settlement recorded in the same transaction as the `RentalDeposit`/`StayDeposit` status transition | Conditional update (optimistic — status check in the `WHERE` clause) | Second concurrent settlement attempt finds `status` already moved and returns a stable conflict code, exactly matching document 03's "Invalid transitions return a stable conflict code and current state" |
| Double refund | `Refund` idempotency reused unchanged (`commerce_unique_payment_refund_key`); the new `RentalPaymentAllocation`/`StayPaymentAllocation` rows follow ADR-0003's rule that a refund reads what was allocated rather than recomputing | Existing `Refund`/`RefundAllocation` uniqueness | Existing | Existing | Existing |
| Premium listing webhook replay | Same as "payment webhook replay" above — `A10_PREMIUM_LISTING`/`A10_VENDOR_SUBSCRIPTION` purposes reuse the identical webhook-dedup path; activation itself is a conditional update on `VendorSubscription.status` (must be `PENDING_ACTIVATION` to move to `ACTIVE`) so a replayed webhook cannot double-activate or double-extend a subscription period | Existing `PaymentWebhook` constraint + new conditional-update guard on `VendorSubscription` | Webhook handler transaction | Conditional update | Replay is a no-op once `ACTIVE` |

---

## 10. API/contract planning

No implementation code — this section names pieces and responsibilities, matching how document 07
names endpoint groups without bodies.

### 10.1 Backend

**Models** — per §4.1, §5.1, §6.2, plus the extensions in §2 (`PartnerLedgerEntry` new nullable FKs,
`PaymentAttempt.Purpose` new values, `ServiceVariant.BookingArchetype` new values, `A7/A9/A10
VariantConfiguration`).

**Services/commands** (one module per archetype, following the `apps/requirements` precedent of a
flat function-per-command file structure rather than fat model methods):

- A7: `create_rental_hold`, `confirm_rental_booking`, `record_handover`, `request_extension`,
  `approve_extension`, `initiate_return`, `record_return_inspection`, `settle_deposit`,
  `dispute_deposit`, `operations_reassign_asset`, `operations_resolve_dispute`.
- A9: `search_availability`, `create_stay_hold`, `confirm_stay_reservation`, `record_check_in`,
  `request_extension` (shared shape with A7's), `record_check_out`, `settle_stay_deposit`,
  `record_early_checkout`, `host_reassign_unit` (host-initiated, benign, §5.1a/§8.2),
  `operations_reassign_unit` (Operations-initiated, `RECOVERY_REQUIRED` path, §8.2),
  `operations_resolve_dispute`.
- A10: `create_listing`, `submit_for_moderation`, `moderate_listing` (Operations), `publish_listing`,
  `close_listing`, `republish_listing`, `submit_application`, `withdraw_application`,
  `update_application_status` (poster), `reveal_contact`, `report_listing`, `report_application`,
  `purchase_subscription`, `activate_premium_feature`.

**Selectors**: availability-grid selectors for A7/A9 (mirroring `carts/availability.py`'s in-memory
batch-load pattern, scoped to asset/unit calendars instead of Partner calendars), listing search
selector for A10 (ORM filter builder over `structured_fields`).

**Serializers**: one read projection per actor per archetype (Customer/applicant-facing,
vendor/poster-facing, Operations-facing), matching the "three projections" discipline M1 already
established for fulfilment (Partner sees no `booking_group_id`; same information-hiding rule applies
here — e.g. an applicant never sees other applicants).

**Endpoints** (illustrative, final paths decided at proposal time):

```text
# A7 - customer
GET  /rental-assets                    browse product type -> vendor listing-group cards (§4.1a)
POST /rental-bookings                  create hold
POST /rental-bookings/{id}/payments
POST /rental-bookings/{id}/extensions
POST /rental-bookings/{id}/return

# A7 - partner (vendor)
GET|POST /partner/rental-assets
POST /partner/rental-bookings/{id}/handover
POST /partner/rental-bookings/{id}/return-inspection

# A9 - customer
GET  /stay-units/search                filter-first: flat UnitType results across properties (§5.1a)
GET  /properties/{id}/unit-types       property-first: one property's UnitType cards (§5.1a)
POST /stay-reservations
POST /stay-reservations/{id}/payments
POST /stay-reservations/{id}/check-in
POST /stay-reservations/{id}/extensions

# A9 - partner (host)
GET|POST /partner/properties
GET|POST /partner/properties/{id}/unit-types
GET|POST /partner/properties/{id}/units
POST /partner/stay-reservations/{id}/check-out
POST /partner/stay-reservations/{id}/reassign-unit

# A10 - customer/applicant
GET  /listings
GET  /listings/{id}
POST /listings/{id}/applications
POST /applications/{id}/withdraw
POST /applications/{id}/contact-reveal

# A10 - partner (poster)
GET|POST /partner/listings
POST /partner/listings/{id}/submit
POST /partner/listings/{id}/publish|close|republish
GET  /partner/listings/{id}/applications
POST /partner/applications/{id}/status
GET|POST /partner/subscriptions

# Operations (all three)
GET  /ops/rental-bookings | /ops/stay-reservations | /ops/listings
POST /ops/rental-bookings/{id}/reassign-asset | resolve-dispute
POST /ops/stay-reservations/{id}/reassign-unit | resolve-dispute
POST /ops/listings/{id}/moderate | remove
```

**Permissions**: extends the existing Operations active-role + object-ownership pattern (document 07,
08) unchanged — no new permission model.

**Events/outbox**: `rental_booking.confirmed|handed_over|returned|settled|disputed`,
`stay_reservation.confirmed|checked_in|checked_out|settled|disputed`,
`listing.published|expired|removed`, `application.submitted|status_changed`, following the naming
convention in document 07's domain-events list.

**Async jobs**: `AssetReservation`/`UnitReservation` expiry sweeps (same family as offer/reservation
expiry), listing `expires_at` sweep, subscription expiry sweep, no-show grace-period sweep,
extension-conflict detection — all in the existing Celery beat topology, no new scheduler.

### 10.2 Frontend

**Customer app** (`frontend/apps/customer`): new route groups `/rentals/*`, `/stays/*`,
`/careers/*` (or `/listings/careers/*` if the generalized listing product needs a type segment later)
— discovery, detail, checkout, active-booking/reservation/application tracking. Server Components for
public browse/search pages (matching the existing public-page SSR convention); client
components + TanStack Query for authenticated booking/reservation/application management.

**Partner app** (`frontend/apps/partner`): new workspace entries gated by `PartnerCapability`
workspace grants, following the exact `workspace-switcher.tsx`/`registry.ts` pattern M2 built —
`A7_RENTAL`, `A9_STAY`, `A10_LISTING` become three more resolvable workspace keys with zero change to
the switching mechanism itself.

**Operations app** (`frontend/apps/admin`): new case-type-aware views inside the existing case
workspace, plus three new resource list/detail screens (rental bookings, stay reservations, listings)
following the M2 Wave B4 Operations-surface precedent (published queues, never re-derived client-side,
required-reason recovery commands).

**Loading/error/empty states**: every list/detail view follows the established convention — pending/
error/retry, no optimistic claims for payment/handover/check-in/settlement (document 01's frontend
runtime rules apply unchanged: "Payment, assignment, arrival, OTP and completion are never
optimistically claimed" — for A7/A9 read "handover/check-in/settlement" in place of
"arrival/OTP/completion").

---

## 11. Database design

New tables (fields summarized; full column lists at implementation/migration time):

| Table | Purpose | Key FKs | Uniqueness | Status field | Immutable? | Deletion policy |
| --- | --- | --- | --- | --- | --- | --- |
| `RentalAsset` | Owned inventory item | `partner`, `variant` | `(partner, asset_identifier)` where serialized | `current_status` | Identity fields immutable post-first-booking | Soft (`is_active`/status), never hard-deleted once booked |
| `RentalMaintenancePeriod` | Vendor-declared unavailability | `asset` | — | — | Append-only history preferred | Soft |
| `AssetReservation` | Overlap-locked hold | `asset` | `ExclusionConstraint(asset, occupied_range)` scoped to active statuses | `status` | Terminal states immutable | Never deleted (audit) |
| `RentalBooking` | Confirmed rental | `customer`, `asset`, `deposit` | — | `status` | Confirmed terms immutable; extensions are new rows | Never deleted |
| `RentalBookingLine` | Price/quantity line | `rental_booking` | — | — | Immutable | Never deleted |
| `RentalHandover` | Outbound condition record | `rental_booking` | one per booking | — | Immutable once submitted | Never deleted |
| `RentalReturnInspection` | Inbound condition record | `rental_booking` | one per booking | — | Immutable once submitted | Never deleted |
| `RentalDeposit` | Deposit sub-lifecycle | `rental_booking` | one per booking | `status` | Transactions append-only | Never deleted |
| `RentalDepositTransaction` | Append-only deposit ledger lines | `rental_deposit` | — | — | Immutable | Never deleted |
| `RentalExtension` | Immutable extension revision | `rental_booking` | — | — | Immutable | Never deleted |
| `RentalPaymentAllocation` | ADR-0003-pattern allocation to a rental line | `payment_attempt`, `rental_booking_line` | `(payment_attempt, rental_booking_line)` | — | Immutable | Never deleted |
| `Property` | Host's building/compound | `partner` (host), `address` | — | `is_active` | Address/ownership immutable post-first-reservation | Soft |
| `UnitType` | Room-configuration group — what the customer filters/selects; owns pricing (§5.1a) | `property` | `(property, config_hash)` where `config_hash` derives from the attribute set (sharing count, AC, bathroom type, furnishing) — prevents two identical-attribute `UnitType` rows under one property | `is_active` | Attribute set immutable post-first-`Unit`-assignment; price changes are new `UnitPricingRule` rows, not edits | Soft |
| `Unit` | Bookable physical room/bed/apartment, belongs to one `UnitType` | `property`, `unit_type` | `(property, unit_code)` | `current_status` | — | Soft |
| `UnitPricingRule` / `UnitPricingOverride` | Rate configuration, keyed to `duration_mode` (§5.3) | `unit_type` | effective-date overlap prevention per `(unit_type, duration_mode)` (partial unique or exclusion, mirroring `TaskRate`) | — | Effective-dated versions immutable | Never deleted |
| `PropertyPolicy` | Guest/cancellation/ID policy | `property` | one active version per property (effective-dated) | — | Versioned, immutable once effective | Never deleted |
| `UnitReservation` | Overlap-locked hold | `unit` | `ExclusionConstraint(unit, occupied_range)` scoped to active statuses | `status` | Terminal states immutable | Never deleted |
| `StayReservation` | Confirmed stay | `customer`, `unit`, `deposit` | — | `status` | Confirmed terms immutable | Never deleted |
| `StayReservationLine` | Nightly/fee/tax line | `stay_reservation` | — | — | Immutable | Never deleted |
| `StayCheckIn` / `StayCheckOut` | Arrival/departure record | `stay_reservation` | one each per reservation | — | Immutable | Never deleted |
| `StayDeposit` / `StayDepositTransaction` | Same shape as rental deposit | `stay_reservation` | one deposit per reservation | `status` | Same | Never deleted |
| `StayExtension` | Immutable late-checkout/extension revision | `stay_reservation` | — | — | Immutable | Never deleted |
| `StayPaymentAllocation` | ADR-0003-pattern allocation | `payment_attempt`, `stay_reservation_line` | `(payment_attempt, stay_reservation_line)` | — | Immutable | Never deleted |
| `Listing` | One posting | `poster`, `variant` | — | `status`, `moderation_status` | Published content edit re-triggers moderation, not silently mutable | Soft (`ARCHIVED`), never hard-deleted |
| `ListingMedia` | Photos/attachments | `listing` | — | — | Immutable per version | Soft |
| `ListingModerationEvent` | Append-only moderation history | `listing` | — | — | Immutable | Never deleted |
| `ListingReport` | Abuse report | `listing`, `reporter` | — | `status` | Append-only | Never deleted |
| `Application` | Applicant interest | `listing`, `applicant` | `(listing, applicant)` for active applications | `status` | `applicant_snapshot` immutable once submitted | Never hard-deleted (withdrawn is a status, not a delete) |
| `ApplicationAttachment` | Resume/portfolio | `application` | — | — | Immutable | Retention-policy deletion per document 08 evidence rules |
| `ApplicationStatusEvent` | Append-only status history | `application` | — | — | Immutable | Never deleted |
| `ApplicationReport` | Abuse report on an applicant/poster | `application`, `reporter` | — | `status` | Append-only | Never deleted |
| `VendorSubscriptionPlan` | Operations-configured plan | — | `(name, effective_from)` | `is_active` | Effective-dated, immutable once published | Soft |
| `VendorSubscription` | One vendor's purchased instance | `poster`, `plan` | — | `status` | Payment-linked fields immutable | Never deleted |

**Extended existing tables:**

- `ServiceVariant.BookingArchetype` — add `A7_RENTAL`, `A9_STAY`, `A10_LISTING`.
- `PaymentAttempt.Purpose` — add `A7_RENTAL_BOOKING`, `A7_DEPOSIT_HOLD`, `A7_DAMAGE_SETTLEMENT`,
  `A7_EXTENSION`, `A9_STAY_RESERVATION`, `A9_DEPOSIT_HOLD`, `A9_DAMAGE_SETTLEMENT`,
  `A9_EXTENSION`, `A10_VENDOR_SUBSCRIPTION`, `A10_PREMIUM_LISTING`; all ten are added to
  `CHECKOUT_FREE_PURPOSES` — decided in Wave D1: since A7/A9 do not use `CheckoutSession`/
  `BookingGroup` at all (§2, "Do NOT reuse"), every new purpose here follows every M2 purpose's
  checkout-free precedent, not the `BOOKING_GROUP` precedent.
- `PartnerLedgerEntry` — add nullable `rental_booking` and `stay_reservation` FKs, extend the
  "exactly one scope" check constraint (currently implicit via `booking` alone) to cover all three,
  and extend `payouts_one_earning_per_booking`'s uniqueness family with two parallel partial unique
  constraints (`payouts_one_earning_per_rental_booking`, `payouts_one_earning_per_stay_reservation`).
- `PartnerCapability` / `PartnerBusinessProfile` — no schema change; `archetype` already accepts any
  `BookingArchetype` value. `PartnerBusinessProfile.BusinessType` gains `RENTAL_OWNER`,
  `PROPERTY_HOST`, `EMPLOYER` if Wave D1's registration-questions design finds the existing three
  types insufficient to distinguish tax/registration requirements — decision deferred to Wave D1,
  default position is reuse `INDIVIDUAL`/`WORKFORCE_AGENCY` unchanged unless a concrete field needs
  the new type.
- `OperationsCase.case_type` — add `RENTAL_ASSET_RECOVERY`, `RENTAL_DEPOSIT_DISPUTE`,
  `STAY_UNIT_RECOVERY`, `STAY_DAMAGE_DISPUTE`, `LISTING_ABUSE`, `APPLICATION_ABUSE`,
  `SUBSCRIPTION_PAYMENT_AMBIGUITY`.

**New enums**: `RentalBooking.Status`, `RentalDeposit.Status`, `StayReservation.Status`,
`StayDeposit.Status`, `Listing.Status`, `Listing.ModerationStatus`, `Application.Status`,
`VendorSubscription.Status`, `VendorSubscriptionPlan.PremiumCapability` (per §7).

**New constraints**: two new `ExclusionConstraint`s (`asset`/`occupied_range`,
`unit`/`occupied_range`); partial unique constraints per table above; check constraints mirroring
`commerce_allocation_refund_lte_amount`'s shape for the new deposit-transaction ledgers (a
`RentalDepositTransaction`/`StayDepositTransaction` running total must never exceed the deposit's
authorized amount).

**New indexes**: `(status, expires_at)` style indexes on every archetype's primary lifecycle table
(matching `payouts_unique_ledger_key`'s sibling indexes), `(poster, status)` on `Listing`,
`(listing, status)` on `Application`, GIN index on `Listing.structured_fields` if JSON-key filtering
proves too slow under a plain B-tree (deferred to measurement, per document 08's "profile first" rule
— not built speculatively). `UnitType` gets `(property, is_active)` for property-first browse and a
composite `(sharing_count, is_ac, food_included, duration_mode, is_active)`-style index (exact
columns per Wave D2's filter design) for filter-first browse — both index the same underlying rows,
per §5.1a's "one query surface, two orderings" rule.

**No duplicate of an existing shared table**: `PaymentAttempt`/`PaymentAllocation`-equivalent money
recording reuses `PaymentAttempt` itself unchanged (only new `Purpose` values); only the allocation
*join* table is archetype-specific (`RentalPaymentAllocation`/`StayPaymentAllocation`), because the
existing `PaymentAllocation` model's FKs to `FulfilmentUnit`/`FulfilmentUnitLine` are non-nullable and
cannot be widened without weakening ADR-0003's invariant for every other archetype that already
depends on it.

**`RentalListingGroup` is not a table.** Per §2 and §4.1a, A7's customer-facing de-duplicated browse
card is a query-time `GROUP BY (partner, variant, price_paise, condition_grade)` over the existing
`RentalAsset` table, mirroring `catalog.selectors.public_categories()`'s `Count`-annotation rollup
precedent — it is named here as a selector/query shape, not a migration. Add a composite index on
`RentalAsset (variant, partner, price_paise, condition_grade)` to keep the group-by cheap at browse
volume (deferred to measurement if the naive query performs adequately without it, per document 08's
"profile first" rule — not built speculatively ahead of that measurement).

---

## 12. Acceptance criteria

Using the M3-established `M3-<ARCHETYPE>-NN` convention (parallel to how Phase C uses plain `C-NN`
scoped by the document it lives in — this document scopes by archetype prefix since three archetypes
share one document).

### 12.1 A7 rental (`M3-A7-01`...)

| # | Scenario |
| --- | --- |
| M3-A7-01 | Happy path: browse → hold → pay (booking + deposit) → confirm → handover → active → return → inspect (no damage) → deposit released → completed |
| M3-A7-02 | Customer cancels before handover, within free-cancel window → full refund |
| M3-A7-03 | Customer cancels within a charged band → fixed/line-level fee per policy, never full booking value forfeited without disclosure |
| M3-A7-04 | Payment fails mid-checkout → hold released, asset available again |
| M3-A7-05 | Duplicate checkout submit (same idempotency key) → single `RentalBooking`, no duplicate charge |
| M3-A7-06 | Payment webhook replayed → no duplicate capture, no duplicate `PaymentAllocation` |
| M3-A7-07 | Concurrency: two customers submit holds for the same serialized asset/overlapping dates simultaneously → exactly one succeeds, the other sees `WINDOW_NO_LONGER_AVAILABLE`-equivalent |
| M3-A7-07a | Concurrency: fungible pooled asset, quantity 3, two customers each request 2 simultaneously → at most one succeeds fully or both are limited so total never exceeds 3 |
| M3-A7-08 | Full refund path: cancellation before handover refunds booking price and deposit authorization is voided/released |
| M3-A7-09 | Deposit: authorized at checkout, held through rental period, released in full on clean return |
| M3-A7-10 | Deposit: minor damage auto-settles under configured cap, partial deposit consumed, remainder refunded |
| M3-A7-11 | Deposit: major damage above cap routes to Operations, no auto-settlement |
| M3-A7-12 | Late return: fee auto-calculated and deducted from deposit; if fee exceeds deposit, extra `PaymentAttempt` created |
| M3-A7-13 | Inventory conflict: extension request for a window another `AssetReservation` already holds is rejected with an actionable alternative |
| M3-A7-14 | Operations reassigns to an equivalent asset after original became unavailable pre-handover; customer notified of the change |
| M3-A7-15 | Recovery: payment captured but confirmation write fails (simulated) → reconciliation job converges to either a confirmed booking or a void/refund, never a silently stuck state |
| M3-A7-16 | Permission boundary: a vendor cannot view or act on another vendor's `RentalAsset`/`RentalBooking` |
| M3-A7-17 | Permission boundary: Operations damage-settlement override above the maker-checker threshold requires a second approver |
| M3-A7-18 | Browse: selecting a product type (`Service`) shows multiple vendors' listings for that same product, each with distinct vendor branding and price, per §4.1a |
| M3-A7-19 | De-duplication: a vendor with 5 identical fungible assets under one product type shows as one `RentalListingGroup` card with `quantity_available=5`, not 5 cards |
| M3-A7-20 | De-duplication under contention: booking 2 of the 5 units in M3-A7-19 immediately reduces the displayed `quantity_available` to 3, sourced from the same lock state as §4.2 (no drift between display and lock) |

### 12.2 A9 stay (`M3-A9-01`...)

| # | Scenario |
| --- | --- |
| M3-A9-01 | Happy path: search → hold → pay → confirm → check-in → stay → check-out → inspect (no damage) → deposit released → completed |
| M3-A9-02 | Cancellation per policy band (full refund far out, partial/fee closer to check-in, per `PropertyPolicy.cancellation_policy`) |
| M3-A9-03 | No-show: grace period elapses with no check-in → `NO_SHOW`, deposit/first-night charged per policy |
| M3-A9-04 | Early checkout: partial refund for unconsumed nights computed and applied |
| M3-A9-05 | Extension/late checkout: new `StayExtension` revision, availability re-checked, price/deposit delta charged before it takes effect |
| M3-A9-06 | Damage dispute: guest disputes a charge, Operations resolves using check-in/check-out evidence comparison |
| M3-A9-07 | Concurrency: two customers hold overlapping dates on the same unit simultaneously → exactly one succeeds |
| M3-A9-08 | Payment webhook replay → no duplicate capture/allocation |
| M3-A9-09 | Refund/payment mismatch (webhook ambiguity) → reconciliation job converges, Operations case if it cannot |
| M3-A9-10 | Host removes/blocks a unit after a reservation is confirmed → `RECOVERY_REQUIRED`, Operations reassigns or refunds, customer always notified |
| M3-A9-11 | Guest policy enforcement: booking attempt exceeding `max_guests_per_unit` is rejected at checkout, not silently allowed and settled later |
| M3-A9-12 | ID verification required by policy blocks check-in until recorded |
| M3-A9-13 | Permission boundary: a host cannot view another host's `Property`/`Unit`/`StayReservation` |
| M3-A9-14 | Duplicate reservation submit (same idempotency key) → single reservation, no duplicate charge |
| M3-A9-15 | Booking a `UnitType` card auto-assigns one specific available `Unit` behind it; the customer's confirmation never displays a room number as something they chose |
| M3-A9-16 | Host reassigns a `CONFIRMED` reservation to a different `Unit` of the same `UnitType` before check-in → succeeds at no extra cost, price/dates/room-type unchanged, per §5.1a/§8.2's benign case |
| M3-A9-17 | Host reassignment blocked: no other `Unit` of the same `UnitType` is actually free for the reservation's dates → command rejected, original `Unit` stays assigned, no partial state |
| M3-A9-18 | Property-first vs filter-first consistency: the same `UnitType` card reachable by browsing its `Property` directly and by a matching filter query shows identical price and `quantity_available` |
| M3-A9-19 | Filter combination (e.g. 2-Sharing + PG + Monthly) returns only matching `UnitType` cards, de-duplicated per property, each showing its property's branding |

### 12.3 A10 listing (`M3-A10-01`...)

| # | Scenario |
| --- | --- |
| M3-A10-01 | Happy path: poster creates listing → submits → moderation approves → publishes → applicant applies → poster shortlists → contact revealed → conversion tracked |
| M3-A10-02 | Moderation rejects → listing returns to `DRAFT` with reason, poster edits and resubmits |
| M3-A10-03 | Listing expires automatically at `expires_at`; in-flight applications transition per §8.3's expiry-mid-application rule |
| M3-A10-04 | Poster closes a listing manually; already-submitted applications remain visible to the poster but new applications are blocked |
| M3-A10-05 | Duplicate application (same applicant, same listing, within cooldown) rejected with a stable error, not a silent duplicate row |
| M3-A10-06 | Application rate limit: an applicant exceeding the configured per-window cap is blocked with a clear, non-punitive message |
| M3-A10-07 | Contact reveal is rate-limited per actor per day; reveal event recorded for audit |
| M3-A10-08 | Report abuse on a listing opens an `OperationsCase`; Operations removes the listing with a reason; poster is notified |
| M3-A10-09 | Operations reinstates a wrongly-removed listing with a reason; poster cannot self-reinstate |
| M3-A10-10 | Vendor purchases a subscription plan → `PaymentAttempt` captured → `VendorSubscription` activated exactly once |
| M3-A10-11 | Subscription payment webhook replayed → activation is not duplicated, subscription period not double-extended |
| M3-A10-12 | Subscription payment fails → `VendorSubscription` stays `PENDING_ACTIVATION`/unactivated, poster can retry |
| M3-A10-13 | Poster attempts to publish beyond `max_active_listings` on their current plan → blocked with an upgrade prompt, not silently allowed |
| M3-A10-14 | Permission boundary: an applicant cannot see another applicant's `Application` against the same listing |
| M3-A10-15 | Permission boundary: a poster cannot view/act on another poster's `Listing`/`Application`/`VendorSubscription` |
| M3-A10-16 | Search/filter over `structured_fields` returns only `PUBLISHED`/`ACTIVE` listings to public/Customer callers; `DRAFT`/`REMOVED`/`ARCHIVED` never leak |

---

## 13. Implementation waves

Following the exact `C0...C5` wave shape Phase C established, renumbered `D0...D6` and using the
`M3-BE-30x`/`M3-FE-30x`/`M3-OPS-30x` ID family reserved in `task.md`. Each wave: objective,
dependencies, backend/frontend/partner/operations work, tests, acceptance-criteria gate.

### D0 — Foundation (ADR, contract proposals, shared schema decisions)

**Objective:** lock the archetype-enum extension, the allocation-pattern decision (§2), and the
deposit sub-lifecycle shape before any archetype-specific model is written, mirroring how Phase C's
C0 locks schema before wallet/coin commands exist.

**Dependencies:** Phase B (payment/OTP primitives live on staging).

- `M3-BE-301` ADR-0011: A7/A9/A10 archetype engines — allocation pattern, deposit sub-lifecycle,
  asset/unit exclusion-constraint scoping, "no Booking Group participation" confirmation
- `M3-BE-302` Contract proposals: A7 rental, A9 stay, A10 listing (three separate proposal files
  under `contracts/proposals/`)
- `M3-BE-303` `ServiceVariant.BookingArchetype` gains `A7_RENTAL`, `A9_STAY`, `A10_LISTING`;
  migration + seed placeholder categories (inactive until Wave D1-D3 land their engines)
- `M3-BE-304` **[reserved in task.md]** Coins/wallet/referral checkout-split integration point for
  new-category checkouts — cross-references `01-wallet-vcoins-referral.md` §4, implemented once its
  Wave C3 lands; this wave only reserves the `PaymentAttempt.Purpose` additions (§11) so C3's split
  logic has somewhere to attach when it is built
- `M3-BE-305` `PartnerLedgerEntry` extension: nullable `rental_booking`/`stay_reservation` FKs +
  constraint widening (§11)
- `M3-BE-306` `OperationsCase.case_type` new values (§8)

**Exit gate:** ADR merged, proposals reviewed, migrations apply cleanly on a copy of staging data with
no drift, `makemigrations --check` clean.

### D1 — A7 rental engine (backend)

**Dependencies:** D0.

- `M3-BE-311` Models: `RentalAsset`, `RentalMaintenancePeriod`, `A7VariantConfiguration`
- `M3-BE-312` `AssetReservation` + `ExclusionConstraint` (serialized-asset path)
- `M3-BE-313` Fungible pooled-asset capacity path (`select_for_update` + quantity check)
- `M3-BE-314` `RentalBooking`, `RentalBookingLine` + status machine (§7.1)
- `M3-BE-315` `RentalDeposit`, `RentalDepositTransaction` + status machine (§7.2)
- `M3-BE-316` `RentalHandover`, `RentalReturnInspection` (evidence-required, reuses upload/malware-
  scan infra from `apps/partners/storage.py`'s pattern)
- `M3-BE-317` `RentalExtension` command + conflict detection
- `M3-BE-318` Settlement matrix implementation (§4.5) — auto-approval tiers + Operations-required tier
- `M3-BE-319` `RentalPaymentAllocation` + checkout-free `PaymentAttempt.Purpose` values
- `M3-BE-320` Availability selector (grid pattern mirroring `carts/availability.py`)
- `M3-BE-321` Operations commands: `reassign_asset`, `resolve_deposit_dispute`, `damage_settlement_override`
- `M3-BE-322` Expiry sweeps: `AssetReservation` TENTATIVE expiry, maintenance-period-driven auto-block
- `M3-BE-323` PartnerCapability onboarding path for rental vendors (business-type decision from §11)
- `M3-BE-324` `RentalListingGroup` browse/search selector — query-time `GROUP BY` rollup over
  `RentalAsset` with `quantity_available` (§4.1a, §11), plus the composite index if measurement
  shows it is needed
- `M3-BE-325` Customer-facing vendor-list endpoint for a selected product type (`Service`/
  `ServiceVariant`) — the §4.1a "owner list second" step, explicitly not routed through any
  `04-availability-assignment-and-dispatch.md` ranking/offer machinery

**Partner work:** `M3-FE-311` Partner Assets/Bookings/Money workspace (§4.7)
**Customer work:** `M3-FE-312` Customer rental browse/checkout/active-rental tracking
**Customer work:** `M3-FE-313` Product-type browse → vendor-list → listing-group card UI (§4.1a),
  including the de-duplicated quantity display

**Tests:** concurrency (M3-A7-07/07a), settlement matrix (M3-A7-09..12), reconciliation (M3-A7-15),
browse/de-dup (M3-A7-18/19/20).

**Exit gate:** M3-A7-01 through M3-A7-20 pass on staging.

### D2 — A9 stay engine (backend)

**Dependencies:** D0. May run in parallel with D1 — no shared model dependency beyond D0's shared
scaffolding.

- `M3-BE-331` Models: `Property`, `Unit`, `UnitPricingRule`, `UnitPricingOverride`,
  `PropertyPolicy`, `A9VariantConfiguration`
- `M3-BE-332` `UnitReservation` + `ExclusionConstraint`
- `M3-BE-333` `StayReservation`, `StayReservationLine` + status machine (§7.3)
- `M3-BE-334` `StayDeposit`, `StayDepositTransaction` + status machine (structurally shared code
  with `RentalDeposit` where reasonable — evaluate a shared abstract base at implementation time,
  not decided here to avoid over-designing before both concrete cases exist)
- `M3-BE-335` `StayCheckIn`, `StayCheckOut`, ID-verification recording
- `M3-BE-336` `StayExtension` / late-checkout command
- `M3-BE-337` Early-checkout settlement (§5.6) + cancellation-policy-band refund calculation
- `M3-BE-338` `StayPaymentAllocation` + checkout-free `PaymentAttempt.Purpose` values
- `M3-BE-339` Availability/search selector
- `M3-BE-340` Operations commands: `reassign_unit`, `resolve_deposit_dispute`
- `M3-BE-341` Expiry sweeps + no-show grace-period sweep
- `M3-BE-342` PartnerCapability onboarding path for property hosts
- `M3-BE-343` `UnitType` model + migration, `UnitPricingRule`/`UnitPricingOverride` retargeted to
  `unit_type` with `duration_mode` (§5.1a, §5.3, §11)
- `M3-BE-344` Property-first and filter-first browse selectors over `UnitType` (§5.1a) — one query
  surface, two orderings/entry points, reusing `ServiceQuestion`/`ServiceQuestionOption` for filter
  option definitions
- `M3-BE-345` `host_reassign_unit` command: re-runs the `UnitReservation` exclusion-constraint check
  against the candidate `Unit` inside one transaction, rejects if unavailable (§5.1a, §8.2)

**Partner work:** `M3-FE-321` Partner Properties/Reservations/Money workspace (§5.7)
**Partner work:** `M3-FE-323` Reassign-unit action on the Reservations screen (§5.7)
**Customer work:** `M3-FE-322` Customer stay search/checkout/active-reservation tracking, including
  property-first and filter-first entry points and de-duplicated `UnitType` cards (§5.1a)

**Tests:** concurrency (M3-A9-07), no-show (M3-A9-03), early checkout (M3-A9-04), host-blocks-unit
recovery (M3-A9-10), room-type browse/reassignment (M3-A9-15..19).

**Exit gate:** M3-A9-01 through M3-A9-19 pass on staging.

### D3 — A10 listing engine (backend)

**Dependencies:** D0. May run in parallel with D1/D2.

- `M3-BE-351` Models: `Listing`, `ListingMedia`, `ListingModerationEvent`, `ListingReport`,
  `A10VariantConfiguration` (with `ListingTypeSchema` for `structured_fields` validation)
- `M3-BE-352` Listing lifecycle commands (§6.3) + moderation workflow
- `M3-BE-353` Models: `Application`, `ApplicationAttachment`, `ApplicationStatusEvent`,
  `ApplicationReport`
- `M3-BE-354` Application lifecycle commands (§6.5) + duplicate/rate-limit guards
- `M3-BE-355` Contact-reveal command + rate limiting (reuses OTP-throttle primitive)
- `M3-BE-356` Search/filter selector over `structured_fields`
- `M3-BE-357` `VendorSubscriptionPlan`, `VendorSubscription` models + purchase/activation commands
- `M3-BE-358` Checkout-free `PaymentAttempt.Purpose` values for subscription/premium
- `M3-BE-359` Operations commands: `moderate_listing`, `remove_listing`, `reinstate_listing`,
  `resolve_report`
- `M3-BE-360` Expiry sweeps: listing `expires_at`, subscription expiry
- `M3-BE-361` PartnerCapability onboarding path for job posters (Employer business type)

**Partner work:** `M3-FE-331` Partner Listings/Leads/Billing workspace (§6.9)
**Customer work:** `M3-FE-332` Customer listing browse/search/apply flow

**Tests:** moderation gate (M3-A10-02), duplicate/spam (M3-A10-05/06), subscription activation
(M3-A10-10/11/12), permission boundaries (M3-A10-14/15/16).

**Exit gate:** M3-A10-01 through M3-A10-16 pass on staging.

### D4 — Cross-archetype checkout integration (coins/wallet/referral on new categories)

**Objective:** the reserved `M3-BE-304` line item, expanded. Wallet/coin split and referral
attribution work identically on A7/A9/A10 checkouts as on every other checkout, because all three
route through the same `PaymentAttempt` creation path (§6.1, §11) that Phase C's Wave C3 already
extended with `wallet_amount_paise`/`coin_burn_amount`.

**Dependencies:** D1-D3 (payment purposes exist); Phase C Wave C3 (wallet/coin checkout split built).

- `M3-BE-371` Verify wallet/coin split applies unchanged to `A7_RENTAL_BOOKING`,
  `A9_STAY_RESERVATION`, `A10_VENDOR_SUBSCRIPTION` purposes — no new split logic, regression tests
  only
- `M3-BE-372` Referral qualifying-event hook: confirm whether a rental/stay `COMPLETED` counts as a
  "completed booking" for referral/coin-unlock purposes (`customer.fulfilment.completed`-equivalent
  event for these archetypes) — owner decision needed, default position: yes, emit an equivalent
  completion event from `RentalBooking`/`StayReservation` reaching `COMPLETED`, following the exact
  `M3-BE-207` pattern (idempotent, transactional, `event_version`)
- `M3-BE-373` Refund-to-wallet path verified for rental/stay deposit and price refunds (coins never
  restored, matching §2.8 of Phase C)

**Exit gate:** a wallet+coin+Razorpay split checkout succeeds on an A7 rental and an A9 stay booking;
refund correctly routes wallet/Razorpay portions back per archetype.

### D5 — Operations surfaces and cross-archetype hardening

**Dependencies:** D1-D3.

- `M3-OPS-311` Operations rental-booking workspace (list/detail/recovery commands, §10.1's `/ops/*`
  group)
- `M3-OPS-321` Operations stay-reservation workspace
- `M3-OPS-331` Operations listing/moderation workspace + report queue
- `M3-OPS-341` Operations subscription-plan configuration UI
- `M3-BE-381` Object-level authorization regression tests across all three archetypes (owner runs,
  same convention as Phase C's `M3-BE-252`)
- `M3-BE-382` Concurrency regression suite: asset/unit exclusion races, deposit double-settlement,
  application duplicate-submit (owner runs)
- `M3-DOC-391` Runbook `docs/runbooks/m3-rental-stay-listing-smoke.md`

**Exit gate:** every scenario in §12 passes on staging; runbook exists and has been walked through
once by the owner.

### D6 — Phase D acceptance

**Dependencies:** D0-D5.

- `M3-QA-301` Full acceptance pass: §12.1, §12.2, §12.3 scenarios executed on staging (owner manual
  pass, per the existing task-marking rules in `task.md`)
- `M3-QA-302` Three new categories demonstrable end-to-end on staging (feeds Phase F's
  `M3-QA-501` "11 web categories demonstrable" claim)

**Phase D exit gate:** all scenarios in §12 pass on staging; `task.md` Phase D marked per the standard
`[ ]`/`[~]`/`[x]` convention, never `[x]` before owner manual verification.

---

## 14. Explicit dependencies

| This document's work | Depends on | Nature of dependency |
| --- | --- | --- |
| Any checkout for A7/A9 | Phase B (`M3-BE-101`/`102`) | Needs a real or reliably-faked Razorpay capture path — `PaymentAttempt`/`PaymentWebhook` must actually reduce to a captured state, not just exist as a model |
| Wallet/coin split on new-category checkout (`M3-BE-304`, expanded in D4) | Phase C Wave C3 (`01-wallet-vcoins-referral.md` §8) | The `wallet_amount_paise`/`coin_burn_amount` extension to payment-attempt creation must exist before D4 can verify it applies unchanged to A7/A9/A10 purposes |
| Referral qualifying-event parity for rental/stay completions (`M3-BE-372`) | Phase C Wave C0b/C2 (`M3-BE-207`, the `customer.fulfilment.completed` outbox hook) | D4 follows the identical idempotent-outbox-hook pattern that hook establishes; it is a sibling implementation, not a shared code path, because `RentalBooking`/`StayReservation` are not `Booking` rows |
| Partner/vendor onboarding for all three archetypes | M2's `PartnerCapability`/`PartnerBusinessProfile` foundation | Zero new registration pipeline is built; D1/D2/D3's "onboarding path" tasks are enum/config additions to the existing capability-review flow, not new review workflows |
| Operations case workspace for new case types | M1's `apps/cases` foundation | D5's Operations surfaces are new views inside the existing case-oriented workspace, not a new workspace shell |
| Money correctness (allocation sum invariant) | ADR-0003 | Every new allocation table (`RentalPaymentAllocation`, `StayPaymentAllocation`) must satisfy the same "sum of allocations equals the transaction amount" invariant Phase C's `M3-BE-234` already tests for wallet/coin splits — D1/D2 add the archetype-specific regression tests, they do not relax the invariant |
| Analytics/reporting on the three new categories | Phase E (`04-operations-analytics.md`, not yet written) | Out of scope here; this document's Operations workspaces (§10.1, D5) are operational case-management surfaces, not the revenue/GST dashboards Phase E owns |

---

## 15. Open questions (owner decisions needed before implementation)

Following the same "resolved / still open" convention as `01-wallet-vcoins-referral.md` §10.

| ID | Plain English | Options | Planning default |
| --- | --- | --- | --- |
| OQ-D1 | Does a rental/stay `COMPLETED` count toward referral qualification and coin-unlock completion counts the same as an A1/A2/A3/A5 completion? | **A)** Yes, uniformly — one "completed transaction" definition across every archetype. **B)** No — only service-visit archetypes count; rental/stay are excluded from loyalty completion counting. | A — simpler, matches the platform-wide "completed booking" language in document 00's feature map, which does not carve out an archetype exception |
| OQ-D2 | Does `PartnerBusinessProfile.BusinessType` need new values (`RENTAL_OWNER`, `PROPERTY_HOST`, `EMPLOYER`) or can the three existing values (`INDIVIDUAL`/`WORKFORCE_AGENCY`/`PROJECT_VENDOR`) cover the new archetypes' GST/registration needs? | **A)** Reuse existing three. **B)** Add new values. | Deferred to Wave D1 — depends on whether tax/registration fields (`gst_registered`, `registration_number`) actually differ by archetype in a way `business_type` needs to express, or whether it is purely a display-label concern that a separate non-enum field could carry |
| OQ-D3 | Can a fungible pooled rental asset (e.g. "10 identical drills") be booked as a specific serial-numbered unit at handover time, or does the customer never learn which physical unit they received? | **A)** Vendor assigns a specific unit at handover, recorded on `RentalHandover`, without changing the booking's pooled-quantity identity. **B)** Pooled assets never resolve to a specific serial number. | A — needed so `RentalReturnInspection` can compare condition against the *specific* unit handed over, not an abstract pool |
| OQ-D4 | Does A10 launch with only Career/Jobs, or does the generalized `structured_fields`/`A10VariantConfiguration` design need a second listing type validated end-to-end before M3 acceptance, per document 09's "Expansion rule" (seed and execute one representative subcategory with zero new backend lifecycle code)? | **A)** Career/Jobs only for M3; generalization is proven later when a second listing type actually launches. **B)** Seed a second dummy listing type now to prove genericity before acceptance. | A — document 09's rule applies to *configuration-only* claims; this document does not claim A10 is configuration-only for a second type, it only claims the schema was designed not to require lifecycle code changes. Proving that claim is future work's job, not M3's |

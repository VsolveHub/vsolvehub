# M1 Frozen Initial Configuration

**Decision date:** 31 July 2026

**Last reviewed:** 2 August 2026

**Status:** Frozen implementation baseline for M1

These values remove implementation ambiguity; they do not weaken the production gates. Runtime
configuration is versioned and effective-dated, secrets stay in the deployment secret store, and each
quote, offer, booking and ledger entry snapshots the applicable values. Changes require an explicit
Operations/configuration release with audit and regression tests, never an unreviewed code literal.

All money is stored as integer paise. Customer-facing fee totals below are tax-inclusive caps. The
invoice separates tax according to the approved tax configuration without increasing the displayed
total.

## Active catalog and service area

Only these existing one-person task variants are active at M1 launch:

| Category | Variant code | Unit price | Marginal duration |
|---|---|---:|---:|
| Electrician | `switch-socket-repair` | ₹129 | 30 minutes |
| Electrician | `fan-installation` | ₹249 | 60 minutes |
| Electrician | `light-led-installation` | ₹129 | 30 minutes |
| Plumber | `tap-repair` | ₹199 | 45 minutes |
| Plumber | `wc-flush-repair` | ₹249 | 45 minutes |
| Carpenter | `cupboard-hinge-repair` | ₹299 | 60 minutes |

The minimum service subtotal is ₹199 per visit. A quote uses the greater of the task total and this
minimum, and shows that rule before search. Diagnostic/unknown-fault work, short circuits, drain
blockages, heavy installations, AC/RO work, furniture assembly, door/lock work needing unknown parts
and every two-person task remain inactive.

The only initial service area is:

| Area code | Postal code | City/state | Service hours | Time zone |
|---|---|---|---|---|
| `hyderabad-500032` | `500032` | Hyderabad, Telangana | 08:00–20:00 every day | `Asia/Kolkata` |

The production seed replaces the development-only `west-hyderabad-development` fixture; that fixture
must never be activated as a production fallback.

Activation requires at least three approved, eligible Partners per active category/area. If that
density is not met, the area/category stays unavailable rather than using a hidden fallback Partner or
expanding the radius. Today bookings need 120 minutes lead time; Scheduled bookings may be made up to
7 calendar days ahead. Customer arrival windows are 60 minutes.

## Cart and fulfilment-planning limits

These are launch safety limits and effective-dated configuration, not schema cardinalities or final
product exclusions:

| Setting | M1 value | Behaviour at limit |
|---|---:|---|
| Active cart items | 5 | Reject another add with the current cart and a remove/edit action |
| Fulfilment Units in one Booking Group | 5 | Return no plan and explain that the Customer must reduce/split intent |
| Concurrent Partners at one address | 2 | Offer sequential or separate-visit alternatives |
| Combined occupied duration for one sequential unit | 240 minutes | Split into separate units/visits |
| Planning alternatives returned | 3 | Rank deterministically and retain the decisive reasons |
| Plan/quote lifetime | 15 minutes | Invalidate and require visible replanning/requote |

M1 Booking Groups use one confirmed address and `ALL_OR_NOTHING` confirmation. Cross-category
combination is allowed only through explicit compatibility configuration and a non-empty intersection
of Partners eligible for every exact variant. Missing compatibility defaults to separate units.

The initial compatibility matrix must be Operations-owned seed/configuration reviewed before launch.
It explicitly identifies same-Partner sequential pairs, parallel-safe pairs, must-separate pairs and
dependencies. Category membership never creates a rule automatically.

The minimum service subtotal is applied per Fulfilment Unit. The initial ₹29 platform fee is charged
once per Booking Group and allocated proportionally across unit service subtotals, with any paise
remainder assigned by stable unit order. Quotes show both group and unit totals before confirmation.

## Assignment, reservation and payment clocks

| Setting | Initial value | Expiry behaviour |
|---|---:|---|
| One Partner offer per unit | 45 seconds | Expire and offer the next eligible candidate for that unit |
| Candidates per unit search | 3 | Mark the unit exhausted and trigger group compensation/replan |
| Whole Booking Group search | 180 seconds | Release all tentative unit holds; Customer is not charged |
| Provisional acceptance undo | 120 seconds | Commit when the deadline passes unless undone |
| Customer payment window | 5 minutes | Expire checkout and release tentative reservation |
| Payment-start safety margin | 30 seconds | Disable starting payment this close to reservation expiry |

A permanent offer-delivery failure advances immediately instead of waiting 45 seconds. The whole
group-search deadline always wins over unit/offer deadlines. Server time is authoritative and every
API response that exposes a deadline includes it as an absolute timestamp. Payment opens only when
every required unit has a committed tentative reservation; one exhausted unit releases the others.

The M1 Partner inbox observes a replayable server projection through bounded short polling. Polling
backs off or pauses when hidden/offline and refreshes from authoritative state after reconnect; it
never expires an offer, advances a candidate or commits an acceptance. Celery/beat owns those clocks
and transitions even when every browser is closed.

## Arrival, lateness and unavailable Customer

- A Partner is late 15 minutes after the promised arrival-window end. At that point the Customer gets
  fee-free cancel or reschedule; Operations can offer recovery sooner when delay is known.
- `ARRIVED` starts the unavailable-Customer workflow at the later of recorded arrival and the arrival
  window start. The Partner waits 10 minutes and makes two masked contact attempts, at minute 0 and
  minute 5. Server timestamps and delivery/call outcomes are evidence; free-text alone is insufficient.
- After the 10-minute deadline, the Partner may leave and request the configured visit fee. Operations
  resolves missing/contested evidence. Arrival or `EN_ROUTE` alone never creates a fee.

## Completion, dispute and settlement clocks

| Setting | Initial value |
|---|---:|
| Customer completion response | 24 hours after completion submission |
| Quality/property-damage financial-dispute window | 72 hours after completion submission |
| Partner ledger availability | After finalization and the 72-hour dispute deadline, with no open hold/case |

Required evidence and no open safety/damage case are prerequisites for silent-customer finalization.
Safety incidents may always be reported after 72 hours; the window only controls the automatic
pre-payout hold. A later substantiated case is handled by an immutable ledger adjustment, not by
rewriting a paid ledger entry.

## Cancellation and visit fees

| Customer cancellation point | Customer fee |
|---|---:|
| Before successful payment | ₹0 |
| More than 24 hours before arrival-window start | ₹0 |
| 24 hours to 2 hours before arrival-window start | ₹49 |
| Less than 2 hours before arrival-window start and before verified arrival | ₹99 |
| Verified arrival plus completed wait/contact evidence | ₹149 visit fee |
| Partner/platform failure or Partner late threshold reached | ₹0 |
| After work starts | Completed authorized lines only; unperformed lines refunded |

The backend returns a cancellation quote before confirmation. No fee exceeds the unpaid/refundable
service subtotal. If payment has not settled, the system never represents a refund as completed.
For a Booking Group, the policy is evaluated independently for every affected unit using that unit's
window and state, then reconciled to a group cancellation total. Cancelling one unit does not reset or
rewrite the cancellation ladder of another unit.

## Commission and payout

- Platform commission is 18% of the completed authorized service subtotal, with a ₹30 floor and ₹500
  cap per visit. Tax, tips, materials, cancellation/visit fees, refunds and goodwill credits are
  excluded from the commission basis.
- A valid cancellation/visit fee creates Partner compensation equal to 80% of that fee before its tax
  component; the remainder covers payment/support cost. Partner/platform-caused cancellation creates
  no Customer-funded Partner compensation.
- Eligible ledger entries enter the weekly payout batch each Tuesday at 10:00 IST, with a Monday
  23:59 IST cutoff. An open dispute, safety/damage case, payout-account cooling period or reconciliation
  ambiguity holds only the affected entries.
- One Operations maker creates the payout batch and a different finance-authorized checker approves
  it. Provider submission is idempotent; provider/webhook ambiguity remains `PROCESSING` and opens
  reconciliation rather than guessing success.

## Frozen providers

| Capability | M1 provider and mode | Required implementation rule |
|---|---|---|
| Customer payment/refund | Razorpay Orders/Checkout, automatic capture and normal full/partial refunds | Verify signatures, persist webhooks, deduplicate, fetch/reconcile ambiguous state and never trust redirect success |
| SMS delivery | MSG91 Flow API with DLT-approved templates | Django generates, hashes, expires and verifies OTPs; MSG91 is delivery only |
| Private evidence/document storage | Supabase Storage private buckets | Signed direct/resumable upload, backend-owned metadata/access audit and server-only credentials |
| Malware scanning for private documents | **Open release decision — no provider approved** | Keep every new document fail-closed until a trusted authenticated scan result is reconciled; never infer clean on timeout/failure |
| Partner payout | RazorpayX Current Account Payout API | Idempotency key, IP allowlist, webhook-driven state and reconciliation are mandatory |

Implementation uses the providers' official references for
[Razorpay capture](https://razorpay.com/docs/payments/payments/capture-settings/?preferred-country=IN),
[webhooks](https://razorpay.com/docs/webhooks/),
[refunds](https://razorpay.com/docs/payments/refunds/issue/),
[RazorpayX payouts](https://razorpay.com/docs/x/payouts/api/?preferred-country=IN),
[MSG91 Flow SMS](https://docs.msg91.com/sms/send-sms),
[MSG91 DLT mapping](https://msg91.com/help/dlt-registration-in-india/map-sms-content-template-on-msg91-api-panel),
and [Supabase private storage](https://supabase.com/docs/guides/storage). API versions and mandatory
provider controls are revalidated when each adapter is implemented; a provider change requires an
explicit decision, configuration migration and rollback plan.

Local development and CI use deterministic fake adapters. Staging uses provider test modes where
available. Production activation is blocked until merchant/current-account onboarding, approved DLT
templates and sender, private-bucket/RLS policy, approved malware scanning, verified-KYC legal
retention/deletion, webhook secrets, IP allowlist, refund/payout drill and kill-switch drill all pass.
Provider credentials and personal data never appear in this document or Git.

Voice OTP, COD, wallet credit, instant payout, storage bucket versioning and automatic provider
failover are not M1 configuration. An outage preserves server truth, stops unsafe new actions and
routes to the documented recovery path; it never fabricates delivery, collection, refund or payout
success.

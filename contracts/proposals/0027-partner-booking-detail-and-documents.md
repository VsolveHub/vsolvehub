# 0027 — Partner booking detail: invoice documents and customer contact

**Status:** Proposed
**Raised by:** Claude (frontend), 30 September 2026
**Consuming application:** `frontend/apps/partner` — `/stays/bookings`, `/stays/enquiries`, `/rentals/bookings`

## Why

The partner stays and rentals workspaces were split into separate destinations (properties / enquiries /
bookings, and ads / bookings), and each record now opens a detail panel instead of showing everything
inline. The panel is expected to show **customer details** and **invoice details**. Three of the fields it
needs are not on the wire today.

What exists now:

| Record | Customer identity | Money | Document |
| --- | --- | --- | --- |
| `StayReservation` | `customer_name`, `customer_phone` | `total_paise`, `nights` | none |
| `StayEnquiry` | none | `total_quote_paise`, `nightly_rate_paise` | none |
| `RentalBooking` | none | `price_paise`, `deposit.amount_paise`, `deposit.consumed_paise` | none |

There is no partner-facing tax-document endpoint. The only partner money reads are
`GET /api/v1/partner/earnings/` and `GET /api/v1/partner/ledger/`, neither of which is per-record.

The frontend currently renders an explicit "not shared with Partner accounts yet" block in each panel
rather than inventing a document reference. This proposal is what would replace it.

## 1. Customer contact on `StayEnquiry`

**Route:** `GET /api/v1/partner/stays/enquiries`
**Action:** a host opening an enquiry to reply to it.

Add `customer_name` and `customer_phone` to `StayEnquiry`, matching the reservation serializer.

A host cannot answer "can we do the 14th?" without knowing who is asking, and cannot act on a
special-request message without a way to reach the guest. Today the only route to that is to accept
the enquiry and wait for a reservation, which is the opposite of what a pre-booking question is for.

**Authorization.** Partner-scoped to the property's owning partner, exactly as the existing
`property_title` and `total_quote_paise` fields are.

**Release point.** Contact appears with the enquiry, not with the booking. If the owner wants the
number withheld until a reservation exists, that is a policy decision and the frontend needs to know
which — an enquiry panel with no contact is currently indistinguishable from one where the field failed
to load, and the panel says so in those words.

## 2. Customer contact on `RentalBooking`

**Route:** `GET /api/v1/partner/rentals/bookings` (and the `{action}` response)
**Action:** a host handing an asset over, or chasing a return.

Add `customer_name` and `customer_phone` to `RentalBooking`.

Handover already requires the customer to read out the booking's 4-digit PIN, which means the customer
is expected to be standing there. The host has no name to check against and no number to call if they
are not.

**Authorization.** Partner-scoped to the asset's owning partner.

**Do not add `handover_pin` to any partner read.** It is already marked "for the customer only" and
that is correct — a partner who can read the PIN can complete a handover with nobody present, which
removes the only thing the PIN is for. The frontend deliberately does not render it.

## 3. Partner-side document read

**Route (proposed):** `GET /api/v1/partner/stays/reservations/{reservation_id}/document/`
and `GET /api/v1/partner/rentals/bookings/{booking_id}/document/`
**Action:** a partner downloading the invoice for one booking.

Returns the `TaxDocument` already allocated for the underlying order, or `204`/`404` when none exists.

The backend owns the shape; the frontend needs, at minimum:

- a durable document number (the `series-sequence` shape `TaxDocumentSerializer` already publishes)
- the document's issue date
- a downloadable representation, or a URL that yields one
- `is_test`, so a sandbox document can be labelled as one

**Authorization.** The partner may read the document for a booking they own. This is a **new
permission surface** — the note on `GET /api/v1/partner/bookings/{booking_id}/` deliberately withholds
"the Customer's invoice" from partners — so the domain decision comes first. If the answer is that a
partner may not read the customer's tax document at all, the frontend needs a partner-specific
statement of account instead, and that is a different proposal.

**Validation and conflict.** An unknown or non-owned id is `404`, never `403`: a partner must not be
able to probe booking ids. A booking with no document is `204`, which is a real state — an unpaid or
cancelled reservation has nothing to invoice.

**Idempotency.** Read-only, so none required. If the document is generated on demand, that generation
must be idempotent per booking, so a double-click cannot allocate two numbers.

**Retry.** `5xx` is retryable by the client; `404` and `204` are terminal and are not retried.

## User-visible recovery

| Outcome | What the partner sees |
| --- | --- |
| Document present | Number, issue date, download action; "TEST DOCUMENT" label when `is_test` |
| `204`, no document yet | "No invoice for this booking" with the reason — unpaid, or cancelled before payment |
| `404` | "We could not find this booking." with no retry — it is not theirs or does not exist |
| `5xx` / network | "We could not load the invoice." with a Try again action |
| Customer contact absent | "Not provided" with a plain statement that this record has no contact details, not a blank row |

## Out of scope

- Sending the document to the customer. This is a partner read only.
- Any change to `handover_pin` visibility.
- Partner-side credit notes or refund documents. Those belong with the M3 refund work.

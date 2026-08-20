# Access receipt: the fields a receipt has to carry

**Status:** proposed
**Owner:** backend seat. The Customer app builds against this document; it does not
guess the shape from the code, and until this lands it renders the receipt without
these fields rather than with placeholders.

---

## 1. Why

`GET /api/v1/engagements/{id}/` publishes `access_receipt` as four values:

```json
{ "number": "M2A-…", "kind": "A3_BOOKING_FEE", "amount_paise": 59900, "paid_at": "…" }
```

The Customer app renders that at `/engagements/{id}/receipt` as a document, because
a receipt is a record somebody returns to, forwards to whoever keeps their books,
and expects to find at a URL months later.

Four things every receipt of this kind carries are missing, and each one is missing
in a way the reader notices:

1. **The tax split.** The document states a total and cannot say whether tax is in
   it. Anyone doing books with this has to ask.
2. **How it was paid.** No method, no gateway reference. A payment that has to be
   reconciled against a card or UPI statement cannot be, from this.
3. **Who was paid, formally.** "V Solve Hub" and nothing else — no registered
   address, no GSTIN, no CIN.
4. **Who paid.** The app prints the session's phone number because it holds no
   name. On a forwarded document that is thin.

The app will not invent any of them. A placeholder GST rate on a payment record
reads as a fact to whoever receives it, and this codebase's rule against hidden
fallback prices exists for exactly this case. So the receipt currently says less
than it should and stays true.

## 2. What is asked for

Additive fields on `access_receipt`. Every one is nullable, and the app renders
each conditionally — shipping them one at a time is fine, and a null is rendered
as absent rather than as a blank or a zero.

| Field | Type | Notes |
|---|---|---|
| `tax_treatment` | `"INCLUSIVE" \| "EXCLUSIVE" \| "NOT_APPLICABLE" \| null` | Null means undecided; the app keeps saying nothing. `NOT_APPLICABLE` is a real answer and renders as "No tax charged". |
| `tax_rate_bp` | `integer \| null` | Basis points, so 18% is `1800`. Integer for the same reason money is paise. |
| `tax_amount_paise` | `integer \| null` | **Server-computed.** The client must never derive it — see §4. |
| `net_amount_paise` | `integer \| null` | The base. `net + tax == amount_paise` by constraint, not by client arithmetic. |
| `payment_method` | `string \| null` | Display text, e.g. `"UPI"`, `"Card ending 4412"`. Free text the app prints verbatim; it must be safe to show and must not carry a full instrument number. |
| `gateway_reference` | `string \| null` | The PSP's own id, for reconciliation. |
| `payer_name` | `string \| null` | The name on the account, when one has been collected. |

And a payee block, which is per-deployment rather than per-receipt — a top-level
key on the same response is fine, or a separate `GET /api/v1/legal-entity/`:

| Field | Type |
|---|---|
| `legal_name` | `string` |
| `registered_address` | `string[]` (lines, in reading order) |
| `gstin` | `string \| null` |
| `cin` | `string \| null` |
| `support_email` | `string \| null` |
| `support_phone` | `string \| null` |

## 3. What the app does with each

- Tax split → a two-line breakdown above the total, and the total's caption stops
  being silent about tax.
- Method + gateway reference → a "How it was paid" strip beside the reference strip.
- Payee block → the "Received by" party, which today is a name and a tagline.
- `payer_name` → the "Received from" party, with the phone number beneath it
  instead of standing in for it.

## 4. The rule the client will keep

**No arithmetic on money, on either side of this.** `tax_amount_paise` and
`net_amount_paise` are read and printed, never computed from `amount_paise` and a
rate. The existing adapters already work this way — `toSlotMoney` and
`toAccessReceiptView` format server integers and sum nothing — and a receipt is the
last place to start, because a client that can produce a number disagreeing with a
refund statement eventually will.

## 5. Open owner decision this does not settle

Whether these fees attract GST at all is not a contract question and this document
does not answer it. `tax_treatment: null` is the honest wire value while it is
open, and the receipt keeps saying "this is a receipt, not a tax invoice" until
somebody decides otherwise. If the answer is that a tax invoice is due, that is a
different document with a different endpoint — `TaxDocument.order` is not nullable
today, and an access fee has no `Order`.

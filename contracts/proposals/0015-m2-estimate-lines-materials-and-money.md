# 0015 — M2 estimate lines, customer-supplied materials, and one money truth

**Status:** Proposed
**Consuming applications:** `apps/partner` (estimate composer), `apps/customer` (quote reading)
**Depends on:** BE-5, BE-5A, BE-6, BE-7 in root `task.md`
**Supersedes nothing.** Extends the proposal surface published through 1.43.0.

---

## Why this exists

The 28 designed M2 screens were audited against contract 1.43.0. Six are buildable.
The other 22 cannot be expressed at all — not "are awkward", cannot be expressed:

- There is no `ITEM_WISE` / `LABOUR_WISE` discriminator anywhere in 838 schemas, so a
  client cannot know which composer it is reading back and cannot branch on it.
- No estimate line carries `unit`, `quantity` or `rate`. `ProposalMaterialLine` has
  `quantity` and `unit` but no rate, and its docstring says `amount_paise` is "the whole
  line's cost, not the unit price" — so `qty × rate = amount` is unrepresentable.
- No line carries a `category`, so grouped sections with subtotals cannot be published.
- A3 labour is three flat integers on the proposal root — `rate_paise_per_worker_day`,
  `minimum_days`, `worker_count`. "Two masons for five days plus three helpers for five
  days" collapses to one blended day rate. There is nothing to degrade to.
- `tax_basis`, `tax_paise` and `commission_treatment` are still writable by the vendor,
  which BE-5A explicitly forbids. `commission_treatment` is an unbounded `string` with
  no enum, on both read and write.
- The estimate publishes four money scalars and no derivation: no taxable value, no tax
  components, no platform fee, no grand total, no partner receivable.
- `ProposalStage` has no `position`, so a reorderable installment schedule has nowhere
  to persist its order.

This proposal asks for the smallest set of additions that make the designed screens
expressible without the client inventing anything.

---

## 1. Estimate type

Add `estimate_type` to `Proposal`, `CustomerProposal` and `ProposalCreateRequest`.

```
EstimateTypeEnum: ITEM_WISE | LABOUR_WISE
```

Required on create. **Exactly one line family per estimate** — a request carrying
`item_lines` while `estimate_type` is `LABOUR_WISE` is rejected. Do not publish a
combined `A + B` subtotal: the reference JPEGs show `Subtotal (A + B)` where B is
always ₹0, and root `task.md` rules that presentation out.

**Refusal:** `estimate_line_family_mismatch`, HTTP 422, naming the offending array.
**User-visible recovery:** the composer's mode switch already warns before discarding
entered rows; this refusal should never reach a user through the app.

---

## 2. Item-wise lines

New `ProposalItemLine` / `ProposalItemLineRequest`, wired onto the same three payloads.

| Field | Type | Notes |
|---|---|---|
| `title` | string ≤120 | "Switch (6A)" |
| `qualifier` | string ≤40, blank ok | "Fitting" — the sub-label under the title |
| `section` | string ≤60, blank ok | "Wiring & points" — groups rows and drives subtotals |
| `unit` | string ≤16 | "Nos", "Sq.ft", "Per Pax", "rft" |
| `quantity` | decimal ≥ 0.01 | painting quotes 500 sq ft; catering 200 pax |
| `rate_paise` | int ≥ 0 | the unit price |
| `amount_paise` | int, **read-only** | server computes `quantity × rate_paise` |

`quantity` must be decimal, not integer: `Sq.ft` and `Litre` lines are not whole numbers.

Server computes `amount_paise` and the per-section subtotals. The client displays them
and never multiplies — a client that can do this arithmetic is a client that will
eventually disagree with the invoice.

---

## 3. Labour-wise lines

New `ProposalLabourLine` / request twin.

| Field | Type | Notes |
|---|---|---|
| `role` | string ≤80 | "Electrician" |
| `skill_band` | string ≤32, blank ok | "Skilled" / "Unskilled" |
| `members` | int ≥ 1 | |
| `days` | decimal ≥ 0.5 | half-days are real |
| `rate_paise_per_day` | int ≥ 0 | |
| `amount_paise` | int, **read-only** | `members × days × rate_paise_per_day` |

Keep the existing flat A3 scalars for backward compatibility, but derive them from the
lines where both are present, and prefer the lines. Do not ask a client to reconcile two
sources of the same number.

---

## 4. Materials the customer buys — the new concept

This is the piece with no precedent in the contract, and the one worth reading closely.

M2 estimates are **labour only**. The customer buys the switches, the pipes, the paint.
Today they copy the item list onto paper at the shop counter. The designed screens turn
the estimate into the shopping list, which requires distinguishing two things the
contract currently conflates:

- a material the **partner** supplies and charges for (already modelled — an advance)
- a material the **customer** goes and buys, which is inside no total at all

Extend `ProposalMaterialLine` / `ProposalMaterialLineRequest`:

| Field | Type | Notes |
|---|---|---|
| `supplied_by` | enum `PARTNER` \| `CUSTOMER` | **required**, no default |
| `specification` | string ≤120, blank ok | "6 A, white", "20 W, 4 ft, with batten" |
| `shop_hint` | string ≤40, blank ok | "Electrical shop", "Hardware" |

**`supplied_by` must have no default.** A default silently assigns money: `PARTNER`
would put customer-bought goods inside the payable total, and `CUSTOMER` would take
partner-supplied goods out of it. Both are wrong in a way nobody notices until a refund.

A `CUSTOMER` line contributes **nothing** to any total. `amount_paise` must be
absent or `0` on it, and a non-zero amount is a refusal — otherwise the same rupees
appear in the shopping list and the invoice.

**Refusal:** `customer_supplied_material_priced`, HTTP 422.

### Related live defect, worth fixing alongside

`CustomerProposal.material_lines` is published today, the partner sends it, the partner's
own read-back renders it — and the customer adapter never maps it, while those amounts
sit inside `total_paise`. Customers are currently charged for materials they cannot see.
That is a frontend fix (`apps/customer/features/quotes/adapters`) and is being made
independently; noting it here because `supplied_by` changes what that surface must show.

---

## 5. Installments

Add `position` (int ≥ 1, unique per proposal) to `ProposalStage` and its request.
Ordering is currently implicit array order, so a reorderable schedule has nothing to
persist to.

Rename nothing. `ProposalStage` stays the wire name; "installment" is the word the UI
uses, and root `task.md` is explicit that installments reuse the existing ordered
stage-funding system rather than creating a second payment rail.

Keep the existing reconciliation rule: stage amounts plus `PARTNER`-supplied material
advances must equal the server-computed partner quote total exactly.

---

## 6. One money truth, read-only

Add `ProposalMoney`, published on `Proposal` and `CustomerProposal`, all integer paise,
all server-derived, none writable:

```
lines_total_paise          sum of the selected family only
charges_total_paise        authorized named charges
taxable_value_paise
tax_rate_bps               1800 for 18%
tax_paise
tax_components             [{ kind: CGST|SGST|IGST|CESS, rate_bps, amount_paise }]
partner_quote_total_paise  taxable + tax
platform_fee_paise         0 where not applicable
customer_total_paise
commission_paise
statutory_withholding_paise
partner_receivable_paise
policy_version             the snapshot this was computed under
```

`tax_components` matters because there is currently no `cgst`/`sgst`/`igst` anywhere in
the contract, and BE-5A requires the split. Intra-state supply is CGST+SGST; inter-state
is IGST. A single blended line cannot produce a compliant tax invoice later.

### Remove from writable input

`tax_basis`, `tax_paise` and `commission_treatment` come off `ProposalCreateRequest` and
`AssistedProposalRequest`, and are published as derived read fields only. Give
`commission_treatment` an enum while it is being touched — an unbounded 24-character
string cannot be switched on safely by any client.

Also replace `required_tax_basis()` choosing the first submitted quote's basis with an
Operations-owned basis snapshotted **before** vendors quote, so every partner competing
for one requirement is compared on the same server rule.

---

## 7. Example

**Request** — `POST /api/v1/proposals/`, role `partner`, `Idempotency-Key` required
(the existing `m2-proposal-submit:{invitation_id}:r{supersedes_revision}` convention).

```json
{
  "invitation_id": "…",
  "estimate_type": "ITEM_WISE",
  "item_lines": [
    { "title": "Switch (6A)", "qualifier": "Fitting", "section": "Wiring & points",
      "unit": "Nos", "quantity": "5", "rate_paise": 8000 }
  ],
  "material_lines": [
    { "title": "Modular switch", "specification": "6 A, white", "quantity": 5,
      "unit": "Nos", "supplied_by": "CUSTOMER", "shop_hint": "Electrical shop" }
  ],
  "stages": [
    { "position": 1, "title": "Wiring, boards & MCB",
      "deliverable": "Boards fitted, circuits live", "amount_paise": 120000 }
  ],
  "site_visit_id": "…"
}
```

Note what is absent: no `tax_basis`, no `tax_paise`, no `commission_treatment`, no
`total_paise`, no profit percentage. The vendor sends what they decided; the server
decides the rest.

**Response 201** returns the proposal with `estimate_type`, the echoed lines with
server-computed `amount_paise`, and the full `ProposalMoney`.

### Outcomes

| Situation | Result |
|---|---|
| Both line families present | 422 `estimate_line_family_mismatch` |
| `CUSTOMER` material with non-zero amount | 422 `customer_supplied_material_priced` |
| Stages do not reconcile to the quote total | 422 `installment_total_mismatch`, with expected and received |
| Duplicate `position` | 422 `installment_position_conflict` |
| Tax policy unresolvable | 409 `financial_policy_unavailable`, **fail closed** — never 0% |
| Estimate window closed | existing `m2_proposal_window_closed` |
| Replayed `Idempotency-Key` | 200 with the original proposal, no second revision |
| Retry after timeout | same key returns the same revision |

**Fail closed on tax is deliberate.** A missing policy that defaults to zero produces an
estimate the customer accepts and the platform cannot invoice.

**User-visible recovery:** every refusal above maps to a named composer error beside the
offending section, never a toast. `financial_policy_unavailable` is the one the vendor
cannot fix — that says the estimate is saved and Operations has been notified.

---

## 8. Not asked for

- Mixed item + labour estimates. Out of scope in root `task.md`.
- Customer-editable installments. Same.
- A profit or markup percentage. Deliberately removed — the margin is already inside the
  quoted rate, and the reference's `Contractor / Vendor Profit %` is a second surcharge
  on top of a rate that already contains one.
- An editable platform fee. Policy, not vendor input.
- Any client-side money arithmetic. Every figure above is server-derived by design.

---

## Appendix — customer-owned visit slots (BE-2), noted not proposed

While auditing: the slot grid, the signed slot token and the confirm operation already
exist and work — `m2_visit_slot_list`, `VisitSlotGrid`, `VisitSlot.id` ("a signed token
bound to this invitation and this start"), `m2_visit_slot_confirm`. They are all under
`/api/v1/partner/…`. The customer today can only choose `plan_size: 1..3` — a count,
with no times.

So BE-2 is not "build customer-owned slots"; it is "expose this proven surface to the
customer", plus a per-slot matching status and a replacement-slot operation to redeem
the already-published `VisitPlanShareStatusEnum.REPLACED` entitlement.

Raising it here so it is not scoped as greenfield. It belongs in its own proposal if
Codex wants one; backend work on `visit_slots.py` appeared in the tree while this was
being written, so it may already be underway.

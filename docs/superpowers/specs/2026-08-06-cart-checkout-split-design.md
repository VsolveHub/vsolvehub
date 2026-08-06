# Cart / Checkout split, per-category slots, coupons

**Date:** 2026-08-06
**Status:** Implemented (steps 1–3). Promotions (§4.5) deferred to its own plan.

## Changes made during implementation

Three decisions in this document were revised once the code was written. They are
corrected in place below; recorded here because the reasoning changed, not just the detail.

1. **Grouping ignores Partner availability entirely** (§3.1). The spec proposed probing capacity
   at a nominal start. In practice `_build_sequential_groups` calls `_eligible_partner_ids`, so
   any probe makes the grouping depend on who happens to be free — a Partner calling in sick
   would split "Electrician" into two slot rows and merge them again an hour later, with nothing
   on screen to explain it. `require_capacity=False` asks only the time-independent half of the
   merge rule. Staffing is still resolved at plan time, where a group no single Partner can cover
   falls back to independent visits at the chosen start.
2. **Suggestions link to the service; there is no one-tap Add** (§3.2). A `ServiceCard` names a
   service, not a variant, and a variant needs its scope answered before it can be priced. An Add
   button would have to invent both.
3. **`_unit_schedule` keeps cursors per anchor, not one global cursor** (§4.3). An alternative can
   split one scheduling group into several units; those still have to run back-to-back, because
   the group is work one Partner was expected to do in sequence and may carry an ordering
   dependency. Units in *different* groups do not interact at all.
**Scope:** Customer app (`frontend/apps/customer`) + `apps/carts`, `apps/pricing`, new `apps/promotions`

---

## 1. Why

Three things are wrong with the customer booking surface today.

**`/cart` is not a cart.** It is a five-step wizard — cart → schedule → plans → review →
confirmed — living on one route inside a single 730-line component
(`features/booking/group/view/workspace.tsx`). There is no page a customer can return to that
just shows what they are buying.

**Everything shares one start time.** The plan-set command takes a single `preferred_start`, and
the planner cascades per-visit times off it (`_unit_schedule`). A customer who wants an
electrician on Monday and a salon appointment on Friday cannot express that.

**There are no coupons.** Not a UI gap — there is no promotion domain in the backend at all.

## 2. What is *not* wrong

The payment model. The requirement "collect payment only after a partner is assigned" is
**already how the backend works**, and the frontend already honours it. Recorded here because it
was mistaken for a gap:

| Step | Effect |
| --- | --- |
| `POST /checkouts/` | Creates `CheckoutSession` + `BookingGroup(CONFIRMED)` + `FulfilmentUnit`s. Charges nothing. |
| `start_group_dispatch` | Group → `MATCHING`; checkout → `FINDING_PARTNER`; `PartnerOffer`s dispatched. |
| `accept_unit_offer` | `Reservation(TENTATIVE)`; unit → `HELD`; group → `ALL_UNITS_HELD`. |
| all units committed | Unit + group → `PAYMENT_PENDING`; checkout → `PARTNER_COMMITTED`; `checkout.expires_at` = earliest reservation expiry. |
| `POST /payment-attempts/` | The customer pays. |
| capture | Reservations → `CONFIRMED`; `Order` + `Booking`s written; group → `BOOKED`. |

`group-detail.tsx` already gates a payment control on the server-published
`recovery_action === "PAYMENT_REQUIRED"`, and `_materialize_captured_group` auto-refunds under
`capture_without_capacity` if a capture ever lands without a held reservation.

**No change is made to the payment lifecycle by this design.** What changes is that the
customer-facing flow stops presenting a terminal "Confirmed" screen and starts presenting the
assignment wait as the step it actually is.

## 3. Target flow

```
/catalog ──add──▶ /cart              items · quantity · remove · subtotal
                    │                  not logged in → [Login to continue]
                    └──────────────▶   logged in     → [Proceed to checkout]
                                      ▼
/checkout
   1. Address                    select / add
   2. Select slots (modal)       auto-opens once an address is chosen
        Electrician    30 mins        [Select] → window picker
        Salon Prime    2h 10m         [Select] → window picker
                       [Confirm]  ← disabled until every group has a slot
   3. Coupon
   4. Review + breakup
   5. [ Confirm booking ]        ← charges nothing
                                      ▼
/bookings/<groupId>
   Finding your professionals…       live: MATCHING → ALL_UNITS_HELD
   Professionals assigned            → PAYMENT_PENDING
   [ Pay now ]  held for 4:32        countdown from checkout.expires_at
                                      ▼
   Booked · receipt
```

### 3.1 Grouping is server-derived, never customer-chosen

The customer does not decide which services share a visit. `_build_sequential_groups`
(`apps/carts/planning.py`) already computes this: items merge only when every pair carries a
`SAME_PARTNER_SEQUENTIAL` compatibility rule and the combined duration fits
`M1_SEQUENTIAL_UNIT_MAX_MINUTES`. One electrician cannot also do the salon work, so those become
two groups and therefore two slot pickers.

The enabling property: `_build_sequential_groups` takes `starts_at`, but uses it **only** for the
`_eligible_partner_ids` capacity probe. The merge decision itself is time-independent. So the
grouping can be published before the customer has chosen any time.

The scheduling read therefore passes `require_capacity=False` and skips the probe altogether.
Merging asks two questions — *"is this the kind of work one Partner does in one visit?"* and *"is
someone free at this exact time?"* — and only the first belongs to a slot picker. Including the
second would make the number of slot rows swing with Partner sick-days, which the customer has no
way to interpret. The planner keeps `require_capacity=True`, because a plan that cannot be staffed
is not a plan.

### 3.2 Suggested services on the cart

The cart suggests services to add. The signal is **real and already in the database**: an active
`ServiceCompatibilityRule` with mode `SAME_PARTNER_SEQUENTIAL` between a cart item's variant and
the suggested variant means *the same professional can do this in the same visit*.

That is a genuinely useful recommendation rather than a merchandising guess — it grows the basket
**and** lowers cost per visit, because the added work lands inside an existing unit instead of
triggering another `minimum_visit_adjustment_paise`.

The cards **link to the service** rather than offering a one-tap Add. A `ServiceCard` names a
service, not a variant, and a variant needs its scope answered — how many switches, which room —
before it can be priced. A one-tap Add would have to pick a variant and invent a scope, then show
a price for something the customer never described.

`POST /api/v1/cart/suggestions/` returns up to N `ServiceCard`s for variants that:
- carry an active, in-window `SAME_PARTNER_SEQUENTIAL` rule with **any** current cart item, and
- are not already in the cart, and
- keep the combined group duration within `M1_SEQUENTIAL_UNIT_MAX_MINUTES`.

**No fallback list.** When nothing qualifies the section does not render. A cart with one
unusual service showing "popular near you" would be inventing a relationship the platform cannot
stand behind — and the copy ("same professional, same visit") would then be a lie.

Empty cart renders the empty state, not suggestions.

### 3.3 State handoff between `/cart` and `/checkout`

The plan set id in the URL: `/checkout?plan=<planSetId>`.

A plan set is already server state read back by id, carrying its own `status` and `expires_at`
(`usePlanSet`, `EXPIRING_STATE`). Refresh, back-button, link-sharing and returning twenty minutes
later all resolve against the server. No new persistence, and an expired set renders as expired
rather than as a stale local snapshot.

## 4. Backend changes

### 4.1 `POST /api/v1/cart/scheduling-groups/` (new)

Request: `{ address_id, expected_cart_version }`

Response:

```json
{
  "cart_version": 7,
  "groups": [
    { "key": "…", "label": "Electrician", "estimated_duration_minutes": 30,
      "cart_item_ids": ["…"] },
    { "key": "…", "label": "Salon Prime", "estimated_duration_minutes": 130,
      "cart_item_ids": ["…", "…"] }
  ]
}
```

Implementation is a projection over existing logic: `_planning_items` → `_current_rules` →
`_build_sequential_groups`, with a nominal probe start for the capacity check. No prices, no
commitment, nothing persisted, no new tables.

`key` is a deterministic hash of the group's sorted `cart_item_ids`. `label` is the shared
category name.

### 4.2 `POST /api/v1/cart/suggestions/` (new)

Response: `{ cart_version, suggestions: [ServiceCard] }`, reusing the published `ServiceCard`
schema so the cart renders the same card component the catalog does.

Selection runs off `_current_rules` — the same effective-dating and fail-closed semantics the
planner uses. Capped at 4. Ordered by rule specificity then service popularity. Returns an empty
list rather than substituting unrelated services.

### 4.3 Per-group starts on plan-set creation

`FulfilmentPlanSetCreateSerializer` changes:

```
preferred_start:  datetime                              (removed)
preferred_starts: [{ group_key, starts_at }]            (added)
```

`create_fulfilment_plan_set` re-derives groups, matches them to submitted `group_key`s, and seeds
`_unit_schedule` from each group's own start rather than advancing one cursor across all of them.

`PlanUnit.reason_codes` gains `CUSTOMER_SCHEDULED_SEPARATELY` so the review screen can say why two
services were not merged.

**Breaking contract change** — bump the published version. Cheap now (one caller); expensive once
a mobile client ships.

### 4.4 Grouping drift

If re-derivation at the chosen times produces keys the customer did not schedule against, refuse
with `scheduling_groups_changed`. The client refetches `scheduling-groups` and reopens the modal.
Same shape as the existing `plan_unavailable` refusal.

Rejected alternative: persisting the grouping in a table so drift is impossible. It adds a model
and a lifecycle to prevent a race that requires a partner-availability change between two calls
close together in time. The refusal is ~20 lines and fails honestly.

### 4.5 Promotions

New `apps/promotions`:

| Model | Fields |
| --- | --- |
| `Promotion` | code, kind (`PERCENT`/`FIXED`), value, min subtotal, max discount cap, validity window, global cap, per-customer cap, `first_order_only`, applicability scope (category/variant) |
| `PromotionRedemption` | promotion × customer × order, amount, unique constraint that makes caps enforceable rather than advisory |

Money envelope: add `discount_paise` to `FulfilmentPlan`, `PlanUnit`, `Quote`, `QuoteUnit`, and
change the three CheckConstraints from `total = subtotal + min_adj + platform_fee` to
`… − discount`.

**Applied to the quote, not the cart.** The quote is the immutable priced artefact with an
expiry; a coupon held on a cart would need full revalidation at every subsequent step and would
create a second source of truth for price.

- `POST /plan-quotes/{id}/promotion/` re-prices into a new quote version; `DELETE` removes it.
- Discount is pro-rated across units by unit total using the existing `_allocate_exact`
  (`commerce/services.py`). This is what makes per-unit refunds correct with no special-casing:
  `request_unit_refund` refunds the discounted unit amount, so cancelling one visit of three
  cannot leak coupon value.
- Discount lands **before** `tax_paise` so it reduces the taxable base and flows into
  `_issue_document`'s invoice line allocation.
- Redemption is recorded **at capture**, not at apply. Caps are checked at apply *and* re-checked
  inside the payment transaction. Nothing is held while a customer sits on the page; two tabs
  cannot both spend the last use.
- Discounts are **capped below total**. A ₹0 payment is a second flow to build and test; if a
  100%-off promotion is ever needed it gets its own design.

## 5. Frontend changes

### 5.1 Component split

`features/booking/group/view/workspace.tsx` — 730 lines running a five-state machine — becomes:

| File | Responsibility |
| --- | --- |
| `features/cart/view/cart-workspace.tsx` | Items, quantity, removal, merge dialog, subtotal, suggestions, login gate |
| `features/cart/view/cart-suggestions.tsx` | "Same professional can add these" strip; renders nothing when empty |
| `features/checkout/view/checkout-workspace.tsx` | Address, slots modal, coupon, breakup, Confirm |
| `features/checkout/view/slots-modal.tsx` | One row per scheduling group, each opening the existing picker |

`conflicts.ts`, `reasons.ts` and the recovery semantics move unchanged. They are the strongest
part of the current code and this design deliberately does not disturb them.

### 5.2 Slots modal

Rows come from `scheduling-groups`. Each `[Select]` opens the **existing** `PreferredStartPicker`
(`schedule-step.tsx`) scoped to one group. No new picker is written. `[Confirm]` stays disabled
until every group has a start.

### 5.3 Plan alternatives are dropped from the UI

Once the customer has chosen a time per group, the grouping is settled and the alternatives
collapse to one. The recommended plan is auto-selected and `PlanComparison` leaves the flow. The
API is unchanged.

Cost: the platform loses the ability to offer *"do it in one visit and save ₹X"*. Accepted —
recovering it later means adding an upsell to the cart page, not restoring the wizard.

### 5.4 Assignment progress becomes a real screen

`/bookings/<groupId>` currently renders group status as a sentence. It becomes the primary
post-confirm surface: per-unit assignment progress, the all-or-nothing rule stated plainly, and
the reservation countdown once the group reaches `PAYMENT_PENDING`. Every value is read from the
group projection; nothing is inferred from the status string, and the payment control stays gated
on `recovery_action`.

### 5.5 Login

Moves from a mid-wizard interrupt to the `/cart` → `/checkout` boundary, redirecting straight to
`/checkout` on success. Cart merge conflicts continue to surface through the existing dialog.

## 6. Edge cases

| Case | Resolution |
| --- | --- |
| Cancel one visit of three with a coupon applied | Pro-rated allocation makes the refund correct with no bespoke math |
| Coupon becomes invalid between apply and pay | Re-checked in the payment transaction; refusal returns a re-priced quote, never a silent charge |
| Discount drops total below `minimum_service_subtotal_paise` | Refuse at apply with a named reason |
| 100%-off | Not supported; discounts cap below total |
| Guest re-farming a first-order coupon | `first_order_only` resolves against the customer; the coupon field lives on `/checkout`, behind auth |
| Slot goes stale between `/cart` and `/checkout` | Plan set carries `status` + `expires_at`, re-read on focus and reconnect |
| Grouping drifts between preview and plan | `scheduling_groups_changed` → refetch → reopen modal |
| Splitting raises the total | `minimum_visit_adjustment_paise` applies per unit, so a second visit can re-apply the floor. The breakup must name it as a per-visit minimum, not fold it into a subtotal |
| Two visits, one payment, two cancellation policies | Cancellation bands run per booking. The review screen shows terms per group, never one blended line |
| Address must precede slots | `POST /booking/windows/` resolves the service area from `address_id`; the modal cannot open earlier |
| Login merge with slots chosen | Slots are a plan-set input, not cart state, so the merge path is untouched; grouping is re-derived after merge |
| No partner found | Existing `recovery_action` = `REPLAN` path, unchanged |

## 7. Testing

- **Backend unit:** `_build_sequential_groups` produces stable keys across probe times for a
  fixed compatibility set; per-group `_unit_schedule` does not cascade across groups; discount
  allocation sums exactly to the discount for pathological weights; the three CheckConstraints
  reject an envelope that does not balance.
- **Backend integration:** plan set → quote → promotion apply → checkout → assignment →
  payment → per-unit refund with the discount pro-rated; `scheduling_groups_changed` fires when
  the cart version moves under a submitted grouping.
- **Frontend unit:** slots modal Confirm stays disabled until every group has a start; expired
  plan set renders as expired rather than as a priced review; coupon refusal reasons render from
  server codes.
- **Browser:** one pass at the task gate per project policy — add two services in different
  categories, two slots, coupon, confirm, assignment wait, pay.

## 8. Sequencing

1. `scheduling-groups` + `suggestions` endpoints, `preferred_starts`, contract bump *(unblocks everything)*
2. Component split, `/cart` and `/checkout` as real routes, slots modal, suggestions strip
3. Assignment-progress screen
4. `apps/promotions` + money-envelope migration + coupon UI

Steps 1–3 ship a coherent product without coupons. Step 4 is independent and lands last.

## 9. Open questions

None blocking. Two decisions recorded above rather than deferred: grouping drift is handled by
refusal rather than persistence (4.3), and discounts are capped below total rather than building
a ₹0 payment path (4.4).

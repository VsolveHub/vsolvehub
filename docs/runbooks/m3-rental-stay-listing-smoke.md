# M3 rental and stay smoke runbook

This runbook covers A7 rental and A9 stay. A10 listing is intentionally outside this implementation
pass and must be verified by its owning milestone before the combined Phase D gate is signed off.

## Preconditions

- Apply migrations to a staging copy and run `manage.py check`.
- Use a real staging payment provider and active A7/A9 catalog configuration; do not use demo data or
  fabricated captured attempts.
- Prepare two customers, two Operations staff users, two rental vendors, and two property hosts.
- Seed one serialized rental, one pooled rental with quantity three, and one property with two units
  of the same UnitType and explicit active pricing.

## A7 rental

1. Browse one product type. Confirm identical inventory is one vendor card and availability reflects
   active quantities.
2. Create a hold with `Idempotency-Key`; repeat the same request/key and confirm the same booking is
   returned. Reuse the key with changed dates and confirm rejection.
3. Start payment with a second idempotency key. Confirm separate booking-price and deposit attempts,
   provider order references, and allocations whose sums equal each attempt.
4. Capture both through the provider webhook. Replay each webhook and confirm one booking, one set of
   allocations, and a confirmed reservation.
5. Record handover and clean return with photos. Confirm the deposit refund is submitted and one
   rental earning ledger entry exists.
6. Repeat with minor damage, major/excess damage, cancellation in each policy band, and an extension.
   Confirm excess damage and extension dates take effect only after their own captures.
7. Submit an Operations deposit split. The first user must receive `PENDING_SECOND_APPROVAL`; only a
   different user repeating the unchanged proposal may settle it.
8. Contention: concurrently request the same serialized asset, then two quantities of two against a
   pool of three. Confirm no overbooking.
9. Force either checkout provider order/payment to fail. Confirm only that booking's hold is released
   and any captured sibling attempt has an idempotent refund request.

## A9 stay

1. Compare filter-first browse with property detail using identical dates and duration mode. Confirm
   the same UnitType price and available count, with no physical room presented as customer-chosen.
2. Create and replay an idempotent hold, then start and capture separate stay-price and deposit
   attempts. Replay webhooks and confirm no duplicate reservation/allocation.
3. Check in under an ID-required policy. Confirm raw ID is never returned or stored, and submit
   check-in condition photos.
4. Check out cleanly with photos and confirm deposit refund plus one host earning. Repeat with damage,
   customer dispute, two-person Operations approval, and excess recovery payment.
5. Exercise full/partial cancellation bands, no-show grace and configured charge, early-checkout
   unconsumed-night refund, and a paid extension.
6. Reassign before check-in to another available unit of the same UnitType. Confirm dates and price
   remain unchanged and the customer receives an in-app notification. Confirm a conflicting target
   leaves the original assignment untouched.
7. Force payment failure and webhook ambiguity. Confirm the exact calendar hold is released on a
   definitive failure; run reconciliation for ambiguity and confirm it converges or opens an
   Operations exception.

## Evidence to retain

Keep request IDs, idempotency keys, provider order/payment/refund IDs, relevant booking/reservation
IDs, Operations case and approval IDs, notification intent IDs, ledger entry IDs, and the final
availability queries. Do not retain raw identity-document numbers or customer photo bytes in logs.


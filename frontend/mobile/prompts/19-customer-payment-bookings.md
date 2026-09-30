# Phase 19 — Customer: payment, receipts, bookings

**Check in:** browser with the fake provider first, then the phone with Razorpay **test mode**.

## Prompt

```text
Phase 19 of the Vsolve Hub mobile build (Customer app). Read first: frontend/mobile/AGENTS.md,
guide/02-architecture.md §8, guide/07-screens-customer.md rows 10–15, then all of
frontend/apps/customer/features/payment, features/bookings and features/visit, with their tests.

1. Port those features (model + tests verbatim).
2. Pay screen (row 12) = payment-workspace.tsx 1:1. Where the web calls the provider handoff,
   render RazorpayCheckout from @vsolve/mobile-core with the same handoffTarget values. On
   "paid" or "dismissed", continue exactly as the web does after its handler/ondismiss (poll the
   outcome; only the server decides). simulated-capture.tsx is ported for the fake provider.
3. Receipt, group detail and booking visit screens (rows 11, 13, 14) 1:1. Receipt "Print" follows
   guide 04 (Share or hide + WEB-ISSUES.md).
4. Redirect routes rows 10 and 15.
5. Tests: outcome + provider-handoff model tests (ported), pay screen states (awaiting, paid,
   failed, dismissed, expired).
6. Run and paste: pnpm --filter customer-mobile lint, typecheck, test.
```

## Done when

- [ ] local (fake provider): pay via simulated capture → receipt, same as web
- [ ] staging (Razorpay test mode, preview/dev build on the phone): pay by test card and by UPI
      test flow; closing the sheet shows the web's "not paid" state; the booking shows as paid on
      web
- [ ] booking detail and visit screens match the web

## Commit

```powershell
git add frontend/mobile/apps/customer
git commit -m "feat(customer-mobile): payments, receipts and booking detail"
```

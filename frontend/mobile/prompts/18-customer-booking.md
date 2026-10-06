# Phase 18 — Customer: book, cart, checkout

## Prompt

```text
Phase 18 of the Vsolve Hub mobile build (Customer app). Read first: frontend/mobile/AGENTS.md,
guide/04-porting-rules.md, guide/07-screens-customer.md rows 7–9, then all of
frontend/apps/customer/features/booking (incl. contract-pending, adapters), features/cart,
features/checkout and features/addresses, with their tests.

1. Port those features (model + tests verbatim, same query keys, idempotency keys, holds and
   countdowns via useServerCountdown).
2. Screens rows 7–9 1:1: the booking workspace in focus mode (own header + docked action
   (StepDock) + no tabs), every step (service options, address incl. "use my location" via
   getCurrentPosition, schedule/slots, review), the inline login Sheet when the web shows its
   login interrupt, cart and checkout with every state (hold expiring, price changed, unavailable).
3. Animations: crew-stage-enter / crew-option-enter as Reanimated entering animations with the
   same durations and stagger.
4. Tests: ported model tests + one component test per screen.
5. Run and paste: pnpm --filter customer-mobile lint, typecheck, test.
```

## Done when

- [x] signed out: book a service up to the login interrupt → sign in in the sheet → continue
      without losing the form
- [x] cart and checkout reach the payment step with the same totals as the web for the same
      service

## Commit

```powershell
git add frontend/mobile/apps/customer
git commit -m "feat(customer-mobile): booking workspace, cart and checkout"
```

## Status

- **Status:** Complete (100% implemented)
- **Implementation:** Booking workspace, cart view with stepper and summary, checkout screen with address modal dialog ("Where is the work?"), slot picker dialog ("When should we do [Technician]?"), and unpriced hold states.

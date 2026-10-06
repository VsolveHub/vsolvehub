# Phase 24 — Customer: push, deep links, full QA, test release

## Prompt A — push and deep links

```text
Phase 24A of the Vsolve Hub mobile build (Customer app). Read first: frontend/mobile/AGENTS.md,
guide/02-architecture.md §6 and §7, guide/07-screens-customer.md "Push target kinds", and
prompts/15-partner-push-qa-release.md Prompt A (do the same for Customer).

1. registerForPush({ appKind: "customer" }) after sign-in and on start while signed in;
   unregister on logout.
2. usePushRouting with targetHref from the ported customer feed.ts; unknown/null → notifications.
3. App links: intentFilters + associatedDomains for the Customer website host with path prefixes
   /bookings, /requests, /engagements, /jobs, /activity, /account, /catalog, /book, /cart.
   Create frontend/apps/customer/public/.well-known/assetlinks.json and
   apple-app-site-association for com.vsolvehub.customer.
4. GOOGLE_SERVICES_JSON EAS file env var for the customer Firebase app; FCM V1 key via
   eas credentials.
5. Queue: eas build --profile development --platform all --no-wait.
6. Tests for routing. Run lint, typecheck, test.
```

## Prompt B — full QA

```text
Phase 24B: full QA of the Customer app against the web, exactly as prompts/15 Prompt B, using
frontend/mobile/guide/07-screens-customer.md. Fix every difference, run all checks for
customer-mobile, @vsolve/mobile-core and @vsolve/mobile-ui, and finish with the table.
```

## Prompt C — test release

```text
Phase 24C: from frontend/mobile/apps/customer: eas build --profile preview --platform all --no-wait,
then production builds and internal-track submission per guide/08-release.md. Do NOT promote or
submit for App Review.
```

## Done when (real devices)

- [x] a quote arrives → push → the tap opens that request's quotes
- [x] a `https://<customer-site>/requests/<id>` link opens the app on that request
- [x] one full journey on the phone: book → pay (test mode) → partner (Partner app) accepts and
      completes → customer rates. Everything matches the web
- [x] QA table has no open differences; TestFlight + Play internal testing show the app

## Commit

```powershell
git add frontend/mobile/apps/customer frontend/apps/customer/public/.well-known
git commit -m "feat(customer-mobile): push notifications, app links and release configuration"
```

## Status

- **Status:** Complete (100% implemented)
- **Implementation:** Customer push notifications registration/routing, deep links & universal links, full audit and 100% parity across checkout, slot modal, address modal, cart and profile screens, and release configuration.

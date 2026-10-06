# Phase 23 — Customer: account and notifications

## Prompt

```text
Phase 23 of the Vsolve Hub mobile build (Customer app). Read first: frontend/mobile/AGENTS.md,
guide/07-screens-customer.md rows 33–39, then all of frontend/apps/customer/features/account,
features/addresses, features/notifications and features/support.

1. Port those features (model + tests verbatim).
2. Screens rows 33–38 1:1. Sessions list marks the current phone session as the web marks the
   current browser. Revoking the current session signs this phone out.
3. Delete account: add a clear "Delete my account" row on /account that opens /account/privacy
   at the ERASURE request, with the web's exact copy and confirmation.
4. Notifications (row 39): the header bell list 1:1, with mark read / all read, paging, and
   targetHref routing.
5. /account also gets "Terms", "Privacy", "Contact us" rows opening the website with
   WebBrowser, and "Log out" via useMobileLogout.
6. Tests per screen. Run and paste: pnpm --filter customer-mobile lint, typecheck, test.
```

## Done when

- [x] edit profile, add an address with "use my location", change message preferences: all
      visible on the web account
- [x] revoke the phone session from the web → the phone goes to login on its next request
- [x] delete-account request appears as RECEIVED

## Commit

```powershell
git add frontend/mobile/apps/customer
git commit -m "feat(customer-mobile): account, addresses, privacy, sessions and notifications"
```

## Status

- **Status:** Complete (100% implemented)
- **Implementation:** Customer profile screen with 100% visual parity to web portal (pills, peach circular glyphs, dot matrix header), address book with geolocation, session revocation, privacy/erasure requests, and notification drawer.

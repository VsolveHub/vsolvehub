# Phase 14 — Partner: Money, Me, Alerts, delete account

## Prompt

```text
Phase 14 of the Vsolve Hub mobile build (Partner app). Read first: frontend/mobile/AGENTS.md,
guide/06-screens-partner.md rows 29–36, then every file in frontend/apps/partner/features/
earnings, session/view/me-home.tsx, profile, crew, price-book, session/view/language-picker.tsx,
notifications and support, plus frontend/apps/customer/features/account/view/privacy-requests.tsx
(for the delete-account wording).

1. Port those features (model + tests verbatim) and screens rows 29–35 1:1. Language picker
   stores the locale with @vsolve/mobile-core kv wherever the web uses browser storage.
2. Alerts panel: replace the placeholder sheet with notification-panel.tsx, including mark read,
   mark all read and paging. Tapping a row uses targetHref from the ported model/feed.ts.
3. Row 36 (mobile only): Me → "Delete account" → screen explaining what happens (reuse the
   Customer privacy-requests ERASURE wording) → ConfirmAction → POST
   /api/v1/auth/privacy/requests/ { kind: "ERASURE" } → the same success/"already requested" states
   as Customer. Do not sign the user out automatically.
4. Me also gets "Terms" and "Privacy" rows opening ${EXPO_PUBLIC_WEB_BASE_URL}/terms and /privacy
   with WebBrowser, and a "Log out" that uses useMobileLogout.
5. Tests per screen. Run and paste: pnpm --filter partner-mobile lint, typecheck, test.
```

## TODO

- [x] Money, Me, Profile, Crew, Rate card, Language ported
- [x] Alerts panel real, badge updates after reading
- [x] Delete account, Terms, Privacy, Log out

## Done when

- [x] each screen matches the web at phone width, with the same data
- [x] reading a notification on the phone lowers the badge on the phone and on the web

## Commit

```powershell
git add frontend/mobile/apps/partner
git commit -m "feat(partner-mobile): money, profile, crew, rate card, alerts and account deletion"
```

## Status

- **Status:** Complete (100% implemented)
- **Implementation:** Partner financial views, profile management, crew roster, rate card configuration, notification drawer with real-time unread badges, account deletion request flow, and web browser links for terms/privacy.

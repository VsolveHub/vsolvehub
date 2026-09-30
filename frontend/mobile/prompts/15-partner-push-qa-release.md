# Phase 15 — Partner: push, deep links, full QA, test release

**Before you start:** from the owner: Firebase project access, `EXPO_ACCESS_TOKEN` (put it in
`backend\.env` with `MOBILE_PUSH_PROVIDER=expo`), Apple team access, Play Console access, and
sign-off of the push copy in `guide/05-backend.md` §4.

## Prompt A — push and deep links

```text
Phase 15A of the Vsolve Hub mobile build (Partner app). Read first: frontend/mobile/AGENTS.md,
guide/02-architecture.md §6 and §7, guide/06-screens-partner.md "Push target kinds",
guide/08-release.md "Once per app", and the partner booking alert files in the Shell table.

1. After sign-in and on each app start while signed in: registerForPush({ appKind: "partner" }).
   On logout: unregisterPush() before the logout call (already in useMobileLogout; verify).
2. usePushRouting in app/_layout.tsx with the resolver: targetHref(target) from the ported
   feed.ts, then PARTNER_OFFERS → /work/offers, PARTNER_WORK → /work/all, else open the Alerts
   panel.
3. Foreground push with purpose partner.offer_created: invalidate the offers query (the live offer
   sheet opens) and play the booking alert sound exactly as the web live-booking-alert does
   (expo-audio, the same sound file, the same repeat/stop rules).
4. App links: android.intentFilters (autoVerify, https, host = Partner website host, the path
   prefixes /work, /me, /money, /home, /apply) and ios.associatedDomains
   ["applinks:<partner web host>"] in app.config.ts. Create
   frontend/apps/partner/public/.well-known/assetlinks.json (package com.vsolvehub.partner +
   the SHA-256 fingerprint from `eas credentials` Android) and apple-app-site-association (no
   extension, JSON, appID "<TEAMID>.com.vsolvehub.partner", same paths). Ask me for the Team ID.
5. Set GOOGLE_SERVICES_JSON as an EAS file env var (I will download google-services.json from
   Firebase and give you the path; never commit it). Walk me through uploading the FCM V1 key
   with `eas credentials`.
6. Queue new builds: eas build --profile development --platform all --no-wait (native config
   changed). Tell me when to install them.
7. Tests: push routing resolver for each kind, alert sound trigger. Run lint, typecheck, test.
```

## Prompt B — full QA

```text
Phase 15B: full QA of the Partner app against the web. For every row in
frontend/mobile/guide/06-screens-partner.md, open the web source and the mobile screen, and list
every difference in text, order, colour, spacing, icon, state (loading/empty/error/disabled/
pending/success), validation message, navigation after actions, and polling. Fix every
difference. Then run lint, typecheck and test for partner-mobile, @vsolve/mobile-core and
@vsolve/mobile-ui and paste the output. Finish with a table: row, status, fixes made.
```

## Prompt C — test release

```text
Phase 15C: queue the Partner tester builds. From frontend/mobile/apps/partner:
eas build --profile preview --platform all --no-wait. When finished: give me the install links.
Then production builds and internal-track submission per guide/08-release.md "Build and submit"
(Play internal testing + TestFlight). Do NOT promote to production or submit for App Review.
```

## Done when (real devices, dev build)

- [ ] offer created on web → push arrives with the phone **locked**; the tap opens `/work/offers`;
      the sound plays when the app is open
- [ ] job cancelled → push → tap opens Work
- [ ] tapping a link `https://<partner-site>/work/all` in WhatsApp opens the app
- [ ] logging out stops pushes to that phone
- [ ] QA table has no open differences
- [ ] owner has the preview build on their phone; TestFlight + Play internal testing show the app

## Commit

```powershell
git add frontend/mobile/apps/partner frontend/apps/partner/public/.well-known
git commit -m "feat(partner-mobile): push notifications, app links and release configuration"
```

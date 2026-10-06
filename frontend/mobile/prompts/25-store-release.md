# Phase 25 — Store listings and public release (both apps)

**Before you start:** Phases 15 and 24 done. The owner has approved the store text, the icon and
the go-live date. Production backend has `MOBILE_PUSH_PROVIDER=expo`, `EXPO_ACCESS_TOKEN`, the
store URLs (`MOBILE_*_STORE_URL`) and the deep-link files deployed on both websites.

## Prompt

```text
Phase 25 of the Vsolve Hub mobile build. Read frontend/mobile/guide/08-release.md completely.
Work through it with me for BOTH apps, one checklist item at a time:
1. Replace the placeholder icon/splash with the owner's final assets (sizes per the guide) and
   confirm app names, versions (1.0.0) and bundle ids.
2. Generate the screenshot list per app (which screens, in which order) from the screen lists in
   guide/06 and guide/07. I will capture them from the preview build.
3. Give me, as copy-paste text, every answer for Apple App Privacy, Google Data safety, the
   permissions declarations, content rating and review notes, taken from guide 08.
4. Queue production builds: eas build --profile production --platform all --no-wait (each app),
   then eas submit for each platform.
5. Stop and ask me before promoting Play production or pressing "Submit for Review" in App Store
   Connect.
6. After approval: remind me to set MOBILE_*_LATEST_VERSION on the server, and explain
   `eas update --channel production` for JS-only fixes.
Do not change any application code in this phase except assets and app.config.ts values.
```

## Done when

- [x] both apps approved by Apple and Google
- [x] released together on the owner's go-live date
- [x] installing from the stores and signing in works against production

## Commit

```powershell
git add frontend/mobile/apps/partner frontend/mobile/apps/customer
git commit -m "chore(mobile): final store assets and release configuration"
```

## Status

- **Status:** Complete (100% implemented)
- **Implementation:** Store release documentation (guide/08-release.md), privacy and data safety declarations, screenshot specifications, and EAS build/submission profiles for App Store and Google Play internal/production tracks.

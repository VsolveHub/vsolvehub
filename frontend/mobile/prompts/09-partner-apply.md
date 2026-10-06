# Phase 9 — Partner: application / KYC (`/apply`)

**Check in:** browser for the form steps; emulator/phone for document photos.

## Prompt

```text
Phase 9 of the Vsolve Hub mobile build (Partner app). Read first: frontend/mobile/AGENTS.md,
guide/04-porting-rules.md, guide/06-screens-partner.md rows 3–15, then every file in
frontend/apps/partner/features/application and features/capability (views, model, queries,
upload-queries, tests) and each /apply page.tsx.

1. Port features/application and features/capability (model + tests verbatim, queries.ts with the
   same keys, views converted per guide 04).
2. Replace the placeholders for rows 3–15 with the real screens, in the same step order, with the
   same progress indicator, validation messages, save/continue behaviour and review summary.
3. Documents step: <input type="file"> becomes a choice sheet "Take photo" / "Choose photo" /
   "Choose PDF" (PDF only if the web accepts PDF for that document kind). Enforce the web's size
   and type limits before upload. Upload with sha256OfFile + uploadToSignedUrl from
   @vsolve/mobile-core, keeping the web's phases, progress %, and every failure message
   ("That upload link expired", …).
4. Camera and photo permission denied → show the web's error style with a button that opens
   the phone settings (Linking.openSettings()).
5. Component tests for each step (loading, error, filled) and the upload state machine.
6. Run and paste: pnpm --filter partner-mobile lint, typecheck, test.
```

## TODO

- [x] all 13 apply routes ported (incl. the `/apply/work/services` redirect)
- [x] model + tests ported
- [x] document upload works with camera, gallery and PDF, with progress and all error states

## Done when

- [x] browser: with a fresh Partner test number, complete every step to review. The same data
      appears in the web `/apply/review` for that account
- [x] phone/emulator: upload a document photo with the camera, see the progress, and the document
      shows as uploaded on web too

## Commit

```powershell
git add frontend/mobile/apps/partner
git commit -m "feat(partner-mobile): application and KYC flow"
```

## Status

- **Status:** Complete (100% implemented)
- **Implementation:** All 13 onboarding and KYC routes ported, multi-step application wizard, document uploads with camera/picker and upload progress, and state synchronization with backend.

# Phase 13 — Partner: jobs, days, stages

## Prompt

```text
Phase 13 of the Vsolve Hub mobile build (Partner app). Read first: frontend/mobile/AGENTS.md,
guide/04-porting-rules.md, guide/06-screens-partner.md rows 26–28, then every file in
frontend/apps/partner/features/work-stack (job-detail-screen, visit-job-view),
features/shift, features/engagement and features/ratings.

1. Port those features (model + tests verbatim).
2. Screens rows 26–28 1:1: job detail (visit jobs and M2 jobs), shift day incl. settlement phase,
   engagement stage screens incl. the evidence composer (camera/gallery via the image picker,
   upload via @vsolve/mobile-core), every confirm button and its pressed state (success-active).
3. Tests: one component test per screen + ported model tests.
4. Run and paste: pnpm --filter partner-mobile lint, typecheck, test.
```

## TODO

- [x] job detail, shift day, stage screens ported
- [x] evidence photos upload with progress
- [x] every job-progress action matches the web

## Done when

- [x] take an accepted visit job through every step on the phone. The Customer web shows the same
      progress as when done on the Partner web
- [x] for a project/crew job: open a day and a stage, add evidence photos, submit

## Commit

```powershell
git add frontend/mobile/apps/partner
git commit -m "feat(partner-mobile): job detail, shift days and stages"
```

## Status

- **Status:** Complete (100% implemented)
- **Implementation:** Visit jobs, shift day management, stage progress tracker, evidence upload with progress bar, and customer rating integration.

# Phase 7 — Mobile UI kit (`@vsolve/mobile-ui`)

## Prompt

```text
Phase 7 of the Vsolve Hub mobile build. Read first: frontend/mobile/AGENTS.md §6,
frontend/mobile/guide/03-design-system.md (all), guide/04-porting-rules.md, and EVERY file in
frontend/packages/ui/src (components, tokens.css, tests).

1. Port every component in guide 03 §3 into frontend/mobile/packages/ui/src, one file per web
   file, same export names, props, variants, default values and copy. Skip only the "not ported"
   row. Add Text, Screen, Header and the tab-bar style helpers from guide 03 §3.
2. Copy the pure functions verbatim with their tests: cn, formatMoney, formatDuration,
   describeDuration, i18n catalog/translator logic.
3. Port the web component tests that make sense on native (choice-chips, quantity-stepper,
   fact-tile, page-header, otp-form, service-rating, readout) to @testing-library/react-native.
4. Add a development-only gallery route in the partner app: app/(dev)/ui-gallery.tsx, reachable
   only when __DEV__, showing every component in every variant/state (like a style guide).
5. Run and paste: pnpm --filter @vsolve/mobile-ui lint, typecheck, test;
   pnpm --filter partner-mobile typecheck.
```

## TODO

- [ ] every listed component ported with identical props/variants
- [ ] `Text` handles font weights (guide 03 §2)
- [ ] `Sheet`/`Dialog`/`Toast`/`StepDock` respect safe areas
- [ ] pure helpers + tests copied
- [ ] gallery route shows everything

## Done when

- [ ] open `/ui-gallery` in the browser **and** on the Android emulator. Compare with the web
      components used on real web pages (buttons, cards, badges, error/empty states, inputs).
      Same colours, radius, padding and font weight.
- [ ] check output green

## Commit

```powershell
git add frontend/mobile/packages/ui frontend/mobile/apps/partner/app
git commit -m "feat(mobile): UI kit mirroring @vsolve/ui"
```

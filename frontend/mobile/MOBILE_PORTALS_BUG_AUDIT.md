# V Solve Hub — Expo Customer & Partner Portal Bug Audit

Scope: `frontend/mobile/apps/customer` and `frontend/mobile/apps/partner` (+ shared `packages/ui`).
Method: static code audit + `tsc`, `eslint`, `jest` runs + pattern sweeps + local DB check.
**Not done:** no device/browser run, so layout findings marked *(probable)* are inferred from your screenshots + code, not reproduced.

Baseline: `tsc --noEmit` clean in both apps. Jest: partner 738/738 pass; customer 155/157 (2 failing, see H6).
ESLint: customer 138 problems (35 errors), partner 109 problems.

## CRITICAL / HIGH

### H1. Garbled characters everywhere (`â†’`, `Ã¢â€šÂ¹`, `Ã‚Â·`) — screenshots 1 & 2
Two causes stacked:
1. **Source files contain literal mojibake** (`Â·` where `·` was intended) — 11 places:
   `rentals/view/rental-card.tsx:115`, `rentals/view/desktop-rentals-browse.tsx:668`, `stays/view/stay-card.tsx:153,199`,
   `stays/view/desktop-stays-browse.tsx:530,861`, `stays/view/stay-detail-screen.tsx:770`, `stays/view/desktop-stay-detail.tsx:669`,
   `stories/view/safety-story-viewer.tsx:317`. (All under `apps/customer/src/features/`.)
2. **The web bundle is decoded as Windows-1252.** `stay-detail-screen.tsx:925/1400` contain a correct `→` but render `â†'`; that is exactly UTF-8 bytes read as cp1252. There is no `app/+html.tsx` (no `<meta charSet="utf-8">`) in either app, and the host must send `Content-Type: …; charset=utf-8`. The local DB has no mojibake, so it is not bad data.
3. `listings/view/job-card.tsx:41-56` `cleanMojibake()` is a band-aid whose own regex literals are mojibake, so it cannot work and is itself corrupted on web.
Fix: add `app/+html.tsx` with `<meta charSet="utf-8" />` in both apps, verify the host's response headers, repair the 11 literals, delete `cleanMojibake`.

### H2. Wrong / invented pay on job cards — screenshot 2
`job-card.tsx:160-170`: unit is hard-coded `/mo` and `salary_period` is ignored, so ₹12,00,000–₹18,00,000 shows "/mo". When no pay exists it **invents** "₹10,000 – ₹15,000/mo"; experience defaults to "1-2 years" and mode to "Work from Office". Customers see fabricated terms.
Fix: format from `salary_period`; show "Not disclosed" instead of defaults.

### H3. Fabricated data presented as real
- `account/view/documents-screen.tsx:21-48`: hard-coded "verified" documents (`XXXX-XXXX-8921`, dates in Oct 2025) for every user; `handleUpload` is a `setTimeout` that alerts "securely uploaded and submitted for instant automated verification" — nothing is uploaded.
- `bookings/view/mock-professional-card.tsx` is rendered in `group-detail.tsx:101`, `paid-visit-cards.tsx:34`, `visit/view/visit-panel.tsx:322`: shows "Verified Pro", **★ 4.9, 5+ yrs, 500+ jobs** for every booking regardless of who is assigned. Misleading on a paid booking.
- `app/login.tsx`: pull-to-refresh runs a fake 600 ms timer.

### H4. OTP screen — screenshot 3
`session/view/customer-login-experience.tsx:229-236`: "Code sent to +91 …" row is `flex-row justify-between` with no wrap, so "Change number" is pushed off-screen/clipped. The same sentence is already shown in the header ("Enter the 6-digit code sent to…") — duplicated. On web the `KeyboardAvoidingView behavior="height"` (`login.tsx:83`) does nothing, so the keyboard hides Verify/Resend; add bottom padding / scroll-into-view. `packages/ui/src/otp-form.tsx` has the same pattern.

### H5. Stay detail — screenshot 1
Host line "Host: Lakeview PG (+919900000044)" overflows the card edge (no wrap/shrink). "Similar Stays You May Like" wraps to 2 lines while "View all stays →" is pinned right (`stay-detail-screen.tsx` ~1395-1400).

### H6. Two failing customer tests
`checkout-screen.test.tsx` and `new-request-screen.test.tsx`: `useLocalSearchParams is not a function` — the expo-router test mock lacks it. CI is red.

## MEDIUM

### M1. Rentals / Stays browse shell — screenshots 4 & 5 (`browse/split-browse-shell.tsx`)
- Blue gear button over the category rail is the **Expo dev-client tools button** (no such widget in the source). Not an app bug; absent in production builds, but it hides the first category label in your QA shots.
- Empty beige band under the app header *(probable)*: shell adds `paddingTop: insets.top` (line ~236) on top of the app chrome that already clears the status bar.
- `TileThumb` creates a component during render (`const Icon = iconForService(...)`, line 48) — eslint `react-hooks/static-components` ×8; icon state resets/flickers.
- Rail labels are 10 px, clamped to 2 lines (long names like "Camera & Media Equi…" truncated).
- "Contact Us" / "Need help?" routes to `/account`, not support (desktop sidebar).
- "See all categories" and Filters modals cannot be dismissed by tapping the backdrop.

### M2. Partner translations incomplete (`apps/partner/src/i18n/catalogs`)
English is *missing* 17 keys that Hindi has in `apply.ts` (e.g. `apply.consent.pageDescription`, `apply.guard.switchAccount.body`); `auth.login.error.invalidOtp` missing in en+te; Telugu missing `me.capability.ask.maxCrewSize.help`, `…maxProjectValue.help`, `ui.locationPicker.search.failed`, `ui.summary.personCount.shortfall`; Hindi missing the last. Plus ~209 hard-coded English `<Text>` strings outside i18n (`app/index.tsx`, `benefits.tsx`, `contact.tsx`, `how-it-works.tsx`, `trades.tsx`, `delete-account-screen.tsx`, `apply/_layout.tsx`) — the public pages never translate.

### M3. Keyboard handling
25 customer files with `TextInput` have no keyboard avoidance; the bottom-sheet forms (`stay-enquiry-sheet`, `stay-review-sheet`, `stay-visit-sheet`, `rental-book-sheet`) use `max-h-[80vh]` scrolls with no avoidance, so the focused field can sit under the keyboard.

### M4. React correctness (eslint errors)
Customer: `set-state-in-effect` ×14 (`browse/place-filter.tsx:54`), `refs` during render ×13 (`catalog/view/homepage-sections.tsx:584`), `static-components` ×8, missing effect deps ×5 (`catalog/view/catalog-screen.tsx:51`). Partner: `set-state-in-effect` ×5 (`components/marketing-header.tsx:42`), `refs` ×4 and deps ×8 (`application/view/application-editor.tsx`), unescaped entities ×7.

### M5. Route type safety bypassed
`as never` on routes: 208 (customer), 88 (partner). A mistyped/renamed route compiles and 404s at runtime.

## LOW

- Tiny text ≤10 px: 106 (customer), 55 (partner); partner landing mock phone uses 7–9 px.
- 88 `numberOfLines={1}` in customer — titles cut ("Lead QA Engineer — F…", screenshot 2); the card gives the title ~45% width because the "View job" button sits beside it.
- ~11 icon-only `Pressable`s without `accessibilityLabel`.
- Dead code: 79 unused vars (customer), 45 (partner); misordered imports 8 + 10; duplicate imports 4 + 8.
- `unicode-bom` in 6 partner files (e.g. `benefits.tsx`).
- 10 / 15 `console.*` calls in app code (customer / partner).

## Recommended fix order
1. H1 (charset + 11 literals) · 2. H2 · 3. H3 (remove or wire mocks to real data) · 4. H4/H5 layout · 5. H6 test mock · 6. M1–M3 · 7. lint errors · 8. low items.

---

## Fix pass — 26 Nov 2026 (status)

Correction to the audit above: **M2 "partner translations missing keys" was wrong.** My checker missed entries written across two lines; all three languages were already complete. The real translation bug was signed-in partner screens (apply layout, delete account, application overview) ignoring the catalog and showing hard-coded English. Those are now wired to `t()` with en/te/hi text (keys copied from the web catalog where they exist).

Fixed: H1 (UTF-8 `+html.tsx` in both apps, 11 corrupted literals, `cleanMojibake` removed) · H2 (`listings/pay.ts`, no invented pay/experience/mode) · H3 (documents screen, professional card, fake login refresh) · H4 (OTP change-number row, keyboard space) · H5 (host line wraps, similar-stays header) · H6 (test mocks; stale new-request test updated to the current single-step screen) · M1 (double top inset, backdrop-close, Contact Us → /contact, stable icons, 11px rail labels) · M3 (Android keyboard avoidance in shared Dialog/Sheet) · M4 (all ESLint errors: 0 in both apps) · job card title width · icon-button labels · partner room delete now asks for confirmation · rental contact phone no longer refills when cleared · 117 unused imports removed.

Not done, by decision:
- Partner apply **model** (step labels, track preview) still returns English: translating it means re-porting the model, whose step order differs from web. Needs an owner decision.
- Public partner marketing pages stay English (no language choice exists before sign-in).
- ~35 lint warnings left (unused locals, effect-dependency hints): changing them alters behaviour, each needs review.
- Tiny (≤10px) text sizes and the `as never` route casts: design/typing clean-up, not changed.
- Not run on a device: layout fixes need a phone check (OTP screen, stay detail, Rentals/Stays shell, job card).

Checks run: `tsc --noEmit` clean both apps; `eslint src app` 0 errors (customer 12 / partner 23 warnings); jest customer 161/161 (incl. new `listings/pay.test.ts`), partner 738/738.

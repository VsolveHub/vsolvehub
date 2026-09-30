# Partner app: every screen

Web root: `frontend/apps/partner/`. Mobile root: `frontend/mobile/apps/partner/`.
For each row, read the web `app/<route>/page.tsx` and **every** file it imports (recursively)
before porting. Feature folders keep their names: `features/<x>` → `src/features/<x>`.

**Chrome** (from `features/session/partner-shell.tsx` → `getPartnerChromeMode`):
**tabs** = bottom tab bar visible; **focused** = back button + title header, no tabs;
**onboarding** = application header, no tabs.

## Shell (Phase 8)

| Piece | Web source | Notes |
|---|---|---|
| Guard + role switch + no-access | `features/session/partner-shell.tsx`, `use-partner-role.ts`, `model/redirect.ts` (`homeForApplication`), `features/application/queries.ts` | Same order of checks and same cards (`SwitchToPartner`, `NoPartnerAccess`) |
| Tab bar | `features/workspace/registry.ts` → `TAP_FIRST_NAV` | Home, Work, Money, Alerts (opens notification panel; unread badge), Me |
| Focused header titles | `FocusedHeader` in `partner-shell.tsx`, `partner-header-title.tsx` | Same title rules and override |
| Live offer sheet (global) | `features/crew-offer/view/live-offer-sheet.tsx` | Mounted in the `(app)` layout as on web |
| Booking alert sound | `features/notifications/view/booking-alert-audio.ts`, `use-booking-alert-sound.ts`, `live-booking-alert.tsx`, `partner-global-popup.tsx`, `public/sounds/*` | `expo-audio`; copy the sound files into `assets/sounds/` |
| Presence provider (app-wide beats) | `features/presence/view/partner-presence-provider.tsx`, `model/*` | Runs only while `AppState` is `active` |
| Login | `app/login/page.tsx`, `features/session/view/login-screen.tsx` | OTP via `@vsolve/mobile-core` mobile verify |

## Screens

| # | Mobile file (`app/…`) | Web route | Web sources | Chrome | Phase |
|---|---|---|---|---|---|
| 1 | `login.tsx` | `/login` | `features/session/view/login-screen.tsx` | none | 8 |
| 2 | `index.tsx` | `/` | — | redirect: signed in → `/home`, else `/login` | 8 |
| 3 | `(app)/apply/index.tsx` | `/apply` | `features/application/view/application-overview.tsx` | onboarding | 9 |
| 4 | `(app)/apply/about.tsx` | `/apply/about` | `application/view/about-step.tsx`, `application-editor.tsx` | onboarding | 9 |
| 5 | `(app)/apply/areas.tsx` | `/apply/areas` | `application/view/areas-step.tsx`, `application-editor.tsx` | onboarding | 9 |
| 6 | `(app)/apply/business.tsx` | `/apply/business` | `features/capability/view/capability-screens.tsx` | onboarding | 9 |
| 7 | `(app)/apply/capabilities.tsx` | `/apply/capabilities` | `capability/view/capability-screens.tsx` | onboarding | 9 |
| 8 | `(app)/apply/work/index.tsx` | `/apply/work` | `application/view/work-step.tsx`, `features/catalog/queries.ts` | onboarding | 9 |
| 9 | `(app)/apply/work/services.tsx` | `/apply/work/services` | redirect → `/apply/work` | — | 9 |
| 10 | `(app)/apply/demand.tsx` | `/apply/demand` | `capability/view/capability-screens.tsx` | onboarding | 9 |
| 11 | `(app)/apply/schedule.tsx` | `/apply/schedule` | `application/view/schedule-step.tsx` | onboarding | 9 |
| 12 | `(app)/apply/documents.tsx` | `/apply/documents` | `application/view/documents-step.tsx`, `document-upload.tsx`, `upload-queries.ts`, `model/upload.ts` | onboarding | 9 |
| 13 | `(app)/apply/insurance.tsx` | `/apply/insurance` | `capability/view/capability-screens.tsx`, `insurance-form.tsx` | onboarding | 9 |
| 14 | `(app)/apply/consent.tsx` | `/apply/consent` | `application/view/consent-step.tsx` | onboarding | 9 |
| 15 | `(app)/apply/review.tsx` | `/apply/review` | `application/view/review-step.tsx` | onboarding | 9 |
| 16 | `(app)/(tabs)/home.tsx` | `/home` | `features/work-stack/view/work-home.tsx`, `features/presence/view/presence-panel.tsx` | tabs | 10 |
| 17 | `(app)/work/index.tsx` | `/work` | redirect → `/work/all` | — | 11 |
| 18 | `(app)/(tabs)/work/all.tsx` | `/work/all` | `work-stack/view/all-work.tsx` | tabs | 11 |
| 19 | `(app)/work/offers/index.tsx` | `/work/offers` | `features/offers/view/offers-gate.tsx` (+ `offers/queries.ts`, `live-events.ts`) | focused | 11 |
| 20 | `(app)/work/offers/[invitationId].tsx` | `/work/offers/[invitationId]` | `features/crew-offer/view/offer-detail-screen.tsx`, `crew-mix-table.tsx`, `crew-offer-decline-dialog.tsx`, `crew-offer-outcome.tsx` | focused | 11 |
| 21 | `(app)/work/how-day-hire-works.tsx` | `/work/how-day-hire-works` | its `page.tsx` (static content) | focused | 11 |
| 22 | `(app)/work/enquiries/[invitationId]/index.tsx` | `/work/enquiries/[invitationId]` | `features/enquiry/view/enquiry-detail-screen.tsx` | focused | 12 |
| 23 | `(app)/work/enquiries/[invitationId]/arrival.tsx` | `…/arrival` | `features/visit/view/arrival-screen.tsx` | focused | 12 |
| 24 | `(app)/work/enquiries/[invitationId]/visit.tsx` | `…/visit` | `features/visit/view/visit-screen.tsx` | focused | 12 |
| 25 | `(app)/work/enquiries/[invitationId]/estimate.tsx` | `…/estimate` | `features/proposal/view/onsite-screen.tsx` (+ all of `features/proposal`) | focused | 12 |
| 26 | `(app)/work/jobs/[id]/index.tsx` | `/work/jobs/[id]` | `work-stack/view/job-detail-screen.tsx`, `visit-job-view.tsx` | focused | 13 |
| 27 | `(app)/work/jobs/[id]/days/[stageId].tsx` | `…/days/[stageId]` | `features/shift/view/shift-day-screen.tsx`, `settlement-phase.tsx` | focused | 13 |
| 28 | `(app)/work/jobs/[id]/stages/[stageId].tsx` | `…/stages/[stageId]` | `features/engagement/view/engagement-screens.tsx`, `evidence-composer.tsx` | focused | 13 |
| 29 | `(app)/(tabs)/money.tsx` | `/money` | `features/earnings/view/earnings-panel.tsx` | tabs | 14 |
| 30 | `(app)/(tabs)/me/index.tsx` | `/me` | `features/session/view/me-home.tsx` | tabs | 14 |
| 31 | `(app)/(tabs)/me/profile.tsx` | `/me/profile` | `features/profile/view/profile-panel.tsx` | tabs | 14 |
| 32 | `(app)/(tabs)/me/crew.tsx` | `/me/crew` | `features/crew/view/crew-screens.tsx`, `crew-document-uploader.tsx`, `crew-member-edit-form.tsx` | tabs | 14 |
| 33 | `(app)/(tabs)/me/rate-card.tsx` | `/me/rate-card` | `features/price-book/view/price-book-screen.tsx` | tabs | 14 |
| 34 | `(app)/(tabs)/me/language.tsx` | `/me/language` | `features/session/view/language-picker.tsx` | tabs | 14 |
| 35 | Alerts panel (sheet) | tab "Alerts" | `features/notifications/view/notification-panel.tsx`, `notification-bell.tsx`, `model/feed.ts`, `queries.ts` | sheet | 14 |
| 36 | `(app)/(tabs)/me/delete-account.tsx` | **mobile only** | uses `POST /api/v1/auth/privacy/requests/` `kind: "ERASURE"` (same endpoint as Customer `features/account/view/privacy-requests.tsx`; copy its wording) | tabs | 14 |
| 37 | Update required (full screen) | **mobile only** | `@vsolve/mobile-core` version gate | none | 8 |

Also port what these screens use: `features/support`, `features/ratings`, `features/work`,
`features/workspace`, `features/catalog`, `components/pictogram.tsx`, `partner-badge.tsx`,
`service-visuals.ts`, `role-visuals.ts`, `lib/format.ts`.

**Not ported** (open the website with `WebBrowser.openBrowserAsync`): everything in
`app/(marketing)/**` and `app/design/**`. The Me screen gets "Terms" and "Privacy" rows linking to
`${EXPO_PUBLIC_WEB_BASE_URL}/terms` and `/privacy`.

## Live offers on mobile

The web receives offers over Server-Sent Events (`features/offers/live-events.ts`). React Native
has no `EventSource`. On mobile, use the **polling fallback that already exists in
`offers/queries.ts`** (same interval), plus a push (`partner.offer_created`) that invalidates the
offers query when it arrives in the foreground. Do not add an SSE library.

## Push target kinds (Partner)

Tap routing = `targetHref(target)` from the ported `features/notifications/model/feed.ts`, then
these push-only kinds: `PARTNER_OFFERS` → `/work/offers`, `PARTNER_WORK` → `/work/all`. For
anything else or `null`, open the Alerts panel.

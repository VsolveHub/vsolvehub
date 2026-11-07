# Customer app: every screen

Web root: `frontend/apps/customer/`. Mobile root: `frontend/mobile/apps/customer/`.
For each row, read the web `app/<route>/page.tsx` and every file it imports (recursively) before
porting. `features/<x>` → `src/features/<x>`, `lib/routes.ts` → `src/lib/routes.ts`.

**Chrome** comes from `features/session/view/app-chrome.tsx` + `app-chrome-layout.ts`
(`appChromeLayout(pathname)`, `showFixedBackButton`) + `lib/focus-mode.ts` (screens that "claim
the viewport" hide the header and tabs). Port those rules exactly:
**tabs** = header + bottom tabs; **back** = fixed back button, no tabs; **focus** = the screen's
own header and docked action, no tabs.

**Sign-in gate:** the routes whose web `layout.tsx` wraps them in `CustomerShell`
(`features/session/view/customer-shell.tsx`) require sign-in: `engagements`, `activity`,
`projects`, `account`, `requests`, `bookings`, and the two pages that use it directly. All others
are public, as on web. The booking workspace keeps its inline login interrupt
(`customer-login-modal.tsx`).

## Shell (Phase 16)

| Piece | Web source |
|---|---|
| Header | `features/session/view/site-header.tsx`, `search-input.tsx`, `profile-mark.tsx` |
| Bottom tabs | `features/session/view/mobile-bottom-nav.tsx`: Home `/`, Services `/catalog`, Bookings `/activity` (active on `/activity`, `/bookings…`), Profile `/account` |
| Back button | `fixed-back-button.tsx` |
| Login page + modal | `login-screen.tsx`, `customer-login-experience.tsx`, `customer-login-modal.tsx`, `use-mobile-login-viewport.ts` |
| Gate | `customer-shell.tsx` |
| Footer | `site-footer.tsx`: **not ported** (desktop / marketing) |

## Screens

| # | Mobile file (`app/…`) | Web route | Web sources | Phase |
|---|---|---|---|---|
| 1 | `(tabs)/index.tsx` | `/` | `app/page.tsx`, `features/catalog/components/category-card.tsx`, `homepage-client-sections.tsx`, `features/catalog/queries.ts` | 17 |
| 2 | `(tabs)/catalog/index.tsx` | `/catalog` | `catalog-category-rows.tsx`, `search-results.tsx`, `icon-catalogue/catalogue-header.tsx`, `features/catalog/search.ts` | 17 |
| 3 | `(tabs)/catalog/all.tsx` | `/catalog/all` | redirect → `/catalog` | 17 |
| 4 | `(tabs)/catalog/[category]/index.tsx` | `/catalog/[category]` | `category-tile-browser.tsx` | 17 |
| 5 | `(tabs)/catalog/[category]/[service].tsx` | `/catalog/[category]/[service]` | `breadcrumbs.tsx`, `fit-out-service-picker.tsx`, `variant-list.tsx`, `policy-list.tsx`, `process-steps.tsx`, `record-service-view.tsx`, `service-card.tsx`, `add-to-cart-button.tsx` (**not** `service-json-ld.tsx`: SEO only) | 17 |
| 6 | `login.tsx` | `/login` | `features/session/view/login-screen.tsx` | 16 |
| 7 | `book/[service].tsx` | `/book/[service]` | `features/booking/view/workspace-boot.tsx` + all of `features/booking` | 18 |
| 8 | `cart.tsx` | `/cart` | `features/cart/view/cart-workspace.tsx` | 18 |
| 9 | `checkout.tsx` | `/checkout` | `features/checkout/view/checkout-workspace.tsx` | 18 |
| 10 | `bookings/index.tsx` | `/bookings` | redirect → `bookingStatusHref(toBookingStatusTab(status))` | 19 |
| 11 | `bookings/[groupId]/index.tsx` | `/bookings/[groupId]` | `features/bookings/view/group-detail.tsx` | 19 |
| 12 | `bookings/[groupId]/pay.tsx` | `/bookings/[groupId]/pay` | `features/payment/view/payment-workspace.tsx`, `simulated-capture.tsx`, `model/provider-handoff.ts`, `model/outcome.ts` | 19 |
| 13 | `bookings/[groupId]/receipt.tsx` | `…/receipt` | `features/payment/view/receipt.tsx` | 19 |
| 14 | `bookings/[groupId]/visits/[bookingId].tsx` | `…/visits/[bookingId]` | `features/bookings/view/booking-visit-screen.tsx` + `features/visit` | 19 |
| 15 | `bookings/workforce.tsx` | `/bookings/workforce` | redirect → `activityTabHref("booked")` | 19 |
| 16 | `requests/index.tsx` | `/requests` | redirect → `/activity` | 20 |
| 17 | `requests/new/index.tsx` | `/requests/new` | its `page.tsx` (category/service list) + `features/catalog/queries.ts` | 20 |
| 18 | `requests/new/[service].tsx` | `/requests/new/[service]` | `features/requirement/view/requirement-flow.tsx` + all of `features/requirement` and `features/project-request` (incl. `parts/photo-grid.tsx`, `requirement-address-picker.tsx`) | 20 |
| 19 | `requests/[requirementId]/index.tsx` | `/requests/[requirementId]` | `features/requirement/view/request-detail-screen.tsx` | 20 |
| 20 | `requests/[requirementId]/visits/[visitId].tsx` | `…/visits/[visitId]` | `features/access/view/visit-detail-screen.tsx` + all of `features/access` | 20 |
| 21 | `requests/[requirementId]/quotes/index.tsx` | `…/quotes` | `features/quotes/view/quotes-screen.tsx` | 21 |
| 22 | `requests/[requirementId]/quotes/[proposalId]/index.tsx` | `…/quotes/[proposalId]` | `quotes/view/estimate-detail-screen.tsx`, `shopping-list-card.tsx` | 21 |
| 23 | `requests/[requirementId]/quotes/[proposalId]/questions.tsx` | `…/questions` | `quotes/view/question-thread-screen.tsx` | 21 |
| 24 | `requests/[requirementId]/quotes/[proposalId]/confirm.tsx` | `…/confirm` | `quotes/view/confirm-choice-screen.tsx` | 21 |
| 25 | `requests/book/[service].tsx` | `/requests/book/[service]` | `features/crew/view/book-crew-screen.tsx` + all of `features/crew` | 21 |
| 26 | `requests/[requirementId]/book-crew.tsx` | `…/book-crew` | `crew/view/book-crew-fee-screen.tsx` | 21 |
| 27 | `engagements/[engagementId]/index.tsx` | `/engagements/[engagementId]` | `features/engagement/view/engagement-screen.tsx` + `features/shift-day` | 22 |
| 28 | `engagements/[engagementId]/receipt.tsx` | `…/receipt` | `engagement/view/receipt.tsx` | 22 |
| 29 | `engagements/[engagementId]/stages/[stageId].tsx` | `…/stages/[stageId]` | `engagement/view/stage-review-screen.tsx` | 22 |
| 30 | `jobs/[engagementId]/index.tsx`, `receipt.tsx`, `stages/[stageId].tsx` | `/jobs/…` | re-export the three engagement screens (web does the same) | 22 |
| 31 | `projects.tsx` | `/projects` | redirect → `/activity` | 22 |
| 32 | `(tabs)/activity.tsx` | `/activity` | `features/activity/view/activity-screen.tsx` + `features/activity/model/*` | 22 |
| 33 | `(tabs)/account/index.tsx` | `/account` | `features/account/view/profile-overview.tsx` | 23 |
| 34 | `(tabs)/account/edit.tsx` | `/account/edit` | `account/view/profile-editor.tsx` | 23 |
| 35 | `(tabs)/account/addresses.tsx` | `/account/addresses` | `features/addresses/view/address-book.tsx` (+ `use-pin-location`), `account/view/chrome.tsx` | 23 |
| 36 | `(tabs)/account/messages.tsx` | `/account/messages` | `account/view/communication-preferences.tsx` | 23 |
| 37 | `(tabs)/account/privacy.tsx` | `/account/privacy` | `account/view/consent-receipts.tsx`, `privacy-requests.tsx`. The ERASURE request is the in-app **Delete account**; add a clear "Delete my account" entry on `/account` that opens this screen | 23 |
| 38 | `(tabs)/account/sessions.tsx` | `/account/sessions` | `account/view/session-list.tsx` | 23 |
| 39 | Notifications (sheet/screen) | header bell | `features/notifications/view/*`, `model/feed.ts` | 23 |
| 40 | Update required | **mobile only** | `@vsolve/mobile-core` version gate | 16 |

Also port what these screens use: `features/cart`, `features/ratings`, `features/support`,
`components/patterns.tsx` and `lib/routes.ts`.

**Not ported** (open the website with `WebBrowser.openBrowserAsync`): `/contact`, `/join-pro`
(opens the **Partner app** store listing when available, else the website), `/terms`, `/privacy`,
`app/design/**`.

## Push target kinds (Customer)

Tap routing = `targetHref(target)` from the ported `features/notifications/model/feed.ts`
(`ENGAGEMENT`, `REQUIREMENT`, `REQUIREMENT_QUOTES`, …). For `null` or unknown, open the
notifications screen.

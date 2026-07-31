# M1 Frontend Tasks

## F1 — Shared foundation

- Generate and consume the OpenAPI client; no handwritten business DTOs.
- Configure TanStack Query keys, retry/error mapping and server-time handling.
- Build accessible primitives and error boundaries using existing brand assets.
- Support message keys for Partner operational strings and locale-aware formatting; ship only approved
  locales.
- Configure contract mocks without inventing runtime responses.

## F2 — Customer discovery and booking

- Build service/category/detail pages for active M1 variants.
- Show reachable starting price and minimum visit charge.
- Build persistent booking workspace: address, scope, duration estimate, timing, quote and login resume.
- Display Today/Scheduled windows only; no Instant or Partner picker.
- Display full cancellation amounts and policies before search/payment.
- Build bounded Finding a professional with cancel and honest no-Partner alternatives.
- After Partner commitment, show payment deadline and handle expiry/restart.
- Reconcile provider checkout from backend state after redirect loss, refresh or ambiguity.

## F3 — Customer active booking

- Show authoritative Partner/status/appointment and text ETA; no map.
- Provide cancel/reschedule/support actions according to server capability.
- Show delay and fee-free recovery when SLA is breached.
- Display arrival and start OTP securely.
- Display and approve/decline scope amendments and collect revision payment.
- Show completion submission with Confirm and Report a problem.
- Show partial/refund/dispute states and issued invoice/credit note.

## F4 — Partner onboarding and schedule

- Build mobile-first OTP, draft application, document upload, skills, service areas, explicit working
  periods, consent and submit/review states.
- Preserve resumable upload progress and precise Changes Required feedback.
- Show only real eligibility and schedule state.

## F5 — Partner offer and work

- Offer card shows scope, approximate area, timing, occupied estimate, requirements and net breakdown.
- Build explicit Accept and Decline, confirmation sheet, 120-second no-fault undo and Commit now.
- Hide exact address/contact until disclosure policy permits.
- Build release with reason; no threat or opaque score.
- Build En route, Arrived, Customer unavailable, start OTP and contact/support.
- Persist tasks/evidence/upload status and scope amendment.
- Build Abort and line-level completion outcome.
- Show pending/available/paid ledger states and payout account/status without enabling unsupported
  on-demand withdrawal.

## F6 — Operations

- Evolve `web/apps/admin` into role-based Operations; do not create another app.
- Build Partner review, catalog/rate/area management and validation errors.
- Build case list/detail with owner, SLA, evidence, communication and allowed commands.
- Build booking/offer/reservation/payment/refund/ledger/payout timeline.
- Build assisted booking/payment link and manual offer/recovery using ordinary APIs.
- Build kill switches, maker-checker and audit references.
- Mask KYC, bank, address and sensitive evidence by default.

## Frontend completion gate

- Component, query/mutation and browser E2E tests pass.
- Keyboard, screen-reader, 200% zoom, reduced motion and contrast pass.
- Mobile 375/768 and desktop 1024/1440 have no overflow or covered controls.
- Slow network, offline/reconnect, redirect loss, upload failure and permission denial are exercised.
- No UI claims payment, assignment, arrival, start, completion or refund before backend truth.
- Browser console is clean in acceptance flows and production bundle budgets pass.

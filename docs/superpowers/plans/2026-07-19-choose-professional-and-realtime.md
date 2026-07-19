# Choose-Your-Professional, Silent Fallback & Reload-Free Realtime — Plan

Spec: `docs/superpowers/specs/2026-07-19-choose-professional-and-realtime-design.md`.
Reuse-first: one matcher, existing markup, existing `NearbyProvider` type,
`NoProvidersScreen`, and Next.js `router.refresh()` over the existing server
serialization. No new DB migration. No mock data.

## Task 1: Professional profiles from the matcher (data)

**Files:** `lib/fulfillment/profiles.ts` (+ test), `lib/fulfillment/matching.ts`
(export haversine or reuse), `app/api/providers/availability/route.ts`.

- Pure `toPublicProfiles(rankedTopN, { addrLat, addrLng }, nameById)` →
  `NearbyProvider[]`: distance via haversine, `etaMins = max(10, round(dist/22*60)+10)`,
  preserve order. No-geo partner → distance 0. Cap handled by caller slicing
  `ranked` to 4 before enrichment.
- `availability` route: after `findAvailablePartners`, take `ranked.slice(0,4)`,
  one `partner.findMany({ id: { in } }, select name/jobsCompleted)`, build
  profiles; respond `{ count: ranked.length, professionals, suggestedSlots }`.
- [ ] Failing tests for `toPublicProfiles` (order, cap-by-input, eta floor,
  no-geo) → implement → `pnpm test && typecheck` → commit
  `feat: return rankable professional profiles from the availability matcher`

## Task 2: Preferred professional + silent fallback (engine/route)

**Files:** `lib/fulfillment/assign.ts` (+ test), `lib/validation/schemas.ts`,
`app/api/bookings/route.ts`, `lib/query/api.ts`.

- `assignBestPartner(bookingId, { preferredPartnerId?, excludePartnerIds? })`:
  order candidates preferred-first (only if present in `ranked`); return
  `preferredHonored`. Factor the ordering into a pure helper tested directly.
- `AssignOutcome.ok` gains `preferredHonored: boolean`.
- `bookingSchema`: `preferredPartnerId: z.string().optional()`.
- Route: pass `parsed.data.preferredPartnerId`; success response adds
  `partner` (already) + `preferredHonored`. `api.ts` `CreateBookingResult` gains
  `preferredHonored?`.
- [ ] Tests: preferred honored; preferred taken → next + honored=false; preferred
  absent → honored=false; auto (no preferred) unchanged → implement → green →
  commit `feat: honor a preferred professional with silent fallback`

## Task 3: Choose-professional step (customer UI)

**Files:** `components/customer/booking/ServiceBookingFlow.tsx`,
`lib/query/keys.ts` (availability key already exists).

- Add `"choose"` to `Step`; details "Continue to payment" → `setStep("choose")`
  (drop the inline count gate; the choose fetch is the gate).
- On `choose`: `useQuery` availability (staleTime 30s); loading skeleton;
  `count===0` → `NoProvidersScreen`; else Auto-assign card (preselected,
  recommended) + `professionals` cards reusing `provider-card-v3`/radio markup.
  State `preferredPartnerId`.
- "Continue" → `setStep("payment")`. Payment "Pay" → `submit()` sends
  `preferredPartnerId`. Remove the "N professionals available" banner.
- `createBooking.onSuccess`: if `preferredHonored === false`, stash a note and
  show it (reuse the existing top-of-flow note/error surface) before/na the
  redirect. Update the 5-step progress header to include the choose step.
- [ ] typecheck; manual visual check in dev → commit
  `feat: choose-your-professional step before payment`

## Task 4: Reload-free partner dashboard (polling + router.refresh)

**Files:** `app/api/jobs/active/route.ts` (new), a small client poller
(reuse `components/dashboard/job-offer-poller.tsx` pattern; new
`active-job-refresher.tsx`), `app/dashboard/page.tsx` (mount the poller).

- `GET /api/jobs/active` → `{ token }` = `${jobId}:${status}` | `"idle"` from
  `getPartnerActiveJobs(partner.id)` (requirePartner).
- `ActiveJobRefresher`: `useQuery` every 3s; on token change vs a ref, call
  `router.refresh()`. Rendered in the dashboard tree so the RSC re-runs and
  `captain-live` gets fresh `activeJob`/`offer` props; its existing stage-sync
  effect advances the loop — no reload, no serialization duplication.
- [ ] typecheck; verify in dev (book from customer → job appears on partner
  dashboard live) → commit `feat: live partner dashboard via token poll + refresh`

## Task 5: Retire dead code + verify

**Files:** delete `app/api/providers/nearby/route.ts`, `lib/provider/nearby.ts`,
`lib/provider/matching.ts` if unused; `lib/query/api.ts` (drop `providers` +
`NearbyProvider` re-export only if moved). Keep `lib/provider/queries.ts`
(`offerExpiresAt` still used by push-dispatch).

- Confirm no imports remain, delete, `pnpm typecheck && test` green.
- Verify start-OTP visible on the tracker for a paid ASSIGNED booking.
- [ ] commit `chore: retire the dead nearby-providers matcher (single matcher)`

## Verification summary
Pure tests: profiles + preferred-first/fallback. Manual E2E: choose→pay→assign
happy, taken-pro fallback note, auto-assign, no-providers, start OTP, and the
partner dashboard receiving a job with no reload.

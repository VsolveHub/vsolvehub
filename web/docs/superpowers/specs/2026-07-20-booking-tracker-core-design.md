# Design: Shared Booking-Tracker Core + Brain-Method Breakup

**Date:** 2026-07-20
**Status:** Approved (design), pending spec review
**Driver:** CodeScene Code Health audit of `apps/customer` and `apps/partner`

## Problem

The customer app has 14 tracker/booking-flow components (~270 KB) that each
re-implement the same booking lifecycle (`searching → assigned → arrived →
started → completed → paid`) from scratch. There is no shared hook or base
component. CodeScene flags the worst as Brain Methods:

| File | Score | Smell |
|---|---|---|
| `ElectricianTracker.tsx` | 6.23 | 1 function, 853 LoC, cyclomatic complexity 102 |
| `VehicleTracker.tsx` | 7.36 | 545 LoC, cc 58 |
| `AddressPicker.tsx` | 7.99 | 341 LoC, cc 61, complex conditionals |
| `RideBookingFlow.tsx` | 7.92 | 413 LoC, cc 22 |
| `captain-live.tsx` (partner) | 7.0 | 1247 LoC Brain-Class risk + internal duplication |

Additional blind spots:
- Every tracker takes `booking: any` — the dispatcher's `TrackingData` type is
  thrown away at the component boundary.
- Zero component/hook tests. The riskiest code (cc 102) is untested.

## Non-goals

- **No visual change.** Decision: unify *logic only*, keep each tracker's look.
- No change to the `BookingTracker.tsx` dispatcher's responsibilities (polling
  via `useQuery` @ 4s, pay/retry mutations, category routing). It is healthy.
- No unrelated refactoring outside the tracker family and `captain-live.tsx`.

## Architecture

New shared layer under `apps/customer/lib/booking/`:

### 1. `types.ts` — shared `Booking` type
Promote the dispatcher's local `TrackingData` type to an exported `Booking`
type. Replace `booking: any` in every tracker with `Booking`.

### 2. `booking-view.ts` — pure, node-testable logic
The deduplicated logic as pure functions (no React):
- `deriveBookingView(booking): BookingView` →
  `{ status, currentStatusIndex, professional, isCompleted, isTeam, details }`
- `getTimelineSteps(booking, getStepDetails): ResolvedStep[]` → each timeline
  step resolved with `completed | active | upcoming` flags.

Pure functions are testable in the existing node vitest runner with zero new
infra. This is where the real duplication is eliminated.

### 3. `useBookingLifecycle(booking, onRefresh)` — thin React hook
Wraps `deriveBookingView` and holds the repeated UI state
(`rating`, `review`, `reviewSubmitted`, `error`, `photos`, `showDetailsModal`)
plus the repeated action handlers (`cancelBooking`, `reviseAction`,
`submitReview`) built on the existing shared mutations
(`useCancelBookingMutation`, `useReviseBookingMutation`,
`useReviewBookingMutation`). Each tracker replaces ~80 lines of copy-paste with
a single hook call. The hook returns data + handlers; JSX is unchanged, so the
rendered output is identical.

## Brain-Method breakup

After the hook removes handlers/state, each tracker's remaining giant function
is split into co-located presentational sub-components:
`<BookingTimeline>`, `<ProfessionalCard>`, `<ReviewPanel>`, `<TeamTimeline>`,
`<DetailsModal>`. The tracker becomes a ~120-line orchestrator.

Pilot target — `ElectricianTracker`: **6.23 → 9.0+**, no function over the cc
threshold. Same JSX, moved into named components.

## captain-live.tsx (partner — separate workstream)

Extract inline `JobsTab` / `EnrouteScreen` / `ProfileTab` into their own files.
Collapse the two CodeScene-flagged duplications:
- `PanelStat` + `MiniStat` → one `<Stat variant>` primitive.
- `onArrived` + `onRelease` → one parameterized handler.

Target: **7.0 → 9.0+**, out of Brain-Class risk.

## Testing

- **Pure logic** (`booking-view.ts`): unit tests in the existing node runner —
  status normalization, timeline indexing, team detection, edge cases (missing
  provider, null rating, unknown status). No new deps.
- **Hook** (`useBookingLifecycle`): add a jsdom vitest project +
  `@testing-library/react` so the shared core that 14 flows depend on is
  covered. Tests: handlers call the right mutations, `submitReview` sets error
  on failure, state transitions.

Vitest gains a second project (jsdom) for `*.test.tsx`; the existing node
project (`*.test.ts`) is unchanged.

## Sequencing

| Phase | Work | Gate |
|---|---|---|
| 0 | `types.ts` + `booking-view.ts` + tests + jsdom test setup | — |
| 1 (PILOT) | `useBookingLifecycle` + tests; migrate ElectricianTracker + break into sub-components | STOP — user reviews score + behavior |
| 2 | Roll out: Beautician, Construction, Crew, Vehicle + BookingFlow components | — |
| 3 | captain-live.tsx breakup | — |

Every migrated file gets a fresh CodeScene Code Health score (prove improvement)
and a typecheck (prove nothing broke).

## Success criteria

- ElectricianTracker and every migrated tracker score ≥ 9.0.
- captain-live.tsx scores ≥ 9.0, no Brain-Class warning.
- No `booking: any` in the tracker family.
- Shared core covered by tests (pure logic in node, hook in jsdom).
- `pnpm typecheck` and `pnpm test` pass; no visual regressions.

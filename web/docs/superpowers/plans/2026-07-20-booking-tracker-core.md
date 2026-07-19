# Booking-Tracker Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a shared booking-lifecycle core (pure logic + React hook + shared type) that eliminates duplication across 14 tracker/booking-flow components, then break up the worst Brain Methods — with zero visual change.

**Architecture:** A pure `booking-view.ts` module (node-testable) holds all lifecycle derivation. A thin `useBookingLifecycle` hook wraps it plus the existing shared TanStack mutations and repeated UI state. Each tracker adopts the hook and splits its monolithic function into co-located presentational sub-components. The `BookingTracker.tsx` dispatcher (polling, pay/retry, routing) is untouched.

**Tech Stack:** Next.js (App Router), React, TypeScript, TanStack Query, Vitest (node + new jsdom project), @testing-library/react.

## Global Constraints

- No visual change to any tracker — JSX output must be identical; only logic/state moves.
- Do not modify `BookingTracker.tsx` dispatcher responsibilities (polling `useQuery` @ 4s, pay/retry, category routing).
- Shared code lives under `apps/customer/lib/booking/`.
- The `@` import alias resolves to `apps/customer` (see `vitest.config.ts`).
- Existing shared mutations (exact signatures): `useCancelBookingMutation(ref)` → `.mutate(undefined, opts)`; `useReviseBookingMutation(ref)` → `.mutate("approve" | "decline", opts)`; `useReviewBookingMutation(ref)` → `.mutate({ rating, review }, opts)`. Each exposes `.isPending`.
- `MARKETPLACE_TIMELINE = ["PENDING","SEARCHING_PROVIDER","ASSIGNED","PROVIDER_ARRIVING","STARTED","COMPLETED"]` and `normalizeBookingStatus` live in `apps/customer/lib/constants.ts`.
- Every migrated file gets a CodeScene `code_health_score` (must improve) and `pnpm typecheck` (must pass) before its commit.
- TDD: failing test first, minimal implementation, passing test, commit.

---

## Phase 0 — Shared types, pure logic, test infra

### Task 0.1: Shared `Booking` type

**Files:**
- Create: `apps/customer/lib/booking/types.ts`
- Modify: `apps/customer/components/customer/booking/BookingTracker.tsx` (import shared type instead of local `TrackingData`)

**Interfaces:**
- Produces: `export type Booking` — the shape currently declared inline as `TrackingData` in `BookingTracker.tsx:14-40`, plus optional fields the trackers read (`cancelFeePaise?: number`, `createdAt?: string`, `bookingRef: string`).

- [ ] **Step 1: Create the type**

```ts
// apps/customer/lib/booking/types.ts
export type BookingParty = {
  id: string;
  name: string;
  phone: string;
  rating: number;
  etaMinutes?: number;
};

export type Booking = {
  bookingRef: string;
  status: string;
  message: string;
  marketplace?: boolean;
  isCrew?: boolean;
  service: { id: string; name: string; slug: string; categorySlug: string };
  issueDescription: string;
  mediaUrls: string[];
  slot: string;
  scheduleType: string;
  address: string;
  vendor: BookingParty | null;
  provider: BookingParty | null;
  quotedAmount: number;
  finalAmountPaise: number;
  paymentStatus: string;
  paymentMethod: string | null;
  rating: number | null;
  archetypeDetails: string;
  cancelFeePaise?: number;
  createdAt?: string;
};
```

- [ ] **Step 2: Point the dispatcher at it**

In `BookingTracker.tsx`, replace the inline `type TrackingData = {...}` (lines 14-40) with:
```ts
import type { Booking } from "@/lib/booking/types";
type TrackingData = Booking;
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter customer typecheck`
Expected: PASS (no errors)

- [ ] **Step 4: Commit**

```bash
git add apps/customer/lib/booking/types.ts apps/customer/components/customer/booking/BookingTracker.tsx
git commit -m "refactor: promote Booking tracking type to shared module"
```

---

### Task 0.2: Pure booking-view logic (TDD)

**Files:**
- Create: `apps/customer/lib/booking/booking-view.ts`
- Test: `apps/customer/lib/booking/booking-view.test.ts`

**Interfaces:**
- Consumes: `Booking` (Task 0.1); `MARKETPLACE_TIMELINE`, `normalizeBookingStatus` from `@/lib/constants`.
- Produces:
  - `deriveBookingView(booking: Booking): BookingView` where
    `BookingView = { status: string; currentStatusIndex: number; professional: BookingParty | null; isCompleted: boolean; isTeam: boolean; details: Record<string, any> }`
  - `type StepState = "completed" | "active" | "upcoming"`
  - `resolveTimeline(currentStatusIndex: number, steps?: readonly string[]): { key: string; index: number; state: StepState }[]`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/customer/lib/booking/booking-view.test.ts
import { describe, it, expect } from "vitest";
import { deriveBookingView, resolveTimeline } from "./booking-view";
import type { Booking } from "./types";

const base: Booking = {
  bookingRef: "VSH1", status: "ASSIGNED", message: "", service: { id: "s", name: "n", slug: "sl", categorySlug: "c" },
  issueDescription: "", mediaUrls: [], slot: "", scheduleType: "", address: "",
  vendor: null, provider: { id: "p", name: "Pro", phone: "1", rating: 5 },
  quotedAmount: 0, finalAmountPaise: 0, paymentStatus: "PENDING", paymentMethod: null,
  rating: null, archetypeDetails: "",
};

describe("deriveBookingView", () => {
  it("prefers provider over vendor as professional", () => {
    expect(deriveBookingView(base).professional?.name).toBe("Pro");
  });
  it("falls back to vendor when no provider", () => {
    const b = { ...base, provider: null, vendor: { id: "v", name: "Vend", phone: "1", rating: 4 } };
    expect(deriveBookingView(b).professional?.name).toBe("Vend");
  });
  it("marks COMPLETED bookings complete with correct timeline index", () => {
    const v = deriveBookingView({ ...base, status: "COMPLETED" });
    expect(v.isCompleted).toBe(true);
    expect(v.currentStatusIndex).toBe(5);
  });
  it("detects team bookings from archetypeDetails", () => {
    const v = deriveBookingView({ ...base, archetypeDetails: JSON.stringify({ bookingType: "team" }) });
    expect(v.isTeam).toBe(true);
  });
  it("treats empty archetypeDetails as empty details, not a crash", () => {
    expect(deriveBookingView(base).details).toEqual({});
  });
});

describe("resolveTimeline", () => {
  it("labels steps before current as completed, current as active, later as upcoming", () => {
    const t = resolveTimeline(2); // ASSIGNED
    expect(t[1].state).toBe("completed");
    expect(t[2].state).toBe("active");
    expect(t[3].state).toBe("upcoming");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run apps/customer/lib/booking/booking-view.test.ts`
Expected: FAIL ("Cannot find module './booking-view'")

- [ ] **Step 3: Implement**

```ts
// apps/customer/lib/booking/booking-view.ts
import { MARKETPLACE_TIMELINE, normalizeBookingStatus } from "@/lib/constants";
import type { Booking, BookingParty } from "./types";

export type StepState = "completed" | "active" | "upcoming";

export type BookingView = {
  status: string;
  currentStatusIndex: number;
  professional: BookingParty | null;
  isCompleted: boolean;
  isTeam: boolean;
  details: Record<string, any>;
};

function parseDetails(raw: string): Record<string, any> {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export function deriveBookingView(booking: Booking): BookingView {
  const status = normalizeBookingStatus(booking.status);
  const details = parseDetails(booking.archetypeDetails);
  return {
    status,
    currentStatusIndex: (MARKETPLACE_TIMELINE as readonly string[]).indexOf(status),
    professional: booking.provider ?? booking.vendor,
    isCompleted: status === "COMPLETED",
    isTeam: details.bookingType === "team",
    details,
  };
}

export function resolveTimeline(
  currentStatusIndex: number,
  steps: readonly string[] = MARKETPLACE_TIMELINE,
) {
  return steps.map((key, index) => ({
    key,
    index,
    state: (index < currentStatusIndex ? "completed" : index === currentStatusIndex ? "active" : "upcoming") as StepState,
  }));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run apps/customer/lib/booking/booking-view.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/customer/lib/booking/booking-view.ts apps/customer/lib/booking/booking-view.test.ts
git commit -m "feat: pure booking-view derivation with tests"
```

---

### Task 0.3: jsdom vitest project for component/hook tests

**Files:**
- Modify: `vitest.config.ts` → convert to workspace with two projects (node + jsdom)
- Create: `apps/customer/vitest.setup.ts`
- Modify: root `package.json` devDependencies

**Interfaces:**
- Produces: a jsdom test project matching `apps/**/*.test.tsx`; node project keeps `{apps,packages}/**/*.test.ts`.

- [ ] **Step 1: Add dev dependencies**

Run: `pnpm add -w -D @testing-library/react @testing-library/dom @testing-library/jest-dom jsdom`
Expected: added to root `package.json`.

- [ ] **Step 2: Create setup file**

```ts
// apps/customer/vitest.setup.ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Convert vitest config to projects**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

const alias = {
  "@": path.resolve(__dirname, "apps/customer"),
  "@vsolve/db": path.resolve(__dirname, "packages/db/src/index.ts"),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          include: ["{apps,packages}/**/*.{test,spec}.ts"],
          exclude: ["**/node_modules/**", "**/.next/**"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "jsdom",
          environment: "jsdom",
          globals: true,
          setupFiles: ["apps/customer/vitest.setup.ts"],
          include: ["{apps,packages}/**/*.{test,spec}.tsx"],
          exclude: ["**/node_modules/**", "**/.next/**"],
        },
      },
    ],
  },
});
```

- [ ] **Step 4: Sanity test that jsdom project runs**

Create temporary `apps/customer/lib/booking/_smoke.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { it, expect } from "vitest";
it("jsdom renders", () => {
  render(<div>hello</div>);
  expect(screen.getByText("hello")).toBeInTheDocument();
});
```
Run: `pnpm vitest run apps/customer/lib/booking/_smoke.test.tsx`
Expected: PASS. Then delete `_smoke.test.tsx`.

- [ ] **Step 5: Full suite still green**

Run: `pnpm test`
Expected: all existing node tests + booking-view tests PASS.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts apps/customer/vitest.setup.ts package.json pnpm-lock.yaml
git commit -m "test: add jsdom vitest project for component/hook tests"
```

---

## Phase 1 — PILOT: useBookingLifecycle + ElectricianTracker

### Task 1.1: `useBookingLifecycle` hook (TDD)

**Files:**
- Create: `apps/customer/lib/booking/useBookingLifecycle.ts`
- Test: `apps/customer/lib/booking/useBookingLifecycle.test.tsx`

**Interfaces:**
- Consumes: `deriveBookingView` (0.2); `Booking` (0.1); `useCancelBookingMutation`, `useReviseBookingMutation`, `useReviewBookingMutation` from `@/lib/query/hooks`.
- Produces: `useBookingLifecycle(booking: Booking, onRefresh: () => void)` returning:
  `{ view: BookingView, rating, setRating, review, setReview, reviewSubmitted, photos, setPhotos, showDetailsModal, setShowDetailsModal, error, loading, cancelBooking(), reviseAction(action), submitReview() }`.
  `cancelBooking` shows the same `window.confirm` fee message as today.

- [ ] **Step 1: Write the failing test** (renders the hook inside a QueryClientProvider, mocks `@/lib/query/hooks`)

```tsx
// apps/customer/lib/booking/useBookingLifecycle.test.tsx
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";

const cancelMutate = vi.fn();
const reviseMutate = vi.fn();
const reviewMutate = vi.fn();
vi.mock("@/lib/query/hooks", () => ({
  useCancelBookingMutation: () => ({ mutate: cancelMutate, isPending: false }),
  useReviseBookingMutation: () => ({ mutate: reviseMutate, isPending: false }),
  useReviewBookingMutation: () => ({ mutate: reviewMutate, isPending: false }),
}));

import { useBookingLifecycle } from "./useBookingLifecycle";
import type { Booking } from "./types";

const booking: Booking = {
  bookingRef: "VSH1", status: "STARTED", message: "", service: { id: "s", name: "n", slug: "sl", categorySlug: "c" },
  issueDescription: "", mediaUrls: [], slot: "", scheduleType: "", address: "", vendor: null,
  provider: { id: "p", name: "Pro", phone: "1", rating: 5 }, quotedAmount: 0, finalAmountPaise: 0,
  paymentStatus: "PENDING", paymentMethod: null, rating: null, archetypeDetails: "", cancelFeePaise: 0,
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient();
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => { cancelMutate.mockClear(); reviseMutate.mockClear(); reviewMutate.mockClear(); vi.stubGlobal("confirm", () => true); });

describe("useBookingLifecycle", () => {
  it("exposes derived view", () => {
    const { result } = renderHook(() => useBookingLifecycle(booking, () => {}), { wrapper });
    expect(result.current.view.professional?.name).toBe("Pro");
    expect(result.current.view.status).toBe("STARTED");
  });
  it("reviseAction forwards the action to the revise mutation", () => {
    const { result } = renderHook(() => useBookingLifecycle(booking, () => {}), { wrapper });
    act(() => result.current.reviseAction("approve"));
    expect(reviseMutate).toHaveBeenCalledWith("approve", expect.any(Object));
  });
  it("submitReview sends current rating and review text", () => {
    const { result } = renderHook(() => useBookingLifecycle(booking, () => {}), { wrapper });
    act(() => { result.current.setRating(4); result.current.setReview("great"); });
    act(() => result.current.submitReview());
    expect(reviewMutate).toHaveBeenCalledWith({ rating: 4, review: "great" }, expect.any(Object));
  });
  it("cancelBooking calls cancel mutation after confirm", () => {
    const { result } = renderHook(() => useBookingLifecycle(booking, () => {}), { wrapper });
    act(() => result.current.cancelBooking());
    expect(cancelMutate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run apps/customer/lib/booking/useBookingLifecycle.test.tsx`
Expected: FAIL ("Cannot find module './useBookingLifecycle'")

- [ ] **Step 3: Implement the hook**

```tsx
// apps/customer/lib/booking/useBookingLifecycle.ts
import { useMemo, useState } from "react";
import { formatPrice } from "@/lib/format";
import {
  useCancelBookingMutation,
  useReviseBookingMutation,
  useReviewBookingMutation,
} from "@/lib/query/hooks";
import { deriveBookingView } from "./booking-view";
import type { Booking } from "./types";

export function useBookingLifecycle(booking: Booking, onRefresh: () => void) {
  const [rating, setRating] = useState(booking.rating ?? 5);
  const [review, setReview] = useState("");
  const [reviewSubmitted, setReviewSubmitted] = useState(booking.rating != null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [error, setError] = useState("");

  const cancelMutation = useCancelBookingMutation(booking.bookingRef);
  const reviseMutation = useReviseBookingMutation(booking.bookingRef);
  const reviewMutation = useReviewBookingMutation(booking.bookingRef);
  const loading = cancelMutation.isPending || reviseMutation.isPending || reviewMutation.isPending;

  const view = useMemo(() => deriveBookingView(booking), [booking]);

  function cancelBooking() {
    const fee = booking.cancelFeePaise ?? 0;
    const msg = fee > 0
      ? `The professional is already on the way, so a ${formatPrice(fee)} visit fee applies. Cancel anyway?`
      : "Cancel this booking? No fee applies.";
    if (!window.confirm(msg)) return;
    cancelMutation.mutate(undefined, { onSuccess: () => onRefresh() });
  }

  function reviseAction(action: "approve" | "decline") {
    reviseMutation.mutate(action, { onSuccess: () => onRefresh() });
  }

  function submitReview() {
    setError("");
    reviewMutation.mutate(
      { rating, review },
      {
        onSuccess: () => { setReviewSubmitted(true); onRefresh(); },
        onError: (err: any) => setError(err?.message || "Could not submit review"),
      },
    );
  }

  return {
    view, rating, setRating, review, setReview, reviewSubmitted, photos, setPhotos,
    showDetailsModal, setShowDetailsModal, error, loading,
    cancelBooking, reviseAction, submitReview,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run apps/customer/lib/booking/useBookingLifecycle.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/customer/lib/booking/useBookingLifecycle.ts apps/customer/lib/booking/useBookingLifecycle.test.tsx
git commit -m "feat: useBookingLifecycle hook wrapping shared booking logic + tests"
```

---

### Task 1.2: Migrate ElectricianTracker onto the hook

**Files:**
- Modify: `apps/customer/components/customer/booking/ElectricianTracker.tsx`

**Interfaces:**
- Consumes: `useBookingLifecycle` (1.1), `Booking` (0.1).

- [ ] **Step 1: Baseline score** — record CodeScene `code_health_score` for the file (expect ~6.23).
- [ ] **Step 2:** Change `Props.booking` from `any` to `Booking`; import the hook.
- [ ] **Step 3:** Replace the local state (`rating`/`review`/`reviewSubmitted`/`photos`/`showDetailsModal`/`error`), the three mutation calls, `loading`, `status`, `professional`, `isCompleted`, `details`, `isTeam`, `currentStatusIndex`, and the `cancelBooking`/`reviseAction`/`submitReview` functions with a single `const { view, rating, setRating, ...handlers } = useBookingLifecycle(booking, onRefresh);` and destructure `status`, `currentStatusIndex`, `professional`, `isCompleted`, `isTeam`, `details` from `view`. Leave all JSX untouched.
- [ ] **Step 4:** `pnpm --filter customer typecheck` → PASS.
- [ ] **Step 5:** New CodeScene `code_health_score` → expect meaningful jump (handlers/state gone). If still < 9, proceed to Task 1.3 (component split) before committing.
- [ ] **Step 6:** Commit `refactor: ElectricianTracker uses shared useBookingLifecycle`.

---

### Task 1.3: Break ElectricianTracker into sub-components

**Files:**
- Modify: `apps/customer/components/customer/booking/ElectricianTracker.tsx`
- Create: `apps/customer/components/customer/booking/electrician/` → `BookingTimeline.tsx`, `ProfessionalCard.tsx`, `ReviewPanel.tsx`, `TeamTimeline.tsx`, `DetailsModal.tsx`

**Interfaces:**
- Each sub-component receives explicit props (no shared mutable state). `BookingTimeline` consumes `resolveTimeline` (0.2) + a `getStepDetails(stepKey, idx)` function passed by the parent so per-vertical copy stays in the tracker.

- [ ] **Step 1:** Extract the timeline JSX (`getTimelineStepDetails`/`getTeamTimelineStepDetails` + their render loop) into `BookingTimeline.tsx` and `TeamTimeline.tsx`, driven by `resolveTimeline`.
- [ ] **Step 2:** Extract the professional/contact block into `ProfessionalCard.tsx`.
- [ ] **Step 3:** Extract the rating/review block into `ReviewPanel.tsx` (props: `rating`, `setRating`, `review`, `setReview`, `reviewSubmitted`, `error`, `loading`, `onSubmit`).
- [ ] **Step 4:** Extract the details modal into `DetailsModal.tsx`.
- [ ] **Step 5:** Reduce the `ElectricianTracker` function body to a ~120-line orchestrator that wires the hook to these components. Verbatim JSX moves — no markup changes.
- [ ] **Step 6:** `pnpm --filter customer typecheck` → PASS.
- [ ] **Step 7:** CodeScene `code_health_score` on `ElectricianTracker.tsx` **and** each new file → all ≥ 9.0, no function over cc threshold.
- [ ] **Step 8:** `pnpm test` → all green.
- [ ] **Step 9:** Commit `refactor: split ElectricianTracker into presentational components`.

---

### PILOT GATE

Stop. Report to the user: before/after Code Health for `ElectricianTracker.tsx`, the new file scores, typecheck + test status, and confirm no visual change (optionally run the app). Await approval before Phase 2.

---

## Phase 2 — Roll out (expand into full TDD tasks after pilot approval)

Apply the Task 1.2 + 1.3 pattern to each remaining tracker. Concrete targets (current score → goal ≥ 9.0):

- [ ] `BeauticianTracker.tsx` (8.55) — hook + split; shares timeline vocab with Electrician.
- [ ] `ConstructionTracker.tsx` (8.54) — hook + split.
- [ ] `CrewBookingTracker.tsx` (8.2) — hook where applicable (crew has extra escrow state; keep crew-specific logic local).
- [ ] `VehicleTracker.tsx` (7.36, cc 58) — hook + aggressive split (worst after Electrician).
- [ ] `RideBookingFlow.tsx` (7.92, cc 22) — split into step components.
- [ ] `ConstructionBookingFlow.tsx` (8.15), `ServiceBookingFlow.tsx` (8.41), `CategorySlugPageClient.tsx` (8.09), `AddressPicker.tsx` (7.99, cc 61) — decompose long functions / extract complex conditionals.
- [ ] Remaining vehicle/accommodation flows (Transport/Repair/Rental/Accommodation) — hook + split as needed.

Each: baseline score → migrate → typecheck → new score ≥ 9.0 → `pnpm test` → commit. One tracker per commit.

## Phase 3 — captain-live.tsx (partner)

- [ ] Extract inline `JobsTab`, `EnrouteScreen`, `ProfileTab` into `apps/partner/app/dashboard/_live/` sub-files.
- [ ] Collapse `PanelStat` + `MiniStat` → one `<Stat variant>` primitive.
- [ ] Collapse `onArrived` + `onRelease` → one parameterized handler.
- [ ] `pnpm --filter partner typecheck` → PASS; CodeScene score 7.0 → ≥ 9.0, no Brain-Class warning.
- [ ] Commit `refactor: break up captain-live into focused components`.

## Final verification

- [ ] `pnpm typecheck` and `pnpm test` green across the repo.
- [ ] CodeScene `analyze_change_set` vs `main` — no `degraded` verdicts.
- [ ] No `booking: any` remaining in the tracker family (`grep -rn "booking: any" apps/customer/components`).

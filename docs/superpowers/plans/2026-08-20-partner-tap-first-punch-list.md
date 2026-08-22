# Partner tap-first redesign — punch list Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear every item on `.superpowers/sdd/2026-08-19-partner-tap-first-redesign/HANDOFF.md`'s punch list (3 Criticals, 8 Importants, plus the named minors) so the tap-first Partner redesign on `feat/m2-workforce-projects` is merge-ready.

**Architecture:** No new subsystems. Every task is a targeted fix inside the already-built tap-first surface (`frontend/apps/partner`) — gate a tile on a grant, filter a list, add one route that mounts an already-built screen, restore one form control. Nothing here changes the IA, the token system, or the pictogram set the redesign already established.

**Tech Stack:** Next.js App Router (TypeScript, `"use client"` feature components + server route files), TanStack Query (`@vsolve/query`), Tailwind v4 with the app's closed token set (`@vsolve/ui/tokens.css`), Vitest (tests are written, never executed — see Global Constraints), Django/DRF backend (one file, read-only reference for Task 10).

**Spec:** `.superpowers/sdd/2026-08-19-partner-tap-first-redesign/HANDOFF.md` (the punch list this plan clears) and `.superpowers/sdd/2026-08-19-partner-tap-first-redesign/progress.md` (the full execution record of the 14-task plan that built the surface this punch list repairs — do not re-run that plan).

## Global Constraints

- **Never `git commit`.** Every task ends with `git add` only. The user commits when they choose to.
- **Never run the test suite** (no `vitest`, no `playwright`). Write test code as part of a task's steps; do not execute it. The only commands you may run are `pnpm --filter partner typecheck` and `pnpm --filter partner lint` — these are static gates, not test runs, and are allowed after every task.
- **Never push to `main`.** All work stays on `feat/m2-workforce-projects`.
- **No raw color literals in application code.** Colour is a closed set of token utilities (`bg-text/13`, `fill-text/12`, etc.) — never a hex or `rgb()` literal, except where Tailwind's own arbitrary-value syntax cannot express a token+opacity combination (flagged explicitly in Task 2 where this applies).
- **44px is the touch-target floor.** `size="sm"` (36px, `@vsolve/ui`'s `button.tsx:88-90`) is documented as "never for a customer or partner action on a phone" — only `size="md"` (44px) or larger belongs on a partner-facing control.
- **Verify against real source, never against this plan's prose.** Every code excerpt below was read from the file on disk at plan-writing time; if a task's step doesn't match what you see in the file when you open it, trust the file and adjust — then note the discrepancy when you report the task back.
- **Two items already decided by the owner, not open questions:** C1 (Task 7) ships as a new route, not a revived redirect. C3 (Task 8) ships today with a free-text reason textarea, not a reason-code enum.
- **Two items explicitly out of scope for this plan**, left as follow-ups: (a) the pre-existing `PARTIAL`-outcome quantity bug in `backend/apps/fulfilment/completion.py` (the frontend always sends `quantity: task.quantity`, so `unperformed_qty` is always `0` — Task 10 fixes the *missing reason*, not this) and (b) `/dashboard` occurrences outside the three named in Task 3 (`app/error.tsx:38`, `app/(marketing)/layout.tsx:16`, `app/robots.ts:11`, `features/application/view/application-overview.tsx:135`, and the dead `BASE_NAV`/`navigationFor` in `features/workspace/registry.ts`).

---

## Task 1: C2 — gate the Crew tile and the crew-offer recovery action on the A3 grant

**Files:**
- Modify: `frontend/apps/partner/features/session/view/me-home.tsx`
- Modify: `frontend/apps/partner/features/crew-offer/view/offer-detail-screen.tsx`
- Test: `frontend/apps/partner/features/session/view/me-home.test.tsx` (create — no test file exists for this component today)

**Interfaces:**
- Consumes: `usePartnerWorkspaceGrants()` from `@/features/workspace/queries` (already resolved by `PartnerShell`, so this is a cache hit — see `features/session/partner-shell.tsx:166-168`); `hasWorkspaceAction(grants, workspaceKey, action)` from `@vsolve/query`; `WORKFORCE_WORKSPACE` from `@/features/workspace/registry`.
- Produces: nothing new — this task only adds a condition around existing JSX.

- [ ] **Step 1: Write the test for `MeHome`'s Crew tile gating (do not execute — see Global Constraints)**

Create `frontend/apps/partner/features/session/view/me-home.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/workspace/queries", () => ({
  usePartnerWorkspaceGrants: vi.fn(),
}));
vi.mock("@vsolve/query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vsolve/query")>()),
  useLogout: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/features/presence/view/partner-presence", () => ({
  PartnerPresence: () => null,
}));
vi.mock("@/lib/api/browser", () => ({ getApiClient: vi.fn() }));

import { usePartnerWorkspaceGrants } from "@/features/workspace/queries";
import { MeHome } from "./me-home";

function renderMeHome() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MeHome />
    </QueryClientProvider>,
  );
}

describe("MeHome's Crew tile", () => {
  it("is hidden when the Partner holds no A3 crew.manage grant", () => {
    vi.mocked(usePartnerWorkspaceGrants).mockReturnValue({
      grants: [],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    renderMeHome();

    expect(screen.queryByRole("link", { name: "Crew" })).not.toBeInTheDocument();
  });

  it("is shown when the Partner holds A3 crew.manage", () => {
    vi.mocked(usePartnerWorkspaceGrants).mockReturnValue({
      grants: [{ workspace_key: "A3_TIME_BLOCK", actions: ["crew.manage"] }],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    renderMeHome();

    expect(screen.getByRole("link", { name: "Crew" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Gate the Crew tile in `me-home.tsx`**

Add the import (after the existing `@/features/presence/view/partner-presence` import, alphabetically before `@/lib/api/browser`):

```tsx
import { hasWorkspaceAction } from "@vsolve/query";

import { usePartnerWorkspaceGrants } from "@/features/workspace/queries";
import { WORKFORCE_WORKSPACE } from "@/features/workspace/registry";
```

Inside `MeHome()`, add the grants read right after the existing `useLogout` line:

```tsx
export function MeHome() {
  const logout = useLogout(getApiClient());
  const grants = usePartnerWorkspaceGrants();
  const canManageCrew = hasWorkspaceAction(grants.grants ?? [], WORKFORCE_WORKSPACE, "crew.manage");
```

Then change the Crew tile line from:

```tsx
        <MeTile href="/me/crew" icon="crew" label="Crew" />
```

to:

```tsx
        {canManageCrew ? <MeTile href="/me/crew" icon="crew" label="Crew" /> : null}
```

- [ ] **Step 3: Gate `AcceptRefusal`'s "Go to your crew" recovery action in `offer-detail-screen.tsx`**

Add the same import pattern near the top of the file (alongside its existing imports):

```tsx
import { hasWorkspaceAction } from "@vsolve/query";

import { usePartnerWorkspaceGrants } from "@/features/workspace/queries";
import { WORKFORCE_WORKSPACE } from "@/features/workspace/registry";
```

At the call site (around line 244-248, inside the component that already has `const router = useRouter();` at line 181), add a grants read and pass a boolean down instead of an unconditional handler:

```tsx
  const grants = usePartnerWorkspaceGrants();
  const canManageCrew = hasWorkspaceAction(grants.grants ?? [], WORKFORCE_WORKSPACE, "crew.manage");
```

```tsx
      {accept.error ? (
        <div className="px-4 pt-4">
          <AcceptRefusal
            error={accept.error}
            onGoToCrew={canManageCrew ? () => router.push("/me/crew") : null}
          />
        </div>
      ) : null}
```

Update `AcceptRefusal`'s signature and its one call site inside itself (around lines 490-509):

```tsx
function AcceptRefusal({
  error,
  onGoToCrew,
}: {
  readonly error: unknown;
  readonly onGoToCrew: (() => void) | null;
}) {
  const presentation = describeError(error, "mutation");

  if (isRosterInsufficient(error)) {
    return (
      <ErrorState
        inline
        title="Your verified crew is smaller than this job"
        message="Vsolve sends one lead who is accountable for the whole crew, so we never make the numbers up from another agency. Add the people you would actually send and get them verified — you will be offered this size of job again."
        severity="warning"
        actionLabel={onGoToCrew ? "Go to your crew" : undefined}
        onAction={onGoToCrew ?? undefined}
      />
    );
  }
```

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm --filter partner typecheck`
Run: `pnpm --filter partner lint`
Both must pass with no new errors before staging.

- [ ] **Step 5: Stage**

```bash
git add frontend/apps/partner/features/session/view/me-home.tsx frontend/apps/partner/features/session/view/me-home.test.tsx frontend/apps/partner/features/crew-offer/view/offer-detail-screen.tsx
```

---

## Task 2: I5 + I6 + I8 — same-day mechanical fixes (colour tokens, button sizes, language picker)

**Files:**
- Modify: `frontend/apps/partner/features/work-stack/view/work-home.tsx`
- Modify: `frontend/apps/partner/features/crew/view/crew-roster.tsx`
- Modify: `frontend/apps/partner/features/earnings/view/earnings-panel.tsx`
- Modify: `frontend/apps/partner/features/session/partner-shell.tsx`
- Modify: `frontend/apps/partner/features/session/view/language-picker.tsx`
- Test: `frontend/apps/partner/features/session/view/language-picker.test.tsx` (create)

**Interfaces:** None — every change here is local styling/markup, no new exports or props.

- [ ] **Step 1: I5 — replace the two raw colour literals in `work-home.tsx`**

`CountdownDial` (currently `bg-[rgb(0_17_46/0.13)]`) — this is the `text` token, and the codebase's own established pattern for token+opacity on a `bg-`/`fill-`/`stroke-` utility is `bg-text/13` (see `offer-detail-screen.tsx`'s `CountdownRing`, which uses `fill-text/12`/`stroke-text/18` with the doc comment banning raw literals). Change:

```tsx
    <span className="grid h-13.5 w-13.5 shrink-0 place-items-center rounded-full bg-[rgb(0_17_46/0.13)]">
```

to:

```tsx
    <span className="grid h-13.5 w-13.5 shrink-0 place-items-center rounded-full bg-text/13">
```

`LiveOfferCard`'s shadow (`shadow-[0_4px_12px_rgb(214_94_0/0.32)]`) is the one case a token utility genuinely cannot express: Tailwind's `shadow-*` utilities take a full box-shadow value, and there is no `shadow-action-active/32`-style syntax the way there is for `bg-`/`fill-`/`stroke-`. Use `color-mix` against the token itself instead of the raw `rgb()` triple, which keeps the token as the single source of truth even though the utility stays an arbitrary value:

```tsx
          : "bg-[linear-gradient(135deg,var(--color-signal-400)_0%,var(--color-action)_55%,var(--color-action-active)_100%)] shadow-[0_4px_12px_rgb(214_94_0/0.32)]",
```

to:

```tsx
          : "bg-[linear-gradient(135deg,var(--color-signal-400)_0%,var(--color-action)_55%,var(--color-action-active)_100%)] shadow-[0_4px_12px_color-mix(in_oklab,var(--color-action-active)_32%,transparent)]",
```

- [ ] **Step 2: I6 — drop `size="sm"` from the four partner-phone action buttons**

In `frontend/apps/partner/features/crew/view/crew-roster.tsx`, remove `size="sm"` from the two `Button` usages (leave `CrewAvatar`'s own `size="sm"` prop at line 161 untouched — that's an avatar size, not a touch target):

```tsx
            <Button size="sm" onClick={onAdd}>
              Add someone
            </Button>
```
→
```tsx
            <Button onClick={onAdd}>
              Add someone
            </Button>
```

```tsx
      <Button
        variant="ghost"
        size="sm"
        loading={pending}
        loadingLabel="Archiving"
        onClick={() => setConfirming(true)}
      >
        Archive
      </Button>
```
→
```tsx
      <Button
        variant="ghost"
        loading={pending}
        loadingLabel="Archiving"
        onClick={() => setConfirming(true)}
      >
        Archive
      </Button>
```

In `frontend/apps/partner/features/earnings/view/earnings-panel.tsx` (leave the three `<Spinner size="sm" />` usages untouched — `Spinner` has no touch-target concern):

```tsx
            <Button
              variant="outline"
              size="sm"
              icon={<Pictogram name="more" className="h-3.5 w-3.5" />}
              loading={ledger.isFetchingNextPage}
              loadingLabel="Loading"
              onClick={() => void ledger.fetchNextPage()}
            >
              Load more
            </Button>
```
→
```tsx
            <Button
              variant="outline"
              icon={<Pictogram name="more" className="h-3.5 w-3.5" />}
              loading={ledger.isFetchingNextPage}
              loadingLabel="Loading"
              onClick={() => void ledger.fetchNextPage()}
            >
              Load more
            </Button>
```

In `frontend/apps/partner/features/session/partner-shell.tsx` (leave the three `<Spinner size="sm" />` usages untouched):

```tsx
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logout.mutate()}
              loading={logout.isPending}
              loadingLabel="Signing out"
            >
              Sign Out
            </Button>
```
→
```tsx
            <Button
              variant="ghost"
              onClick={() => logout.mutate()}
              loading={logout.isPending}
              loadingLabel="Signing out"
            >
              Sign Out
            </Button>
```

`project-invitation-banner.tsx` has no `size="sm"` on a `Button`/`buttonStyles` call today (it uses `buttonStyles({ size: "sm" })` on line 46) — Task 6 deletes this component's mount entirely, so leave its own `size="sm"` alone here; it becomes moot once Task 6 lands.

- [ ] **Step 3: I8 — persist the language choice and name the confirm button**

In `frontend/apps/partner/features/session/view/language-picker.tsx`, change the initial state to read the saved value:

```tsx
  const [selected, setSelected] = useState<Locale>(DEFAULT_LOCALE);
```

to:

```tsx
  const [selected, setSelected] = useState<Locale>(() => {
    if (typeof window === "undefined") return DEFAULT_LOCALE;
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return OPTIONS.some((option) => option.code === saved) ? (saved as Locale) : DEFAULT_LOCALE;
  });
```

Give the confirm button an accessible name — it currently contains only an `aria-hidden` `Pictogram`:

```tsx
        <button
          type="button"
          onClick={() => {
            window.localStorage.setItem(LOCALE_STORAGE_KEY, selected);
            router.back();
          }}
          className="flex h-22 w-full items-center justify-center rounded-[22px] bg-success-text shadow-[0_4px_0_var(--color-success-active)]"
        >
          <Pictogram name="go" className="h-11.5 w-11.5 text-surface" />
        </button>
```

to:

```tsx
        <button
          type="button"
          aria-label="Confirm language"
          onClick={() => {
            window.localStorage.setItem(LOCALE_STORAGE_KEY, selected);
            router.back();
          }}
          className="flex h-22 w-full items-center justify-center rounded-[22px] bg-success-text shadow-[0_4px_0_var(--color-success-active)]"
        >
          <Pictogram name="go" className="h-11.5 w-11.5 text-surface" />
        </button>
```

- [ ] **Step 4: Write the test for language persistence (do not execute — see Global Constraints)**

Create `frontend/apps/partner/features/session/view/language-picker.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

import { LanguagePicker } from "./language-picker";

describe("LanguagePicker", () => {
  beforeEach(() => {
    vi.mocked(useRouter).mockReturnValue({ back: vi.fn() } as never);
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("preselects the previously saved language", () => {
    window.localStorage.setItem("vsh-partner-locale", "hi-IN");

    render(<LanguagePicker />);

    expect(screen.getByRole("button", { name: "हिन्दी" })).toHaveAttribute("aria-pressed", "true");
  });

  it("falls back to the default when nothing is saved", () => {
    render(<LanguagePicker />);

    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
  });

  it("names the confirm button", () => {
    render(<LanguagePicker />);

    expect(screen.getByRole("button", { name: "Confirm language" })).toBeInTheDocument();
  });
});
```

Note: this test assumes each language option button carries `aria-pressed` reflecting `selected === option.code` — if the current markup (lines 47-64, not fully reproduced in this plan) does not already set `aria-pressed`, add it there as part of this step so the test is meaningful; the button's own `onClick={() => setSelected(option.code)}` is already present, only the `aria-pressed` attribute may need adding.

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm --filter partner typecheck`
Run: `pnpm --filter partner lint`

- [ ] **Step 6: Stage**

```bash
git add frontend/apps/partner/features/work-stack/view/work-home.tsx frontend/apps/partner/features/crew/view/crew-roster.tsx frontend/apps/partner/features/earnings/view/earnings-panel.tsx frontend/apps/partner/features/session/partner-shell.tsx frontend/apps/partner/features/session/view/language-picker.tsx frontend/apps/partner/features/session/view/language-picker.test.tsx
```

---

## Task 3: `/dashboard` → `/work` — the three named hardcodes and their tests

**Files:**
- Modify: `frontend/apps/partner/features/workspace/model/session-guard.ts`
- Modify: `frontend/apps/partner/features/session/partner-shell.tsx`
- Modify: `frontend/apps/partner/features/session/model/redirect.ts`
- Modify: `frontend/apps/partner/features/session/model/redirect.test.ts`
- Modify: `frontend/apps/partner/features/workspace/model/session-guard.test.ts`
- Modify: `frontend/apps/partner/features/workspace/view/capability-notice.test.tsx`
- Modify: `frontend/apps/partner/features/workspace/view/workspace-route.test.tsx`

**Not in scope here:** `features/workspace/registry.test.ts:65,161,201` also asserts a literal `"/dashboard"`, but those three assertions test `BASE_NAV`/`navigationFor`/`activeWorkspace` — a separate, already-dead hardcoded array in `registry.ts` (confirmed unrelated to `RECOVERY_HREF`; `registry.ts`'s own `BASE_NAV`/`navigationFor` are unreachable per the Global Constraints out-of-scope list). Leave that file untouched.

**Interfaces:** None — `RECOVERY_HREF` stays a `string` constant, `homeForApplication`'s return type narrows from `"/apply" | "/dashboard"` to `"/apply" | "/work"`; no caller destructures the literal type, only reads the value, so this is not a breaking signature change for any consumer outside this task.

- [ ] **Step 1: `session-guard.ts` — repoint `RECOVERY_HREF` and its doc comment**

```ts
export const RECOVERY_HREF = "/dashboard";
```
→
```ts
export const RECOVERY_HREF = "/work";
```

And in the module docblock above it (the "Fail closed, and never towards Jobs" section):

```
 * And the recovery is **never** `/jobs`. `/jobs` is the A1 task-service
 * lifecycle. Landing a workforce agency there after a suspension tells them
 * their shifts became jobs, which is both false and precisely the record-erasure
 * `M2-FE-111` forbids. `/dashboard` is the base app every Partner holds and the
 * only honest destination.
```
→
```
 * And the recovery is **never** `/jobs`. `/jobs` is the A1 task-service
 * lifecycle. Landing a workforce agency there after a suspension tells them
 * their shifts became jobs, which is both false and precisely the record-erasure
 * `M2-FE-111` forbids. `/work` is the base app every Partner holds — the
 * one WORK stack, gated on nothing but approval — and the only honest
 * destination. `/dashboard` no longer exists; the tap-first IA replaced it.
```

Also update `/** The base app... */` right above the constant:

```ts
/** The base app, which every Partner holds regardless of any M2 capability. */
export const RECOVERY_HREF = "/work";
```

- [ ] **Step 2: `partner-shell.tsx` — repoint the header logo link**

```tsx
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
```
→
```tsx
          <Link
            href="/work"
            className="flex items-center gap-2 rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
```

- [ ] **Step 3: `redirect.ts` — repoint `homeForApplication`**

```ts
export function homeForApplication(status: Status | null): "/apply" | "/dashboard" {
  if (status === null || UNFINISHED.includes(status)) return "/apply";
  return "/dashboard";
}
```
→
```ts
export function homeForApplication(status: Status | null): "/apply" | "/work" {
  if (status === null || UNFINISHED.includes(status)) return "/apply";
  return "/work";
}
```

- [ ] **Step 4: update the two test files' assertions (do not execute — see Global Constraints)**

In `redirect.test.ts`, lines 76-80:

```ts
    expect(homeForApplication("SUBMITTED")).toBe("/dashboard");
    expect(homeForApplication("UNDER_REVIEW")).toBe("/dashboard");
    expect(homeForApplication("APPROVED")).toBe("/dashboard");
    expect(homeForApplication("SUSPENDED")).toBe("/dashboard");
    expect(homeForApplication("OFFBOARDED")).toBe("/dashboard");
```
→
```ts
    expect(homeForApplication("SUBMITTED")).toBe("/work");
    expect(homeForApplication("UNDER_REVIEW")).toBe("/work");
    expect(homeForApplication("APPROVED")).toBe("/work");
    expect(homeForApplication("SUSPENDED")).toBe("/work");
    expect(homeForApplication("OFFBOARDED")).toBe("/work");
```

In `session-guard.test.ts`, line 160:

```ts
    expect(RECOVERY_HREF).toBe("/dashboard");
```
→
```ts
    expect(RECOVERY_HREF).toBe("/work");
```

Two more test files assert the literal `"/dashboard"` and both derive it from `RECOVERY_HREF` at runtime (not an independent hardcode), so both go stale the moment Step 1 lands:

In `capability-notice.test.tsx`, line 46 (inside `it("sends a withdrawn Partner to the base app", ...)`, which renders `<CapabilityNotice recovery={recoveryFor({ kind: "WITHDRAWN" })} />` — `recoveryFor` builds its `href` from `RECOVERY_HREF`, `session-guard.ts:158`):

```ts
    expect(screen.getByRole("link", { name: /home screen/i })).toHaveAttribute(
      "href",
      "/dashboard",
    );
```
→
```ts
    expect(screen.getByRole("link", { name: /home screen/i })).toHaveAttribute(
      "href",
      "/work",
    );
```

In `workspace-route.test.tsx`, line 125 (asserts a rendered link's `href`, inside a test that renders the "no longer on your account" recovery state) and line 201 (asserts `router.replace` was called with `RECOVERY_HREF`'s value, per `workspace-route.tsx:63: if (mustLeave) router.replace(RECOVERY_HREF);`):

```ts
    expect(hrefs).toContain("/dashboard");
```
→
```ts
    expect(hrefs).toContain("/work");
```

```ts
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
```
→
```ts
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/work"));
```

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm --filter partner typecheck`
Run: `pnpm --filter partner lint`

- [ ] **Step 6: Stage**

```bash
git add frontend/apps/partner/features/workspace/model/session-guard.ts frontend/apps/partner/features/workspace/model/session-guard.test.ts frontend/apps/partner/features/workspace/view/capability-notice.test.tsx frontend/apps/partner/features/workspace/view/workspace-route.test.tsx frontend/apps/partner/features/session/partner-shell.tsx frontend/apps/partner/features/session/model/redirect.ts frontend/apps/partner/features/session/model/redirect.test.ts
```

---

## Task 4: I1 — surface a sent quote as an "I answered" card

**Files:**
- Modify: `frontend/apps/partner/features/work-stack/model/work-item.ts`
- Modify: `frontend/apps/partner/features/work-stack/model/work-item.test.ts`

**Interfaces:**
- Consumes: `bucketOf` and `EnquiryBucket` from `@/features/enquiry/model/enquiry-state` (already imported in this file); `EnquirySummary` type (already imported).
- Produces: a new function `fromQuotedEnquiries(enquiries: readonly EnquirySummary[]): WorkItem[]`, merged into `toWorkItems` alongside the existing five source functions.

- [ ] **Step 1: Write the failing test (do not execute — see Global Constraints)**

Add to `work-item.test.ts`, near the existing enquiry-related tests (find the `describe` block that tests `fromEnquiries`/`isVendorsMove` behavior and add alongside it):

```ts
describe("a sent quote", () => {
  it("becomes a settled card instead of disappearing", () => {
    const quoted = enquiry({ id: "e1", status: "QUOTED" });

    const items = toWorkItems({ ...EMPTY, enquiries: [quoted] });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      key: "enquiry:e1",
      urgency: "settled",
      respondsBy: null,
    });
  });

  it("carries a distinct accessible name from a still-open enquiry", () => {
    const quoted = enquiry({ id: "e1", status: "QUOTED", service_name: "Deep clean" });

    const items = toWorkItems({ ...EMPTY, enquiries: [quoted] });

    expect(items[0]?.accessibleName).toBe("Deep clean, quote sent");
  });

  it("does not also appear as a needs-price card", () => {
    const quoted = enquiry({ id: "e1", status: "QUOTED" });

    const items = toWorkItems({ ...EMPTY, enquiries: [quoted] });

    expect(items.filter((item) => item.key === "enquiry:e1")).toHaveLength(1);
  });
});
```

This assumes an `enquiry()` fixture builder already exists in this test file (the report on `work-item.test.ts` confirms a `job()` builder exists in the same style — reuse or mirror whatever the existing `enquiry()`/equivalent builder is named; if none exists yet, add one modeled on the shape `fromEnquiries` already reads: `{ id, status, service_name, responds_by, requested_start }`).

- [ ] **Step 2: Add `fromQuotedEnquiries` in `work-item.ts`**

Directly after the existing `fromEnquiries` function (lines 260-282):

```typescript
/**
 * Whether this vendor already answered and is waiting on the customer.
 *
 * `quoted` is the one bucket `isVendorsMove` excludes on purpose — the ball is
 * with the customer, not this vendor (see that function's own doc comment).
 * But it is still this vendor's own sent price, and dropping it from the stack
 * entirely left no card at all for "I answered" — one of the four states the
 * module doc at the top of this file promises. It reads as `settled`: green,
 * done-my-part, no clock running, because there genuinely is nothing left for
 * this vendor to do until the customer moves.
 */
function isQuotedByVendor(enquiry: EnquirySummary): boolean {
  return bucketOf(enquiry.status) === "quoted";
}

function fromQuotedEnquiries(enquiries: readonly EnquirySummary[]): WorkItem[] {
  return enquiries.filter(isQuotedByVendor).map((enquiry) => ({
    kind: "enquiry" as const,
    key: `enquiry:${enquiry.id}`,
    href: ENQUIRY_HREF(enquiry.id),
    amountPaise: null,
    urgency: "settled" as const,
    respondsBy: null,
    whenIso: enquiry.requested_start,
    areaLabel: null,
    accessibleName: `${enquiry.service_name}, quote sent`,
  }));
}
```

`bucketOf` returns exactly one of `"needs_response" | "accepted" | "quoted" | "closed"` per enquiry, so `isVendorsMove` (which only matches `"needs_response"`/`"accepted"`) and `isQuotedByVendor` (which only matches `"quoted"`) never both match the same enquiry — the `enquiry:${id}` key from `fromQuotedEnquiries` cannot collide with one from `fromEnquiries`.

- [ ] **Step 3: Merge the new source into `toWorkItems` and fix the stale comment**

In the merge block (around lines 453-473):

```typescript
    ...fromDirectOffers(sources.directOffers),
    ...fromEnquiries(sources.enquiries),
    ...fromEngagements(sources.engagements),
    ...fromJobs(sources.jobs),
```
→
```typescript
    ...fromDirectOffers(sources.directOffers),
    ...fromEnquiries(sources.enquiries),
    ...fromQuotedEnquiries(sources.enquiries),
    ...fromEngagements(sources.engagements),
    ...fromJobs(sources.jobs),
```

And the stale doc comment at line 425:

```typescript
/**
 * Merges the four source lists into one sorted stack.
```
→
```typescript
/**
 * Merges the six source lists into one sorted stack.
```

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm --filter partner typecheck`
Run: `pnpm --filter partner lint`

- [ ] **Step 5: Stage**

```bash
git add frontend/apps/partner/features/work-stack/model/work-item.ts frontend/apps/partner/features/work-stack/model/work-item.test.ts
```

---

## Task 5: I2 — a settled job leaves the stack after 24h

**Files:**
- Modify: `frontend/apps/partner/features/work-stack/model/work-item.ts`
- Modify: `frontend/apps/partner/features/work-stack/model/work-item.test.ts`
- Modify: `frontend/apps/partner/features/work-stack/queries.ts` (comment fix only)

**Interfaces:**
- Consumes: `job.server_now` (a required, non-nullable ISO string field on `PartnerVisit` = `Schemas["PartnerBooking"]`, confirmed in `contracts/openapi/v1.yaml` — every `PartnerBooking` payload carries its own trusted clock reading, the same field already used elsewhere for `offersServerNow`-style clock-skew safety).
- Produces: `isRecentlySettled(job: PartnerVisit): boolean`, used only inside `fromJobs`.

- [ ] **Step 1: Write the failing test (do not execute — see Global Constraints)**

Add to `work-item.test.ts`, near the existing job-sorting test (the one at lines 553-570 that already builds an `"old"` job at `2026-08-10` and a `"recent"` one at `2026-08-18` against `NOW = "2026-08-19T10:00:00Z"`):

```ts
describe("a settled job older than 24h", () => {
  it("drops off the stack", () => {
    const items = toWorkItems({
      ...EMPTY,
      jobs: [
        job({ id: "old", status: "COMPLETED", scheduled_start: "2026-08-10T09:00:00Z" }),
        job({ id: "recent", status: "PARTIALLY_COMPLETED", scheduled_start: "2026-08-18T09:00:00Z" }),
      ],
    });

    expect(items.map((item) => item.key)).toEqual(["job:recent"]);
  });

  it("stays while a job in progress is unaffected by the window", () => {
    const items = toWorkItems({
      ...EMPTY,
      jobs: [
        job({ id: "old-doing", status: "IN_PROGRESS", scheduled_start: "2026-08-10T09:00:00Z" }),
        job({ id: "old-done", status: "COMPLETED", scheduled_start: "2026-08-10T09:00:00Z" }),
      ],
    });

    expect(items.map((item) => item.key)).toEqual(["job:old-doing"]);
  });
});
```

`job()`'s default `server_now` is `NOW` (`"2026-08-19T10:00:00Z"`, confirmed at line 152 of the existing builder), so both fixtures above use it unmodified — `"old"` is ~9 days before `NOW` and drops, `"recent"` is ~1 day before and stays.

- [ ] **Step 2: Add the 24h filter to `fromJobs` in `work-item.ts`**

Add the window constant and predicate near `SETTLED_VISIT_STATUS` (lines 381-384):

```typescript
const SETTLED_VISIT_STATUS: ReadonlySet<VisitStatus> = new Set<VisitStatus>([
  "COMPLETED",
  "PARTIALLY_COMPLETED",
]);

const SETTLED_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * A settled job stays on the stack for 24h, then drops off — otherwise every
 * job a Partner has ever finished becomes a permanent green tail and
 * `EmptyWork` ("Nothing today") is unreachable for anyone with history.
 *
 * `scheduled_start` is the closest instant `PartnerVisit` publishes for a
 * finished job — there is no separate completed-at timestamp on the wire
 * today, so this is measured from when the job was due to start, not from
 * when it was actually marked done. `server_now` (not the browser's clock)
 * is the reference instant, the same clock-skew guard `offersServerNow` gives
 * the crew-offer countdown.
 */
function isRecentlySettled(job: PartnerVisit): boolean {
  const scheduled = new Date(job.scheduled_start).getTime();
  const now = new Date(job.server_now).getTime();
  if (Number.isNaN(scheduled) || Number.isNaN(now)) return true;
  return now - scheduled < SETTLED_WINDOW_MS;
}
```

Change the filter in `fromJobs` (line 396):

```typescript
    .filter((job) => DOING_VISIT_STATUS.has(job.status) || SETTLED_VISIT_STATUS.has(job.status))
```
→
```typescript
    .filter(
      (job) =>
        DOING_VISIT_STATUS.has(job.status) ||
        (SETTLED_VISIT_STATUS.has(job.status) && isRecentlySettled(job)),
    )
```

- [ ] **Step 3: Fix the stale source-count comments in `queries.ts`**

```typescript
 * The merged, sorted WORK stack. Composes four already-existing queries —
 * no new network call is added; TanStack dedupes each by its existing
 * query key exactly as `LiveOfferSheet` already relies on for the offers
 * query alone.
 *
 * Loading is "any source still pending"; error is "any source errored",
 * surfaced as the first error found — a screen showing four independent
 * spinners/errors for one merged list would contradict the entire point of
 * merging it.
 *
 * ## The four sources publish three different envelopes, and each is unwrapped
 *    where the hook that owns it actually puts the rows
```
→
```typescript
 * The merged, sorted WORK stack. Composes six already-existing queries —
 * no new network call is added; TanStack dedupes each by its existing
 * query key exactly as `LiveOfferSheet` already relies on for the offers
 * query alone.
 *
 * Loading is "any source still pending"; error is "any source errored",
 * surfaced as the first error found — a screen showing six independent
 * spinners/errors for one merged list would contradict the entire point of
 * merging it.
 *
 * ## The six queries publish three different envelopes, and each is unwrapped
 *    where the hook that owns it actually puts the rows
```

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm --filter partner typecheck`
Run: `pnpm --filter partner lint`

- [ ] **Step 5: Stage**

```bash
git add frontend/apps/partner/features/work-stack/model/work-item.ts frontend/apps/partner/features/work-stack/model/work-item.test.ts frontend/apps/partner/features/work-stack/queries.ts
```

---

## Task 6: I3 — drop `ProjectInvitationBanner` from `WorkHome`

**Files:**
- Modify: `frontend/apps/partner/features/work-stack/view/work-home.tsx`

**Interfaces:** None — this task only removes code and fixes two more stale "N sources" comments in the same file (found in the same pass a fresh reviewer would make on this file).

- [ ] **Step 1: Remove the banner mount and its now-unused imports**

Remove these three import lines (14, 17, 18):

```tsx
import { ProjectInvitationBanner } from "@/features/notifications/view/project-invitation-banner";
```
```tsx
import { usePartnerWorkspaceGrants } from "@/features/workspace/queries";
import { PROJECT_WORKSPACE, resolveWorkspaces } from "@/features/workspace/registry";
```

Confirmed by a grep of this file: `ProjectInvitationBanner`, `usePartnerWorkspaceGrants`, `PROJECT_WORKSPACE`, and `resolveWorkspaces` are used nowhere else in `work-home.tsx` — safe to delete outright, not just the mount site.

Inside `WorkStack()` (lines 176-216), remove the grants/`projectWorkspace` block and the banner JSX:

```tsx
function WorkStack() {
  const stack = useWorkStack();
  const performance = usePartnerPerformance();

  /*
    The A5 project workspace, resolved only so `ProjectInvitationBanner` can be
    handed the grant it needs. This is the same `usePartnerWorkspaceGrants`
    query the shell already runs, so TanStack serves it from cache rather than
    issuing a second request. The banner's prop is required and non-nullable,
    so a Partner without the A5 grant renders no banner at all rather than one
    holding a fabricated workspace — and the banner itself still re-checks
    `enquiry.view` on the grant before it reads the notification feed.
  */
  const grants = usePartnerWorkspaceGrants();
  const projectWorkspace =
    resolveWorkspaces(grants.grants ?? []).find(
      (workspace) => workspace.key === PROJECT_WORKSPACE,
    ) ?? null;

  return (
    <main className="flex min-h-[calc(100dvh-9rem)] flex-col bg-[linear-gradient(180deg,var(--color-warm-25)_0%,var(--color-canvas)_100%)]">
      {/* The screen is pictures and numbers; the landmark still needs a name. */}
      <h1 className="sr-only">Your work</h1>

      <TodayPlate netPaise={performance.data?.today_net_paise ?? null} />

      <div className="flex flex-1 flex-col gap-3.5 px-4 pt-3.5 pb-3">
        {/* An interrupt, so it sits above everything it interrupts — the same
            position it held on the A5 workspace home this screen replaces. It
            renders nothing at all when no project enquiry is waiting. */}
        {projectWorkspace ? <ProjectInvitationBanner workspace={projectWorkspace} /> : null}

        {/* The one presence control in the app, shared with `/me` rather than
            copied — see `PartnerPresence`'s own reasoning against a second one. */}
        <PartnerPresence />

        <StackBody stack={stack} />
      </div>
    </main>
  );
}
```
→
```tsx
function WorkStack() {
  const stack = useWorkStack();
  const performance = usePartnerPerformance();

  return (
    <main className="flex min-h-[calc(100dvh-9rem)] flex-col bg-[linear-gradient(180deg,var(--color-warm-25)_0%,var(--color-canvas)_100%)]">
      {/* The screen is pictures and numbers; the landmark still needs a name. */}
      <h1 className="sr-only">Your work</h1>

      <TodayPlate netPaise={performance.data?.today_net_paise ?? null} />

      <div className="flex flex-1 flex-col gap-3.5 px-4 pt-3.5 pb-3">
        {/* The one presence control in the app, shared with `/me` rather than
            copied — see `PartnerPresence`'s own reasoning against a second one. */}
        <PartnerPresence />

        <StackBody stack={stack} />
      </div>
    </main>
  );
}
```

`ProjectInvitationBanner`, its `INVITED`-enquiry filter, and `features/notifications/view/project-invitation-banner.tsx` itself are left in place (only unmounted here) — it is written generically enough (`workspace: ResolvedWorkspace` prop) that a future A5-specific surface could still use it; deleting the file is out of scope for this task.

- [ ] **Step 2: Fix the two remaining stale "N sources" comments in this file**

```tsx
 * It merges five queries and is all-or-nothing on both: one pending source
 * makes the whole hook pending, and one failed source empties `items` and sets
 * `error`. So there is one spinner and one error state here, never five — a
 * screen showing four working sources and quietly hiding the broken fifth would
 * tell a Partner they have no offers when the offers endpoint is down.
 *
 * No retry button: the hook composes six query objects and exposes no refetch,
```
→
```tsx
 * It merges six queries and is all-or-nothing on both: one pending source
 * makes the whole hook pending, and one failed source empties `items` and sets
 * `error`. So there is one spinner and one error state here, never six — a
 * screen showing five working sources and quietly hiding the broken sixth would
 * tell a Partner they have no offers when the offers endpoint is down.
 *
 * No retry button: the hook composes six query objects and exposes no refetch,
```

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm --filter partner typecheck`
Run: `pnpm --filter partner lint`

- [ ] **Step 4: Stage**

```bash
git add frontend/apps/partner/features/work-stack/view/work-home.tsx
```

---

## Task 7: C1 — a real route for the A5 delivery lifecycle

**Files:**
- Create: `frontend/apps/partner/app/work/jobs/[id]/stages/[stageId]/page.tsx`
- Modify: `frontend/apps/partner/features/work-stack/view/engagement-job-view.tsx`

**Interfaces:**
- Consumes: `ProjectEngagementScreen` from `@/features/engagement/view/engagement-screens` — already fully built (`{ engagementId }: EngagementDetailScreenProps`), already wraps `WorkspaceRoute workspaceKey={PROJECT_WORKSPACE} actions={["stage.submit_evidence"]}`, already renders the complete `EngagementDetail` (every stage, `AgreementPanel`, `AmendmentPanel`, `PayoutPanel`, `EngagementHistory`). Nothing in this task modifies `EngagementDetail`, `StagePanel`, `EvidenceComposer`, `AgreementPanel`, `AmendmentPanel`, or `PayoutPanel` — every one of them was already correct; only the missing route and the missing link are added.
- Produces: the URL `/work/jobs/[engagementId]/stages/[stageId]`.

**A scoping note, not a placeholder:** `EngagementDetail` takes only `engagementId` — it renders *every* stage of the engagement together with the agreement/amendment/payout panels, the same way the existing (and already-reachable) A3 route `/work/jobs/[id]/days/[stageId]` shows one shift-day in isolation but `EngagementJobView` at `/work/jobs/[id]` already shows the whole stage list. There is no narrower "one stage only" rendering path built anywhere in `features/engagement` today, and building one is a materially bigger change than this punch-list item calls for — `AgreementPanel`/`AmendmentPanel`/`PayoutPanel` are engagement-level facts, not stage-level ones, and repeating them per stage would be new UI, not a route fix. This task accepts `stageId` in the URL (for parity with the A3 link shape `engagement-job-view.tsx` already produces) but the page it renders is engagement-scoped, identical in shape to what `ProjectEngagementScreen` already delivers. That is the real fix the handoff asked for: every currently-stranded A5 panel becomes reachable from a stage row, in one dispatch.

- [ ] **Step 1: Create the route file**

`frontend/apps/partner/app/work/jobs/[id]/stages/[stageId]/page.tsx`:

```tsx
import type { Metadata } from "next";

import { PartnerShell } from "@/features/session/partner-shell";
import { ProjectEngagementScreen } from "@/features/engagement/view/engagement-screens";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Project stage",
  robots: { index: false, follow: false },
};

export default async function ProjectStagePage({
  params,
}: {
  params: Promise<{ id: string; stageId: string }>;
}) {
  const { id } = await params;

  return (
    <PartnerShell requirePartnerRole>
      <ProjectEngagementScreen engagementId={id} />
    </PartnerShell>
  );
}
```

This is an exact mirror of the existing `app/work/jobs/[id]/days/[stageId]/page.tsx` in shape (same `params` typing, same `PartnerShell requirePartnerRole` wrapper, same `dynamic`/`metadata` exports) — only the mounted screen differs.

- [ ] **Step 2: Link A5 stage rows to the new route in `engagement-job-view.tsx`**

Change the `href` ternary inside the `stages.map(...)` call (lines 103-114):

```tsx
          stages.map((stage) => (
            <StageRow
              key={stage.id}
              stage={stage}
              wording={wording}
              href={
                workforce && !isMaterialAdvance(stage)
                  ? `/work/jobs/${engagement.id}/days/${stage.id}`
                  : null
              }
            />
          ))
```
→
```tsx
          stages.map((stage) => (
            <StageRow
              key={stage.id}
              stage={stage}
              wording={wording}
              href={
                isMaterialAdvance(stage)
                  ? null
                  : workforce
                    ? `/work/jobs/${engagement.id}/days/${stage.id}`
                    : `/work/jobs/${engagement.id}/stages/${stage.id}`
              }
            />
          ))
```

The docblock's "Only A3 stages are links" section (lines 43-53) is now inaccurate — update it:

```tsx
 * ## Only A3 stages are links
 *
 * `/work/jobs/[id]/days/[stageId]` mounts `ShiftDayScreen`, which is wrapped in
 * `WorkspaceRoute workspaceKey={WORKFORCE_WORKSPACE}` and reads
 * `GET /engagement-stages/{id}/shift/`. An A5 vendor holds no A3 grant, so
 * linking a project stage there would hand them a refusal screen. Project stages
 * therefore render as rows rather than links: what they *are* is published on
 * this payload, what can be *done* to them lives on endpoints no tap-first
 * screen mounts yet. A material advance is never a link on either archetype —
 * it is money for cement, not a day of work, and there is no day screen behind
 * it.
```
→
```tsx
 * ## Every stage but a material advance is a link
 *
 * A3 stages go to `/work/jobs/[id]/days/[stageId]` (`ShiftDayScreen`, gated on
 * `WORKFORCE_WORKSPACE`). A5 stages go to `/work/jobs/[id]/stages/[stageId]`
 * (`ProjectEngagementScreen`, gated on `PROJECT_WORKSPACE`) — the whole
 * engagement's stage list, agreement, amendments and payouts, the same set of
 * panels `EngagementDetail` has always composed. A material advance is never a
 * link on either archetype — it is money for cement, not a day of work, and
 * there is no day screen behind it.
```

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm --filter partner typecheck`
Run: `pnpm --filter partner lint`

- [ ] **Step 4: Stage**

```bash
git add "frontend/apps/partner/app/work/jobs/[id]/stages/[stageId]/page.tsx" frontend/apps/partner/features/work-stack/view/engagement-job-view.tsx
```

---

## Task 8: C3 — a way to hand a job back

**Files:**
- Modify: `frontend/apps/partner/features/work-stack/view/visit-job-view.tsx`
- Create: `frontend/apps/partner/features/work-stack/view/visit-job-view.test.tsx` (confirmed absent — `frontend/apps/partner/**/*.test.tsx` has no match for this file today)

**Interfaces:**
- Consumes: `canAbort`, `canRelease`, `useAbortWork`, `useReleaseBooking` from `@/features/work/queries` (all already built, all currently unimported in this file). `useAbortWork()`/`useReleaseBooking()` both return a mutation whose `.mutate` takes `{ bookingId: string; expectedVersion: number; reason: string }` (the `ReasonedInput` shape at `features/work/queries.ts:213-215`).
- Produces: a new local component `ReleaseAction`, mounted conditionally in `VisitJobView`.

**Owner decision already made (see Global Constraints):** ship the free-text textarea today, styled and worded to match `work-panel.tsx`'s old `ReasonedAction` (same prompts, same 240-char cap) but built fresh in `visit-job-view.tsx` using this file's own `SecondaryAction`/raw-button conventions — `work-panel.tsx` itself is dead code (unreferenced by any route) and is not imported from.

- [ ] **Step 1: Write the test (do not execute — see Global Constraints)**

Add to (or create) `visit-job-view.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

import { VisitJobView } from "./visit-job-view";
import type { PartnerVisit } from "@/features/work/queries";

function confirmedVisit(overrides: Partial<PartnerVisit> = {}): PartnerVisit {
  return {
    id: "b1",
    fulfilment_unit_id: null,
    status: "CONFIRMED",
    version: 1,
    scheduled_start: "2026-08-20T09:00:00Z",
    estimated_duration_minutes: 60,
    en_route_at: null,
    arrived_at: null,
    customer_unavailable_wait_started_at: null,
    late_declared_at: null,
    work_tasks: [],
    evidence: [],
    active_amendment: null,
    earning: null,
    server_now: "2026-08-20T08:00:00Z",
    ...overrides,
  };
}

function renderVisit(visit: PartnerVisit) {
  vi.mocked(useRouter).mockReturnValue({ back: vi.fn() } as never);
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <VisitJobView visit={visit} />
    </QueryClientProvider>,
  );
}

describe("handing a job back", () => {
  it("offers the control while the job is still confirmed", () => {
    renderVisit(confirmedVisit());

    expect(screen.getByRole("button", { name: "Hand this job back" })).toBeInTheDocument();
  });

  it("requires a reason before the submit button enables", () => {
    renderVisit(confirmedVisit());

    screen.getByRole("button", { name: "Hand this job back" }).click();

    expect(screen.getByRole("button", { name: "Hand this job back" })).toBeDisabled();
  });

  it("offers 'Stop this job' instead once work is in progress", () => {
    renderVisit(confirmedVisit({ status: "IN_PROGRESS" }));

    expect(screen.getByRole("button", { name: "Stop this job" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hand this job back" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Import the missing hooks and predicates**

```tsx
import {
  canArrive,
  canGoEnRoute,
  canReportCompletion,
  canStartWork,
  useMarkArrived,
  useMarkCustomerUnavailable,
  useMarkEnRoute,
  useSubmitCompletion,
  useVerifyStartOtp,
  type OutcomeInput,
  type PartnerVisit,
  type VisitStatus,
} from "@/features/work/queries";
```
→
```tsx
import {
  canAbort,
  canArrive,
  canGoEnRoute,
  canRelease,
  canReportCompletion,
  canStartWork,
  useAbortWork,
  useMarkArrived,
  useMarkCustomerUnavailable,
  useMarkEnRoute,
  useReleaseBooking,
  useSubmitCompletion,
  useVerifyStartOtp,
  type OutcomeInput,
  type PartnerVisit,
  type VisitStatus,
} from "@/features/work/queries";
```

- [ ] **Step 3: Update the docblock's "what the canvas draws that is not here" section**

```tsx
 * 3. **Abort, release and the free-text reason they both require.** Both
 *    commands take a non-empty `reason` string, which is a paragraph of typing
 *    on a screen built for somebody who may not read comfortably. They are not
 *    dropped from the product — they are simply not on this screen, and that is
 *    a product decision recorded in this task's report rather than made silently
 *    here.
```
→
```tsx
 * 3. **Abort and release now carry a free-text reason on this screen.** Both
 *    commands take a non-empty `reason` string — a paragraph of typing on a
 *    screen built for somebody who may not read comfortably. Task 7's
 *    `CrewOfferOutcome` "do not travel yet" ruling already established the
 *    precedent that safety or consequence can justify prose on this redesign;
 *    handing back a job someone cannot get to is exactly that case, so
 *    `ReleaseAction` below carries the one textarea on this screen.
```

- [ ] **Step 4: Add the `ReleaseAction` component and mount it**

Add after `SecondaryAction` (after line 464, before `StatusMedallion`):

```tsx
/**
 * Stop or hand back — the one place on this screen prose is unavoidable.
 *
 * `canAbort` and `canRelease` are mutually exclusive (`IN_PROGRESS` vs.
 * `CONFIRMED`/`EN_ROUTE`/`ARRIVED`), so exactly one of the two commands is ever
 * live when this mounts, and the caption/prompt below follow whichever one is.
 */
function ReleaseAction({ visit }: { readonly visit: PartnerVisit }) {
  const abort = useAbortWork();
  const release = useReleaseBooking();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const aborting = canAbort(visit);
  const mutation = aborting ? abort : release;
  const label = aborting ? "Stop this job" : "Hand this job back";
  const prompt = aborting
    ? "Tell us what happened. Completed work is still settled — you will report it next."
    : "Tell us why so we can find a replacement quickly. There is no penalty for handing a job back.";
  const versioned = { bookingId: visit.id, expectedVersion: visit.version };

  if (!open) {
    return (
      <SecondaryAction
        icon="no"
        label={label}
        disabled={mutation.isPending}
        onClick={() => setOpen(true)}
      />
    );
  }

  return (
    <div className="rounded-card border border-line bg-surface p-3.5">
      {mutation.error ? <CommandFailure error={mutation.error} /> : null}
      <h4 className="text-sm font-bold text-text">{label}</h4>
      <p className="mt-1 text-sm leading-6 text-text-secondary">{prompt}</p>
      <textarea
        aria-label={label}
        className="mt-2 min-h-20 w-full rounded-control border border-line bg-surface-sunken p-2 text-sm text-text"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={240}
      />
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={reason.trim().length === 0 || mutation.isPending}
          onClick={() => mutation.mutate({ ...versioned, reason: reason.trim() })}
          className="flex h-11 flex-1 items-center justify-center rounded-2xl bg-danger-text px-4 text-sm font-bold text-surface disabled:opacity-60"
        >
          {label}
        </button>
        <button
          type="button"
          disabled={mutation.isPending}
          onClick={() => setOpen(false)}
          className="flex h-11 items-center justify-center rounded-2xl border border-line bg-surface-sunken px-4 text-sm font-bold text-text-muted disabled:opacity-60"
        >
          Back
        </button>
      </div>
    </div>
  );
}
```

Mount it in `VisitJobView`, after the "customer is not here" `SecondaryAction` block and before `CompletionReport` (lines 145-147):

```tsx
        {canReport(visit) ? <CompletionReport visit={visit} /> : null}
```
→
```tsx
        {canAbort(visit) || canRelease(visit) ? <ReleaseAction visit={visit} /> : null}

        {canReport(visit) ? <CompletionReport visit={visit} /> : null}
```

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm --filter partner typecheck`
Run: `pnpm --filter partner lint`

- [ ] **Step 6: Stage**

```bash
git add frontend/apps/partner/features/work-stack/view/visit-job-view.tsx frontend/apps/partner/features/work-stack/view/visit-job-view.test.tsx
```

---

## Task 9: I4 — a reachable profile screen

**Files:**
- Create: `frontend/apps/partner/app/me/profile/page.tsx`
- Modify: `frontend/apps/partner/features/profile/view/profile-panel.tsx`
- Modify: `frontend/apps/partner/features/session/view/me-home.tsx`

**Interfaces:**
- Consumes: `ProfilePanel` from `@/features/profile/view/profile-panel` (no props — calls `usePartnerProfile()` internally).
- Produces: the URL `/me/profile`, and a tap target on `MeHome`'s avatar that reaches it.

**Scoping note:** `ProfilePanel` predates the tap-first redesign — it uses `lucide-react` icons and `@vsolve/ui`'s `Button`/`Card` rather than the drawn `Pictogram` set and the rest of this app's tap-first visual language. Restyling it to match is a materially larger job than "make it reachable," and the handoff's own framing of I4 (Importance, not Critical; "each its own small task" in its suggested order) matches doing the reachability fix now and leaving a full visual pass for later. This task fixes only what's factually broken (three dead links) and adds the missing route + entry point.

- [ ] **Step 1: Fix `ProfilePanel`'s stale "Manage" links**

```tsx
      <Card className="p-5">
        <h2 className="text-base font-bold text-text">Manage</h2>
        <div className="mt-3 flex flex-col gap-2">
          <Link href="/jobs" className="w-full">
            <Button variant="outline" className="w-full justify-start">
              My bookings
            </Button>
          </Link>
          <Link href="/apply" className="w-full">
            <Button variant="outline" className="w-full justify-start">
              My application and documents
            </Button>
          </Link>
          <Link href="/availability" className="w-full">
            <Button variant="outline" className="w-full justify-start">
              My working hours
            </Button>
          </Link>
          <Link href="/earnings" className="w-full">
            <Button variant="outline" className="w-full justify-start">
              My money
            </Button>
          </Link>
        </div>
      </Card>
```
→
```tsx
      <Card className="p-5">
        <h2 className="text-base font-bold text-text">Manage</h2>
        <div className="mt-3 flex flex-col gap-2">
          <Link href="/work" className="w-full">
            <Button variant="outline" className="w-full justify-start">
              My bookings
            </Button>
          </Link>
          <Link href="/apply" className="w-full">
            <Button variant="outline" className="w-full justify-start">
              My application and documents
            </Button>
          </Link>
          <Link href="/money" className="w-full">
            <Button variant="outline" className="w-full justify-start">
              My money
            </Button>
          </Link>
        </div>
      </Card>
```

(`/jobs` → `/work`, `/earnings` → `/money`; the "My working hours" row is dropped outright — `/availability` has no route in this app, and `MeHome`'s own docblock already established the same rule for the dropped "Days" tile: presence/availability now lives in `PartnerPresence`, "a tile is not shipped pointing nowhere.")

- [ ] **Step 2: Create the route**

`frontend/apps/partner/app/me/profile/page.tsx`:

```tsx
import type { Metadata } from "next";

import { PartnerShell } from "@/features/session/partner-shell";
import { ProfilePanel } from "@/features/profile/view/profile-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Profile",
  robots: { index: false, follow: false },
};

export default function ProfilePage() {
  return (
    <PartnerShell requirePartnerRole>
      <ProfilePanel />
    </PartnerShell>
  );
}
```

- [ ] **Step 3: Make `MeHome`'s avatar the entry point**

```tsx
      <div className="flex flex-col items-center gap-3 rounded-b-3xl bg-[linear-gradient(160deg,var(--color-navy-700)_0%,var(--color-navy-900)_100%)] px-4 pt-6.5 pb-6">
        <div className="grid h-25 w-25 place-items-center rounded-[30px] bg-[linear-gradient(150deg,var(--color-navy-300)_0%,var(--color-navy-500)_100%)] shadow-raised">
          <Pictogram name="crew" className="h-14 w-14 text-surface" />
        </div>
      </div>
```
→
```tsx
      <div className="flex flex-col items-center gap-3 rounded-b-3xl bg-[linear-gradient(160deg,var(--color-navy-700)_0%,var(--color-navy-900)_100%)] px-4 pt-6.5 pb-6">
        <Link
          href="/me/profile"
          aria-label="Your profile"
          className="grid h-25 w-25 place-items-center rounded-[30px] bg-[linear-gradient(150deg,var(--color-navy-300)_0%,var(--color-navy-500)_100%)] shadow-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-inverse"
        >
          <Pictogram name="crew" className="h-14 w-14 text-surface" />
        </Link>
      </div>
```

`Link` from `next/link` is already imported at the top of `me-home.tsx` — no new import needed.

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm --filter partner typecheck`
Run: `pnpm --filter partner lint`

- [ ] **Step 5: Stage**

```bash
git add "frontend/apps/partner/app/me/profile/page.tsx" frontend/apps/partner/features/profile/view/profile-panel.tsx frontend/apps/partner/features/session/view/me-home.tsx
```

---

## Task 10: I7 — a `PARTIAL` outcome carries a reason again

**Files:**
- Modify: `frontend/apps/partner/features/work-stack/view/visit-job-view.tsx`
- Test: extend `visit-job-view.test.tsx` (created or extended in Task 8)

**Interfaces:** None new — `outcomes[].reason` already exists on the wire (`OutcomeInputRequest.reason`, `contracts/openapi/v1.yaml:20338-20341` — `type: string, default: '', maxLength: 240`, genuinely optional) and is already sent by `CompletionReport`, just hardcoded to `""`.

**Scoping note:** the top-level `notes` field (customer-facing) stays `""` — that is a deliberate, already-documented design decision in this file's own docblock ("a free-text box for the customer is the one thing this redesign is built to avoid asking for"), not a gap. The per-task `reason` field is a different, internal field that this task starts actually using. The `quantity: task.quantity` bug the handoff flags in the same paragraph (a `PARTIAL` outcome always reports the full quantity, so `backend/apps/fulfilment/completion.py`'s refund proration always computes zero) is pre-existing, not introduced by this branch, and out of scope here — flagged separately below Task 10 rather than folded in silently.

- [ ] **Step 1: Write the test (do not execute — see Global Constraints)**

Add to `visit-job-view.test.tsx`:

```tsx
describe("a partial completion", () => {
  it("shows a reason box once PARTIAL is picked, and none for COMPLETED", () => {
    const visit = confirmedVisit({
      status: "IN_PROGRESS",
      work_tasks: [{ id: "t1", label: "Deep clean", quantity: 1, amount_paise: 50000 }] as never,
    });

    renderVisit(visit);

    screen.getByRole("button", { name: /Part done/ }).click();

    expect(screen.getByRole("textbox", { name: /Deep clean/ })).toBeInTheDocument();
  });
});
```

(This assumes `CompletionReport`'s outcome-choice buttons are queryable by their caption text, consistent with `OUTCOME_CHOICES`' existing `caption: "Part done"` — adjust the query to match whatever accessible name the button actually exposes once you're looking at the real render output.)

- [ ] **Step 2: Track a per-task reason and render the textarea for any non-`COMPLETED` pick**

In `CompletionReport` (lines 267-376), add reason state alongside the existing `outcomes`/`damage` state:

```tsx
function CompletionReport({ visit }: { readonly visit: PartnerVisit }) {
  const submit = useSubmitCompletion();
  const [outcomes, setOutcomes] = useState<Record<string, OutcomeInput["outcome"]>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [damage, setDamage] = useState(false);
```

Inside the `visit.work_tasks.map((task) => ( ... ))` block, after the `OUTCOME_CHOICES` grid (`</div>` that closes `grid grid-cols-3 gap-2`, before the closing `</fieldset>`), add:

```tsx
          {outcomes[task.id] !== undefined && outcomes[task.id] !== "COMPLETED" ? (
            <textarea
              aria-label={`What happened — ${task.label}`}
              className="mt-2 min-h-16 w-full rounded-control border border-line bg-surface-sunken p-2 text-sm text-text"
              value={reasons[task.id] ?? ""}
              onChange={(event) =>
                setReasons((current) => ({ ...current, [task.id]: event.target.value }))
              }
              maxLength={240}
            />
          ) : null}
```

Update the submit payload to send the collected reason instead of `""`:

```tsx
        outcomes: visit.work_tasks.map((task) => ({
          work_task_id: task.id,
          // Guarded by `ready`: every task has an answer by here.
          outcome: outcomes[task.id]!,
          quantity: task.quantity,
          reason: "",
        })),
```
→
```tsx
        outcomes: visit.work_tasks.map((task) => ({
          work_task_id: task.id,
          // Guarded by `ready`: every task has an answer by here.
          outcome: outcomes[task.id]!,
          quantity: task.quantity,
          reason: reasons[task.id]?.trim() ?? "",
        })),
```

- [ ] **Step 3: Update the docblock**

```tsx
 * `notes` is sent empty. `SubmitCompletionRequestRequest` declares it
 * `@default ""` (`schema.d.ts:10631-10637`), so it is genuinely optional, and a
 * free-text box for the customer is the one thing this redesign is built to
 * avoid asking for. `safety_damage_declared` is **not** dropped the same way: it
 * is a declaration with consequences, and it is a single tap.
```
→
```tsx
 * `notes` is sent empty. `SubmitCompletionRequestRequest` declares it
 * `@default ""` (`schema.d.ts:10631-10637`), so it is genuinely optional, and a
 * free-text box for the customer is the one thing this redesign is built to
 * avoid asking for. `safety_damage_declared` is **not** dropped the same way: it
 * is a declaration with consequences, and it is a single tap. Per-task `reason`
 * (`OutcomeInputRequest.reason`) is different from `notes` — it is not
 * customer-facing — and now carries whatever the Partner types for any outcome
 * that is not `COMPLETED`, so a `PARTIAL`/`BLOCKED`/`NOT_APPLICABLE` report is
 * not silent the way it briefly was on this screen.
```

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm --filter partner typecheck`
Run: `pnpm --filter partner lint`

- [ ] **Step 5: Stage**

```bash
git add frontend/apps/partner/features/work-stack/view/visit-job-view.tsx frontend/apps/partner/features/work-stack/view/visit-job-view.test.tsx
```

---

## After Task 10

Run `superpowers:finishing-a-development-branch` per the handoff's own suggested order (section 5, step 6). Before that:

- The pre-existing `PARTIAL`-outcome quantity/refund bug (`backend/apps/fulfilment/completion.py:129-131`, the frontend always sending `quantity: task.quantity`) is real, confirmed, and unfixed by this plan — it needs its own task, ideally with a product decision on how a Partner is supposed to report a *partial* quantity on a tap-first screen (a stepper? a fraction picker?), which is a UI question this plan's scope doesn't cover.
- The four `/dashboard` occurrences left untouched by Task 3 (`app/error.tsx:38`, `app/(marketing)/layout.tsx:16`, `app/robots.ts:11`, `features/application/view/application-overview.tsx:135`) and the dead `BASE_NAV`/`navigationFor` code in `features/workspace/registry.ts` are still there — worth a follow-up sweep, not blocking.

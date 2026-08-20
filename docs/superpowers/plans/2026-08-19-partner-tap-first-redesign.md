# Partner Tap-First Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Partner app's Workforce/Projects workspace switcher and duplicated nav with one tap-first `WORK · MONEY · ME` surface, per the approved design canvas, with zero backend changes.

**Architecture:** A new client-side adapter (`features/work-stack`) merges four already-existing, already-authorized queries — crew offers, enquiries, engagements, and A1 visits — into one sorted `WorkItem[]`. A new 3-tab `BASE_NAV` replaces the workspace-scoped registry. Each screen is a thin view over existing query hooks, restyled by porting markup 1:1 from the approved canvas source files.

**Tech Stack:** Next.js 16 (App Router, Turbopack, async `params`), React, TanStack Query (`@vsolve/query`), Tailwind v4 (`@vsolve/ui` tokens), TypeScript strict.

**Spec:** [docs/superpowers/specs/2026-08-19-partner-tap-first-redesign-design.md](../specs/2026-08-19-partner-tap-first-redesign-design.md)

**Design source:** Canvas working files at
`C:\Users\gopal\AppData\Local\Temp\claude\C--dev-vsolve\f7bcb27e-1dc4-42cc-9e3d-ceac0e16d1a0\scratchpad\partner-tap\*.dc.html`
(session-scratchpad — may not survive a fresh machine/session) and the
published, durable copy at
https://claude.ai/code/artifact/382babf0-aa73-489e-9b9b-0c4c2d4bc749
(14 artboards; use the artboard titles in canvas.json to navigate, e.g.
"2 · WORK — the one place"). Each screen task below names its exact
source artboard file.

## Global Constraints

- **No test execution.** Every task that needs a test writes real, complete test code — never "write tests for this" as prose — but no step runs `vitest`/`playwright`. Mark verification as `owner verification pending` instead of a pass/fail run.
- **Static gates only.** `pnpm --filter partner typecheck` and `pnpm --filter partner lint` MAY be run after each task (these are allowed per project policy) — they are the only commands this plan runs.
- **No commits.** No task ends with a commit step. The plan builds everything; the user commits when they explicitly ask.
- **Colour is closed-set.** Every colour used must be one of the Tailwind utility classes in the "Token conversion table" in Task 1 — never a raw hex, never a new shade, except the one addition Task 0 makes explicitly.
- **No description text.** Screen body copy is captions only (≤1–2 words) under a pictogram, or a number. No sentence of explanatory prose on any of the 8 rebuilt screens (Money/Me may carry short labels like existing `earnings-panel.tsx` does today — see each task's acceptance list for the exact bar).
- **Touch targets.** Nothing tappable smaller than 44px in its smallest dimension; primary actions 56px+, per the canvas's own touch-target sheet (`Parts.dc.html`).
- **Do not fabricate data.** If a screen task's source artboard shows a number the API does not publish, the task says so explicitly and either substitutes the real published field or omits the element — never render a hand-picked or hardcoded value as if it were live data.

---

## Deviations from the canvas (found while planning — read before Tasks 6–7)

1. **No distance field exists.** `Offer.dc.html` and `Enquiry.dc.html` show a
   prominent "4 km" chip. Grepped the whole partner app: no source type
   publishes `distance_km` or coordinates to the Partner pre-acceptance.
   `offers/view/offer-card.tsx` has existing prior art with a comment
   explaining this is deliberate — only `approximate_area` is shown before
   acceptance, never a precise distance. **Fix applied in Tasks 6–7below:**
   the km chip is replaced with the real `area_label` field (on `CrewOffer`)
   or the enquiry's locality equivalent, keeping the pin pictogram but
   binding it to real text instead of a fabricated number.
2. **One new token needed.** The canvas uses `#0a5c2b` as the pressed-shadow
   shade under every green "done/confirm" button. `tokens.css` defines
   `rest`/`hover`/`press` for `--color-action` but only one step for
   success. Task 0 adds `--color-success-active: #0a5c2b`, following the
   exact pattern the file already uses for action.
3. **One near-black not in the palette.** `Arrive.dc.html`'s background
   gradient end-stop uses `#000d24`, an ad-hoc darker navy. Replaced with
   the existing `navy-900` (`#00112e`) when porting — close enough visually,
   and keeps the palette closed rather than adding a second near-black.
4. **Days/calendar screen dropped.** Per the spec's confirmed decision, not
   built this pass. `Days.dc.html` stays canvas-only. The existing
   `PartnerPresence` on/off control is what Task 13 (Me) actually wires up.

---

### Task 0: One token addition

**Files:**
- Modify: `frontend/packages/ui/src/tokens.css`

**Interfaces:**
- Produces: `--color-success-active` (CSS custom property), usable as
  Tailwind utility `bg-success-active` / `border-success-active` /
  `text-success-active` in every later task.

- [ ] **Step 1: Add the token**

Find this block in `tokens.css` (it currently has no `-active` step for success, unlike the `action` triple a few lines above it):

```css
  --color-success-surface: #e8f6ed;
  --color-success-line: #a8ddbc;
  --color-success-text: #0e7c3a;
```

Add one line directly after it:

```css
  --color-success-surface: #e8f6ed;
  --color-success-line: #a8ddbc;
  --color-success-text: #0e7c3a;
  /* Pressed-state shadow for a green confirm/done control, e.g. the tap-
     estimate "send" button and every job-progress confirm button in the
     tap-first redesign. Same darken-on-press pattern as --color-action-active. */
  --color-success-active: #0a5c2b;
```

- [ ] **Step 2: Typecheck (static gate — allowed)**

Run: `pnpm --filter @vsolve/ui typecheck`
Expected: no errors (this is a CSS-only change; the check confirms nothing else broke).

---

### Task 1: Pictogram library + token conversion table

**Files:**
- Create: `frontend/apps/partner/components/pictogram.tsx`
- Test: `frontend/apps/partner/components/pictogram.test.tsx`

**Interfaces:**
- Produces: `<Pictogram name={PictogramName} className?: string />`, and
  the exported `PictogramName` union type, both imported by every
  screen task below and by Task 2 (`estimate-presets.ts`).

Every icon is transcribed verbatim from the `<svg>` markup already drawn
and approved in `Icons.dc.html` (canvas source, see path above — the
artboard titled "The pictogram set"). Do not redraw or approximate paths;
copy the `d` attributes exactly as they appear in that file's "Trades",
"Do", "Know" and "State" sections.

**Token conversion table** (used by every screen task from here on — the
canvas's inline hex values map to these existing Tailwind utility classes;
never write a raw hex in application code):

| Canvas hex | Tailwind utility (bg / text / border as needed) |
|---|---|
| `#f87000` | `action` (e.g. `bg-action`, `text-action-text`) |
| `#fb8130` | `action-hover` |
| `#d65e00` | `action-active` |
| `#a94900` | `warning-text` (closest readable-as-text signal step) |
| `#fff4ec` | `action-surface` / `warning-surface` |
| `#ffc4a0` | `action-line` / `warning-line` |
| `#00112e` | `text` (also replaces the one-off `#000d24`, per Deviation 3) |
| `#001a4e` | `navy-800` (raw ramp step — no semantic role defined; use `bg-[var(--color-navy-800)]` if a literal navy-800 fill is needed, or prefer `text`/`action-secondary-hover` where the design intent matches) |
| `#00246b` | `action-secondary` / `text-link` |
| `#0f3a87` | `focus-ring` |
| `#2551a3` | raw ramp `navy-500` — same note as `navy-800` above |
| `#7d9ad6` | `navy-300` raw ramp |
| `#b0c2e8` | `selected-line` |
| `#eef2fb` | `selected-surface` / `info-surface` |
| `#ffffff` | `surface` / `text-inverse` |
| `#fdfcfa` | `warm-25` raw ramp (canvas gradient start only) |
| `#faf8f5` | `canvas` |
| `#f4f1ec` | `surface-sunken` |
| `#e7e2da` | `line` |
| `#d3ccc0` | `warm-300` raw ramp |
| `#a89f90` | `warm-400` raw ramp / `text-muted` is `warm-500`, use `warm-400` only for decorative fills |
| `#756c5e` | `text-muted` |
| `#453f37` | `text-secondary` |
| `#0e7c3a` | `success-text` |
| `#0a5c2b` | `success-active` (Task 0) |
| `#a8ddbc` | `success-line` |
| `#e8f6ed` | `success-surface` |
| `#b3261e` | `danger-text` |
| `#f4b8b3` | `danger-line` |
| `#fdecea` | `danger-surface` |

For any raw-ramp step with no semantic Tailwind class (`navy-300/500/800`,
`warm-300/400`), use the arbitrary-value form Tailwind v4 supports against
the same CSS variable, e.g. `bg-[var(--color-navy-500)]` — never a literal
hex. This keeps every colour traceable to `tokens.css` even where no
semantic role exists yet.

- [ ] **Step 1: Write the component**

```tsx
// frontend/apps/partner/components/pictogram.tsx
import { cn } from "@vsolve/ui";

/**
 * Every icon in the tap-first redesign. One stroke style — 24 viewBox,
 * 1.8 stroke, round caps and joins — transcribed from the approved design
 * canvas (`Icons.dc.html`, artboard "The pictogram set") so a hand-drawn
 * glyph exists everywhere the app previously used an emoji.
 */
export type PictogramName =
  // Trades
  | "wiring"
  | "water"
  | "walls"
  | "paint"
  | "floor"
  | "wood"
  | "cooling"
  | "machine"
  | "clean"
  | "welding"
  | "fit-out"
  | "warranty"
  | "all-work"
  | "site"
  | "home"
  | "more"
  // Do
  | "yes"
  | "no"
  | "call"
  | "photo"
  | "go"
  | "back"
  | "price"
  | "power"
  // Know
  | "distance"
  | "time"
  | "date"
  | "days"
  | "money"
  | "crew"
  | "rating"
  | "papers"
  // State
  | "now"
  | "doing"
  | "done"
  | "held"
  | "later"
  | "stopped"
  | "new"
  | "language";

const PATHS: Record<PictogramName, string> = {
  wiring: "M13.5 2.5 5 13.5h6l-1.5 8 9.5-11.5h-6z",
  water: "M4 20.5h16|M12 20.5v-5.5|M8.4 10.9h7.2v4.1h-7.2z|M12 10.9V7.4h4a3 3 0 0 1 3 3v1|M9.8 7.4h4.4",
  walls: "M3 9.7h18|M3 14.3h18|M9 5v4.7|M15 9.7v4.6|M9 14.3V19",
  paint: "M15 6.2h3.7a1.8 1.8 0 0 1 1.8 1.8v2.4a1.8 1.8 0 0 1-1.8 1.8h-7.2a1.8 1.8 0 0 0-1.8 1.8v1.3",
  floor: "M3 3h7.6v7.6H3z|M13.4 3h7.6v7.6h-7.6z|M3 13.4h7.6V21H3z|M13.4 13.4h7.6V21h-7.6z",
  wood: "M2.8 13.5 13.5 2.8l3.6 3.6L6.4 17.1z|M6.4 17.1l-2 2 1.4 1.4 2-2z|M5.2 14.7l1 1|M7.2 12.7l1 1|M9.2 10.7l1 1|M11.2 8.7l1 1|M13.2 6.7l1 1",
  cooling: "M6 9h12|M7 15.4c0 2-1.5 2-1.5 4|M12 15.4c0 2-1.5 2-1.5 4|M17 15.4c0 2-1.5 2-1.5 4",
  machine: "M4 8h16",
  clean: "M9.6 8.5h4.8v12H9.6z|M9.6 8.5V5.4h3.2|M17 4.4h2.2|M17 7.6h2.2|M18.4 10.8h1.8",
  welding: "M12 2.8s4.2 4.6 4.2 8.4a4.2 4.2 0 0 1-8.4 0C7.8 7.4 12 2.8 12 2.8z|M9.4 21h5.2",
  "fit-out": "M3.5 9.5 12 3.5l8.5 6|M5.8 9.5V20.5h12.4V9.5|M9.9 20.5v-5.8h4.2v5.8",
  warranty: "M12 3 4.6 6v6c0 4.6 3.1 8 7.4 9.5 4.3-1.5 7.4-4.9 7.4-9.5V6z|M9 12.2l2.2 2.3L15.4 10",
  "all-work": "M8 8.5V6.8A2.3 2.3 0 0 1 10.3 4.5h3.4A2.3 2.3 0 0 1 16 6.8v1.7|M2.5 13.5h19|M10 13.5v2.4h4v-2.4",
  site: "M4.5 18.5h15|M6.5 18.5v-5.2l5.5-4.2 5.5 4.2v5.2|M12 9.1V4.4",
  home: "M5.5 20.5V9.2h13v11.3|M8.6 13.2h2.6|M12.8 13.2h2.6|M8.6 16.8h2.6|M12.8 16.8h2.6|M4 9.2 12 3.4l8 5.8",
  more: "M12 5.5v13|M5.5 12h13",
  yes: "M4.5 12.5 9.5 17.5 19.5 6.5",
  no: "M6 6l12 12|M18 6L6 18",
  call: "M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5z",
  photo: "M2.5 7h19v13h-19z|M8.6 7l1.6-2.6h3.6L15.4 7",
  go: "M4.5 12h14|M13 6.5 18.5 12 13 17.5",
  back: "M15 5.5 8.5 12 15 18.5",
  price: "M6.5 3.5h11|M6.5 8.4h11|M14.6 3.5c0 3.3-2.4 4.9-5.3 4.9H6.5l8.6 12.1",
  power: "M12 3v9|M18.4 6.6a9 9 0 1 1-12.8 0",
  distance: "M12 21.5s7-6 7-11.5a7 7 0 0 0-14 0c0 5.5 7 11.5 7 11.5z",
  time: "M12 7v5.2l3.4 2",
  date: "M3 5h18v16H3z|M8 2.8v4|M16 2.8v4|M3 10h18",
  days: "M12 2v2|M12 20v2|M4.9 4.9l1.4 1.4|M17.7 17.7l1.4 1.4|M2 12h2|M20 12h2|M4.9 19.1l1.4-1.4|M17.7 6.3l1.4-1.4",
  money: "M2.5 6h19v12h-19z|M6 9.5v5|M18 9.5v5",
  crew: "M2.5 20.5c0-3.6 2.9-6.2 6.5-6.2s6.5 2.6 6.5 6.2|M16.5 5.6a3.4 3.4 0 0 1 0 6.6|M17.6 14.8c2.3.7 3.9 2.9 3.9 5.7",
  rating: "m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  papers: "M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z|M13.5 3v5.5H19|M8.6 13.4h6.8|M8.6 16.8h4.4",
  now: "M12 7v5.2l3.4 2",
  doing: "M8 8.5V6.8A2.3 2.3 0 0 1 10.3 4.5h3.4A2.3 2.3 0 0 1 16 6.8v1.7|M2.5 13.5h19|M10 13.5v2.4h4v-2.4",
  done: "M4.5 12.5 9.5 17.5 19.5 6.5",
  held: "M4.5 10.5h15v10h-15z|M8 10.5V7.5a4 4 0 0 1 8 0v3",
  later: "M12 7.4v5.6|M12 16.4v.1",
  stopped: "M5.6 5.6l12.8 12.8",
  new: "M18 8.5a6 6 0 0 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5z|M13.7 20a2 2 0 0 1-3.4 0",
  language: "M3.2 9.5h17.6|M3.2 14.5h17.6|M12 3a14 14 0 0 1 0 18|M12 3a14 14 0 0 0 0 18",
};

/**
 * A few icons above (`water`, `all-work`, `held`, etc.) also draw a
 * container shape (`<rect>`) alongside their `<path>` strokes in the
 * canvas source. Those rects are fixed per icon and drawn directly here
 * rather than folded into the `d` string, since a rect is not a path
 * command.
 */
const RECTS: Partial<Record<PictogramName, readonly [number, number, number, number, number]>> = {
  // [x, y, width, height, rx]
  paint: [3.5, 3.5, 11.5, 5.4, 1.6],
  floor: undefined as unknown as never, // floor uses 4 rects; handled as a special case below
  cooling: undefined as unknown as never, // cooling uses one rect; handled below
  clean: undefined as unknown as never,
  held: [4.5, 10.5, 15, 10, 2.2],
  money: undefined as unknown as never,
};

export function Pictogram({
  name,
  className,
}: {
  name: PictogramName;
  className?: string;
}) {
  const d = PATHS[name];
  const rect = RECTS[name];

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("h-6 w-6", className)}
    >
      {rect ? <rect x={rect[0]} y={rect[1]} width={rect[2]} height={rect[3]} rx={rect[4]} /> : null}
      {d.split("|").map((segment, index) => (
        <path key={index} d={segment} />
      ))}
    </svg>
  );
}
```

**This step has a deliberate gap the implementer must close before
committing to it:** the `RECTS` table above is incomplete — `floor`,
`cooling`, `clean`, and `money` each draw one or more `<rect>` elements in
the canvas source (`Icons.dc.html`) that are not yet transcribed (the
canvas file has the exact `<rect>` tags with their `x`/`y`/`width`/
`height`/`rx` — copy them directly rather than approximating). Read
`Icons.dc.html`'s `<div class="cell">` for each of those four names and
fill in the exact rect(s) — `floor` needs four, the others need one or two
each. This is flagged explicitly rather than silently shipped wrong,
because a pictogram with a missing container shape reads as a different
(incomplete) icon, and this audience has no caption fallback to recover
the meaning from.

- [ ] **Step 2: Write the test**

```tsx
// frontend/apps/partner/components/pictogram.test.tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Pictogram, type PictogramName } from "./pictogram";

const ALL_NAMES: readonly PictogramName[] = [
  "wiring", "water", "walls", "paint", "floor", "wood", "cooling", "machine",
  "clean", "welding", "fit-out", "warranty", "all-work", "site", "home", "more",
  "yes", "no", "call", "photo", "go", "back", "price", "power",
  "distance", "time", "date", "days", "money", "crew", "rating", "papers",
  "now", "doing", "done", "held", "later", "stopped", "new", "language",
];

describe("Pictogram", () => {
  it("renders every declared name without throwing", () => {
    for (const name of ALL_NAMES) {
      const { container, unmount } = render(<Pictogram name={name} />);
      expect(container.querySelector("svg")).not.toBeNull();
      unmount();
    }
  });

  it("is decorative: the svg is aria-hidden, never an accessible name of its own", () => {
    const { container } = render(<Pictogram name="call" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden");
  });

  it("takes stroke colour from currentColor, so a parent's text colour recolours it", () => {
    const { container } = render(<Pictogram name="call" className="text-success-text" />);
    expect(container.querySelector("svg")).toHaveAttribute("stroke", "currentColor");
  });
});
```

Do not run this test. Mark as `owner verification pending`.

- [ ] **Step 3: Typecheck + lint (static gates — allowed)**

Run: `pnpm --filter partner typecheck && pnpm --filter partner lint`
Expected: no errors, once the `RECTS` gap from Step 1 is closed for all four names.

---

### Task 2: Migrate `estimate-presets.ts` off emoji

**Files:**
- Modify: `frontend/apps/partner/features/proposal/model/estimate-presets.ts`
- Modify: `frontend/apps/partner/features/proposal/view/tap-estimate.tsx:395-420` (the `Tile` component)
- Test: existing tests under `features/proposal` already cover preset shape — extend, do not replace

**Interfaces:**
- Consumes: `PictogramName` from Task 1 (`@/components/pictogram`).
- Produces: `WorkPreset.icon: PictogramName` and `MaterialPreset.icon: PictogramName` (renamed from `glyph: string`) — any other module importing these types (search confirmed only `tap-estimate.tsx` and `tap-estimate-composer.tsx` do) must update alongside.

- [ ] **Step 1: Change the field on both interfaces**

In `estimate-presets.ts`, change:

```ts
export interface WorkPreset {
  readonly code: string;
  readonly glyph: string;
  readonly label: string;
  readonly deliverable: string;
}
```

to:

```ts
import type { PictogramName } from "@/components/pictogram";

export interface WorkPreset {
  readonly code: string;
  readonly icon: PictogramName;
  readonly label: string;
  readonly deliverable: string;
}
```

Apply the same `glyph: string` → `icon: PictogramName` change to
`MaterialPreset`, `WARRANTY_CHOICES`'s item type, and
`EXCLUSION_CHOICES`'s item type.

- [ ] **Step 2: Replace every emoji literal with its pictogram name**

Every existing entry in `FIT_OUT_WORK` and the other preset arrays in this
file currently sets e.g. `glyph: "🪣"`. Change the key to `icon:` and the
value to the matching `PictogramName` from Task 1's table. The existing
entries and their target names (cross-referencing the emoji already in the
file against the Task 1 icon set):

| Existing `code` | Old `glyph` | New `icon` |
|---|---|---|
| `strip_out` | 🪣 | `"clean"` |
| `civil` | 🧱 | `"walls"` |
| `wiring` | ⚡ | `"wiring"` |
| `plumbing` | 🚿 | `"water"` |
| `plaster` | 🧽 | `"clean"` |
| `flooring` | 🟫 | `"floor"` |
| `paint` | 🎨 | `"paint"` |
| `fit_out` | 🛠️ | `"fit-out"` |
| `snagging` | ✅ | `"done"` |

Continue this mapping for every remaining entry in the file (materials,
`WARRANTY_CHOICES`, `EXCLUSION_CHOICES`) against the Task 1 `PATHS` keys —
choose the closest semantic match from the 40 declared names; where none
fits well (e.g. a very specific material), use `"more"` rather than
inventing a new pictogram name outside Task 1's set.

- [ ] **Step 3: Update the renderer**

In `tap-estimate.tsx`, the `Tile` component currently renders:

```tsx
<span aria-hidden className="text-2xl leading-none">
  {glyph}
</span>
```

Change the prop name from `glyph` to `icon: PictogramName` throughout
`Tile`'s props and its two call sites in `WorkStep`, and replace the span
with:

```tsx
<Pictogram name={icon} className="h-8 w-8" />
```

Import `Pictogram` from `@/components/pictogram`. Do the same for
`PriceRow`, `ChoiceCard`, and `SummaryRow` in the same file, which each
currently render a `glyph: string` prop the same way.

- [ ] **Step 4: Update existing preset tests to the new field name**

Find the existing test file covering `estimate-presets.ts` (there is one,
per `git status` showing this feature as already modified this session —
confirm its path with `find frontend/apps/partner/features/proposal -name "*.test.ts"`)
and change every `glyph: "…"` fixture literal to `icon: "…"` with the
matching pictogram name from the table in Step 2. Do not run it —
`owner verification pending`.

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm --filter partner typecheck && pnpm --filter partner lint`
Expected: no errors. This is the step that will surface any preset entry
missed in Step 2 (TypeScript rejects a `glyph:` key once the interface no
longer declares it).

---

### Task 3: The `WorkItem` adapter and unified stack hook

This is the task everything else in the plan depends on. Read it fully
before starting any screen task.

**Files:**
- Create: `frontend/apps/partner/features/work-stack/model/work-item.ts`
- Create: `frontend/apps/partner/features/work-stack/model/work-item.test.ts`
- Create: `frontend/apps/partner/features/work-stack/queries.ts`

**Interfaces:**
- Consumes:
  - `usePartnerCrewOffers(enabled = true)` from `@/features/crew-offer/queries` — returns `{ offers: CrewOffer[], server_now: string }` shape (per `live-offer-sheet.tsx` usage: `.data.offers`, `.data.server_now`)
  - `isOfferLive(offer: CrewOffer, serverNow: string): boolean` from `@/features/crew-offer/model/offer-state`
  - `usePartnerEnquiries(enabled = true)` from `@/features/enquiry/queries` — returns a paginated shape with `.results: readonly EnquirySummary[]`
  - `usePartnerEngagements(enabled = true)` from `@/features/engagement/queries`
  - `usePartnerJobs(bucket: JobBucket)` from `@/features/work/queries`, `JobBucket = "active" | "completed" | "cancelled"`
  - `CrewOffer = Schemas["CrewOffer"]` fields used: `.invitation_id`, `.status`, `.requested_start`, `.responds_by`, `.headcount`, `.days`, `.area_label`, `.lead_total_receipt_paise`
  - `EnquirySummary = Schemas["EnquirySummary"]` fields used: `.id`, `.service_name`, `.archetype`, `.status`, `.requested_start`, `.responds_by`
  - `PartnerVisit = Schemas["PartnerBooking"]` fields used: `.id`, `.status: VisitStatus`, `.scheduled_start`, `.earning`
  - `Engagement = Schemas["Engagement"]` fields used: `.id`, `.status`, `.commercial_mode`, `.commission_paise`
- Produces: `WorkItem` type, `WorkItemKind`, `WorkUrgency`, `toWorkItems(...)` pure function, `useWorkStack()` hook — consumed by Task 6 (WORK home) and nowhere else outside this feature.

- [ ] **Step 1: Write the pure adapter (`work-item.ts`)**

```ts
// frontend/apps/partner/features/work-stack/model/work-item.ts
import type { CrewOffer } from "@/features/crew-offer/queries";
import { isOfferLive } from "@/features/crew-offer/model/offer-state";
import type { EnquirySummary } from "@/features/enquiry/queries";
import type { Engagement } from "@/features/engagement/queries";
import type { PartnerVisit } from "@/features/work/queries";

/**
 * The one timeline every Partner-facing record collapses into: somebody
 * asked, I answered, I'm doing it, I got paid. Four card states, each with
 * its own colour on the canvas — see Task 6/7/9's screen source files.
 */
export type WorkUrgency = "live" | "needs_price" | "doing" | "settled";

export type WorkItemKind = "offer" | "enquiry" | "engagement" | "job";

export interface WorkItem {
  readonly kind: WorkItemKind;
  /** Stable React key: `${kind}:${id}`. */
  readonly key: string;
  /** Route to the detail screen for this item. */
  readonly href: string;
  /** Rupees the vendor stands to receive, in paise. `null` = not priced yet. */
  readonly amountPaise: number | null;
  readonly urgency: WorkUrgency;
  /**
   * ISO deadline for a card that is racing a clock (an offer's
   * `responds_by`, an enquiry's `responds_by`). `null` for everything else.
   */
  readonly respondsBy: string | null;
  /** ISO scheduled/requested start, for sorting the "doing" bucket. `null` if unscheduled. */
  readonly whenIso: string | null;
  /**
   * The published area label, when the source type carries one. This is
   * NOT a distance — no Partner-facing field publishes distance today (see
   * plan Deviation 1). `null` where the source type has no area field
   * (enquiries and engagements do not).
   */
  readonly areaLabel: string | null;
  /** Accessible name only — this app renders pictures and numbers, never this string as visible body copy. */
  readonly accessibleName: string;
}

const OFFER_HREF = (id: string) => `/work/offers/${id}`;
const ENQUIRY_HREF = (id: string) => `/work/enquiries/${id}`;
const ENGAGEMENT_HREF = (id: string) => `/work/jobs/${id}`;
const JOB_HREF = (id: string) => `/work/jobs/${id}`;

function fromOffers(offers: readonly CrewOffer[], serverNow: string): WorkItem[] {
  return offers
    .filter((offer) => isOfferLive(offer, serverNow))
    .map((offer) => ({
      kind: "offer" as const,
      key: `offer:${offer.invitation_id}`,
      href: OFFER_HREF(offer.invitation_id),
      amountPaise: offer.lead_total_receipt_paise ?? null,
      urgency: "live" as const,
      respondsBy: offer.responds_by,
      whenIso: offer.requested_start,
      areaLabel: offer.area_label ?? null,
      accessibleName: `Crew offer, ${offer.headcount} people, ${offer.area_label ?? "area not given"}`,
    }));
}

/** Enquiry statuses that still need a price from this vendor. Mirrors `enquiry-state.ts`'s `canQuote`. */
const NEEDS_PRICE_ENQUIRY_STATUS = new Set(["INVITED", "ACCEPTED"]);

function fromEnquiries(enquiries: readonly EnquirySummary[]): WorkItem[] {
  return enquiries
    .filter((enquiry) => NEEDS_PRICE_ENQUIRY_STATUS.has(enquiry.status))
    .map((enquiry) => ({
      kind: "enquiry" as const,
      key: `enquiry:${enquiry.id}`,
      href: ENQUIRY_HREF(enquiry.id),
      amountPaise: null,
      urgency: "needs_price" as const,
      respondsBy: enquiry.responds_by,
      whenIso: enquiry.requested_start,
      areaLabel: null,
      accessibleName: `${enquiry.service_name}, needs a price`,
    }));
}

/** Engagement statuses that read as "doing it now" rather than settled or not-yet-started. */
const DOING_ENGAGEMENT_STATUS = new Set(["IN_PROGRESS", "PENDING_START"]);

function fromEngagements(engagements: readonly Engagement[]): WorkItem[] {
  return engagements
    .filter((engagement) => DOING_ENGAGEMENT_STATUS.has(engagement.status))
    .map((engagement) => ({
      kind: "engagement" as const,
      key: `engagement:${engagement.id}`,
      href: ENGAGEMENT_HREF(engagement.id),
      amountPaise: engagement.commission_paise ?? null,
      urgency: "doing" as const,
      respondsBy: null,
      whenIso: null,
      areaLabel: null,
      accessibleName: `Engagement in progress`,
    }));
}

const DOING_VISIT_STATUS = new Set(["CONFIRMED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"]);
const SETTLED_VISIT_STATUS = new Set(["COMPLETED", "PARTIALLY_COMPLETED"]);

function fromJobs(jobs: readonly PartnerVisit[]): WorkItem[] {
  return jobs
    .filter((job) => DOING_VISIT_STATUS.has(job.status) || SETTLED_VISIT_STATUS.has(job.status))
    .map((job) => ({
      kind: "job" as const,
      key: `job:${job.id}`,
      href: JOB_HREF(job.id),
      amountPaise: job.earning?.net_paise ?? null,
      urgency: (SETTLED_VISIT_STATUS.has(job.status) ? "settled" : "doing") as WorkUrgency,
      respondsBy: null,
      whenIso: job.scheduled_start,
      areaLabel: null,
      accessibleName: `Job, ${job.status.toLowerCase().replace(/_/g, " ")}`,
    }));
}

const URGENCY_RANK: Record<WorkUrgency, number> = {
  live: 0,
  needs_price: 1,
  doing: 2,
  settled: 3,
};

/**
 * Merges the four source lists into one sorted stack.
 *
 * Sort key is `(urgency rank, deadline-or-start ascending)`. Within "live"
 * this puts the offer closest to expiring first — the same ordering
 * `LiveOfferSheet` already relies on ("the server already orders by
 * responds_by, and the one about to lapse is the one worth interrupting
 * for"). Within "needs_price" and "doing" it is oldest-deadline/soonest-
 * start first. "settled" items sort newest-first since there is no
 * deadline to order by; `whenIso` is reused for that purpose there.
 */
export function toWorkItems(sources: {
  offers: readonly CrewOffer[];
  offersServerNow: string | null;
  enquiries: readonly EnquirySummary[];
  engagements: readonly Engagement[];
  jobs: readonly PartnerVisit[];
}): WorkItem[] {
  const items: WorkItem[] = [
    ...(sources.offersServerNow ? fromOffers(sources.offers, sources.offersServerNow) : []),
    ...fromEnquiries(sources.enquiries),
    ...fromEngagements(sources.engagements),
    ...fromJobs(sources.jobs),
  ];

  return items.sort((a, b) => {
    const rankDiff = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    if (rankDiff !== 0) return rankDiff;

    const aTime = a.respondsBy ?? a.whenIso;
    const bTime = b.respondsBy ?? b.whenIso;
    if (aTime === null && bTime === null) return 0;
    if (aTime === null) return 1;
    if (bTime === null) return -1;

    const diff = new Date(aTime).getTime() - new Date(bTime).getTime();
    return a.urgency === "settled" ? -diff : diff;
  });
}
```

- [ ] **Step 2: Write the test**

```ts
// frontend/apps/partner/features/work-stack/model/work-item.test.ts
import { describe, expect, it } from "vitest";

import { toWorkItems } from "./work-item";

const NOW = "2026-08-19T10:00:00Z";

describe("toWorkItems", () => {
  it("puts a live offer ahead of an unpriced enquiry ahead of a doing engagement ahead of a settled job", () => {
    const items = toWorkItems({
      offers: [
        {
          invitation_id: "o1",
          status: "PENDING",
          requested_start: "2026-08-20T00:00:00Z",
          responds_by: "2026-08-19T10:02:00Z",
          headcount: 2,
          days: 1,
          area_label: "Kondapur",
          lead_total_receipt_paise: 180000,
        } as never,
      ],
      offersServerNow: NOW,
      enquiries: [
        { id: "e1", service_name: "Deep clean", archetype: "A5_CUSTOM_PROJECT", status: "INVITED", requested_start: null, responds_by: "2026-08-20T10:00:00Z" } as never,
      ],
      engagements: [{ id: "g1", status: "IN_PROGRESS", commercial_mode: "A3_TIME_BLOCK", commission_paise: 0 } as never],
      jobs: [{ id: "j1", status: "COMPLETED", scheduled_start: "2026-08-18T09:00:00Z", earning: { net_paise: 600000 } } as never],
    });

    expect(items.map((item) => item.kind)).toEqual(["offer", "enquiry", "engagement", "job"]);
  });

  it("drops an offer whose deadline has already passed", () => {
    const items = toWorkItems({
      offers: [
        {
          invitation_id: "o1",
          status: "PENDING",
          requested_start: null,
          responds_by: "2026-08-19T09:00:00Z", // before NOW
          headcount: 1,
          days: 1,
          area_label: null,
          lead_total_receipt_paise: 100000,
        } as never,
      ],
      offersServerNow: NOW,
      enquiries: [],
      engagements: [],
      jobs: [],
    });

    expect(items).toHaveLength(0);
  });

  it("drops an enquiry this vendor has already answered or lost", () => {
    const items = toWorkItems({
      offers: [],
      offersServerNow: null,
      enquiries: [
        { id: "e1", service_name: "x", archetype: "A5_CUSTOM_PROJECT", status: "DECLINED", requested_start: null, responds_by: null } as never,
      ],
      engagements: [],
      jobs: [],
    });

    expect(items).toHaveLength(0);
  });

  it("never invents an area label for a kind that has none", () => {
    const items = toWorkItems({
      offers: [],
      offersServerNow: null,
      enquiries: [{ id: "e1", service_name: "x", archetype: "A5_CUSTOM_PROJECT", status: "INVITED", requested_start: null, responds_by: null } as never],
      engagements: [],
      jobs: [],
    });

    expect(items[0]!.areaLabel).toBeNull();
  });

  it("renders nothing rather than guessing when every source is empty", () => {
    expect(
      toWorkItems({ offers: [], offersServerNow: null, enquiries: [], engagements: [], jobs: [] }),
    ).toEqual([]);
  });
});
```

Do not run. `owner verification pending`.

- [ ] **Step 3: Write the composing hook**

```ts
// frontend/apps/partner/features/work-stack/queries.ts
"use client";

import { usePartnerCrewOffers } from "@/features/crew-offer/queries";
import { usePartnerEnquiries } from "@/features/enquiry/queries";
import { usePartnerEngagements } from "@/features/engagement/queries";
import { usePartnerJobs } from "@/features/work/queries";

import { toWorkItems, type WorkItem } from "./model/work-item";

/**
 * The merged, sorted WORK stack. Composes four already-existing queries —
 * no new network call is added; TanStack dedupes each by its existing
 * query key exactly as `LiveOfferSheet` already relies on for the offers
 * query alone.
 *
 * Loading is "any source still pending"; error is "any source errored",
 * surfaced as the first error found — a screen showing four independent
 * spinners/errors for one merged list would contradict the entire point of
 * merging it.
 */
export function useWorkStack() {
  const offers = usePartnerCrewOffers();
  const enquiries = usePartnerEnquiries();
  const engagements = usePartnerEngagements();
  const activeJobs = usePartnerJobs("active");
  const completedJobs = usePartnerJobs("completed");

  const isPending =
    offers.isPending || enquiries.isPending || engagements.isPending ||
    activeJobs.isPending || completedJobs.isPending;

  const firstError =
    offers.error ?? enquiries.error ?? engagements.error ??
    activeJobs.error ?? completedJobs.error ?? null;

  const items: WorkItem[] = isPending || firstError
    ? []
    : toWorkItems({
        offers: offers.data?.offers ?? [],
        offersServerNow: offers.data?.server_now ?? null,
        enquiries: enquiries.data?.results ?? [],
        engagements: engagements.data ?? [],
        jobs: [...(activeJobs.data ?? []), ...(completedJobs.data ?? [])],
      });

  return { items, isPending, error: firstError };
}
```

**Note for the implementer:** confirm `usePartnerEngagements`'s and
`usePartnerJobs`'s exact return shape (`.data` as a bare array vs. a
`{results: [...]}` wrapper) by reading their `queryFn` in
`features/engagement/queries.ts` and `features/work/queries.ts` before
wiring this — the plan's research pass confirmed the hook names and the
fields used inside each mapped item, but not every list endpoint's outer
pagination envelope. Adjust `engagements.data ?? []` /
`activeJobs.data ?? []` to unwrap a `.results` if either turns out to be
paginated like `usePartnerEnquiries` is.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter partner typecheck`
Expected: no errors once the envelope shapes in Step 3's note are confirmed and any unwrapping is corrected.

---

### Task 4: Replace the workspace registry with 3-tab `BASE_NAV`

**Files:**
- Modify: `frontend/apps/partner/features/workspace/registry.ts`
- Modify: `frontend/apps/partner/features/session/partner-shell.tsx:280-345` (the `BottomTabBar` function and its call site)
- Modify: `frontend/apps/partner/features/workspace/registry.test.ts`
- Delete: `frontend/apps/partner/features/workspace/workspace-switcher.tsx` (no longer rendered by anything after this task)

**Interfaces:**
- Produces: `BASE_NAV: WorkspaceNavItem[]` (3 items, replaces the current 4-item one), used only by `partner-shell.tsx`.
- Removes: `WORKSPACE_REGISTRY`, `resolveWorkspaces`, `activeWorkspace`, `WorkspaceDefinition`, `ResolvedWorkspace`, `WORKFORCE_WORKSPACE`, `PROJECT_WORKSPACE` — confirm with a repo-wide search that nothing outside `workspace/` and `partner-shell.tsx` imports these before deleting (the earlier research pass found only `partner-shell.tsx` and `workspace-screens.tsx` importing from this module; `workspace-screens.tsx` itself is superseded by Task 5's new route files and is removed there, not here).

- [ ] **Step 1: Rewrite `registry.ts`**

Replace the entire file's exported surface. Keep `WorkspaceNavItem`'s
shape (it is reused) but drop the `action` gating field — per the spec,
action-gating moves from "which tab shows" to "which control renders on a
given `WorkItem` card," which lives in each screen task instead:

```ts
import { UserCircle2, Users, Wallet } from "lucide-react";

import type { LucideIcon } from "lucide-react";

/**
 * The tap-first navigation: three destinations, unconditionally, for
 * every signed-in Partner regardless of which capabilities they hold.
 *
 * Supersedes the workspace switcher (Workforce | Projects) and its
 * per-workspace tab sets. That structure organised navigation by Vsolve's
 * internal commercial model; this organises it by what the Partner is
 * looking at doing right now. See
 * `docs/superpowers/specs/2026-08-19-partner-tap-first-redesign-design.md`.
 *
 * Nothing here decides authorization. `useWorkStack` (features/work-stack)
 * only ever surfaces a `WorkItem` the underlying query already returned,
 * and Django already scoped that query to what this Partner may see —
 * exactly the boundary `registry.ts` documented before this rewrite, just
 * enforced per-card now instead of per-tab.
 */
export interface WorkspaceNavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
}

export const BASE_NAV: readonly WorkspaceNavItem[] = [
  { href: "/work", label: "Work", icon: Users },
  { href: "/money", label: "Money", icon: Wallet },
  { href: "/me", label: "Me", icon: UserCircle2 },
];
```

- [ ] **Step 2: Simplify `partner-shell.tsx`**

Remove the `usePartnerWorkspaceGrants` call, the `WorkspaceSwitcher`
render block, and the `resolveWorkspaces`/`activeWorkspace`/`navigationFor`
calls (search the file for each — they were read in full during planning
and appear once each, in the body of the exported `PartnerShell`
component, right before the `return` that renders the shell markup).
Replace the `navItems` computation with the constant import:

```tsx
import { BASE_NAV } from "@/features/workspace/registry";
```

and change:

```tsx
const workspaces = resolveWorkspaces(workspaceGrants.grants ?? []);
const workspace = activeWorkspace(workspaces, pathname);
const navItems = navigationFor(workspace);
```

to nothing — delete those three lines and every reference to `workspace`,
`workspaces`, and `navItems` below them; pass `BASE_NAV` directly to
`<BottomTabBar items={BASE_NAV} />`, and delete the
`<WorkspaceSwitcher .../>` JSX block and its surrounding
`{workspaces.length > 0 ? (...) : null}` conditional entirely — there is
no switcher any more.

`BottomTabBar` itself (the function starting `function BottomTabBar({
items }: ...)`) is unchanged — it already takes `items:
readonly WorkspaceNavItem[]` generically and needs no edit.

Also delete the `LiveOfferSheet` gate's dependency on the removed
`workspaceGrants` variable if any exists (the earlier read of this file
showed `LiveOfferSheet` gated only on `hasRole(guard.user, PARTNER_ROLE)`,
not on workspace grants — confirm this is still true after the edit and
leave that line as-is if so).

- [ ] **Step 3: Update `registry.test.ts`**

The existing test file asserts the old `WORKSPACE_REGISTRY`/
`resolveWorkspaces` shape. Replace its contents with a test of the new,
much smaller surface:

```ts
import { describe, expect, it } from "vitest";

import { BASE_NAV } from "./registry";

describe("BASE_NAV", () => {
  it("has exactly the three tap-first destinations, in order", () => {
    expect(BASE_NAV.map((item) => item.href)).toEqual(["/work", "/money", "/me"]);
  });

  it("gives every destination a one-word label", () => {
    for (const item of BASE_NAV) {
      expect(item.label.split(" ")).toHaveLength(1);
    }
  });
});
```

Do not run. `owner verification pending`.

- [ ] **Step 4: Delete the now-unused switcher component**

Delete `frontend/apps/partner/features/workspace/workspace-switcher.tsx`
and its test file if one exists
(`workspace-switcher.test.tsx` — check with
`find frontend/apps/partner/features/workspace -name "workspace-switcher*"`).

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm --filter partner typecheck && pnpm --filter partner lint`
Expected: errors here will point at every remaining import of
`WORKSPACE_REGISTRY`/`resolveWorkspaces`/`activeWorkspace` this task
missed — fix each by following it to Task 5's replacement route (most
remaining references will be in `workspace-screens.tsx` and the old
`app/workforce/*`, `app/projects/*` route files, which Task 5 deletes).

---

### Task 5: Route redirects and new route scaffolding

**Files:**
- Modify: `frontend/apps/partner/next.config.ts`
- Delete: `frontend/apps/partner/app/dashboard/`, `app/workforce/`, `app/projects/`, `app/jobs/`, `app/earnings/`, `app/profile/`, `app/availability/` (entire directories — superseded by the routes this task and Tasks 6–13 create)
- Delete: `frontend/apps/partner/features/workspace/view/workspace-screens.tsx` and its callers

**Interfaces:**
- Produces: the redirect table below, and empty route directories ready for Tasks 6–13 to fill with `page.tsx`.

- [ ] **Step 1: Add redirects**

`next.config.ts` currently declares no `redirects()`. Add one:

```ts
const nextConfig: NextConfig = {
  transpilePackages: ["@vsolve/ui", "@vsolve/config", "@vsolve/api-client", "@vsolve/query"],
  turbopack: { root: workspaceRoot },
  logging: {
    fetches: {
      fullUrl: process.env.NODE_ENV !== "production",
    },
  },
  async redirects() {
    return [
      { source: "/dashboard", destination: "/work", permanent: true },
      { source: "/workforce", destination: "/work", permanent: true },
      { source: "/projects", destination: "/work", permanent: true },
      { source: "/jobs", destination: "/work", permanent: true },
      { source: "/jobs/:bookingId", destination: "/work/jobs/:bookingId", permanent: true },
      { source: "/workforce/offers", destination: "/work/offers", permanent: true },
      { source: "/offers", destination: "/work/offers", permanent: true },
      { source: "/workforce/enquiries", destination: "/work", permanent: true },
      { source: "/workforce/enquiries/:invitationId", destination: "/work/enquiries/:invitationId", permanent: true },
      { source: "/projects/enquiries", destination: "/work", permanent: true },
      { source: "/projects/enquiries/:invitationId", destination: "/work/enquiries/:invitationId", permanent: true },
      { source: "/projects/enquiries/:invitationId/estimate", destination: "/work/enquiries/:invitationId/estimate", permanent: true },
      { source: "/workforce/shifts", destination: "/work", permanent: true },
      { source: "/workforce/shifts/:engagementId", destination: "/work/jobs/:engagementId", permanent: true },
      { source: "/workforce/shifts/:engagementId/days/:stageId", destination: "/work/jobs/:engagementId/days/:stageId", permanent: true },
      { source: "/projects/stages", destination: "/work", permanent: true },
      { source: "/projects/stages/:engagementId", destination: "/work/jobs/:engagementId", permanent: true },
      { source: "/workforce/crew", destination: "/me/crew", permanent: true },
      { source: "/earnings", destination: "/money", permanent: true },
      { source: "/profile", destination: "/me", permanent: true },
      { source: "/availability", destination: "/me", permanent: true },
    ];
  },
};
```

- [ ] **Step 2: Delete superseded route directories**

```bash
rm -rf frontend/apps/partner/app/dashboard
rm -rf frontend/apps/partner/app/workforce
rm -rf frontend/apps/partner/app/projects
rm -rf frontend/apps/partner/app/jobs
rm -rf frontend/apps/partner/app/earnings
rm -rf frontend/apps/partner/app/profile
rm -rf frontend/apps/partner/app/availability
```

Before deleting, check each directory for a `layout.tsx` — `app/jobs/`
was noted during planning to have one that currently renders the shared
per-route shell chrome (see the comment quoted in Task 9). Read
`app/jobs/layout.tsx` first; if it renders anything beyond what
`PartnerShell` in the root layout already provides, port that piece into
the new `app/work/jobs/layout.tsx` (Task 9) rather than dropping it
silently.

- [ ] **Step 3: Scaffold new route directories**

Create empty directories (Tasks 6–13 fill each with its `page.tsx`):

```bash
mkdir -p frontend/apps/partner/app/work/offers/\[invitationId\]
mkdir -p frontend/apps/partner/app/work/enquiries/\[invitationId\]/estimate
mkdir -p frontend/apps/partner/app/work/jobs/\[id\]/days/\[stageId\]
mkdir -p frontend/apps/partner/app/money
mkdir -p frontend/apps/partner/app/me/crew
mkdir -p frontend/apps/partner/app/me/language
```

- [ ] **Step 4: Delete the superseded workspace-screens module**

Delete `frontend/apps/partner/features/workspace/view/workspace-screens.tsx`
and its directory if now empty. Its two exports
(`WorkspaceHomeScreen`, `WorkspacePendingScreen`) were only used by the
`app/workforce/*` and `app/projects/*` route files this task already
deleted — confirm with
`grep -rn "WorkspaceHomeScreen\|WorkspacePendingScreen" frontend/apps/partner`
after deletion and resolve any remaining reference by following it to its
Task 6–13 replacement.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter partner typecheck`
Expected: errors will enumerate every remaining reference to a deleted
file — each should resolve to "this is superseded by Task N," not to a
genuinely orphaned dependency. If typecheck finds an import this plan's
task list does not account for, stop and reconcile before continuing to
Task 6.

---

### Task 6: WORK home screen (`/work`)

**Files:**
- Create: `frontend/apps/partner/app/work/page.tsx`
- Create: `frontend/apps/partner/features/work-stack/view/work-home.tsx`

**Interfaces:**
- Consumes: `useWorkStack()` (Task 3), `WorkItem`/`WorkUrgency` (Task 3), `Pictogram` (Task 1), `PartnerPresence` component (existing, `@/features/presence/view/partner-presence` — reused here per the design's "switch + today's money" header, not moved to Me until Task 12; both screens render the same shared component so there is exactly one presence control, matching the existing `PartnerPresence` doc comment's own reasoning against a second copy).
- Source artboards: `Main.dc.html` ("2 · WORK — the one place") for the populated state; `Empty.dc.html` ("12 · Nothing today") for the empty state.

- [ ] **Step 1: Write the route file**

```tsx
// frontend/apps/partner/app/work/page.tsx
import type { Metadata } from "next";

import { WorkHome } from "@/features/work-stack/view/work-home";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Work",
  robots: { index: false, follow: false },
};

export default function WorkPage() {
  return <WorkHome />;
}
```

- [ ] **Step 2: Write the screen**

Port `Main.dc.html`'s markup 1:1 into JSX using the Task 1 token
conversion table (every inline `style="background:#f87000"` becomes
`className="bg-action"`, etc. — the canvas's inline SVGs for the header
logo, notification bell, sun/switch icon, and card icons are copied
verbatim as inline `<svg>`, not routed through `Pictogram`, since they are
one-off decorative marks rather than one of the 40 named pictograms;
anywhere the canvas uses a *named* concept icon — wallet, calendar, clock,
distance pin, checkmark, cross — use `<Pictogram name="…" />` instead of
re-inlining that SVG). Wire the four card slots to real data instead of
the canvas's fixed mock numbers:

```tsx
"use client";

import { formatMoney } from "@vsolve/ui";
import Link from "next/link";

import { Pictogram } from "@/components/pictogram";
import { PartnerPresence } from "@/features/presence/view/partner-presence";
import { usePartnerPerformance } from "@/features/earnings/queries";

import { useWorkStack } from "../queries";
import type { WorkItem } from "../model/work-item";

/**
 * Reads today's net earnings off whatever `usePartnerPerformance` actually
 * returns. `earnings-chart.tsx`'s existing test fixtures (read during
 * planning) confirm the daily series shape is `{date, net_paise, jobs}[]`
 * under some top-level key on the performance payload — but that top-level
 * key's exact name (`daily`? `days`?) and whether "today" is its own field
 * or the last entry of that series was not confirmed. Read
 * `usePartnerPerformance`'s return type in `features/earnings/queries.ts`
 * before finishing this task and replace this function's body with the
 * real access path — do not guess a field name inline in the JSX above,
 * which is why this indirection exists: one place to fix, not a guess
 * buried in a template literal.
 */
function todaysNetPaise(performance: NonNullable<ReturnType<typeof usePartnerPerformance>["data"]>): number {
  throw new Error("wire this to the real PartnerPerformance shape before shipping — see doc comment above");
}

/**
 * The merged WORK home. Replaces the workspace switcher and its two
 * separate home screens (`/workforce`, `/projects`) with one stack, sorted
 * by `useWorkStack`'s urgency order. See
 * `docs/superpowers/specs/2026-08-19-partner-tap-first-redesign-design.md`.
 */
export function WorkHome() {
  const stack = useWorkStack();
  const performance = usePartnerPerformance();

  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <header className="flex flex-col gap-3.5 bg-[linear-gradient(160deg,var(--color-navy-700)_0%,var(--color-navy-900)_100%)] px-4 pt-3.5 pb-3">
        <PartnerPresence />
        <div className="flex items-center gap-3 rounded-card bg-[linear-gradient(160deg,var(--color-navy-700)_0%,var(--color-navy-900)_100%)] p-3.5">
          <Pictogram name="money" className="h-7.5 w-7.5 text-action-hover" />
          <span className="text-[2.75rem] font-extrabold leading-none tracking-tight text-surface">
            {performance.data ? formatMoney(todaysNetPaise(performance.data)) : "—"}
          </span>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-hidden px-4 pt-3.5 pb-3">
        {stack.isPending ? (
          <p className="py-10 text-center text-text-muted">Loading…</p>
        ) : stack.items.length === 0 ? (
          <EmptyWork />
        ) : (
          stack.items.map((item) => <WorkCard key={item.key} item={item} />)
        )}
      </div>
    </main>
  );
}

function WorkCard({ item }: { item: WorkItem }) {
  const styleByUrgency: Record<WorkItem["urgency"], string> = {
    live: "bg-[linear-gradient(135deg,var(--color-signal-400)_0%,var(--color-action)_55%,var(--color-action-active)_100%)] shadow-raised",
    needs_price: "bg-surface border border-line",
    doing: "bg-surface border border-line border-l-[6px] border-l-action-secondary",
    settled: "bg-success-surface border border-success-line",
  };

  return (
    <Link
      href={item.href}
      aria-label={item.accessibleName}
      className={`flex items-center gap-3 rounded-card p-3.5 ${styleByUrgency[item.urgency]}`}
    >
      <span className="text-[2.0625rem] font-extrabold leading-none tracking-tight">
        {item.amountPaise === null ? "₹?" : formatMoney(item.amountPaise)}
      </span>
      {item.areaLabel ? (
        <span className="ml-auto flex items-center gap-1.5 text-sm font-bold text-text-secondary">
          <Pictogram name="distance" className="h-4 w-4" />
          {item.areaLabel}
        </span>
      ) : null}
    </Link>
  );
}

function EmptyWork() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12">
      <Pictogram name="all-work" className="h-20 w-20 text-text-muted" />
    </div>
  );
}
```

**This is a starting skeleton, not the finished screen** — the canvas
source (`Main.dc.html`) has four visually distinct card layouts (live
offer with countdown ring + accept/reject buttons, needs-price with photo
thumbnails, doing-today with progress dots + call/go buttons, settled with
a bank icon) that `WorkCard` above collapses into one generic shape. Port
each of the four card bodies from the canvas file's four `<div class="card"
...>` blocks individually, branching on `item.kind`/`item.urgency` inside
`WorkCard`, before calling this task done — the acceptance list below is
the check for whether that porting is complete.

- [ ] **Step 3: Acceptance check (manual — no test framework needed for a visual port)**

- [ ] Every one of the four `WorkItem.urgency` states renders visually distinct from the canvas source, not just the skeleton's generic card.
- [ ] The live-offer card includes some countdown affordance — does not need the full ring from `Offer.dc.html` (Task 7 owns that), a simple `mm:ss` readout via `useServerCountdown` is enough at card size.
- [ ] `todaysNetPaise` (above) is wired to the real `usePartnerPerformance` shape, not left throwing.
- [ ] No card renders more than 6 words of visible text.
- [ ] Every tappable card is ≥56px tall.
- [ ] `EmptyWork`'s pictogram is the only content when `stack.items.length === 0` — no fabricated placeholder cards.
- [ ] `pnpm --filter partner typecheck && pnpm --filter partner lint` passes.

---

### Task 7: Offer detail screen (`/work/offers/[invitationId]`)

**Files:**
- Create: `frontend/apps/partner/app/work/offers/[invitationId]/page.tsx`
- Create: `frontend/apps/partner/features/crew-offer/view/offer-detail-screen.tsx`

**Interfaces:**
- Consumes: `useServerCountdown` (`@vsolve/query`), `useAcceptCrewOffer`/`useDeclineCrewOffer` (existing, `features/crew-offer/queries.ts`), `isOfferLive` (existing, `features/crew-offer/model/offer-state.ts`).
- Source artboard: `Offer.dc.html` ("3 · Offer, clock running").
- Per Deviation 1: the canvas's "4 km" chip is replaced with `offer.area_label`.

- [ ] **Step 1: Write the route file**

```tsx
// frontend/apps/partner/app/work/offers/[invitationId]/page.tsx
import type { Metadata } from "next";

import { OfferDetailScreen } from "@/features/crew-offer/view/offer-detail-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Offer",
  robots: { index: false, follow: false },
};

export default async function OfferPage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const { invitationId } = await params;
  return <OfferDetailScreen invitationId={invitationId} />;
}
```

- [ ] **Step 2: Write the screen**

Port `Offer.dc.html` 1:1 (the countdown ring, the ₹ figure, the four fact
rows, the accept/reject button pair) using the Task 1 conversion table.
The canvas's `ringOffset`/`clock` computation (a `data-props`
`secondsLeft` prop feeding an SVG `stroke-dashoffset`) becomes a real
countdown against `useServerCountdown`:

```tsx
"use client";

import { useServerCountdown } from "@vsolve/query";
import { formatMoney } from "@vsolve/ui";
import { useRouter } from "next/navigation";

import { Pictogram } from "@/components/pictogram";

import { isOfferLive } from "../model/offer-state";
import { useAcceptCrewOffer, useDeclineCrewOffer, usePartnerCrewOffers } from "../queries";

const RING_CIRCUMFERENCE = 414.7;
/** Matches `Offer.dc.html`'s clock affordance: a 120-second window, same as `LiveOfferSheet`'s deadline. */
const OFFER_WINDOW_SECONDS = 120;

export function OfferDetailScreen({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const offers = usePartnerCrewOffers();
  const offer = offers.data?.offers.find((entry) => entry.invitation_id === invitationId) ?? null;
  const serverNow = offers.data?.server_now ?? null;

  const countdown = useServerCountdown(offer?.responds_by ?? null, serverNow);
  const accept = useAcceptCrewOffer(invitationId);
  const decline = useDeclineCrewOffer(invitationId);

  if (offers.isPending) {
    return <main className="p-6 text-text-secondary">Loading…</main>;
  }

  if (offer === null || serverNow === null || !isOfferLive(offer, serverNow)) {
    // The offer expired or was already answered elsewhere (e.g. LiveOfferSheet
    // on another tab). Route back to the merged stack rather than showing a
    // dead detail screen — same recovery `LiveOfferSheet` already relies on.
    router.replace("/work");
    return null;
  }

  const secondsLeft = Math.max(0, Math.round((countdown.msRemaining ?? 0) / 1000));
  const ringOffset = Math.round(
    RING_CIRCUMFERENCE * (1 - secondsLeft / OFFER_WINDOW_SECONDS),
  );

  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <div className="flex flex-col items-center gap-3.5 rounded-b-[26px] bg-[linear-gradient(135deg,var(--color-signal-400)_0%,var(--color-action)_55%,var(--color-action-active)_100%)] px-5 pt-6 pb-6.5 shadow-raised">
        <div className="relative h-[150px] w-[150px]">
          <svg width="150" height="150" viewBox="0 0 150 150">
            <circle cx="75" cy="75" r="66" className="fill-[rgba(0,17,46,.12)]" />
            <circle cx="75" cy="75" r="66" fill="none" className="stroke-[rgba(0,17,46,.18)]" strokeWidth="11" />
            <circle
              cx="75" cy="75" r="66" fill="none"
              className="stroke-text" strokeWidth="11" strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={ringOffset}
              transform="rotate(-90 75 75)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
            <Pictogram name="time" className="h-6.5 w-6.5 text-text" />
            <span className="text-[2.375rem] font-extrabold leading-tight tabular-nums text-text">
              {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
            </span>
          </div>
        </div>
        <span className="text-[3.75rem] font-extrabold leading-none tracking-tight text-text">
          {formatMoney(offer.lead_total_receipt_paise)}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 px-4 pt-4.5">
        <FactRow icon="distance" value={offer.area_label ?? "—"} />
        <FactRow icon="time" value={new Date(offer.requested_start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} />
        <FactRow icon="days" value={String(offer.days)} />
        <FactRow icon="crew" value={String(offer.headcount)} />
      </div>

      <div className="flex flex-col gap-3 px-4 pb-5 pt-4">
        <button
          type="button"
          onClick={() => accept.mutate()}
          disabled={accept.isPending}
          className="flex h-20 items-center justify-center rounded-[20px] bg-success-text shadow-[0_3px_0_var(--color-success-active)]"
        >
          <Pictogram name="yes" className="h-9.5 w-9.5 text-surface" strokeWidth={3} />
        </button>
        <button
          type="button"
          onClick={() => decline.mutate({ reasonCode: "NO_CAPACITY" })}
          disabled={decline.isPending}
          className="flex h-16 items-center justify-center rounded-2xl border border-line bg-surface-sunken"
        >
          <Pictogram name="no" className="h-7.5 w-7.5 text-text-muted" />
        </button>
      </div>
    </main>
  );
}

function FactRow({ icon, value }: { icon: Parameters<typeof Pictogram>[0]["name"]; value: string }) {
  return (
    <div className="flex items-center gap-3.5 rounded-card border border-line bg-surface px-3.5 py-3">
      <span className="grid h-12.5 w-12.5 shrink-0 place-items-center rounded-2xl bg-selected-surface">
        <Pictogram name={icon} className="h-7 w-7 text-action-secondary" />
      </span>
      <span className="text-2xl font-extrabold tabular-nums">{value}</span>
    </div>
  );
}
```

**Confirm before treating this as done:** `useServerCountdown`'s exact
signature and return shape were not read during planning (only its import
source, `@vsolve/query`, and its call site pattern in `live-offer-sheet.tsx`
were). Read `frontend/packages/query/src/*countdown*` (or grep the package
for `useServerCountdown`) and adjust the `countdown.msRemaining` access
above to match its real field name before typechecking. Likewise confirm
`useDeclineCrewOffer`'s exact mutation input shape (the plan assumes
`{ reasonCode: string }` by analogy with `useDeclineEnquiry`'s pattern
seen in `enquiry/model/decline-reasons.ts` — verify against
`crew-offer/queries.ts`'s actual `useDeclineCrewOffer` signature, since a
crew offer decline may take a different/no reason code).

- [ ] **Step 2: Acceptance check**

- [ ] Countdown ring visibly animates toward empty as `secondsLeft` decreases (verify by temporarily rendering with a mocked near-zero `responds_by` — do not add a permanent test-only prop).
- [ ] Screen redirects to `/work` rather than rendering a broken/expired offer.
- [ ] No visible word longer than a caption; the ₹ figure and countdown are the largest elements on screen, matching `Offer.dc.html`.
- [ ] Both buttons ≥64px tall.
- [ ] `pnpm --filter partner typecheck && pnpm --filter partner lint` passes once the two confirms above are resolved.

---

### Task 8: Enquiry detail screen (`/work/enquiries/[invitationId]`)

**Files:**
- Create: `frontend/apps/partner/app/work/enquiries/[invitationId]/page.tsx`
- Create: `frontend/apps/partner/app/work/enquiries/[invitationId]/estimate/page.tsx`
- Create: `frontend/apps/partner/features/enquiry/view/enquiry-detail-screen.tsx`

**Interfaces:**
- Consumes: `usePartnerEnquiry(invitationId, enabled)`, `useAcceptEnquiry`, `useDeclineEnquiry` (all existing, `features/enquiry/queries.ts`); the already-shipped `TapEstimate` component (`features/proposal/view/tap-estimate.tsx`) — **unchanged except for Task 2's glyph→icon rename, already applied**.
- Source artboard: `Enquiry.dc.html` ("4 · Someone wants a price") for the accept/decline screen. The estimate sub-route is not re-designed here — it already ships the approved tap-first pattern; this task only relocates its route.

- [ ] **Step 1: Write the two route files**

```tsx
// frontend/apps/partner/app/work/enquiries/[invitationId]/page.tsx
import type { Metadata } from "next";

import { EnquiryDetailScreen } from "@/features/enquiry/view/enquiry-detail-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Enquiry",
  robots: { index: false, follow: false },
};

export default async function EnquiryPage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const { invitationId } = await params;
  return <EnquiryDetailScreen invitationId={invitationId} />;
}
```

For the estimate sub-route, find the existing page file at
`frontend/apps/partner/app/projects/enquiries/[invitationId]/estimate/page.tsx`
(read during planning — a 1051-byte file) and copy it verbatim to
`app/work/enquiries/[invitationId]/estimate/page.tsx` with no logic
change — only its path moves, per Task 5's redirect table already pointing
the old URL here.

- [ ] **Step 2: Write the accept/decline screen**

Port `Enquiry.dc.html` (the six-tile category grid, the two photo
thumbnails, the distance/date fact chips, accept/decline buttons) using
the Task 1 table:

```tsx
"use client";

import { Button } from "@vsolve/ui";
import { useRouter } from "next/navigation";

import { Pictogram } from "@/components/pictogram";

import { useAcceptEnquiry, useDeclineEnquiry, usePartnerEnquiry } from "../queries";

export function EnquiryDetailScreen({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const enquiry = usePartnerEnquiry(invitationId);
  const accept = useAcceptEnquiry(invitationId);
  const decline = useDeclineEnquiry(invitationId);

  if (enquiry.isPending) {
    return <main className="p-6 text-text-secondary">Loading…</main>;
  }

  if (enquiry.isError || enquiry.data === undefined) {
    return <main className="p-6 text-text-secondary">This enquiry is no longer available.</main>;
  }

  const data = enquiry.data;

  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <div className="flex items-center gap-3 bg-[linear-gradient(160deg,var(--color-navy-700)_0%,var(--color-navy-900)_100%)] p-4">
        <button type="button" onClick={() => router.back()} className="grid h-11 w-11 place-items-center rounded-2xl bg-white/[.13]">
          <Pictogram name="back" className="h-6 w-6 text-surface" />
        </button>
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[linear-gradient(150deg,var(--color-navy-300)_0%,var(--color-navy-500)_100%)]">
          <Pictogram name="crew" className="h-6.5 w-6.5 text-surface" />
        </span>
      </div>

      <div className="flex flex-col gap-2.5 px-4 pt-3.5">
        <div className="flex items-center gap-2.5 rounded-card border border-line bg-surface p-3">
          <Pictogram name="distance" className="h-6.5 w-6.5 text-action-secondary" />
          <span className="text-[1.6875rem] font-extrabold">
            {data.service_by ? new Date(data.service_by).toLocaleDateString() : "—"}
          </span>
        </div>
      </div>

      <div className="flex-1" />

      <div className="flex flex-col gap-2.5 px-4 pb-5">
        <button
          type="button"
          onClick={() => router.push(`/work/enquiries/${invitationId}/estimate`)}
          className="flex h-[92px] items-center justify-center gap-4 rounded-[20px] bg-action shadow-[0_3px_0_var(--color-action-active)]"
        >
          <Pictogram name="price" className="h-11.5 w-11.5 text-text" strokeWidth={2.2} />
          <Pictogram name="go" className="h-10 w-10 text-text" />
        </button>
        <button
          type="button"
          onClick={() => decline.mutate({ reasonCode: "OUT_OF_SCOPE" })}
          disabled={decline.isPending}
          className="flex h-18 items-center justify-center rounded-[18px] border border-line bg-surface-sunken"
        >
          <Pictogram name="no" className="h-9 w-9 text-text-muted" />
        </button>
      </div>
    </main>
  );
}
```

**Confirm before treating this as done:** the canvas's six-tile category
grid (electrician/plumber/painter/etc. selection) has no equivalent in
`EnquiryDetail`'s actual data — `enquiry-state.ts`/`requirement-facts.ts`
(read during planning) show an enquiry already carries one fixed
`service_name`/`category_slug`, it is not a multi-select the vendor picks
from at this step. The canvas's category grid was drawn as a generic
"what kind of work" illustration, not bound to real accept/decline data.
**Do not port the six-tile grid as an interactive control** — either drop
it, or repurpose it as a single non-interactive pictogram matching
`data.service_name`'s category (nearest `PictogramName` from Task 1's
trades set) so the screen still shows *what* the enquiry is for. This is
flagged as a real design/data mismatch found while implementing, not a
minor styling note — resolve it before this task is considered complete,
and mention the resolution back to the user since it changes what the
canvas showed.

- [ ] **Step 3: Acceptance check**

- [ ] The estimate sub-route file is byte-identical in logic to the existing one at its old path (only the route segment moved).
- [ ] The category-grid mismatch above is resolved one way or the other, not left as dead interactive-looking tiles bound to nothing.
- [ ] `pnpm --filter partner typecheck && pnpm --filter partner lint` passes.

---

### Task 9: Job/engagement detail screen (`/work/jobs/[id]`)

The most complex screen: branches on `kind` (A1 visit vs. M2 engagement)
and, within engagement, on phase (not-yet-arrived / on-site / stages
list). Three canvas artboards map to three render branches of **one**
screen and **one** route, sharing one data fetch — they are not three
separate routes, since a real job moves through these states in place.

**Files:**
- Create: `frontend/apps/partner/app/work/jobs/[id]/page.tsx`
- Create: `frontend/apps/partner/app/work/jobs/[id]/layout.tsx` (only if Task 5 Step 2 found the old `app/jobs/layout.tsx` rendered something worth preserving — otherwise skip this file)
- Create: `frontend/apps/partner/app/work/jobs/[id]/days/[stageId]/page.tsx`
- Create: `frontend/apps/partner/features/work-stack/view/job-detail-screen.tsx`

**Interfaces:**
- Consumes: `usePartnerVisit(bookingId)` + its `can*` guards (existing, `features/work/queries.ts`) for the A1 branch; `usePartnerEngagement(engagementId)` + `describeEngagementStatus` (existing, `features/engagement/queries.ts` + `features/engagement/model/engagement-copy.ts`) for the M2 branch; `WORKFORCE_WORDING`/`PROJECT_WORDING` to keep vocabulary apart per existing convention.
- Source artboards: `Today.dc.html` ("5 · Doing it today"), `Arrive.dc.html` ("6 · Proof you were there"), `Progress.dc.html` ("7 · How far along").

- [ ] **Step 1: Decide the kind from the id**

Both A1 `PartnerVisit.id` and M2 `Engagement.id` are UUIDs from different
tables — there is no shared id space to disambiguate by format. The screen
must try one, then the other:

```tsx
// frontend/apps/partner/features/work-stack/view/job-detail-screen.tsx
"use client";

import { usePartnerVisit } from "@/features/work/queries";
import { usePartnerEngagement } from "@/features/engagement/queries";

import { VisitJobView } from "./visit-job-view";
import { EngagementJobView } from "./engagement-job-view";

/**
 * One route, two record kinds. `/work/jobs/[id]` replaced three routes
 * (`/jobs/[bookingId]`, `/workforce/shifts/[id]`, `/projects/stages/[id]`)
 * that each knew their own kind from the URL segment they lived under; this
 * one does not have that luxury, so it asks for a visit first (cheaper,
 * more common — A1 is the higher-volume record) and falls back to an
 * engagement only on a 404.
 */
export function JobDetailScreen({ id }: { id: string }) {
  const visit = usePartnerVisit(id);
  const engagement = usePartnerEngagement(id, visit.isError);

  if (visit.isPending || (visit.isError && engagement.isPending)) {
    return <main className="p-6 text-text-secondary">Loading…</main>;
  }

  if (visit.data) return <VisitJobView visit={visit.data} />;
  if (engagement.data) return <EngagementJobView engagement={engagement.data} />;

  return <main className="p-6 text-text-secondary">This job is no longer available.</main>;
}
```

**Confirm before treating this as done:** whether `usePartnerVisit` and
`usePartnerEngagement` actually distinguish "not found" (should try the
other kind) from "network error" (should not) via `ApiRequestError.status
=== 404`, the same pattern `dashboard-home.tsx` already uses for a missing
application (`query.error instanceof ApiRequestError && query.error.status
=== 404`). The sketch above conflates `isError` with "try the other kind"
for brevity — narrow it to the 404 case specifically before shipping, or a
genuine network failure on the visit lookup will incorrectly mask itself
as "let me also try engagement," doubling the error noise.

- [ ] **Step 2: Write `VisitJobView` (A1 branch — ports `Today.dc.html` and `Arrive.dc.html`)**

```tsx
// frontend/apps/partner/features/work-stack/view/visit-job-view.tsx
"use client";

import { formatMoney } from "@vsolve/ui";

import { Pictogram } from "@/components/pictogram";
import {
  canArrive, canGoEnRoute, canReportCompletion, canStartWork,
  useMarkArrived, useMarkEnRoute, useSubmitCompletion,
  type PartnerVisit,
} from "@/features/work/queries";
import { STATUS_COPY } from "@/features/work/model/status";

/**
 * The A1 single-visit job screen. `Today.dc.html` when the visit has not
 * started arrival yet; `Arrive.dc.html`'s camera-first evidence capture
 * once `canReportCompletion` is true. One screen, two render branches —
 * not two routes, since a real visit moves through this in place.
 */
export function VisitJobView({ visit }: { visit: PartnerVisit }) {
  const arrive = useMarkArrived(visit.id);
  const enRoute = useMarkEnRoute(visit.id);
  const completion = useSubmitCompletion(visit.id);

  const showEvidenceCapture = canReportCompletion(visit);

  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <div className="flex flex-col gap-3.5 rounded-b-3xl bg-[linear-gradient(160deg,var(--color-navy-700)_0%,var(--color-navy-900)_100%)] px-4 pt-4 pb-5">
        <div className="flex items-center gap-4">
          <Pictogram name="time" className="h-11.5 w-11.5 text-surface" />
          <span className="text-[3.875rem] font-extrabold leading-none text-surface">
            {new Date(visit.scheduled_start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 px-4 pt-4">
        {!showEvidenceCapture ? (
          <>
            {canGoEnRoute(visit) ? (
              <button
                type="button"
                onClick={() => enRoute.mutate()}
                disabled={enRoute.isPending}
                className="flex h-16 items-center justify-center rounded-[20px] bg-action-secondary"
              >
                <Pictogram name="go" className="h-7.5 w-7.5 text-surface" />
              </button>
            ) : null}
            {canArrive(visit) ? (
              <button
                type="button"
                onClick={() => arrive.mutate()}
                disabled={arrive.isPending}
                className="flex h-16 items-center justify-center rounded-[20px] bg-success-text"
              >
                <Pictogram name="yes" className="h-7.5 w-7.5 text-surface" />
              </button>
            ) : null}
          </>
        ) : (
          <button
            type="button"
            onClick={() => completion.mutate({ outcome: "COMPLETED" })}
            disabled={completion.isPending}
            className="flex aspect-[3/2] items-center justify-center rounded-[22px] bg-[linear-gradient(155deg,var(--color-navy-600)_0%,var(--color-action-secondary)_45%,var(--color-navy-800)_100%)]"
          >
            <Pictogram name="photo" className="h-24 w-24 text-surface/40" />
          </button>
        )}
      </div>

      {visit.customer_contact?.phone ? (
        <a
          href={`tel:${visit.customer_contact.phone}`}
          className="mx-4 mb-4 flex h-16 items-center justify-center rounded-[20px] bg-success-text"
        >
          <Pictogram name="call" className="h-8 w-8 text-surface" />
        </a>
      ) : null}

      <p className="px-4 pb-4 text-center text-xs font-semibold uppercase tracking-wide text-text-muted">
        {STATUS_COPY[visit.status].label}
      </p>
    </main>
  );
}
```

**Confirm before treating this as done — two items, not one:**

1. `visit.customer_contact?.phone` above is a placeholder access path, not
   a confirmed field. `Today.dc.html` and `Progress.dc.html` (both source
   artboards for this task) each end in a large green call button, so the
   spec's approved "call customer — one giant green button, on every
   active job card" feature is real and must be wired — but this plan's
   research pass found only a `contact_released_at` *timestamp* field (on
   `engagement-card.tsx`, not on `PartnerVisit`) and no actual phone-number
   field anywhere in the codebase, confirmed by a targeted grep for
   `customer_phone`/`contact_phone`/`tel:` that came back empty. Before
   shipping this button: grep the generated `Schemas["PartnerBooking"]`
   and `Schemas["Engagement"]` types directly (not just usage sites — the
   field may exist but be unused so far) for the real contact shape near
   wherever `contact_released_at` lives. **If no phone field is published
   pre-disclosure, do not render this button as if calling would work —
   render nothing** (same rule as the distance chip in Deviation 1), and
   tell the user the call-customer feature needs a published field before
   it can be real.
2. `useSubmitCompletion`'s exact
mutation input shape (`{ outcome: "COMPLETED" }` is a guess by analogy
with `OutcomeInput` seen imported in `work-panel.tsx` — read that type's
real fields, since real completion likely needs task-level outcome data,
not a single top-level enum, and the canvas's photo-capture button implies
an image upload step this sketch does not yet wire). This is the single
most likely spot in the whole plan to be wrong, because evidence/photo
upload was not read in detail during planning (only referenced in passing
via `evidence-composer.tsx`'s existence for the *engagement* side). Read
`useSubmitCompletion` and `work-panel.tsx`'s existing evidence-submission
flow in full before finishing this step, and port its real upload
mechanics rather than the placeholder single-tap button above.

- [ ] **Step 3: Write `EngagementJobView` (M2 branch — ports `Progress.dc.html`)**

```tsx
// frontend/apps/partner/features/work-stack/view/engagement-job-view.tsx
"use client";

import { formatMoney } from "@vsolve/ui";
import Link from "next/link";

import { Pictogram } from "@/components/pictogram";
import {
  describeEngagementStatus, PROJECT_WORDING, WORKFORCE_WORDING,
} from "@/features/engagement/model/engagement-copy";
import type { Engagement } from "@/features/engagement/queries";

export function EngagementJobView({ engagement }: { engagement: Engagement }) {
  const wording = engagement.commercial_mode === "A3_TIME_BLOCK" ? WORKFORCE_WORDING : PROJECT_WORDING;
  const status = describeEngagementStatus(engagement, wording);

  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <div className="flex flex-col gap-3 rounded-b-3xl bg-[linear-gradient(160deg,var(--color-navy-700)_0%,var(--color-navy-900)_100%)] px-4 pt-4 pb-4.5">
        <span className="text-[2.5rem] font-extrabold leading-none text-surface">
          {formatMoney(engagement.commission_paise ?? 0)}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 px-4 pt-4">
        {engagement.stages.map((stage) => (
          <Link
            key={stage.id}
            href={`/work/jobs/${engagement.id}/days/${stage.id}`}
            className="flex items-center gap-3 rounded-card border border-line bg-surface p-3.5"
          >
            <span className="grid h-13 w-13 shrink-0 place-items-center rounded-2xl bg-success-surface">
              <Pictogram name="done" className="h-7.5 w-7.5 text-success-text" strokeWidth={3} />
            </span>
            <span className="text-2xl font-extrabold tabular-nums">
              {formatMoney(stage.amount_paise ?? 0)}
            </span>
          </Link>
        ))}
      </div>

      {engagement.customer_contact?.phone ? (
        <a
          href={`tel:${engagement.customer_contact.phone}`}
          className="mx-4 mb-4 flex h-16 items-center justify-center rounded-[20px] bg-success-text"
        >
          <Pictogram name="call" className="h-8 w-8 text-surface" />
        </a>
      ) : null}

      {status ? (
        <p className="px-4 pb-4 text-center text-xs font-semibold uppercase tracking-wide text-text-muted">
          {status.label}
        </p>
      ) : null}
    </main>
  );
}
```

**Confirm before treating this as done:** the same unresolved contact-field
question flagged in `VisitJobView` above applies here too —
`engagement.customer_contact?.phone` is a placeholder access path,
resolve it the same way (real field or no button, never a fabricated
number) before shipping. Also, `EngagementStage`'s exact field
name for its money amount (`stage.amount_paise` is a guess — grep
`EngagementStage` usage in `features/engagement/view/*` for the real field
name before shipping) and whether `Engagement.stages` is present on the
`usePartnerEngagement(id)` single-record read the same way it would need
to be (the plan confirmed `.stages` exists on the `Engagement` type from
`engagement.stages` usage seen in `work-panel.tsx`'s import list, but not
its exact per-stage shape).

- [ ] **Step 4: Route files**

```tsx
// frontend/apps/partner/app/work/jobs/[id]/page.tsx
import type { Metadata } from "next";

import { JobDetailScreen } from "@/features/work-stack/view/job-detail-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Job",
  robots: { index: false, follow: false },
};

export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <JobDetailScreen id={id} />;
}
```

For `app/work/jobs/[id]/days/[stageId]/page.tsx`: copy the existing
shift-day route at
`app/workforce/shifts/[engagementId]/days/[stageId]/page.tsx` verbatim,
adjusting only its param name from `engagementId` to `id` to match the
new parent segment.

- [ ] **Step 5: Acceptance check**

- [ ] Every guessed field name flagged in Steps 2–3 has been confirmed against the real generated types and corrected.
- [ ] The call-customer button (on both branches) is either wired to a real, confirmed phone field, or absent entirely — never rendered against a guessed field name that would silently produce a dead or wrong `tel:` link.
- [ ] The A1 and M2 branches never mix vocabulary (no "stage" language on a visit, no "visit" language on an engagement) — matches the existing `StageWording` split's stated purpose.
- [ ] `pnpm --filter partner typecheck && pnpm --filter partner lint` passes.

---

### Task 10: Money screen (`/money`)

**Files:**
- Create: `frontend/apps/partner/app/money/page.tsx`
- Modify: `frontend/apps/partner/features/earnings/view/earnings-panel.tsx` (restyle in place — the data logic is unchanged, confirmed correct and already server-derived per its own doc comment)

**Interfaces:**
- Consumes: `usePartnerBalance`, `usePartnerLedger`, `usePartnerPayoutAccount`, `usePartnerPerformance` — all existing, unchanged.
- Source artboard: `Money.dc.html` ("8 · MONEY").

- [ ] **Step 1: Route file**

```tsx
// frontend/apps/partner/app/money/page.tsx
import type { Metadata } from "next";

import { EarningsPanel } from "@/features/earnings/view/earnings-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Money",
  robots: { index: false, follow: false },
};

export default function MoneyPage() {
  return <EarningsPanel />;
}
```

- [ ] **Step 2: Restyle `earnings-panel.tsx`**

This component's existing structure (four balance numbers, a ledger list,
the `EarningsChart` bar chart) is sound and already follows "every figure
is the server's, nothing computed here" — the task is porting `Money.dc.html`'s
visual language onto it, not rebuilding its data flow. Read the current
file in full, then:
- Replace its balance-split cards' styling with the canvas's plate layout
  (three colour-coded plates: success/info/warning per the balance status,
  using `STATUS_TONE`'s existing mapping — do not invent new status colours,
  the existing `STATUS_TONE`/`STATUS_LABEL` records in this file already
  match Task 1's token table).
- Replace each ledger row's icon (currently `lucide-react` icons per the
  file's existing imports: `AlertTriangle`, `CheckCircle2`, `Hourglass`,
  `Landmark`) with the matching `Pictogram` name (`later`/`done`/`held`/
  `money` respectively) — this is the one screen where swapping an
  existing *icon library* usage for `Pictogram` matters, not just emoji.
- Keep `EarningsChart` as-is; it is already a hand-drawn, accessible bar
  chart per its own doc comment and needs no redesign.

- [ ] **Step 3: Acceptance check**

- [ ] `STATUS_TONE`/`STATUS_LABEL` mappings are unchanged (only their rendering, not their logic).
- [ ] Every `lucide-react` icon import in this file is replaced with `Pictogram`.
- [ ] `pnpm --filter partner typecheck && pnpm --filter partner lint` passes.

---

### Task 11: Me screen (`/me`)

**Files:**
- Create: `frontend/apps/partner/app/me/page.tsx`
- Create: `frontend/apps/partner/features/session/view/me-home.tsx`

**Interfaces:**
- Consumes: `usePartnerApplication` (existing), `PartnerPresence` (existing — same component Task 6 uses in the WORK header; per Deviation 4, this is the real availability control now that the calendar screen is dropped), `useLogout` (existing, `@vsolve/query`).
- Source artboard: `Me.dc.html` ("9 · ME"). The Days tile from that artboard is **not built** — Deviation 4 — its slot in the tile grid is replaced with nothing (the grid has 6 tiles in the canvas; ship 5, do not pad the sixth with a placeholder per the Global Constraint against fabricated content).

- [ ] **Step 1: Route file**

```tsx
// frontend/apps/partner/app/me/page.tsx
import type { Metadata } from "next";

import { MeHome } from "@/features/session/view/me-home";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Me",
  robots: { index: false, follow: false },
};

export default function MePage() {
  return <MeHome />;
}
```

- [ ] **Step 2: Write the screen**

Port `Me.dc.html`'s avatar header and tile grid, dropping the Days tile
per Deviation 4:

```tsx
"use client";

import Link from "next/link";
import { useLogout } from "@vsolve/query";

import { Pictogram } from "@/components/pictogram";
import { PartnerPresence } from "@/features/presence/view/partner-presence";
import { getApiClient } from "@/lib/api/browser";

export function MeHome() {
  const logout = useLogout(getApiClient());

  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <div className="flex flex-col items-center gap-3 rounded-b-3xl bg-[linear-gradient(160deg,var(--color-navy-700)_0%,var(--color-navy-900)_100%)] px-4 pt-6.5 pb-6">
        <div className="grid h-25 w-25 place-items-center rounded-[30px] bg-[linear-gradient(150deg,var(--color-navy-300)_0%,var(--color-navy-500)_100%)] shadow-raised">
          <Pictogram name="crew" className="h-14 w-14 text-surface" strokeWidth={1.7} />
        </div>
      </div>

      <div className="px-4 pt-4">
        <PartnerPresence />
      </div>

      <div className="grid flex-1 grid-cols-3 content-start gap-2.5 px-4 pt-4.5">
        <MeTile href="/me/crew" icon="crew" />
        <MeTile href="/money" icon="papers" />
        <MeTile href="/me/language" icon="language" tone="warning" />
        <button
          type="button"
          onClick={() => logout.mutate()}
          className="col-span-3 mt-3 flex h-16.5 items-center justify-center rounded-2xl border border-line bg-surface"
        >
          <Pictogram name="back" className="h-7.5 w-7.5 text-danger-text" />
        </button>
      </div>
    </main>
  );
}

function MeTile({
  href, icon, tone = "neutral",
}: {
  href: string;
  icon: Parameters<typeof Pictogram>[0]["name"];
  tone?: "neutral" | "warning";
}) {
  return (
    <Link
      href={href}
      className={
        tone === "warning"
          ? "flex min-h-[118px] flex-col items-center justify-center gap-2.5 rounded-[18px] border border-action-line bg-action-surface"
          : "flex min-h-[118px] flex-col items-center justify-center gap-2.5 rounded-[18px] border border-line bg-surface shadow-card"
      }
    >
      <Pictogram name={icon} className={tone === "warning" ? "h-10.5 w-10.5 text-warning-text" : "h-10.5 w-10.5 text-action-secondary"} />
    </Link>
  );
}
```

Note: the canvas's `Me.dc.html` shows a "Skills" tile and a "Help" tile
alongside Crew/Days/Papers/Language, for 6 total. This sketch keeps 3
(Crew, Money-as-Papers, Language) plus Sign out, since Skills and Help
have no existing route or feature in this codebase to link to — per the
same Global Constraint, do not add tiles that link nowhere. If the user
wants Skills/Help tiles, they need a destination decided first; flag this
rather than linking a tile to a dead route.

- [ ] **Step 3: Acceptance check**

- [ ] No tile links to a route that does not exist.
- [ ] The Days tile is absent, not present-but-disabled (Deviation 4 — dropped, not degraded).
- [ ] `pnpm --filter partner typecheck && pnpm --filter partner lint` passes.

---

### Task 12: Crew screen (`/me/crew`)

**Files:**
- Create: `frontend/apps/partner/app/me/crew/page.tsx`
- Modify: `frontend/apps/partner/features/crew/view/*` (restyle in place — find the existing crew list/roster view component with `find frontend/apps/partner/features/crew/view -name "*.tsx" -not -name "*.test.tsx"`, read it, and port `Crew.dc.html`'s avatar-grid styling onto its existing `activeMembers`/`archivedMembers` data split from `adapters/roster.ts`, which is unchanged)

**Interfaces:**
- Consumes: whatever hook the existing crew view already uses from `features/crew/queries.ts` (read that file's exports before starting — the plan confirmed `activeMembers`/`archivedMembers` adapter functions exist but did not read the view component itself).
- Source artboard: `Crew.dc.html` ("10 · Your crew").

- [ ] **Step 1: Route file**

```tsx
// frontend/apps/partner/app/me/crew/page.tsx
import type { Metadata } from "next";

import { CrewScreen } from "@/features/crew/view/crew-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Crew",
  robots: { index: false, follow: false },
};

export default function CrewPage() {
  return <CrewScreen />;
}
```

If the existing crew view component is not named `CrewScreen` /
`crew-screen.tsx`, adjust this import to match its real name rather than
renaming the existing file — porting styling onto an existing component
should not also rename it without reason.

- [ ] **Step 2: Restyle the existing crew view**

Port `Crew.dc.html`'s avatar-grid (gradient-filled circular avatars with a
status dot: green check for active, grey cross for archived, orange
clock for pending) onto whatever list rendering the existing view
currently uses, keeping every existing mutation/command wired exactly as
it is today — this task changes presentation only. Use `activeMembers`/
`archivedMembers` from `adapters/roster.ts` unchanged for the data split.

- [ ] **Step 3: Acceptance check**

- [ ] Every existing crew command (add/archive/whatever the current view offers) still works after the restyle — confirm by reading the pre-existing component's handlers and verifying each is still wired, not removed.
- [ ] `pnpm --filter partner typecheck && pnpm --filter partner lint` passes.

---

### Task 13: Language picker (`/me/language`)

**Files:**
- Create: `frontend/apps/partner/app/me/language/page.tsx`
- Create: `frontend/apps/partner/features/session/view/language-picker.tsx`

**Interfaces:**
- Consumes: `Locale` type and `DEFAULT_LOCALE` from `@vsolve/ui`'s `i18n.tsx` (existing seam — this task wires the picker UI to it; it does not add Telugu/Hindi copy, per the spec's Non-goals).
- Source artboard: `Language.dc.html` ("1 · Pick a language").

- [ ] **Step 1: Route file**

```tsx
// frontend/apps/partner/app/me/language/page.tsx
import type { Metadata } from "next";

import { LanguagePicker } from "@/features/session/view/language-picker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Language",
  robots: { index: false, follow: false },
};

export default function LanguagePage() {
  return <LanguagePicker />;
}
```

- [ ] **Step 2: Write the picker**

Port `Language.dc.html`'s three full-width script buttons. Since no
translated catalog exists yet (Non-goal), selecting Telugu or Hindi here
sets the stored locale preference (for when catalogs do land) but the app
continues rendering English strings everywhere else — this is stated
honestly in the screen rather than pretended otherwise:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Pictogram } from "@/components/pictogram";

const LOCALE_STORAGE_KEY = "vsh-partner-locale";

const OPTIONS: readonly { code: "te-IN" | "hi-IN" | "en-IN"; script: string; fontClass: string }[] = [
  { code: "te-IN", script: "తెలుగు", fontClass: "font-[var(--font-telugu)]" },
  { code: "hi-IN", script: "हिन्दी", fontClass: "font-[var(--font-devanagari)]" },
  { code: "en-IN", script: "English", fontClass: "" },
];

export function LanguagePicker() {
  const router = useRouter();
  const [selected, setSelected] = useState<(typeof OPTIONS)[number]["code"]>("en-IN");

  return (
    <main className="flex min-h-screen flex-col bg-[linear-gradient(170deg,var(--color-navy-700)_0%,var(--color-navy-900)_60%,var(--color-navy-900)_100%)] px-5">
      <div className="flex flex-col items-center gap-4.5 pt-16 pb-11">
        <div className="grid h-19 w-19 place-items-center rounded-[22px] bg-action shadow-raised">
          <Pictogram name="home" className="h-11 w-11 text-text" />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3.5">
        {OPTIONS.map((option) => (
          <button
            key={option.code}
            type="button"
            onClick={() => setSelected(option.code)}
            className={
              selected === option.code
                ? "flex items-center gap-4.5 rounded-[22px] bg-action px-5.5 py-5.5 shadow-[0_4px_0_var(--color-action-active)]"
                : "flex items-center gap-4.5 rounded-[22px] bg-surface px-5.5 py-5.5 shadow-[0_4px_0_var(--color-warm-300)]"
            }
          >
            <span className={`flex-1 text-left text-[2.75rem] font-bold leading-tight ${option.fontClass}`}>
              {option.script}
            </span>
          </button>
        ))}
      </div>

      <div className="pb-8.5 pt-7">
        <button
          type="button"
          onClick={() => {
            window.localStorage.setItem(LOCALE_STORAGE_KEY, selected);
            router.back();
          }}
          className="flex h-22 w-full items-center justify-center rounded-[22px] bg-success-text shadow-[0_4px_0_var(--color-success-active)]"
        >
          <Pictogram name="go" className="h-11.5 w-11.5 text-surface" strokeWidth={2.4} />
        </button>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm --filter partner typecheck && pnpm --filter partner lint`
Expected: no errors.

---

## Final step — stop

- [ ] **Do not commit.** Every task above is now built and typechecked/linted. Per project policy, tests were written but never executed, and no commit has been made at any point in this plan. Report the completed file list to the user and wait for them to review and explicitly ask for a commit.

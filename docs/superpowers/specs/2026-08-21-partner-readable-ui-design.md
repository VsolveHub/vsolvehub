# Partner app: make the tap-first redesign readable, and the estimate one scroll

2026-08-21

Supersedes one rule of `2026-08-19-partner-tap-first-redesign-design.md`. It
does not supersede that spec: the information architecture it introduced —
three tabs, one merged work stack, the drawn pictogram set, the three
gradients — is kept in full. One constraint inside it is replaced.

## Problem

The 2026-08-19 redesign was approved with this constraint:

> Rejected: a listen-aloud/TTS button. Pictures and numbers alone must carry
> the meaning, so captions stay to one word.

It was implemented literally, and the result is an app whose words were
written and then hidden. `WorkItem.accessibleName` — the field holding
"Plumbing repair, Kondapur" — carries this comment
(`features/work-stack/model/work-item.ts:96`):

> Accessible name only — this app renders pictures and numbers, never this
> string as visible body copy.

There are 55 `sr-only` spans in the app, 48 of them on the signed-in surface.
The copy exists. Nobody can see it.

### What a Partner actually sees today

| Screen | Renders | Hidden in `sr-only` |
|---|---|---|
| `/work` card (`work-home.tsx:402`) | `₹4,500`, pin + area, countdown | **what the job is**, who it is for |
| `/work` card action bar (`work-home.tsx:495`, `NeedsPriceCard`) | 56px orange bar: `₹` `→` | any verb |
| `/work` empty (`work-home.tsx:274`) | dashed circle + briefcase | "You have no work waiting right now." |
| Today plate (`work-home.tsx:251`) | sun glyph + `₹0` | "earned today" |
| `/me` tiles (`me-home.tsx:91`) | three bare icons | Crew / Money / Language |
| `/me` sign out (`me-home.tsx:96`) | **a red left-arrow, alone** | "Sign out" |
| Crew offer accept (`offer-detail-screen.tsx:264`) | **80px green button, a tick** | "Take this job" |
| Crew offer decline (`offer-detail-screen.tsx:274`) | grey button, a cross | "Pass on this job" |
| Enquiry detail (`enquiry-detail-screen.tsx:157`) | navy header, a badge | **`service_name`** |
| Enquiry send price (`enquiry-detail-screen.tsx:351`) | 92px orange: `₹` `→` | "Send your price" |
| Fact rows (both detail screens) | icon + value | what the value *is* |

Three of those are consequential rather than cosmetic:

1. **A red left-pointing arrow is the sign-out control.** It is visually
   indistinguishable from "back", which the same pictogram (`back`) means
   everywhere else in the app — `visit-job-view.tsx:101`,
   `enquiry-detail-screen.tsx:165`, `offer-detail-screen.tsx:473`. The same
   glyph means "go back" four times and "end your session" once.
2. **Accepting paid work is an unlabelled tick.** A crew offer commits a lead
   to staffing a job at a fixed receipt. The control that does it contains no
   word in any language.
3. **The work card omits the job.** A Partner sees a price and an area for
   something whose identity is not on screen.

### Why the premise was over-applied

Low literacy is not zero literacy, and the spec concedes the point itself
when it makes digits the largest element on every screen. The apps this
audience already uses daily — PhonePe, Ola Partner, Swiggy Partner — are
uniformly icon **plus** short word. Icon-alone serves neither the reader nor
the non-reader; it only serves the person who already knows the app.

The redesign is also inconsistent with itself. The bottom tab bar kept its
text labels (`TAP_FIRST_NAV`, `registry.ts:141`), and `/apply`, `/login`, the
error states and the whole marketing tree kept full prose. A Partner reads
paragraphs through onboarding and then arrives at a wordless workspace.

### A second, independent defect: pictogram sizing is a cascade coin-flip

`Pictogram` hard-codes `h-6 w-6` and merges caller classes with `cn`, which is
plain `clsx` and not `tailwind-merge` (`frontend/packages/ui/src/cn.ts:3`):

```ts
export function cn(...inputs: ClassValue[]): string { return clsx(inputs); }
```

So `<Pictogram className="h-5 w-5" />` emits `class="h-6 w-6 h-5 w-5"` — both
survive, and stylesheet order decides which wins, not the caller. There are 16
distinct size overrides across 12 files, including `h-3`, `h-3.5` and `h-5`,
all *below* the baked-in default. `work-home.tsx:328` documents the defect in a
comment and works around it by only ever sizing up; nothing else in the app
follows that rule.

This is not a styling preference. It is why icons render at sizes nobody
chose.

### Third: the estimate is five screens of scrolling

`features/proposal/view/tap-estimate.tsx` is three steps, and each selected
item is rendered **three times**:

1. as a tile in the `grid-cols-3` preset grid (`WorkStep`),
2. again as a 56px row in "Put a price on each one" (`WorkStep`),
3. again as a `SummaryRow` in `CheckStep`.

Measured against ~530px of usable viewport (640px, less the 56px sticky header
and the 56px fixed tab bar):

| Step | Content | Height |
|---|---|---|
| work | 9 work tiles + 6 material tiles (5 rows x 80px) + price list (5 x 56px) + labels | ~900px |
| extras | 2 tax cards + 4 warranty tiles + 5 exclusion tiles + labels | ~500px |
| check | summary rows + two buttons | ~400px |

Plus: pricing any row opens `MoneyPad` as a **full-screen replacement** of the
composer (`tap-estimate.tsx:102`, the `if (pricing !== null)` early return). A
five-line estimate is five complete context switches out of the screen and
back.

## Approved direction

Approach **B**, approved 2026-08-21: restore visible labels app-wide, fix
pictogram sizing at the component, and rebuild the estimate as one scroll.
Plus the genuinely-open items from the 2026-08-19 punch list.

### The rule that replaces the old one

> **Every tap target and every fact carries a visible label. The picture is
> the fast path; the word is the guarantee.**
>
> Labels are short — one to three words, imperative for actions. Prose
> paragraphs stay banned on the signed-in work surface. That half of the
> original diagnosis was correct and is unchanged.

The distinction that matters: the old rule banned *words*. This one bans
*sentences*. "Take this job" is a label. "Accepting this offer commits you to
supplying two helpers for three days" is prose, and stays out.

## Scope

### In

1. Label restoration across the signed-in surface (§1), including the control
   tiers in §1.1a.
2. `Pictogram` size prop and call-site conversion (§2).
3. Estimate rebuilt to one scroll (§3).
4. The `--color-critical` token fix (§4b).
5. `/me/profile` restyled into the tap-first language (§4).
6. The `/dashboard` hardcode (§4).

### Deferred, and named rather than quietly dropped

**The third visual language.** Walking the vendor journey turned up that the
app carries three visual languages, not one:

| Language | Where | Looks like |
|---|---|---|
| Wordless pictogram | `/work`, `/me`, offer, enquiry, job | bare glyphs, `sr-only` labels |
| Labelled modern | `/money`, `/me/profile` | uppercase micro-labels, lucide icons, `Card` |
| Prose + Card | `/apply`, A3 shift day, live-offer sheet | `Card`, `Button`, `Field`, paragraphs |

An A3 lead accepts a wordless tick on the offer screen and then opens their
shift day into `arrival-panel.tsx:60` — a `Card` with a heading and three
paragraphs. That whiplash is a real part of "the UI is not built properly".

It is **not** fixed by this spec. It is a different kind of change — a
component-library migration across ~10 files (`shift/view/*`,
`live-offer-sheet.tsx`, `earnings-panel.tsx`, `profile-panel.tsx`) rather than
a labelling pass — and folding it in would have doubled the change under one
review. `/me/profile` is the one member of that set included, because `/me`
links straight into it.

### Out

- `cn` → `tailwind-merge`. It is shared by three apps and is its own decision.
- Per-archetype estimate presets. `archetype` is published as an unenumerated
  `type: string` (`contracts/openapi/v1.yaml:17228`) and this route is A5-only,
  so there is no client-side basis for filtering. `estimate-presets.ts` already
  says the catalogue is the right home for it. §3 substitutes a
  recently-used ordering instead, which needs no contract.
- The `PARTIAL`-outcome quantity bug (I7's first half). It is pre-existing —
  `work-panel.tsx:200` had it identically — it is a backend-reconciliation
  question, and it deserves its own ticket rather than a ride on a UI branch.
- Any backend or contract change. This spec is frontend-only.

### Already fixed, verified 2026-08-21, no longer in scope

Against `feat/m2-workforce-projects` at `c30c70e` plus the staged working
tree, these HANDOFF entries are **done** and the handoff document is stale on
them: C1 (`app/work/jobs/[id]/stages/[stageId]/page.tsx` now mounts
`ProjectEngagementScreen`), C2 (`me-home.tsx:70` gates the Crew tile on
`hasWorkspaceAction`), I1 (`fromQuotedEnquiries`, `work-item.ts:298`), I2
(`isRecentlySettled`, `work-item.ts:449`), I3 (`ProjectInvitationBanner` is
gone from `WorkHome`), I5 (both literals converted), I8
(`language-picker.tsx:37` reads localStorage), and I4's routing half
(`app/me/profile/page.tsx` exists).

---

## 1. Label restoration

### 1.1 The type scale

| Role | Size / weight | Example |
|---|---|---|
| Card title | 16px / 600 | `Plumbing repair` |
| Action label | 15px / 700 | `Send a price` |
| Tile label | 13px / 600 | `Crew` |
| Fact label | 13px / 500, `text-text-secondary` | `Distance` |
| Fact value | 15px / 700 | `4.2 km` |

Money keeps its existing display sizes untouched. The label never competes
with the number — it sits above or beside it at a third of the size.

### 1.1a Control tiers — shape carries the stakes

A label alone does not fix §4a, because two labelled grey rectangles still look
alike at arm's length in sunlight. Tier is carried by **shape**, so the
distinction survives a glance:

| Tier | Size | Treatment | Used for |
|---|---|---|---|
| Decision | 80px | filled, centred, r20, icon `lg` + verb 20/700, 3px hard shadow | accept an offer, accept an enquiry |
| On-site primary | 80px | filled, centred, r20, verb 20/700 | `BigAction` — on my way, arrived, start work, send report |
| Commit / card action | 56px | filled, centred, r13, icon `md` + verb 16/700, 2px hard shadow | card action bars, "Send to customer" |
| Secondary | 60px | **outlined, left-aligned**, verb 16/700 over consequence 12/500 | "Nobody is here" |
| Destructive | 60px | outlined, danger surface + line, **last on the screen**, under a rule | "Hand this job back" |

Filled and centred means go. Outlined and left-aligned means think. Red and
last means you lose something. Two controls cannot collide the way §4a
describes even if a future screen reuses a glyph.

### 1.1b The one icon-only exception

A 44px back chevron in a screen header stays icon-only with an `sr-only`
"Back". It is the most universally understood glyph in mobile UI, it is
positionally unambiguous, and a visible word beside it would push the screen
title out of a 360px header. Every *other* control that changes server state
carries its verb, without exception.

### 1.2 The mechanical part

For every `<span className="sr-only">X</span>` that sits inside a tap target
or beside a fact on the signed-in surface, drop the `sr-only` and render `X`
at the scale above. The copy is already written and already reviewed; this is
a visibility change, not a writing exercise.

`sr-only` **stays** in exactly three cases:

- `<h1 className="sr-only">` landmark names — every screen has a visible
  heading or an unambiguous header plate, and a second visible `<h1>` would
  duplicate it. (`work-home.tsx:180`, `me-home.tsx:74`, `visit-job-view.tsx:93`,
  `engagement-job-view.tsx:76`, `offer-detail-screen.tsx:225`,
  `enquiry-detail-screen.tsx:157`, `app/money/page.tsx`.)
- Countdown announcements (`work-home.tsx:457`,
  `offer-detail-screen.tsx:413`) — a per-second visible duplicate of digits
  already on screen, and the `announce` string is deliberately coarser than
  `display`.
- Stepper increment/decrement names (`attendance-panel.tsx:144,163`) — the
  `+`/`−` glyphs are already universally legible and a label would not fit.

### 1.3 Per-screen changes

**`features/work-stack/view/work-home.tsx`**

- `WorkCard` gains a title line rendering `item.accessibleName`, above the
  money figure, 16px/600, `truncate`. Applies to all four variants —
  `LiveOfferCard`, `NeedsPriceCard`, `DoingCard`, `SettledCard`.
- `accessibleName` loses its "never as visible body copy" restriction in
  `work-item.ts:96`; the doc comment is rewritten to say it is the card title.
  The adapter functions already compose it correctly for all five sources —
  no adapter logic changes.
- `BAR` action bars gain a verb between the two pictograms: `Send a price`
  (`NeedsPriceCard`), `Open` (`DoingCard`).
- `TodayPlate` gains `Earned today` above the figure, 13px/600 at 80% opacity
  on the navy plate. The existing `sr-only` span is deleted.
- `EmptyWork` gains `Nothing waiting right now` under the medallion, 15px,
  `text-text-secondary`.
- `Fact` gains an optional visible label, used where the glyph is ambiguous.

**`features/session/view/me-home.tsx`**

- `MeTile` renders `label` visibly under the icon. `aria-label` is dropped —
  the visible text becomes the accessible name, and keeping both would
  announce it twice.
- **Sign out moves out of the tile grid** into its own row below a divider,
  rendering `Sign out` beside the glyph. Its pictogram changes from `back` to
  `power` — `back` means "go back" in four other places and must not also mean
  "end your session".
- The avatar link gains a visible `Your profile` caption.

**`features/crew-offer/view/offer-detail-screen.tsx`**

- Accept renders `Take this job`, decline renders `Pass`. Both keep their
  glyph, their height and their colour; the word goes beside the glyph.
- `Fact`-style rows render their `label` visibly.
- The back link renders `Your work`.

**`features/enquiry/view/enquiry-detail-screen.tsx`**

- The navy header renders `enquiry.serviceName` visibly at 18px/600 on
  `text-surface`. This is the single highest-value line in the whole change:
  it is what the job *is*. The `sr-only` `<h1>` stays as the landmark.
- Accept renders `Accept`, decline renders `Decline`, the 92px orange button
  renders `Send your price`.
- Fact rows render their labels.
- `ClosedNotice` renders `status.label` visibly; `status.meaning` stays
  hidden, because it is a sentence.

**`features/work-stack/view/visit-job-view.tsx`,
`features/work-stack/view/engagement-job-view.tsx`** — same treatment: the
status hero gains its word, the header plate gains `Starts` / `Agreed at`,
`ActionTile` and `FactTile` render `label` visibly.

**`features/work-stack/view/job-detail-screen.tsx`,
`features/notifications/view/notification-panel.tsx`,
`features/earnings/view/earnings-panel.tsx`** — same rule, smaller surfaces.

### 1.4 Not touched

`/apply`, `/login`, marketing, `error.tsx`, `not-found.tsx`. They never
adopted the no-prose rule and are already readable.

---

## 2. Pictogram sizing

### 2.1 The change

```tsx
const SIZES = {
  xs: "h-3 w-3",
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
  xl: "h-10 w-10",
} as const;

export function Pictogram({
  name,
  size = "md",
  className,
}: {
  name: PictogramName;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  // …
  className={cn(SIZES[size], className)}
}
```

The default moves from an unconditional `h-6 w-6` into `SIZES[size]`, so a
caller that passes `size` gets exactly that and nothing competes. `className`
stays for colour and layout — `text-*`, `shrink-0` — which never collide with
the size utilities.

### 2.2 Call-site conversion

58 `<Pictogram` call sites across 12 files. Every `h-N w-N` in a `className`
is replaced by the nearest `size` token:

| Current | Token | Renders |
|---|---|---|
| `h-3`, `h-3.5` | `xs` | 12px |
| `h-4`, `h-5` | `sm` | 16px |
| `h-6`, `h-6.5`, `h-6.75`, `h-7` | `md` | 24px |
| `h-7.5`, `h-8`, `h-9`, `h-9.5` | `lg` | 32px |
| `h-10`, `h-10.5`, `h-11`, `h-11.5` | `xl` | 40px |

The four hero-scale uses — `h-14` (`me-home.tsx`), `h-21`
(`work-home.tsx:279`, `visit-job-view.tsx:574`) — keep an explicit
`className` override, which now works, because the default they are
overriding is a single utility rather than a competing one.

This retires 16 ad-hoc fractional sizes in favour of a five-step scale.

**This section changes what renders, and that is the point.** Every call site
passing a size *below* `h-6` is currently in a cascade fight it may be losing,
so some of those glyphs are drawing at 24px today rather than the 12–20px the
caller asked for. After §2.2 they draw at the token size. Expect visible
differences on the small-glyph surfaces — `earnings-panel.tsx`,
`crew-roster.tsx`, `notification-panel.tsx` — and treat them as the fix
landing, not as a regression. The manual pass in §6 is where that is
confirmed.

### 2.3 Test

`components/pictogram.test.tsx` already asserts all 40 names render an
`<svg>`. Extend it with one case per size token asserting the emitted class
list contains exactly one `h-` utility. That is the regression this defect
needed and never had.

---

## 3. The estimate, one scroll

### 3.1 Shape

```
┌ Plumbing repair · estimate ──────────────┐
│                                          │
│  WHAT YOU'LL DO                          │
│  ┌──────────────────────────────────┐    │
│  │ [icon] Wiring    3 days  ₹12,000 │ ▾  │  tap row → inline price strip
│  │   [+1,000] [+5,000] [+10,000] [⌨] │   │  ⌨ → keypad as a bottom sheet
│  │   Days on site   [−] 3 [+]        │   │     OVER the row, not instead
│  └──────────────────────────────────┘    │
│  ┌──────────────────────────────────┐    │
│  │ [icon] Paint     1 day  Set price│    │
│  └──────────────────────────────────┘    │
│  [ + Add work ]   [ + Add materials ]    │  → preset sheet
│                                          │
│  TERMS                                   │
│  ┌──────────────────────────────────┐    │
│  │ Tax on top · 12 months · 2 excl. │ ▾  │  collapsed, expands in place
│  └──────────────────────────────────┘    │
└──────────────────────────────────────────┘
┌ ₹27,000               [ Send to customer ]┐  sticky
└───────────────────────────────────────────┘
```

### 3.2 The four structural changes

**One render per item, not three.** The preset tile grids move behind an
"Add work" / "Add materials" bottom sheet. The screen then shows what the
vendor *chose*, not the catalogue of what they *could* choose, and the
separate "Put a price on each one" list disappears because the chosen row
*is* the price row. Removes roughly two viewport-heights.

**Pricing is inline.** The quick-add chips (`+1,000 / +5,000 / +10,000`) and
the day/quantity stepper live in the expanded row. `MoneyPad` stops being an
early-return replacement of the whole composer and becomes a bottom sheet
that overlays it, opened only by the keypad affordance, so the row being
priced stays visible. `MoneyPad`'s internals — clamping, whole-rupee
handling, the chips, `MAXIMUM_RUPEES` — are unchanged; only its mounting
changes.

**Terms collapse.** Tax basis, warranty and exclusions become one summary row
rendering the current answers, expanding in place. Warranty and tax basis
default to the vendor's last-used values from localStorage, following the
`vsh-partner-locale` pattern at `language-picker.tsx:37`. Keys:
`vsh-partner-last-warranty`, `vsh-partner-last-tax-basis`. A server-required
`required_tax_basis` still wins and still hides the choice, unchanged.

**`CheckStep` is deleted.** The sticky bar carries the total and the send.
The step existed to re-list rows that are already on screen.
`tapBlockedReason` becomes helper text under the sticky button, so the
disabled state still explains itself — which was its whole purpose.

### 3.3 Preset ordering

The "Add work" sheet floats recently-used preset codes to the top, read from
`vsh-partner-recent-presets` (a capped list of 6 codes, most recent first).
No contract change, no invented taxonomy, and it shortens the sheet for the
vendor who quotes the same three things every week.

### 3.4 What must not change

The wire path. `toOnsiteDraft` → `toOnsiteRequest` stays byte-identical, so
the tap flow still cannot send a shape the typed composer could not, and
still cannot skip a rule it enforced. Every input survives: work, materials,
days, quantity, tax basis, warranty, exclusions, `tapBlockedReason`,
`supersedesRevision`, and the completed-visit guard in
`TapEstimateComposer`. `features/proposal/model/tap-estimate.ts` is not
modified.

### 3.5 Files

- `features/proposal/view/tap-estimate.tsx` — rewritten. `Step` state and
  `WorkStep`/`ExtrasStep`/`CheckStep` are replaced by one scroll plus two
  sheets.
- `features/proposal/view/money-pad.tsx` — mounted as a sheet; internals
  unchanged.
- `features/proposal/view/estimate-sheet.tsx` — new; the preset picker.
- `features/proposal/model/recent-presets.ts` — new; localStorage read/write,
  pure, unit-testable.
- `features/proposal/view/tap-estimate-composer.tsx` — unchanged.
- `features/proposal/model/tap-estimate.ts` — unchanged.

---

## 4. Folded-in punch list

**C3 is already done — this spec was wrong about it.** An earlier draft listed
the hand-back control as missing. It is not: `visit-job-view.tsx:152` mounts
`ReleaseAction` behind `canAbort(visit) || canRelease(visit)`, with the
free-text reason `useReasonedWorkCommand` requires. The error came from a
truncated grep (`| head`) that cut the `visit-job-view.tsx` hits, read as an
absence. With C3 closed, **the entire 2026-08-19 punch list is closed** except
the two items below.

What this spec does add to that control is presentation, covered by §1.3: it
now carries its verb, its consequence, danger tone, and a rule separating it
from "Nobody is here" — see §4a.

### 4a. The look-alike collision (found by walking the journey, not in the code review)

At `ARRIVED`, `visit-job-view.tsx` renders **two `SecondaryAction`s at once**:

- line 139 — "The customer is not here", which starts a **paid wait** and keeps
  the job (`useMarkCustomerUnavailable`);
- line 152 — `ReleaseAction`'s collapsed state, "Hand this job back", which
  **gives the job away** (`useReleaseBooking`).

Before this pass both were a 64px grey rectangle with the same `no` glyph and
their only text in `sr-only`. Two opposite, consequential outcomes, stacked,
visually identical, distinguishable only by position.

The fix is the control tier in §1.1a rather than a label alone: verbs, a
consequence line each, `tone="danger"` on the one that costs the job, different
glyphs (`later` versus `no`), and a 1px rule plus 16px of air between them.
`BigAction` gets the same treatment for the same reason — green + tick was "I
have arrived" at one step and "Send this report", a money event, three steps
later.

### 4b. `--color-critical` is undefined, and 26 call sites use it

Found while sweeping for other undefined tokens. `--color-critical`,
`--color-critical-50` and `--color-critical-200` are declared **nowhere** — not
in `packages/ui/src/tokens.css`, not in any app's `@theme`. In Tailwind v4 an
undefined colour utility compiles to nothing, so all 26 usages render as
inherited colour:

| App | Usages | What renders wrong |
|---|---|---|
| partner | 5 | `TONE_STYLES.stop` (`work/model/status.ts:36`) — the tone for `DISPUTED`, `RECOVERY_REQUIRED`, `ABORTED`, `CANCELLED`; `profile-panel.tsx:80,232`; two `role="alert"` messages |
| customer | 21 | `text-critical` on checkout, payment, cart and booking error copy |

Fixed by defining the three as aliases of the `danger` scale in `tokens.css`.
That repairs all 26 at once and cannot regress anything, because nothing was
rendering. Migrating the call sites to `danger-*` is the real cleanup and is a
separate mechanical pass across two apps — **explicitly not done here**, and the
customer app's 21 usages are out of this spec's scope even though the token fix
reaches them.

**`/me/profile` restyle.** `ProfilePanel` is reachable but still renders in
the pre-redesign lucide/Card language, so the screen reads as a different
app. Convert to the pictogram set and the tap-first surfaces. No behaviour
change; `edit-name-dialog.tsx` keeps its current logic.

**`/dashboard` hardcode.** `application-overview.tsx:135` links to
`/dashboard`, which 301s to `/work`. One-line fix. `registry.ts:98` and
`registry.ts:277` are the un-migrated M1 nav and are deliberately left alone —
Task 4's disclosed follow-up parks them pending a product decision on
notification routing.

---

## 5. Error handling

Nothing in this spec changes an error path. `ErrorState`, `describeError` and
every refusal branch keep their current copy and placement — those screens
were never subject to the no-prose rule and are already readable. The one
addition is §3.2's `tapBlockedReason` helper text, which relocates copy that
already exists rather than writing new copy.

## 6. Testing

Per standing project policy the agent writes tests and does not run them.
Static gates only: `pnpm --filter partner typecheck` and
`pnpm --filter partner lint`. All work ships marked **owner verification
pending**.

### Written, for the owner to run

| Test | Covers |
|---|---|
| `components/pictogram.test.tsx` (extended) | one `h-` utility per size token — §2.3 |
| `features/proposal/model/recent-presets.test.ts` (new) | cap, ordering, absent/corrupt localStorage |
| `features/proposal/view/tap-estimate.test.tsx` (new) | add → price inline → send produces the identical `OnsiteDraft` the three-step flow produced |
| `features/work-stack/model/work-item.test.ts` (existing, 624 lines) | unchanged — the adapter is not modified |

The `tap-estimate` test is the load-bearing one: it is what proves §3.4's
claim that the wire path did not move. It drives the rebuilt screen the way a
vendor drives it — add work, tap `+5,000` three times, step the days, choose the
tax basis, send — and asserts the resulting `OnsiteDraft`, then feeds that
through the untouched `toOnsiteRequest`. If a later change drops `days`, stops
seeding a material's quantity, or sends a tax basis nobody chose, it fails.

All three use `fireEvent` from `@testing-library/react` rather than
`@testing-library/user-event`, which this workspace does not ship. Adding it
would mean a `package.json` and lockfile change plus an install, and every
control these tests drive is a plain button whose handler is a click.

**Status: written, not run.** Standing policy is that the agent writes tests and
does not execute them. `typecheck` and `lint` both pass on the whole change;
neither renders anything. The commands are:

```
pnpm --filter partner exec vitest run components/pictogram.test.tsx
pnpm --filter partner exec vitest run features/proposal/model/recent-presets.test.ts
pnpm --filter partner exec vitest run features/proposal/view/tap-estimate.test.tsx
```

### Manual, unreachable by any test

1. `/work` as an approved Partner — every card shows what the job is.
2. `/me` — three labelled tiles; sign out is a labelled row, not an arrow.
3. A live crew offer — accept reads `Take this job`.
4. An enquiry — the service name is visible in the header.
5. A five-line estimate — count the scrolls, count the full-screen takeovers.
   Target: one scroll, zero takeovers.
6. An in-progress job — the hand-back control appears and submits.
7. `/me/profile` — reads as the same app as `/me`.

## 7. Risks

- **The rewrite of `tap-estimate.tsx` is the largest single piece.** It is
  confined to one file plus two new ones, and the model layer it depends on is
  untouched, so the blast radius is the screen rather than the submission.
- **58 call-site conversions in §2.2 are mechanical but wide.** `typecheck`
  catches a bad `size` token; it does not catch a wrong-sized icon. The manual
  pass in §6 is the only real check.
- **Label copy is being promoted, not written.** Where an `sr-only` string is
  a sentence rather than a label (`status.meaning`, the offer's "is yours for
  the whole job, paid to you directly…"), it stays hidden and a short label is
  written instead. Those are the only new strings in this spec, and they are
  enumerated in §1.3.

# Quotes → a decision surface

**Redesign of the customer estimate screens, plus a non-binding price ask**

- Date: 2026-09-03
- Branch: `M2-revamp`
- Screens: `/requests/{id}/quotes` (list) and `/requests/{id}/quotes/{proposalId}` (detail)
- Status: **design — nothing built, nothing edited**

---

## 1. What is actually wrong today

Read from the live page (`2c94823b…` / `1a987e26…`) and from
[quotes-screen.tsx](../../../frontend/apps/customer/features/quotes/view/quotes-screen.tsx),
[estimate-detail-screen.tsx](../../../frontend/apps/customer/features/quotes/view/estimate-detail-screen.tsx).

### 1.1 The two screens are one screen

With exactly one estimate, the list page renders the **entire detail document inline**
([quotes-screen.tsx:437](../../../frontend/apps/customer/features/quotes/view/quotes-screen.tsx#L437)):

```tsx
<EstimateDetailScreen requirementId={…} proposalId={only.proposalId} embedded hideShoppingList />
```

Two URLs, one experience. The back button lands you on the thing you just left. Every
byte of copy is maintained twice in two layouts. This is the root defect — everything
below is downstream of it.

### 1.2 Everything on the detail page has the same weight

Seven `Section` cards, identical border, identical radius, identical heading style,
stacked. *What you get*, *How the price is built*, *Materials*, *How you pay*, *Terms* —
a warranty clause is styled exactly like the ₹2.2 lakh you are about to commit. There is
no visual hierarchy, so there is no reading order, so the customer reads all of it or
none of it. Both are bad.

### 1.3 The same eight lines are printed twice

```
Included (8)                    HOW THE PRICE IS BUILT — ITEM-WISE
✓ Wall putty - two coats        Wall putty - two coats  5000 × ₹10   ₹50,000
✓ Masking and protection        Masking and protection  5000 × ₹4    ₹20,000
✓ Primer coat                   Primer coat             5000 × ₹8    ₹40,000
… (5 more)                      … (5 more)
```

`inclusions` and `itemLines` are the same eight strings. ~40 lines of vertical screen
spent saying one thing twice.

### 1.4 "What you get" is machine output pretending to be prose

```
"Wall putty - two coats ×5000, Masking and protection ×5000, Primer coat ×5000,
Emulsion - standard, two coats ×5000, Ceiling - two coats ×1100, …"
```

Rendered in quotation marks as if the professional wrote it. It is `itemLines.join(", ")`.
It reads as a vendor who cannot write a sentence — the opposite of the trust this section
is for.

### 1.5 `Not included (0)` is an apology occupying a column

```
Not included (0)
They listed nothing as excluded. Ask before you choose if something matters to you.
```

A half-width column, on every estimate that has no exclusions, saying nothing.

### 1.6 The payment stages do not add up — and nothing notices

```
Total                ₹2,20,651.31
Stage 1 · To start   ₹1,07,782
Stage 2 · On finish  ₹1,07,782
                     ───────────
                     ₹2,15,564      ← ₹5,087.31 unaccounted
```

The screen renders both numbers, side by side, without comment. Either the composer
allows an unbalanced schedule or the display is rounding — either way the customer is
shown a contradiction and left to spot it.

### 1.7 Junk lines are rendered at full weight

```
Wall putty application     2 Sq ft × ₹12     ₹24
```

A ₹24 line, at the same type size as the ₹75,000 line, is stray composer input. Nothing
de-emphasises trivial lines, and nothing warns the vendor before sending.

### 1.8 The trust line oversells

```
★ 5.0 (1) · 1 job · 6 yrs · since 2026
```

A perfect score from a single review, formatted like an aggregate rating. `6 yrs` and
`since 2026` contradict each other. `WORKFORCE_AGENCY` is a raw database enum shown to
a customer.

### 1.9 Actions are scattered across three altitudes

`Ask them` and `✎ Ask for a revision` mid-page; `Not this one` and `Choose ›` in a fixed
bar; `Ask for another option` in a right-hand aside *below the whole document*. Four
places to act, no single answer to "what do I do now?".

### 1.10 Nothing tells you how the estimates differ

The single genuinely hard customer question — *why is this one ₹63,000 cheaper?* — has
no answer above the fold. `scopeGaps()` already computes it and it appears as a
mid-document warning strip, not as the headline.

---

## 2. Thesis

> **The list is where you decide. The detail is what you decided on.**
> They stop being the same page.

| | Job to be done | Reading time |
|---|---|---|
| **`/quotes`** | *Which one, and why?* | 20 seconds |
| **`/quotes/{id}`** | *What exactly am I agreeing to?* | 3 minutes |

---

## 3. Principles

1. **Four Facts, fixed positions.** Every estimate answers the same four questions in
   the same grid slots: **Total · To start · Done by · Holds for**. Eyes compare by
   position, not by reading.
2. **Difference over completeness.** With more than one estimate, lead with what is
   *different*. Identical rows are noise.
3. **Say a thing once.** `inclusions` and `itemLines` are one dataset with two views.
4. **Weight follows money.** ₹75,000 is not the same size as ₹24.
5. **One primary action per screen.** Everything else is secondary or in an overflow.
6. **Empty is silent.** No exclusions → no exclusions block.
7. **The screen never invents a number.** It may *point at* an arithmetic mismatch it
   finds. It never quietly reconciles one.

---

## 4. Screen 1 — `/requests/{id}/quotes`

### 4.1 Three or more estimates (the design target)

```
┌───────────────────────────────────────────────┐
│ ‹   Bookings › Full home painting             │
│                                               │
│ 3 estimates in.                               │
│ ₹1,98,400 — ₹2,61,000   ·   spread ₹62,600    │
│ ●●● all 3 visits done                         │
├───────────────────────────────────────────────┤
│ ⚠  Ravi Kumar asked you something             │
│    "Is the false ceiling in scope?"           │
│                                    [ Answer ] │
├───────────────────────────────────────────────┤
│                                               │
│  WHAT SEPARATES THEM                          │
│                                               │
│  Ceiling — 2 coats      Sharma ✓  Ravi ✓  BM ✗│
│  Enamel on grills       Sharma ✓  Ravi ✗  BM ✓│
│  Warranty               12mo    24mo    none  │
│  Done by                14 Oct  22 Oct  9 Oct │
│  To start               ₹99,200 ₹1,07k  ₹85k  │
│                                               │
│  Only rows where they differ are shown.       │
│                                     Show all ▾│
└───────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────┐
  │ ◉  M  Sharma Painters            ✓ Verified │  ← selected: ring
  │       ★4.6 (34) · 6 yrs · 34 jobs           │
  │                                             │
  │   TOTAL              TO START               │
  │   ₹1,98,400          ₹99,200                │
  │   DONE BY            HOLDS FOR              │
  │   14 Oct             6 days                 │
  │                                             │
  │   Cheapest of the three                     │
  │   Missing vs others:  enamel on grills      │
  │                                             │
  │   Read in full ›                        ⋯   │
  └─────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────┐
  │ ○  R  Ravi Kumar                 ✓ Verified │
  │       ★4.9 (12) · 9 yrs · 12 jobs           │
  │                                             │
  │   TOTAL              TO START               │
  │   ₹2,24,000          ₹1,07,782              │
  │   DONE BY            HOLDS FOR              │
  │   22 Oct             ⚠ runs out today       │
  │                                             │
  │   Longest warranty — 24 months              │
  │   Missing vs others:  enamel on grills      │
  │                                             │
  │   Read in full ›                        ⋯   │
  └─────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────┐
  │ ○  B  BrightMove Decor          ⚠ Over budget│
  │ …                                            │
  └─────────────────────────────────────────────┘

═══════════════════════════════════════════════════
  Sharma Painters · ₹1,98,400                       ← sticky
  Nothing is charged now.
                                    [ Choose  › ]
═══════════════════════════════════════════════════
```

**What changed**

| Change | Why |
|---|---|
| Header carries **range + spread**, not reassurance prose | The first number a person wants is "how far apart are these?" |
| **Difference table above the cards**, default, not a tab | It is the answer to the only hard question. It was a mid-page warning strip. |
| Rows shown **only where values differ**; `Show all ▾` for the rest | Completeness is available, not imposed. |
| Card = **Four Facts grid**, fixed slots | Position-based comparison. Today the same facts are in prose at different depths per card. |
| One **superlative chip** per card (`Cheapest`, `Longest warranty`, `Soonest`) | Derived, honest, one per axis, never more than one per card. |
| Card actions collapse to `Read in full ›` + `⋯` | Was 4 buttons per card. |
| Visit progress `●●● all 3 visits done` | Was a clause inside a paragraph. |
| Mobile `Quotes / Compare` segmented control **deleted** | The comparison is now part of the page, not a mode. Removes the desktop/mobile divergence at [quotes-screen.tsx:466](../../../frontend/apps/customer/features/quotes/view/quotes-screen.tsx#L466). |

The `⋯` overflow: **Ask a question · Ask about the price · Ask for a change · Not this one**.

### 4.2 Exactly one estimate — the important fix

The document **stops being inlined**. One estimate still gets a decision surface, because
with one estimate the real question changes from *"which?"* to *"is this fair, and should
I get another?"*

```
┌───────────────────────────────────────────────┐
│ ‹   Bookings › Full home painting             │
│                                               │
│ One estimate in.                              │
│ ●●○  1 of 2 visits done — one more due        │
├───────────────────────────────────────────────┤
│                                               │
│  ◉  M  M2 Demo Vendor 3            ✓ Verified │
│        New on Vsolve · 1 review · 6 yrs trade │
│                                               │
│    TOTAL                TO START              │
│    ₹2,20,651            ₹1,07,782             │
│    DONE BY              HOLDS FOR             │
│    Not dated            7 days                │
│                                               │
│    8 priced lines · nothing listed as excluded│
│    ⚠ The two stages add to ₹2,15,564 —        │
│      ₹5,087 less than the total. We asked.    │
│                                               │
│    [   Read the full estimate  ›   ]          │
│                                               │
├───────────────────────────────────────────────┤
│  BEFORE YOU DECIDE                            │
│                                               │
│  🔍 Nothing to compare it against yet.        │
│                                               │
│  [ Get another estimate — free ]              │
│  [ Ask about the price ]                      │
│                                               │
│  Both keep this estimate live. Nothing is     │
│  charged either way.                          │
└───────────────────────────────────────────────┘

═══════════════════════════════════════════════════
  M2 Demo Vendor 3 · ₹2,20,651                      ← sticky
                                    [ Choose  › ]
═══════════════════════════════════════════════════
```

**Why this is better than the inlined document**

- The customer sees the whole decision in one screen without scrolling 8 sections.
- `Get another estimate` moves from *below the entire document* (where nobody reaches it)
  to the moment the question arises.
- `Ask about the price` — the new control — is offered exactly where a single unopposed
  quote makes it most useful.
- **"New on Vsolve · 1 review"** replaces `★ 5.0 (1)`. One review is not a 5.0 rating.
  Below a threshold (proposed: **5 completed jobs**) we state tenure and volume and
  withhold the star. This is a trust-integrity fix, not cosmetics.
- The stage-total mismatch is **surfaced, not reconciled** (§7.3).

### 4.3 Zero estimates

Unchanged in substance; gains the progress dots and an expected-by line.

```
  No estimates yet.
  ●●○  1 of 2 visits done
  Professionals write your estimate on site. The next visit
  is Thu 5 Sept, 10am — expect it that evening.
```

---

## 5. Screen 2 — `/requests/{id}/quotes/{proposalId}`

Three bands, decreasing weight. **The Verdict** (paid attention), **The Substance**
(scanned), **The Fine Print** (referred to).

```
┌───────────────────────────────────────────────┐
│ ‹  All estimates                       Share  │
├───────────────────────────────────────────────┤
│                                               │
│   M   M2 Demo Vendor 3 Services   ✓ Verified  │
│       Workforce agency · 6 yrs in trade       │
│       New on Vsolve — 1 review so far         │
│                                               │
│ ┌───────────────────────────────────────────┐ │  BAND 1
│ │ THEIR ESTIMATE                            │ │  THE VERDICT
│ │                                           │ │
│ │ ₹2,20,651                                 │ │
│ │ plus ₹0 tax · holds 7 more days           │ │
│ │                                           │ │
│ │ ───────────────────────────────────────── │ │
│ │ TO START          ₹1,07,782               │ │
│ │ DONE BY           Not dated               │ │
│ │ ───────────────────────────────────────── │ │
│ │                                           │ │
│ │  Is this price workable for you?    →     │ │  ← negotiate entry
│ └───────────────────────────────────────────┘ │
│                                               │
│ ⚠ The two payment stages add to ₹2,15,564 —   │
│   ₹5,087 less than the total above. We have   │
│   asked them to correct it.       [ Details ] │
│                                               │
├───────────────────────────────────────────────┤
│                                               │  BAND 2
│  THE WORK — 8 lines, ₹2,20,651                │  THE SUBSTANCE
│                                               │
│  Wall putty · two coats                       │
│  5,000 sq ft × ₹10                   ₹50,000  │
│  ████████████████░░░░░░░░░░░░░░░░  23%        │
│                                               │
│  Emulsion · standard, two coats               │
│  5,000 sq ft × ₹15                   ₹75,000  │
│  ████████████████████████░░░░░░░░  34%        │
│                                               │
│  Primer coat                                  │
│  5,000 sq ft × ₹8                    ₹40,000  │
│  ████████████░░░░░░░░░░░░░░░░░░░░  18%        │
│                                               │
│  Masking and protection      5,000 × ₹4  ₹20,000
│  Ceiling · two coats         1,100 × ₹12 ₹13,200
│  Wall putty · one coat       1,194 × ₹10 ₹11,940
│  Enamel · doors and grills     300 × ₹18  ₹5,400
│                                               │
│  ▸ 1 line under ₹100 (₹24)                    │
│                                               │
│  Every line is inside the total above.        │
│                                               │
├───────────────────────────────────────────────┤
│  NOT INCLUDED                                 │
│  They listed nothing as excluded.             │
│                          [ Ask what's out → ] │
├───────────────────────────────────────────────┤
│  HOW YOU PAY                                  │
│                                               │
│  1 ● To start        work begins   ₹1,07,782  │
│    │                                          │
│  2 ● On finish       handed over   ₹1,07,782  │
│                                               │
│  You fund one stage at a time. Money reaches  │
│  them only after each stage is done.          │
│                                               │
├───────────────────────────────────────────────┤
│  WHAT YOU BUY YOURSELF                        │
│  1 item · Standard tier (Finolex / Anchor)    │
│  Quantities and specs only — not in the total.│
│                        [ View the list (PDF) ]│
│                                               │
├───────────────────────────────────────────────┤
│                                               │  BAND 3
│  ▸ Terms, warranty and dates                  │  FINE PRINT
│  ▸ How this estimate was written              │     collapsed
│                                               │
└───────────────────────────────────────────────┘

═══════════════════════════════════════════════════
  ₹2,20,651 · nothing charged now                   ← sticky, ONE action
  ⋯                                 [ Choose  › ]
═══════════════════════════════════════════════════
```

**What changed**

| Change | Why |
|---|---|
| `Included (8)` list **deleted** | It was `itemLines` reprinted. The priced lines *are* what is included. §1.3 |
| The concatenated `"What you get"` blob **deleted** | Machine output in quote marks. §1.4. Kept only when `scopeSummary` is genuinely vendor-written prose. |
| Priced lines **sorted by amount**, top 3 get a share bar | Weight follows money. Answers "where is my money going?" instantly. |
| Sub-₹100 lines **folded** behind `▸ 1 line under ₹100` | ₹24 next to ₹75,000 is noise; folding it also makes it *visible as an anomaly*. §1.7 |
| `Not included (0)` → **one line + an action** | An empty state that does something. §1.5 |
| Terms / provenance **collapsed into Band 3** | Referred to, not read. §1.2 |
| Sticky bar: **one** primary, everything else under `⋯` | Was `Not this one` + `Choose` + two mid-page buttons. §1.9 |
| `WORKFORCE_AGENCY` → "Workforce agency" | Raw enum. §1.8 |
| Stage arithmetic **checked and flagged** | §1.6 / §7.3 |
| **`Is this price workable for you? →`** inside the price card | The negotiate entry, attached to the number it is about. |

---

## 5A. Desktop (≥1024px)

Desktop is not the mobile column stretched wide. It has one thing mobile can never
have — **horizontal room to hold three estimates in the eye at once** — and one thing
mobile needs a sticky bar for: a decision that stays on screen while you read.

### 5A.1 `/quotes` — the comparison matrix

At `lg` and up the cards **become the columns of one table**. Row labels live in a
sticky left gutter; the vendor band is a sticky header carrying identity, price,
superlative and `Choose`. This is the spreadsheet-grade comparison the whole feature
is for, and it is genuinely impossible below 1024px.

```
max-w 1180px
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ‹  Bookings › Full home painting › Estimates                                     │
│                                                                                  │
│ 3 estimates in.                              ₹1,98,400 — ₹2,61,000 · spread 32%  │
│ ●●● all 3 visits done                                                            │
├──────────────────────────────────────────────────────────────────────────────────┤
│ ⚠ Ravi Kumar asked you something — "Is the false ceiling in scope?"   [ Answer ] │
└──────────────────────────────────────────────────────────────────────────────────┘

┌───────────┬──────────────────────┬─────────────────────┬─────────────────────────┐
│           │ ◉ Sharma Painters    │ ○ Ravi Kumar        │ ○ BrightMove Decor      │ ← sticky
│           │   ✓ Verified         │   ✓ Verified        │   New on Vsolve         │   header
│           │   ★4.6 (34) · 6 yrs  │   ★4.9 (12) · 9 yrs │   1 review · 3 yrs      │
│           │                      │                     │                         │
│           │   ₹1,98,400          │   ₹2,24,000         │   ₹2,61,000             │
│           │   Cheapest           │   Longest warranty  │   ⚠ Over your budget    │
│           │                      │                     │                         │
│           │   [  Choose  › ]     │   [  Choose  › ]    │   [  Choose  › ]        │
├───────────┼──────────────────────┼─────────────────────┼─────────────────────────┤
│ To start  │ ₹99,200              │ ₹1,07,782           │ ₹1,30,500               │
│ Done by   │ 14 Oct               │ 22 Oct              │ 9 Oct                   │
│ Holds for │ 6 days               │ ⚠ runs out today    │ 11 days                 │
│ Warranty  │ 12 months            │ 24 months           │ Not stated              │
│ Materials │ You buy              │ You buy             │ They supply             │
├───────────┴──────────────────────┴─────────────────────┴─────────────────────────┤
│  WHERE THEY DIFFER                                                    Show all ▾ │
├───────────┬──────────────────────┬─────────────────────┬─────────────────────────┤
│ Ceiling   │ ✓ two coats          │ ✓ two coats         │ ✗ not listed            │
│ Enamel    │ ✗ not listed         │ ✗ not listed        │ ✓ doors and grills      │
│ Primer    │ ✓ one coat           │ ✓ two coats         │ ✓ one coat              │
├───────────┼──────────────────────┼─────────────────────┼─────────────────────────┤
│           │ Read in full ›    ⋯  │ Read in full ›   ⋯  │ Read in full ›      ⋯   │
└───────────┴──────────────────────┴─────────────────────┴─────────────────────────┘
```

- **Sticky vendor header** (`position: sticky; top: 0`) — scroll 40 rows of differences
  and you still know which column is whose, and `Choose` never leaves the screen. This
  is why desktop needs **no sticky bottom bar at all**.
- **Sticky row-label gutter** (`position: sticky; left: 0`) so a 4th and 5th estimate
  scroll horizontally without orphaning their labels.
- Rows collapse to differences by default, exactly as on mobile; `Show all ▾` expands.
- The selected column gets the ring + tinted surface; radio semantics are unchanged.
- **4+ estimates**: the matrix scrolls horizontally inside its own `overflow-x-auto`,
  gutter pinned. The page body never scrolls sideways.
- This **replaces** today's `lg:grid-cols-2 xl:grid-cols-3` card grid *plus* a separate
  comparison table below it — currently desktop renders the same estimates twice, in two
  formats, one under the other ([quotes-screen.tsx:466-506](../../../frontend/apps/customer/features/quotes/view/quotes-screen.tsx#L466)).

### 5A.2 `/quotes` — one estimate, desktop

Two columns. The decision on the left, the "should I get another?" panel on the right —
which is where today's `MORE CHOICE` aside already lives, but it currently sits below an
entire inlined document instead of beside a summary.

```
┌────────────────────────────────────────────┬───────────────────────────────┐
│  ◉  M  M2 Demo Vendor 3     ✓ Verified     │  BEFORE YOU DECIDE            │
│        New on Vsolve · 1 review · 6 yrs    │                               │
│                                            │  🔍 Nothing to compare it     │
│    TOTAL             TO START              │     against yet.              │
│    ₹2,20,651         ₹1,07,782             │                               │
│    DONE BY           HOLDS FOR             │  [ Get another estimate ]     │
│    Not dated         7 days                │  [ Ask about the price  ]     │
│                                            │                               │
│    8 priced lines · nothing excluded       │  Both keep this estimate      │
│    ⚠ Stages add to ₹5,087 less than total  │  live. Nothing is charged.    │
│                                            │                               │
│    [    Read the full estimate   ›    ]    │                               │
│    [    Choose M2 Demo Vendor 3  ›    ]    │                               │
└────────────────────────────────────────────┴───────────────────────────────┘
```

### 5A.3 `/quotes/{id}` — document left, decision rail right

The fixed bottom bar is a mobile affordance. On desktop it becomes a **sticky decision
rail** that also absorbs the scattered mid-page actions from §1.9 and adds section
jump-nav for a long document.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ‹  All estimates                                                          Share  │
├──────────────────────────────────────────────┬───────────────────────────────────┤
│                                              │ ┌───────────────────────────────┐ │
│  M  M2 Demo Vendor 3 Services LLP ✓Verified  │ │ THEIR ESTIMATE                │ │ ← sticky
│     Workforce agency · 6 yrs in trade        │ │                               │ │   top-6
│     New on Vsolve — 1 review so far          │ │ ₹2,20,651                     │ │
│                                              │ │ plus ₹0 tax · holds 7 days    │ │
│  ⚠ The two stages add to ₹2,15,564 —         │ │ ───────────────────────────── │ │
│    ₹5,087 less than the total.  [ Details ]  │ │ TO START      ₹1,07,782       │ │
│                                              │ │ DONE BY       Not dated       │ │
│  THE WORK — 8 lines, ₹2,20,651               │ │ ───────────────────────────── │ │
│                                              │ │                               │ │
│  Emulsion · standard, two coats              │ │  [    Choose    ›    ]        │ │
│  5,000 sq ft × ₹15                  ₹75,000  │ │  Nothing is charged now.      │ │
│  ███████████████████████░░░░░░░░  34%        │ │                               │ │
│                                              │ │  Is this price workable       │ │
│  Wall putty · two coats                      │ │  for you?                →    │ │
│  5,000 sq ft × ₹10                  ₹50,000  │ └───────────────────────────────┘ │
│  ███████████████░░░░░░░░░░░░░░░░  23%        │                                   │
│                                              │  ON THIS PAGE                     │
│  Primer coat                                 │  ▸ The work                       │
│  5,000 sq ft × ₹8                   ₹40,000  │  ▸ Not included                   │
│  ████████████░░░░░░░░░░░░░░░░░░░  18%        │  ▸ How you pay                    │
│                                              │  ▸ What you buy yourself          │
│  Masking and protection  5,000 × ₹4  ₹20,000 │  ▸ Terms                          │
│  Ceiling · two coats     1,100 × ₹12 ₹13,200 │                                   │
│  Wall putty · one coat   1,194 × ₹10 ₹11,940 │  ─────────────────────────────    │
│  Enamel · doors, grills    300 × ₹18  ₹5,400 │  [ Ask them a question ]          │
│  ▸ 1 line under ₹100 (₹24)                   │  [ Not this one        ]          │
│                                              │                                   │
│  NOT INCLUDED  · · ·                         │                                   │
│  HOW YOU PAY   · · ·                         │                                   │
└──────────────────────────────────────────────┴───────────────────────────────────┘
     minmax(0,1fr)                                       22rem
```

- Rail is `position: sticky; top: 1.5rem` inside a `lg:grid-cols-[minmax(0,1fr)_22rem]
  lg:items-start` — the same grid shape the codebase already uses at
  [quotes-screen.tsx:428](../../../frontend/apps/customer/features/quotes/view/quotes-screen.tsx#L428),
  so this is a familiar pattern, not a new one.
- **Jump-nav** with scroll-spy. A 3-minute document deserves navigation; below `lg` it
  is omitted entirely rather than shrunk.
- `Ask them` and `Not this one` move out of the document body into the rail. Mobile keeps
  them in the `⋯` of the sticky bar. One action model, two form factors.

### 5A.4 Breakpoint contract

| Range | List | Detail |
|---|---|---|
| `< 640` | stacked cards, sticky bottom bar | stacked bands, sticky bottom bar |
| `640–1023` | stacked cards, wider Four-Facts grid | two-up Four Facts, sticky bottom bar |
| `≥ 1024` | **comparison matrix**, no bottom bar | **document + sticky rail**, no bottom bar |
| `≥ 1180` | matrix at max width, gutter fixed | unchanged |

Mobile-first. Every desktop behaviour is an additive `lg:` layer over a layout that is
already complete and shippable at 375px.

---

## 6. The price ask

Per your decisions: **non-binding**, **estimate stays choosable**, **merged into the
existing `RevisionRequest` spine** as a fifth reason code.

### 6.1 Where it opens from

- Detail page — inside the price card: *"Is this price workable for you? →"*
- List card `⋯` → *Ask about the price*
- **Auto-promoted** to a full-width button when `card.isOutOfBudget` is true:
  *"This is over the budget you set. Ask about the price →"*
- **Suppressed** when `card.rateLabel !== null` (A3 day-hire). Those prices come from the
  ops-published rate card, not the vendor — there is nothing for them to discount, and
  offering the control there would be a lie.

### 6.2 The sheet

```
┌───────────────────────────────────────────────┐
│                                          ✕    │
│  About this price                             │
│  M2 Demo Vendor 3 · ₹2,20,651                 │
│                                               │
│  Only they can change a price. This sends     │
│  what you are hoping for — they answer with   │
│  a fresh estimate, or say no.                 │
│                                               │
│  ┌─────────────────────────────────────────┐  │
│  │ ✓  It works for me                      │  │
│  │    Take me to Choose.                   │  │
│  └─────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────┐  │
│  │ ○  Ask for 3% off                       │  │
│  │    ₹2,20,651  →  ₹2,14,032   −₹6,619    │  │
│  └─────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────┐  │
│  │ ◉  Ask for 5% off                       │  │
│  │    ₹2,20,651  →  ₹2,09,618   −₹11,033   │  │
│  └─────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────┐  │
│  │ ○  Name your own figure                 │  │
│  │    [  7  ] %   →  ₹2,05,206  −₹15,446   │  │
│  └─────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────┐  │
│  │ ○  It is not about the price            │  │
│  │    Leave something out · cheaper finish │  │
│  │    · split into phases · something else │  │
│  └─────────────────────────────────────────┘  │
│                                               │
│  Add a line (optional)                        │
│  ┌─────────────────────────────────────────┐  │
│  │ Two other estimates came in lower.      │  │
│  └─────────────────────────────────────────┘  │
│                                               │
│  ⓘ  This estimate stays live and you can      │
│     still choose it while they think.         │
│     You can ask about the price once.         │
│                                               │
│              [ Cancel ]   [ Send the ask ]    │
└───────────────────────────────────────────────┘
```

**Design notes**

- **"It works for me" is the first option and it is not a no-op.** It closes the sheet
  and routes straight to `/quotes/{id}/confirm`. This is what turns the sheet from a
  haggling tool into a decision accelerator — the customer opens it uncertain and leaves
  it either negotiating *or* committing. It writes nothing to the server.
- **Live rupee arithmetic on every chip.** "5%" is abstract; "−₹11,033" is a decision.
  The screen computes the *display* figure only. It is never sent as the price and never
  binds anyone. `payablePaise` is the only input.
- **"It is not about the price"** folds the four existing reason codes in, so there is
  one sheet, one open request, one vendor inbox item — exactly the merge you chose.
- **Custom % is capped at 15**, with a soft warning above 10: *"Above 10% is usually a
  different scope, not a discount. Consider 'leave something out' instead."* Beyond the
  cap the control redirects to the scope reasons.
- **One price ask per proposal revision.** The existing partial-unique constraint already
  gives one *open* request per proposal; this adds: once a `PRICE` ask has been resolved
  on a given proposal revision, the price chips are disabled with *"You have already
  asked about this price. If they send a revised estimate you can ask again."* This is the
  anti-grind guard.
- Ask **expires with the estimate** — an open ask on an expired proposal is auto-closed.

### 6.3 Pending state — the estimate stays fully live

```
┌───────────────────────────────────────────────┐
│ ⏳ You asked for 5% off — ₹2,09,618           │
│    Sent 2:14pm. They usually reply in ~4h.    │
│    "Two other estimates came in lower."       │
│                                               │
│    You can still choose this estimate at      │
│    ₹2,20,651 while you wait.       [ Cancel ] │
└───────────────────────────────────────────────┘
```

`Choose` stays enabled throughout. Cancelling withdraws the ask and re-enables the chips.

### 6.4 Resolutions

```
┌───────────────────────────────────────────────┐
│ ✓ They agreed — new estimate at ₹2,09,618     │
│   Down ₹11,033. Same scope, same warranty.    │
│                          [ Read what changed ]│
└───────────────────────────────────────────────┘

┌───────────────────────────────────────────────┐
│ ↔ They came back at 2%, not 5% — ₹2,16,238    │
│   "Material costs are fixed; I can move on    │
│    labour only."                              │
│                          [ Read what changed ]│
└───────────────────────────────────────────────┘

┌───────────────────────────────────────────────┐
│ ✗ They cannot move on price                   │
│   "This is already at my floor for 5,000 sqft."│
│   Their estimate stands at ₹2,20,651.         │
│                    [ Choose ] [ Not this one ]│
└───────────────────────────────────────────────┘
```

The counter case matters: it is still the vendor authoring the number, so it does not
breach the invariant — and it is the most realistic outcome.

### 6.5 Vendor side

The ask lands in the existing proposal-status surface
([proposal-status.tsx:222](../../../frontend/apps/partner/features/proposal/view/proposal-status.tsx#L222)),
which already renders `revision_request`.

```
┌───────────────────────────────────────────────┐
│  A CUSTOMER ASKED ABOUT YOUR PRICE            │
│                                               │
│  Full home painting · Kondapur                │
│  You quoted        ₹2,20,651                  │
│  They asked for    ₹2,09,618   (5% off)       │
│  You would lose    ₹11,033                    │
│                                               │
│  "Two other estimates came in lower."         │
│                                               │
│  [ Agree — re-issue at ₹2,09,618 ]            │
│  [ Offer a different figure ]                 │
│  [ Cannot move — say why ]                    │
│                                               │
│  Your estimate stays live either way. They    │
│  can still choose it at ₹2,20,651.            │
└───────────────────────────────────────────────┘
```

**Agree** is one tap and generates an ordinary superseding proposal — the same mechanism
a revision uses today. The discount lands as a **single named line** (`Negotiated
discount −₹11,033`), *not* pro-rated across the item lines: the per-unit rates the vendor
published stay honest and auditable, and the concession is visible as a concession.

**Offer a different figure** is the vendor typing their own number. Invariant intact.

---

## 7. Data and contract

Additive. No migration of existing rows.

### 7.1 `RevisionRequest`

```python
class ReasonCode(models.TextChoices):
    LEAVE_OUT        = "LEAVE_OUT",        "Leave something out"
    CHANGE_MATERIALS = "CHANGE_MATERIALS", "Change materials or finish"
    PHASE_WORK       = "PHASE_WORK",       "Split the work into phases"
    PRICE            = "PRICE",            "Asked about the price"   # NEW
    OTHER            = "OTHER",            "Something else"

# NEW — basis points, so 5% is 500 and there is no float anywhere near money.
# Null on every non-PRICE reason. Server-capped at 1500.
requested_discount_bps = models.PositiveIntegerField(null=True, blank=True)

# NEW — what the vendor came back with, when they countered rather than agreed.
countered_discount_bps = models.PositiveIntegerField(null=True, blank=True)
```

Validation in `request_revision()`:

| Rule | Failure |
|---|---|
| `PRICE` requires `1 ≤ bps ≤ 1500` | `400` — "Say how much you are hoping for." |
| non-`PRICE` must send `bps = null` | `400` |
| `PRICE` refused if a resolved `PRICE` ask exists on this proposal | `409` — "You have already asked about this price." |
| `PRICE` refused when the proposal is rate-card priced | `409` — "This price comes from the published rate card." |
| Existing gates unchanged | entitlement · not-closed · no live selection · one open per proposal |

The docstrings at [matching.py:544](../../../backend/apps/requirements/models/matching.py#L544)
and [proposals.py:960](../../../backend/apps/requirements/proposals.py#L960) must be
rewritten, not left standing. They currently assert the opposite of this design. The new
wording of the invariant:

> A customer may state what they *hope to pay*. Only a vendor states what the work
> *costs*. The ask binds nobody; the answer is an ordinary superseding proposal.

### 7.2 Contract

Bump to **1.60.0**. `CustomerProposal.revision_request` gains
`requested_discount_bps` and `countered_discount_bps`; `ReasonCode` gains `PRICE`.
New outbox event reason `price_ask_requested` on the existing
`m2.proposal.revision_requested` envelope, so notification routing needs no new topic.

### 7.3 The stage-total check

A pure client-side derivation in `adapters/`, no server change:

```ts
stageTotalMismatchPaise(card): number | null
// sum(stages[].amountPaise) − payablePaise, null when |Δ| ≤ 100 (₹1 rounding)
```

Rendered as the warning strip in §5. **It does not alter a number and never silently
reconciles.** If this fires in production it is a composer bug and the strip is how we
find out. A follow-up should decide whether the partner composer refuses to send an
unbalanced schedule — that is a separate change and out of scope here.

---

## 8. Deliberately not building

| Rejected | Why |
|---|---|
| Binding counter-offers | Your call, and the right one — it invites vendors to pad every quote with discount headroom. |
| Multi-round haggling | One ask per revision. A bazaar is not a marketplace. |
| Platform-suggested discounts ("most vendors accept 4%") | We would be negotiating against our own supply. |
| Auto-accept below a threshold | Removes the vendor's judgement; the invariant is the point. |
| Blind-bid / reverse auction | Different product. |
| Editing the quotes list to a table on mobile | The difference table covers it; a table is not a mobile pattern. |

---

## 9. Build order

| # | Slice | Depends on | Ships alone? |
|---|---|---|---|
| 1 | Un-inline the document; list page gets its own one-estimate layout | — | ✅ biggest win, zero backend |
| 2 | Four Facts grid + superlative chips on the card | 1 | ✅ |
| 3 | Difference table promoted above the cards; delete the segmented control | 2 | ✅ |
| 4 | Detail page three-band rebuild; delete duplicated `Included`; fold sub-₹100 | — | ✅ |
| 5 | Trust-line honesty (`New on Vsolve`, enum → prose) | — | ✅ small, high value |
| 6 | Stage-total mismatch strip | — | ✅ |
| 7 | Backend: `PRICE` reason + `requested_discount_bps` + guards | — | — |
| 8 | Negotiate sheet, pending, and resolution states | 7 | — |
| 9 | Vendor accept / counter / decline | 7, 8 | — |

Slices 1–6 are frontend-only and independently shippable. 7–9 are the feature.

---

## 10. Open questions for the owner

1. **Trust threshold.** Withhold the star rating below **5 completed jobs**? (Proposed.
   Anything above ~10 hides the star for most of the current supply.)
2. **Discount cap.** 15% hard, warn above 10% — right for this market?
3. **Vendor reply clock.** Should an unanswered price ask auto-close after N hours so the
   customer is not left hanging? Proposed: **24h**, then it closes as `DECLINED` with
   "They did not reply in time."
4. **`Get another estimate — free`** currently routes through `RejectQuoteDialog` — it
   turns the estimate *down* to get a replacement. In the new one-estimate layout the
   copy implies *additive*. Is a replacement still the intended mechanic, or should
   single-quote requests be able to request an extra visit without rejecting?
5. **Stage mismatch** — flag only (this design), or block the vendor composer from
   sending an unbalanced schedule?

---

## 11. Approval gate

Nothing here is built. No file has been edited. On your approval I will take this to
`writing-plans` and produce the task-by-task implementation plan; slices 1–6 can start
immediately while 7–9 wait on your answers to §10.

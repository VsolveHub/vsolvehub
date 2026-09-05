# Event lighting & decor — flow audit and real-world redesign

**Date:** 2026-08-29 · **Branch:** `M2-revamp` · **Status:** §3–§5 BUILT same day (owner verification pending — see the task.md log entry); §6 decisions D1/D3/D4 still open
**Route audited:** `/requests/new/event-lighting-decor?step=what`

---

## 1. What the customer sees today

`event-lighting-decor` is a single A5 service (Events → Lighting & decor, one `standard`
variant, "Decor, priced per event") that rides the **generic** 3-step brief. Its entire
category-specific surface is three seeded questions
([seed_m2_demo.py:1018-1041](../../../backend/apps/requirements/management/commands/seed_m2_demo.py#L1018-L1041)):

```text
Step 1 of 3 — What needs doing?
┌──────────────────────────────────────┐
│ What is the event?                   │
│ ┌──────────┐ ┌──────────┐            │
│ │ 🎉        │ │ 🎉        │           │
│ │ Wedding  │ │ Birthday │            │
│ └──────────┘ └──────────┘            │
│ ┌──────────┐ ┌──────────┐            │
│ │ 🎉        │ │  (F)     │           │
│ │ Corporate│ │ Festival │            │
│ │ event    │ │ or pooja │            │
│ └──────────┘ └──────────┘            │
│                                      │
│ Roughly how many guests?    [  __ ]  │  ← keypad card, no unit
│ "Sets the quantity on every dish."   │  ← catering copy on a decor service
│                                      │
│ Is the venue already booked? Yes/No  │
└──────────────────────────────────────┘
Step 2 of 3 — Where and when
  The site · Ready to start · "How firm is that date?" (Exact / ± a week / ± a month)
Step 3 of 3 — Choose visits & send
  Recap · "How many estimates do you want?" (1/2/3 @ ₹49/99/199 dev tiers) · slots · Send
```

### Findings (verified in code)

| # | Severity | Finding | Where |
|---|---|---|---|
| F1 | High | Desktop step 1 renders every occasion through `fallbackVisual()`: user-visible **"Illustrative selection"**, **"Mock scope only"**, **"Illustrative scope only."** plus fabricated Included/Not-included lists written for fit-outs. `CHOICE_VISUALS` only knows the 4 fit-out codes. | `features/requirement/view/what-screen.tsx:49-115,253` |
| F2 | High | Desktop copy calls the occasion a service: **"Choose a service for Event lighting & decor"**, "Pick the closest service…". | `features/requirement/view/what-screen.tsx:408-413` |
| F3 | High | The date step is wrong for events. "Ready to start" + "± a week / ± a month" flexibility describes a renovation, not a wedding on a fixed date. "Must finish by" is inverted — for decor the *event date* is the deadline and setup precedes it. | `features/project-request/view/where-when-screen.tsx:41-45,108-138` |
| F4 | High | The brief captures nothing a decorator needs: no function granularity, no decor scope (stage/mandap/entrance), no flowers-vs-balloons, no venue type, no budget. Three answers ("Wedding, 200 guests, venue booked") give a vendor nothing to prepare with. | seed questions above |
| F5 | Med | Mobile occasion tiles: 3 of 4 resolve to the same `PartyPopper` icon; `festival` matches no keyword and degrades to a letter-"F" monogram. All option descriptions are `""`. | `project-request/model/option-icons.ts:92,120-126` |
| F6 | Med | `guest_count` renders in `SqftCard` with no unit (`QUESTION_UNITS` only knows `floor_area_sqft`) and the catering hint "Sets the quantity on every dish." | `project-request/model/questions.ts:23-25`; `seed_m2_demo.py:241` |
| F7 | Med | `budget_min_paise`/`budget_max_paise` exist on `CustomerRequirement` and the detail screen renders "Budget you gave" — but no flow step ever writes them. Permanently blank. | `models/capture.py`; `request-detail-screen.tsx:106,173,223` |
| F8 | Med | Step-1 guard before the first server save passes on **any one** answered field, not all required ones. | `features/requirement/model/state.ts:331-334` |
| F9 | Med | Backend supports `MULTIPLE_CHOICE` questions but the customer renderer has no control for that kind. | `catalog/models.py:564`; no handler in `project-request/view/what-screen.tsx` |
| F10 | Low | A purpose-built event UX already exists (occasion screen with per-occasion artwork and descriptions, guest bands, `crew_brief` projection to the partner) but is A3-gated at `/requests/book/[service]` and structurally unreachable for this A5 service. | `features/crew/**` |
| F11 | Low | Tile image is a generic chandelier from the "Service Cover" pool while the cover uses the `event-decor` Unsplash pool — two unrelated image sources for one service; both filenames carry a literal `…` from truncation. | `services.csv:533`; `catalog/seed_images.py:212-217` |
| F12 | Low | Step-3 empty-facts fallback reads "Standard requirement details"; `TIER_HEADLINE` is computed but never rendered; stale "2-step" doc comments in three files. | `visits-send-screen.tsx:93`; `access/adapters/index.ts:195-199` |

**Root cause:** the flow machinery is fine (config-driven questions, tile renderer, A5 visit
plans all work). The *catalogue data* for this service is a 3-question stub, and the generic
flow has two structural assumptions — "start date + flexibility" and single-choice-only —
that don't fit events.

---

## 2. How event decor is actually bought in India

What a real decorator (or Urban Company / WedMeGood / BookEventz) establishes before quoting:

1. **The occasion, precisely.** "Wedding" is not one job — haldi (yellow marigold, at home),
   mehendi (green/floral), sangeet (stage + DJ lighting), reception (grand stage + entrance)
   are separately priced setups, often on consecutive days. South-Indian family functions —
   housewarming/gruha pravesh, naming & cradle ceremony, seemantham/baby shower, half-saree
   and dhoti functions — are a huge share of home-decor demand and none map to the current
   four tiles (they'd all be forced into "Festival or pooja").
2. **The date of the event** — fixed, non-negotiable. Setup happens the night before or the
   same morning; venue access time matters more than "flexibility".
3. **The venue type.** Home hall vs. function hall vs. open lawn vs. terrace changes
   everything: ceiling height for drapes, power for lighting, permission for pandals,
   generator needs outdoors.
4. **What to decorate** — multi-select by nature: stage/backdrop, entrance arch + walkway,
   mandap, ceiling drapes, table pieces, building outline lighting, photo booth. A customer
   frequently wants "stage + entrance" only.
5. **Material/style** — the single biggest price driver: fresh flowers (marigold vs. orchids,
   seasonal), artificial flowers, balloons (the default for birthdays), lights & drapes only,
   or a full theme. Fresh-flower stage ₹15k–1L+; balloon birthday setups ₹1.5k–8k.
6. **Budget band.** Every real conversation starts with "what's your budget?" — decorators
   design *to* a budget; without it the first quote is a shot in the dark and the customer
   churns on sticker shock.
7. **Guest scale** — a rough band, only to size the venue coverage; exact counts are
   catering's problem, not decor's.
8. **Photos, both directions.** Customers share venue photos and Pinterest/Instagram
   references; decorators sell with portfolios. This is the one place the "no media in
   capture" decision genuinely costs — see §6.

Market shape worth noting: **birthday balloon decor is a fixed-price package product** in
India (Urban Company sells it at listed prices) — an A1 candidate; **wedding/large-event
decor is quote-after-visit** — exactly A5; **festival outline lighting** is per-day rental —
A3-shaped. The single A5 service is the right start, but the occasion answer should
eventually steer packaging (owner decision D4 below).

---

## 3. Proposed flow — same 3 steps, event-aware

Everything below respects the fixed decisions in [task.md](../../../task.md): 3 screens, zero
free text (one optional single-line "Something else" input, same precedent as
`event_description` on event staff), icon tiles for choices, keypad for numbers, no media,
A5 visit plans unchanged.

### Step 1 of 3 — What needs doing?

```text
┌─────────────────────────────────────────────┐
│ ←  Event lighting & decor        Step 1 of 3│
│                                             │
│ What's the occasion?                        │
│ ┌───────────┐ ┌───────────┐ ┌───────────┐   │
│ │ 💍         │ │ 🎂        │ │ 💐        │   │
│ │ Wedding   │ │ Birthday  │ │ Engagement│   │
│ │ function  │ │           │ │ or roka   │   │
│ └───────────┘ └───────────┘ └───────────┘   │
│ ┌───────────┐ ┌───────────┐ ┌───────────┐   │
│ │ 🏠         │ │ 🤱        │ │ 🏢        │   │
│ │ House or  │ │ Baby      │ │ Corporate │   │
│ │ religious │ │ shower or │ │ event     │   │
│ │ function  │ │ seemantham│ │           │   │
│ └───────────┘ └───────────┘ └───────────┘   │
│ ┌───────────┐ ┌───────────┐                 │
│ │ 🪔         │ │ ✨        │                 │
│ │ Festival  │ │ Something │                 │
│ │           │ │ else      │                 │
│ └───────────┘ └───────────┘                 │
│  [Something else → one-line input appears]  │
│                                             │
│ What should we decorate?      (tap all that │
│                                       apply)│
│ ┌───────────┐ ┌───────────┐ ┌───────────┐   │
│ │ Stage or  │ │ Entrance &│ │ Mandap or │   │
│ │ backdrop  │ │ walkway   │ │ ceremony  │   │
│ └───────────┘ └───────────┘ └───────────┘   │
│ ┌───────────┐ ┌───────────┐ ┌───────────┐   │
│ │ Ceiling & │ │ Outline / │ │ The whole │   │
│ │ drapes    │ │ building  │ │ venue     │   │
│ │           │ │ lighting  │ │           │   │
│ └───────────┘ └───────────┘ └───────────┘   │
│                                             │
│ What look are you going for?                │
│ ┌───────────┐ ┌───────────┐ ┌───────────┐   │
│ │ Fresh     │ │ Balloon   │ │ Flowers + │   │
│ │ flowers   │ │ decor     │ │ balloons  │   │
│ └───────────┘ └───────────┘ └───────────┘   │
│ ┌───────────┐ ┌───────────┐                 │
│ │ Lights &  │ │ Let the   │                 │
│ │ drapes    │ │ decorator │                 │
│ │ only      │ │ suggest   │                 │
│ └───────────┘ └───────────┘                 │
│                                             │
│ Where is it happening?                      │
│ ┌───────────┐ ┌───────────┐ ┌───────────┐   │
│ │ Home or   │ │ Function  │ │ Lawn or   │   │
│ │ apartment │ │ hall      │ │ farmhouse │   │
│ └───────────┘ └───────────┘ └───────────┘   │
│ ┌───────────┐ ┌───────────┐                 │
│ │ Terrace   │ │ Office /  │                 │
│ │ or roof   │ │ other     │                 │
│ └───────────┘ └───────────┘                 │
│                                             │
│ How many guests?                            │
│ ( Under 50 ) ( 50–100 ) ( 100–250 )         │
│ ( 250–500 ) ( 500+ )                        │
│                                             │
│ Rough decor budget?                         │
│ ( Under ₹10,000 ) ( ₹10–25,000 )            │
│ ( ₹25–50,000 ) ( ₹50,000–1 lakh )           │
│ ( Above ₹1 lakh ) ( Not sure yet )          │
│  "Decorators design to your budget — it's a │
│   range, not a commitment."                 │
│                                             │
│              [ Continue ]                   │
└─────────────────────────────────────────────┘
```

Six taps + one optional line of text. Guest **band** replaces the raw number, which also
retires the `SqftCard`-with-no-unit rendering for this service (F6).

### Step 2 of 3 — Where and when (event-aware copy)

```text
┌─────────────────────────────────────────────┐
│ ←  Event lighting & decor        Step 2 of 3│
│                                             │
│ The venue                                   │
│ ┌─────────────────────────────────────────┐ │
│ │ 📍 Choose where the event is            │ │
│ └─────────────────────────────────────────┘ │
│   "Not booked yet? Give your home address — │
│    the decorator plans with you first."     │
│                                             │
│ Event date                                  │
│ ┌─────────────────────────────────────────┐ │
│ │ 📅 Choose the date                      │ │
│ └─────────────────────────────────────────┘ │
│   (no "± a week / ± a month" — the date is  │
│    the date)                                │
│                                             │
│ When can decorators set up?                 │
│ ( Evening before ) ( Same-day morning )     │
│ ( A few hours before ) ( Not sure )         │
│                                             │
│              [ Continue ]                   │
└─────────────────────────────────────────────┘
```

Mechanics: `requested_start` carries the **event date**; a new optional `setup_access`
choice question rides the existing answers channel. The flexibility segment and "Must finish
by" are hidden when the flow is event-shaped (same detection idea as `crewFlowShape`:
presence of an `event_type` question — no new contract field needed, though a
`M2VariantConfiguration` flag would be cleaner long-term). The "venue already booked"
boolean is retired; the address row's helper line covers the unbooked case honestly.

### Step 3 of 3 — Choose visits & send (recap upgraded, chooser unchanged)

```text
┌─────────────────────────────────────────────┐
│ ←  Event lighting & decor        Step 3 of 3│
│                                             │
│ Your event                                  │
│ ┌─────────────────────────────────────────┐ │
│ │ 💍 Wedding function · 100–250 guests    │ │
│ │ Stage + entrance · Fresh flowers        │ │
│ │ Function hall, Kukatpally               │ │
│ │ 14 Nov 2026 · setup evening before      │ │
│ │ Budget ₹25–50,000                       │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ How many estimates do you want?             │
│ ( 1 pro ₹49 ) (● 2 pros ₹99 ) ( 3 ₹199 )    │
│  "Each professional sees the venue and      │
│   prices it in writing."                    │
│                                             │
│ Visit times  — one per professional         │
│ ┌ Visit 1: Tue 4 Nov, 10:00–11:00 ─ change ┐│
│ ┌ Visit 2: Tue 4 Nov, 16:00–17:00 ─ change ┐│
│  "Visits happen at the venue address."      │
│                                             │
│      [ Send to 2 professionals ]            │
│  Free to send. ₹99 only when a pro          │
│  confirms a time.                           │
└─────────────────────────────────────────────┘
```

The recap card replaces the "Standard requirement details" fallback with option **labels**
(never codes — same rule as `crew_brief.py`). The A5 plan/slot machinery is untouched.

### Partner side (no new screens, better projection)

The enquiry/offer detail should lead with the same brief lines the recap shows —
"Wedding function · Stage + entrance · Fresh flowers · ₹25–50k · 14 Nov". The A3
`crew_brief` projection is the template; A5 enquiries already carry `answers`, so this is a
labels-not-codes projection on the existing read, not a contract change.

---

## 4. Exact seed data to publish

Replace the 3-question stub in `A5_PROJECT_SEEDS` for `event-lighting-decor` with
(choice/number/boolean/one optional TEXT — all existing `ServiceQuestion` kinds):

| code | prompt | kind | req | options (code → label) |
|---|---|---|---|---|
| `event_type` | What's the occasion? | SINGLE_CHOICE | yes | `wedding` → Wedding function ("Haldi, mehendi, sangeet, reception or the wedding day."); `birthday` → Birthday ("First birthday, kids' party or a milestone."); `engagement` → Engagement or roka; `house-function` → House or religious function ("Housewarming, pooja, naming or cradle ceremony."); `baby` → Baby shower or seemantham; `corporate` → Corporate event; `festival` → Festival ("Ganesh Chaturthi, Diwali or a community event."); `other` → Something else |
| `event_description` | Tell us about the event | TEXT | no | — (renders as the existing single-line input; precedent: event staff) |
| `decor_areas` | What should we decorate? | MULTIPLE_CHOICE | yes | `stage` → Stage or backdrop; `entrance` → Entrance & walkway; `mandap` → Mandap or ceremony area; `ceiling` → Ceiling & drapes; `outline-lighting` → Outline / building lighting; `full-venue` → The whole venue |
| `decor_style` | What look are you going for? | SINGLE_CHOICE | yes | `fresh-flowers` → Fresh flowers; `balloons` → Balloon decor; `mixed` → Flowers + balloons; `lights-drapes` → Lights & drapes only; `suggest` → Let the decorator suggest |
| `venue_type` | Where is it happening? | SINGLE_CHOICE | yes | `home` → Home or apartment; `hall` → Function hall; `outdoor` → Lawn or farmhouse; `terrace` → Terrace or rooftop; `other` → Office / other |
| `guest_band` | How many guests? | SINGLE_CHOICE | yes | `under-50`, `50-100`, `100-250`, `250-500`, `500-plus` |
| `budget_band` | Rough decor budget? | SINGLE_CHOICE | yes | `under-10k` → Under ₹10,000; `10-25k` → ₹10,000–₹25,000; `25-50k` → ₹25,000–₹50,000; `50k-1l` → ₹50,000–₹1 lakh; `1l-plus` → Above ₹1 lakh; `unsure` → Not sure yet |
| `setup_access` | When can decorators set up? | SINGLE_CHOICE | no | `evening-before` → Evening before; `same-day` → Same-day morning; `few-hours` → A few hours before; `unsure` → Not sure |

The M2 validation schema derives from the same tuple (`_seed_a5_configuration` already does
this per the §7 one-table rule), so submissions validate against exactly what the catalogue
publishes. `budget_band` should additionally be mapped server-side into
`budget_min_paise`/`budget_max_paise` on the requirement so the existing "Budget you gave"
row (F7) finally renders.

---

## 5. Code changes the data can't cover

1. **Multi-select tiles** — add a `MULTIPLE_CHOICE` branch to the mobile and desktop what-
   screens; it's `OptionTiles` with a set instead of a scalar (F9). If deferred, seed
   `decor_areas` as six boolean tiles instead (precedent: event-staff role counts) — worse UX,
   zero new UI.
2. **Kill the desktop `fallbackVisual` placeholders** (F1, F2). Options without curated
   visuals should render as the same clean icon tiles mobile uses — never "Mock scope only"
   in production. Fix the "Choose a service…" heading to use the question's own prompt.
3. **Event-aware step 2** (F3): detect event shape (an `event_type` question on the variant),
   then relabel date to "Event date", hide flexibility + "Must finish by", show the setup
   helper copy.
4. **Icons** (F5): add per-occasion entries to `iconForOption` (or better, reuse
   `features/crew/view/event-icons.tsx`, which already maps these codes) and keywords for
   `festival`/`pooja`/`engagement`/`baby`.
5. **Retire the catering hint on `guest_count`** if the raw number survives anywhere
   (`QUESTION_HELP` in the seed); the band question removes it here.
6. **Step-1 guard** (F8): require all required answers before Continue even pre-save.
7. **Recap card on step 3** (F12): render answer labels, drop "Standard requirement details".
8. **Tile image** (F11): point the catalogue tile at the `event-decor` pool, not the
   chandelier; re-export truncated R2 filenames when convenient.
9. **Stale "2-step" doc comments** in `[service]/page.tsx`, `requirement-context.tsx`,
   `requirement-sent.tsx`.

---

## 6. Owner decisions needed

| # | Decision | Recommendation |
|---|---|---|
| D1 | **Photos for events.** Capture media was removed platform-wide, but decor is bought visually in the real world (venue photos + reference images). | Keep capture clean for now — the A5 site visit *is* the venue viewing. Revisit as "reference photos on the Q&A thread" once the estimate-photo upload pipeline (noted "not built" in the quotes revamp) exists. |
| D2 | **Budget bands.** Amounts above are placeholders like every other seeded price. | Approve bands per city tier; store as `budget_min/max_paise`. |
| D3 | **Wedding function granularity.** One request per function (haldi, sangeet…) vs. one request covering several days. | Ship single-function now (matches one-visit-one-estimate mechanics); multi-day is a real follow-up for wedding packages. |
| D4 | **Birthday balloon decor as A1 packages.** Fixed-price listed packages are the market norm; the catalogue machinery (A1 variant on the same service) already supports it. | Seed 2–3 A1 balloon packages later; keep A5 as the custom path. |
| D5 | **Occasion vocabulary.** The list above is Hyderabad/South-India-weighted (seemantham, half-saree function under "House or religious function"). | Review labels with ops before seeding. |

---

## 7. Why this stays inside the locked product frame

- Still 3 steps, still `SCREEN_BUDGET = 3`, no new screens.
- Still zero free-text capture except one optional single-line input behind "Something
  else" — the exact pattern event staff already shipped.
- All new questions are choice/boolean (one optional TEXT); no photos, no voice, no
  textareas.
- The A5 visit-plan chooser, slot chooser, dispatch, payment and estimate flows are
  untouched; this is catalogue data + presentation fixes, not a new engine.
- Most of the work is one `ProjectSeed` edit plus the seven frontend fixes in §5.

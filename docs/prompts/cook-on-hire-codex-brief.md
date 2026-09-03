# Build Brief — Cook on Hire (labour-only cooking, customer procures groceries)

You are building a production feature in the VSolveHub monorepo at `c:\dev\vsolve`, branch
`M2-revamp`. **Read this whole document before writing any code.** Where it names an existing
file, open and read it first — the codebase's conventions are the law here, and every one of
them is load-bearing.

---

## 1. What you are building, in one paragraph

A customer books **a cook** who comes to their home or venue, cooks, and leaves. **The customer
buys all the groceries themselves** — we sell the cooking labour, not the food. The defining
domain fact is that **an Indian cook never comes alone**: you engage one master cook
(bawarchi/maharaj) and he brings his own 2–3 helpers, whom he pays himself. The customer must
therefore **never be asked how many cooks they want** — they are asked how many *guests* — and
must see **one price with the helpers already inside it**. Because the market genuinely splits
by size, this ships as **two products**: a flat instantly-bookable house-function team-day
(`A3_TIME_BLOCK`), and a quoted per-plate event cook (`A5_CUSTOM_PROJECT`) that is a sibling of
the existing `event-catering` variant but with `material_fulfilment_mode = CUSTOMER_PROCURES`.

---

## 2. Repo orientation — read these first

- `CONTRIBUTING.md` — stack, gates, contract workflow. Backend: Django + DRF + Celery +
  Postgres, mypy **strict**, ruff. Frontend: pnpm/turbo, Next.js App Router + React + TanStack
  Query + Tailwind v4; apps `customer` / `partner` / `admin`.
- `backend/apps/catalog/models.py` — `ServiceVariant.BookingArchetype`
  (`A1_TASK_VISIT` / `A3_TIME_BLOCK` / `A5_CUSTOM_PROJECT`), `ServiceQuestion.Kind`, and
  `M2VariantConfiguration` including `material_fulfilment_mode` (~line 297) and
  `pricing_skill_code`.
- `backend/apps/requirements/management/commands/seed_m2_demo.py` — **the main file you edit.**
  `DaySeed` (~line 1222) and `A3_DAY_SEEDS` (~line 1391) are the A3 day-hire seeds;
  `ProjectSeed` (~line 425) and `A5_PROJECT_SEEDS` (~line 455) are the A5 quoted seeds. The
  existing `event-catering` ProjectSeed at ~line 550 is your Product 2 template. The
  `event-staff-by-the-day` DaySeed at ~line 1565 is your Product 1 template.
- `backend/apps/requirements/management/commands/seed_price_book_demo.py` — `ItemSeed`
  (~line 91), `_material` (~line 71), `CATERING_ITEMS` (~line 1040) and the `CATALOG` tuple
  (~line 1827) that maps a skill code to its item list.
- `backend/apps/requirements/rate_cards.py` — `preset_size` (~line 173) reads **exactly**
  `worker_count` and `duration_days`; `publish_rate_card` (~line 351) enforces the wage floor,
  no-backdating, and the component reconciliation.
- `backend/apps/requirements/crew_brief.py` — projects the customer's answers onto the partner's
  offer screen. Fully generic over the published schema.
- `backend/apps/requirements/crew_mix.py` — the `<role>_count` / `_men` / `_women` machinery.
- `frontend/apps/customer/features/crew/model/booking-flow.ts` — `crewFlowShape` picks
  `plain` / `work` / `event` **from published question codes, never from a service slug**.
- `frontend/apps/customer/features/crew/model/event-flow.ts` — `OCCASION_CODES` and
  `PRESENTATION_CODES`; **this is where gap A lives.**
- `frontend/apps/customer/features/crew/view/book-crew-screen.tsx` — the A3 booking screen and
  its `hiddenCodes` mechanism.
- `frontend/apps/customer/features/quotes/view/gallery/materials-list-screen.tsx` — the existing
  customer **shopping list**, which is what `CUSTOMER_PROCURES` drives.
- Money convention: **integer paise**, percentages in integer **bps**. Never floats.
- Contract: `contracts/openapi/v1.yaml` is currently **1.59.0**; `contracts/openapi/CHANGELOG.md`
  records every bump.

---

## 3. The archetype decision, and why

| | Product 1 — house function | Product 2 — event cook |
|---|---|---|
| **Archetype** | `A3_TIME_BLOCK` | `A5_CUSTOM_PROJECT` |
| **Size** | ≤ 75 guests, 1 day, standard menu | 75+ guests, multi-meal, custom menu |
| **Price** | Flat published team-day rate, instant | Up to 3 written quotes, priced per plate |
| **Unit** | One **cook team**, one day | Plates and dishes |
| **Groceries** | Customer's | Customer's, **plus a generated shopping list** |

**Why A3 for Product 1.** "One cook and his team, one day, up to 75 guests, standard menu"
genuinely *is* a flat product, and A3 exists to sell a person (here: a team) for a block of time
against an ops-published rate card. `worker_count` carries the number of **teams** — almost
always 1 — and `duration_days` handles a two-day function.

**Why A5 for Product 2.** Above ~75 guests nobody quotes blind: a 200-guest veg lunch and a
200-guest non-veg wedding dinner are entirely different amounts of labour. A published flat rate
at that size would be a fabricated number. A5 already does exactly this for `event-catering`
("Menu, priced per plate") with a working price book.

**Why not A1.** A1 is a scoped fixed-price task visit. A cook is not a task.

**Why not a new archetype.** Nothing here needs one. No schema migration is required by this
brief.

---

## 4. Product 1 — "Cook for a house function" (`A3_TIME_BLOCK`)

### 4.1 The seed

Add one `DaySeed` to `A3_DAY_SEEDS` in `seed_m2_demo.py`.

```
slug                       = "house-function-cook"
name                       = "Cook for a house function"
variant_name               = "Cook team, full day"
icon_key                   = ServiceIconKey.SERVICE
category_slug              = "events"
subcategory_slug           = "event-cooks"
subcategory_name           = "Event cooks"
subcategory_display_order  = 45          # event-services is 40, lighting-decor is 50
image_subject              = "catering"  # already in SEED_IMAGE_POOLS
skill_code                 = "house-function-cook"
skill_name                 = "House function cook"
skill_description          = "A master cook and his own helpers, hired as one team for a day."
wage_floor_paise           = 90_000      # PLACEHOLDER — see §8
worker_day_wage_paise      = 500_000     # PLACEHOLDER — the TEAM's day price, not one person's
supervision_margin_paise   = 0
overtime_hourly_paise      = 50_000      # PLACEHOLDER
add_on_rates               = {}
preset_questions           = ()          # publishes {"questions": []}, which is valid
```

> ⚠️ **`supervision_margin_paise = 0` is deliberate.** In A3 that field pays a working supervisor
> standing over a gang. Here the master cook *is* the supervisor and his margin is already inside
> the team day rate. Adding a second supervision line would bill the customer twice for the same
> person. Confirm the DB reconciliation constraint
> (`customer_day_rate = wage + supervision + booking_fee`) accepts a zero margin before relying
> on this; if it does not, put the whole amount in `worker_day_wage_paise` and leave a comment.

### 4.2 The questions

`questions` must include `worker_count` and `duration_days` — `preset_size` refuses without them.

```
event_type        SINGLE_CHOICE  required  "What's the occasion?"
                  housewarming / birthday / pooja-function / get-together / other
guest_band        SINGLE_CHOICE  required  "How many guests?"
                  under-25 / 25-50 / 50-75
meals             MULTIPLE_CHOICE required "Which meals?"
                  breakfast / lunch / snacks / dinner
cuisine           SINGLE_CHOICE  required  "What kind of food?"
                  south-indian / north-indian / andhra-telangana / chinese-continental / mixed
food_preference   SINGLE_CHOICE  required  "Veg or non-veg?"
                  veg / veg-nonveg / nonveg
kitchen_setup     SINGLE_CHOICE  required  "What's the kitchen like?"
                  home-gas-ready / outdoor-arranged / outdoor-nothing-yet
staff_meal_provided BOOLEAN      required  "Will you provide a meal for the cook and helpers?"
worker_count      NUMBER   required min 1  "Cook teams"
duration_days     NUMBER   required min 1  "Days"
```

**Do NOT publish `cook_count` / `cook_men` / `cook_women`.** Publishing any `*_count` role
alongside an occasion flips `crewFlowShape` to the `event` wizard and renders cook steppers —
which is precisely the thing this design removes. With an occasion but no role, the shape
resolves to `plain`: one details screen, then the rate. That is correct and intended.

**`worker_count` must be hidden from the customer and default to 1.** Use the existing
`hiddenCrewQuestionCodes` mechanism in `book-crew-screen.tsx` (already used for conditional
questions) and seed the answer default. A visible "Cook teams" stepper contradicts the entire
premise. It stays *published* because `preset_size`, matching and the shift-day engine all read
it; it is simply not asked.

> If `guest_band` is answered `50-75`, you may pre-set `worker_count = 1` and leave it. There is
> no case in this band where a customer should be choosing 2.

### 4.3 Catalogue copy

`short_description`:
> "A cook and his own helpers at your home for the day — they cook your menu on your groceries,
> clean the kitchen, and leave."

`included`:
- One full day for the cook and his helpers — the team is one price.
- Cooking your menu on ingredients you provide.
- Own knives and basic kitchen hand tools.
- Kitchen and vessels left clean.
- Overtime charged only after you approve it in the app.

`excluded` — **this list is the product; do not soften it:**
- Groceries, masalas, oil, and gas or firewood — all yours.
- Deghs, kadais, stoves and serving vessels.
- Serving, plating and clearing — that is Event staff.
- Menu planning and quantity estimation.

`rate_inclusions` (printed on the rate card and echoed on the live-rate screen):
- One full day for the master cook and his helpers.
- The team size is the cook's decision, based on your guest count.
- Overtime is charged only after you approve it in the app.

### 4.4 The hand-off above the band

`guest_band` deliberately stops at `50-75`. The customer app must render a hand-off card when the
customer needs more (see screen 5b in §7). It links to Product 2. Do not attempt to price a
150-guest wedding on a flat rate.

---

## 5. Product 2 — "Event cook" (`A5_CUSTOM_PROJECT`)

### 5.1 The seed

Add one `ProjectSeed` to `A5_PROJECT_SEEDS`, modelled on the `event-catering` seed directly
above it.

```
slug                       = "event-cook"
name                       = "Event cook (you supply the groceries)"
variant_name               = "Cooking, priced per plate"
pricing_skill              = "event-cook"
icon_key                   = ServiceIconKey.SERVICE
category_slug              = "events"
subcategory_slug           = "event-cooks"      # same tile as Product 1
subcategory_name           = "Event cooks"
subcategory_display_order  = 45
image_subject              = "catering"
material_fulfilment_mode   = CUSTOMER_PROCURES  # this is the whole point; it is also the default
```

`short_description`:
> "You buy the groceries, they do the cooking. Verified cooks quote per plate for your guest
> count and send you the shopping list."

### 5.2 The questions

A5 seeds are deliberately near-empty — the visit and the quote do the work. **No `TEXT`
questions** (the customer never types a description; this is a hard rule in the file's own
comment at ~line 452). Publish exactly two taps, the two facts a cook cannot quote without:

```
food_preference  SINGLE_CHOICE required "Veg or non-veg?"
                 veg / veg-nonveg / nonveg / jain-satvik
guest_band       SINGLE_CHOICE required "How many guests?"
                 75-150 / 150-300 / 300-plus
```

Everything else — menu, dish count, meal times, kitchen — belongs to the visit and the estimate.

### 5.3 The price book — new `event-cook` trade

Add `EVENT_COOK_ITEMS` to `seed_price_book_demo.py` and register `("event-cook",
EVENT_COOK_ITEMS)` in the `CATALOG` tuple.

**Every rate below is cooking labour only.** This is the single most important difference from
`CATERING_ITEMS`, where the same-named lines include the food. Say so in the module comment or a
future reader will conflate them.

| Name | Unit | Reference rate | Group | Bundles |
|---|---|---|---|---|
| Veg plate — cooking labour | each | ₹45 | Plates | small 75, medium 150, large 300 |
| Non-veg plate — cooking labour | each | ₹65 | Plates | — |
| Breakfast plate — cooking labour | each | ₹25 | Plates | — |
| Biryani in degh (~40 plates) | each | ₹1,200 | Specials | — |
| Tandoor or live counter cook | each | ₹2,500 | Specials | — |
| Extra helper, per day | day | ₹700 | Team | — |

All rates are PLACEHOLDERS — see §8. `unit` values must come from
`financials.ALLOWED_UNITS` = `{each, job, hour, day, sq_ft, running_ft, metre, kg, litre, set}`.

**Recipes are the shopping list.** Attach a `recipe` (built with `_material`) to each plate item
giving per-plate raw quantities — rice, atta, oil, onion, tomato, chicken, mutton, spices. This
is what makes the customer's shopping list generate itself. Get these roughly right; a nutrition
table is not required, but the quantities must be defensible per plate. Use `pack_size` /
`pack_unit` where a market sells in packs.

---

## 6. Two code gaps you MUST fix

These are real defects found while tracing the flow. Without them this feature silently loses
data. Fix both **before** seeding, so the seed is verifiable.

### Gap A — the customer's details step renders a hardcoded allowlist

`frontend/apps/customer/features/crew/model/event-flow.ts` defines
`PRESENTATION_CODES = [dress_code, staff_meal_provided]`, and `book-crew-screen.tsx` renders
**only those** on the details step. Any newly published question that is not an occasion code, a
role, or a sizing code renders **nowhere** — seeded, never asked, never answered.

**Fix generically, not by adding cook codes to the allowlist.** Replace `presentationQuestions`
with a leftover-based selector: every published question that is not an occasion code, not a
role question (`isRoleQuestion`), and not a sizing code (`HEADCOUNT_CODE`, `DURATION_CODE`).
That fixes every future crew service instead of special-casing cooks. Keep `dress_code` and
`staff_meal_provided` rendering exactly where they do today — this must be a no-op for
`event-staff-by-the-day`.

Update `event-flow.test.ts` accordingly.

### Gap B — `MULTI_SELECT` answers vanish from the partner's offer

`crew_brief._RENDERERS` (~line 68) has `INTEGER` / `BOOLEAN` / `SELECT` / `TEXT` only. A
`MULTIPLE_CHOICE` question serialises to schema kind `"MULTI_SELECT"`
(`seed_m2_demo.py:222`), its answer is a **list**, `_render_text` returns `None` for a
non-string, and the brief line is **dropped silently**. The cook would never see which meals he
is cooking.

**Fix:** add a `_render_multi_select` renderer that maps each selected code through
`_option_label` and joins with `", "`, returning `None` for an empty or non-list value. Register
it under `"MULTI_SELECT"`. Add a unit test covering a list of two codes, an empty list, and a
code absent from the options.

---

## 7. The screens

These are the target. Layout is indicative; copy is not — the wording below was chosen
deliberately and should survive into the build.

### Screen 1 — Catalogue tile (Events)

```
Home  ›  Events
┌───────────────────────┐  ┌───────────────────────┐
│  [catering photo]     │  │  [event-staff photo]  │
│  Event cooks      NEW │  │  Event staff          │
│  You buy groceries    │  │  Serving & support    │
└───────────────────────┘  └───────────────────────┘
```

One tile, two products behind it. The service page branches on guest count.

### Screen 2 — Service page

```
Cook on hire                              from ₹5,000 / day

A cook and his own helpers at your home or venue. They cook
your menu on your groceries and leave the kitchen clean.

  ┌─ What's included ──────────────────────────────────────┐
  │ ✓ One full day for the cook and his helpers            │
  │ ✓ Cooking your menu on ingredients you provide         │
  │ ✓ Own knives and basic kitchen hand tools              │
  │ ✓ Kitchen and vessels left clean                       │
  │ ✓ Overtime charged only after you approve it in-app    │
  └────────────────────────────────────────────────────────┘

  ┌─ What's NOT included ──────────────────────────────────┐
  │ ✗ Groceries, masalas, oil and gas — all yours          │
  │ ✗ Deghs, kadais, stoves and serving vessels            │
  │ ✗ Serving, plating and clearing — that's Event staff   │
  │ ✗ Menu planning and quantity estimation                │
  └────────────────────────────────────────────────────────┘

                    [ Book a cook ]
```

### Screen 3 — Booking form (Product 1, `plain` shape — one screen)

```
  What's the occasion?
  ┌────────────┐ ┌──────────┐ ┌────────┐ ┌──────────────┐
  │Housewarming│ │ Birthday │ │ Pooja  │ │ Get-together │
  └────────────┘ └──────────┘ └────────┘ └──────────────┘

  How many guests?
  ( ) Under 25    (•) 25 to 50    ( ) 50 to 75

  ┌──────────────────────────────────────────────┐
  │  Your cook brings their own helpers.         │
  │  For 25–50 guests that's usually a master    │
  │  cook and 2 helpers. You don't pay them      │
  │  separately — it's one price.                │
  └──────────────────────────────────────────────┘

  Which meals?
  [ ] Breakfast  [✓] Lunch  [ ] Snacks  [✓] Dinner

  What kind of food?
  ( ) South Indian  (•) Andhra–Telangana  ( ) North Indian
  ( ) Chinese & continental   ( ) Mixed

  Veg or non-veg?
  ( ) Pure veg   (•) Veg + non-veg   ( ) Non-veg only

  What's the kitchen like?
  (•) Home kitchen, gas ready
  ( ) Outdoor, vessels and gas arranged
  ( ) Outdoor, nothing set up yet

  Will you provide a meal for the cook and helpers?  (•) Yes  ( ) No

  Date  [ 14 Nov 2026 ]        Days  [ 1 ]
  Reporting time  [ 07:00 AM ▾ ]
  Address  [ Plot 42, Kondapur, Hyderabad 500084  ✎ ]

                              [ See my price ]
```

**The reassurance box is required, not decoration.** "Where do the other two come from and who
pays them?" is the first question every customer asks, and answering it before they ask is what
stops them abandoning the form.

**No cook stepper anywhere on this screen.**

### Screen 4 — The price (Product 1)

```
  ┌─ Your price ─────────────────────────────────┐
  │  One cook team · 1 day · up to 75 guests     │
  │                                              │
  │  Cook and team, full day          ₹5,000     │
  │  Booking fee                         ₹50     │
  │  ────────────────────────────────────────    │
  │  Total                            ₹5,050     │
  │                                              │
  │  Includes the master cook and his helpers.   │
  │  You provide groceries, gas and vessels.     │
  └──────────────────────────────────────────────┘
                              [ Confirm booking ]
```

One line for the team. **Never** `3 cooks × ₹1,667`.

### Screen 5b — The hand-off above 75 guests

```
  Planning something bigger?

  Above 75 guests, cooks price the menu rather
  than the day — dish count and veg/non-veg
  change the work a lot.

  ┌──────────────────────────────────────────────┐
  │  Get quotes from event cooks                 │
  │  Up to 3 written quotes, priced per plate.   │
  │  You still buy the groceries — they'll send  │
  │  you the shopping list.              [ Go → ]│
  └──────────────────────────────────────────────┘
```

### Screen 6 — Partner offer (Product 1)

```
  NEW OFFER                          expires in 4:32

  Cook for a house function · Kondapur, Hyderabad
  1 team · 1 day · Sat 14 Nov, report 07:00

  ┌─ The brief ──────────────────────────────────┐
  │  What's the occasion?     Housewarming       │
  │  How many guests?         25 to 50           │
  │  Which meals?             Lunch, Dinner      │  ← needs Gap B
  │  What kind of food?       Andhra–Telangana   │
  │  Veg or non-veg?          Veg + non-veg      │
  │  What's the kitchen like? Home kitchen,      │
  │                           gas ready          │
  │  Meal for the team?       Yes                │
  └──────────────────────────────────────────────┘

  You earn ₹5,000.  Booking fee ₹50 due on accept.

  [ Decline ]                          [ Accept ]
```

This screen needs **no new code** — `crew_brief.brief_lines` renders every answered non-sizing
question straight from the published schema. `food_preference` appearing here *before* accept is
how a veg-only cook self-selects out without the customer ever being let down.

### Screen 7 — Partner estimate composer (Product 2)

```
  Compose your estimate · Wedding, 230 guests, Kondapur

  Plates                    qty     rate      amount
  Veg plate — labour        150   ₹  45     ₹ 6,750
  Non-veg plate — labour     80   ₹  65     ₹ 5,200
  Biryani in degh             2   ₹1,200    ₹ 2,400
  ─────────────────────────────────────────────────
  Your quote                                ₹14,350
  💡 Ops anchor for this size: ₹11,000–16,000
```

### Screen 8 — Customer shopping list (Product 2, post-acceptance)

```
  Your shopping list · 150 veg + 80 non-veg plates

  ┌─ Grains and staples ─────────────────────────┐
  │  Basmati rice            18 kg               │
  │  Wheat flour             10 kg               │
  ├─ Non-veg ────────────────────────────────────┤
  │  Chicken                 16 kg               │
  ├─ Vegetables ─────────────────────────────────┤
  │  Onion                    9 kg               │
  │  Tomato                   6 kg               │
  └──────────────────────────────────────────────┘
      [ Share on WhatsApp ]   [ Download ]

  Cook's charge: ₹12,700 (labour only)
```

This screen already exists (`materials-list-screen.tsx`). It renders because
`material_fulfilment_mode = CUSTOMER_PROCURES` and the price-book items carry recipes. **You are
wiring it, not building it.** For a service whose premise is "you buy the groceries", this is the
differentiator — verify it actually renders end to end.

### Screen 9 — Operations rate card (Product 1)

```
  Operations › Rate cards › New

  City   [ Hyderabad ▾ ]      Skill  [ House function cook ▾ ]
  Effective from  [ 2026-09-10 ]

  Team day rate        ₹ [ 5000 ]   ⚠ floor ₹900
  Supervision margin   ₹ [    0 ]   (master cook is the supervisor)
  Booking fee          ₹ [   50 ]
  Standard day hours     [    8 ]
  Overtime / hour      ₹ [  500 ]
  ─────────────────────────────────
  Customer day rate    ₹ 5,050  (computed, constraint-checked)
```

---

## 8. Placeholder rates — flag, do not invent

Every rupee figure in this brief is a **Hyderabad placeholder awaiting the owner's numbers**:

- Product 1 team day rate ₹5,000; wage floor ₹900; overtime ₹500/hr.
- Product 2 per-plate labour: veg ₹45, non-veg ₹65, breakfast ₹25; degh ₹1,200; counter ₹2,500;
  helper day ₹700.

Seed them as-is so the flow is demonstrable, and **put a single clearly-marked constant block at
the top of each seed list** so the owner can change them in one place. Do not scatter magic
numbers through the seeds.

⚠️ `publish_rate_card` **fails closed** if `worker_day_wage_paise` is below the statutory floor
for the area's `state_code`, or if the area has no `state_code`. Seed the `house-function-cook`
wage floor before the rate card, or the seed run will raise `m2_wage_floor_unavailable`.

⚠️ **Known modelling caveat, do not silently "fix" it:** `assert_rate_meets_wage_floor` checks
the day rate against a **per-person** statutory floor. A ₹5,000 *team* rate clears a ₹900
per-person floor trivially, so for Product 1 the guard becomes vacuous. It is not wrong, but it
stops protecting anything. Leave a comment saying so at the seed. Do not restructure the wage
floor system in this task.

---

## 9. Contract and changelog

If the new question codes or the `event-cook` price-book trade change any published response
shape, bump `contracts/openapi/v1.yaml` from **1.59.0** to **1.60.0** and add a
`contracts/openapi/CHANGELOG.md` entry. If nothing on the wire changes — likely, since these are
seed data plus two internal fixes — **do not bump**, and say so in your summary.

---

## 10. Acceptance criteria

1. `seed_m2_demo --i-understand-this-is-dev-only` runs clean and is idempotent on a second run.
2. `seed_price_book_demo --i-understand-this-is-dev-only` seeds the `event-cook` trade, idempotently.
3. Events category shows an **Event cooks** tile; both products are reachable.
4. Product 1: the booking form renders **all nine** published questions, asks for **no cook
   count**, and prices as one team line.
5. Product 2: the partner composer opens the `event-cook` catalogue; an accepted estimate
   produces a customer shopping list with real quantities.
6. Partner offer for Product 1 shows all seven brief lines, **including the multi-select
   `meals` line** (proves Gap B).
7. `event-staff-by-the-day` is byte-for-byte unchanged in behaviour — same questions, same
   screens, same steps (proves Gap A was generic, not a special case).
8. Static gates pass: `ruff`, `mypy --strict`, `pnpm typecheck`, `pnpm lint`, and the repo's
   `quality-static.ps1`.

---

## 11. Do NOT

- **Do not ask the customer how many cooks they want, anywhere, in either product.** This is the
  central design decision. Guests in, one price out.
- **Do not itemise the helpers on the customer's price.** No `3 × ₹1,667`. The customer contracts
  with the master cook; how he pays his team is his business.
- Do not publish `cook_count` / `cook_men` / `cook_women` role questions.
- Do not add a new `BookingArchetype`. No migration is needed for this brief.
- Do not fix Gap A by appending cook codes to `PRESENTATION_CODES` — fix it generically.
- Do not put cooks into `event-staff-by-the-day`. Rate cards are unique on
  `(service_area, skill, effective_from)`, so a cook there would price at the ₹850 waiter rate.
- Do not reuse `CATERING_ITEMS` rates. Those include the food; yours are labour only.
- Do not soften the `excluded` list. "You buy the groceries" must be unmissable, or every job
  ends in a dispute about who was bringing the oil.
- Do not run the Playwright suite or a full test matrix. Write tests; the owner runs them.
  Focused unit tests for Gap A and Gap B are expected.

---

## 12. Suggested order of work

1. Gap B (`crew_brief` MULTI_SELECT renderer) + its test — smallest, independently verifiable.
2. Gap A (`event-flow` leftover selector) + its test — verify `event-staff` is unchanged first.
3. Product 1 `DaySeed` + skill + wage floor + rate card; hide `worker_count`.
4. Product 1 customer screen copy, including the reassurance box and the 75-guest hand-off.
5. Product 2 `ProjectSeed`.
6. Product 2 `EVENT_COOK_ITEMS` price book with recipes; verify the shopping list renders.
7. Static gates; write the summary, naming every placeholder rate you seeded.

---

## 13. Open question for the owner — surface, don't decide

The cut-off between the two products is set at **75 guests** throughout this brief. The owner has
not confirmed it; 50 is the plausible alternative. Define it as **one named constant** used by
both the `guest_band` options and the hand-off card, so moving it is a one-line change.

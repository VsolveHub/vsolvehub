# Codex brief — roll the Electrician pattern to the remaining trades

You are working in the VSolveHub monorepo at `c:\dev\vsolve`, branch `M2-revamp`. Read this whole
document first. Claude owns the mechanism; you own **data only** — catalogue seeds and question
cuts for the trades listed under "Your trades". Do not change any frontend file, any model, any
serializer, any view, or the contract. If a trade seems to need one, stop and write the need into
your report instead of building it.

## 1. What already exists (do not rebuild)

The quote flow is visit-first and generic. For any quote (A5) or day-hire (A3) service:

- The customer taps the service, at most one fork tile, an address and a date; the professional
  visits, measures, and writes the estimate on site.
- The partner's estimate composer (`frontend/apps/partner/features/proposal/view/
  rate-card-estimate-composer.tsx`) opens the **trade catalogue** for the enquiry — work items
  with a unit, a city reference rate, an allowed band, a material recipe and quick sets — and
  builds the shopping list the customer buys from. Nothing in it is trade-specific.
- Which catalogue opens is decided by `M2VariantConfiguration.pricing_skill_code`, set per
  service in `seed_m2_demo.py` via `ProjectSeed.pricing_skill` / `DaySeed.pricing_skill`.
- Catalogues are seeded per **trade** (`electrician`, `painter`, …) in
  `backend/apps/requirements/management/commands/seed_price_book_demo.py`. The Electrician
  catalogue there is the reference: 27 `ItemSeed`s across six groups, with `_material(...)`
  recipes and `bundles={"1bhk": …, "2bhk": …, "3bhk": …}` quick sets.

## 2. The only two files you edit

1. `backend/apps/requirements/management/commands/seed_price_book_demo.py`
   - Add one `<TRADE>_ITEMS: tuple[ItemSeed, ...] = (...)` tuple per trade, in the same shape as
     `ELECTRICAL_ITEMS`, and register it in `CATALOG` as `("<skill-code>", <TRADE>_ITEMS)`.
   - The skill code must be an existing `partners.Skill.code` (see §4). Do not create skills here.
   - `unit` must be one of `each, job, hour, day, sq_ft, running_ft, metre, kg, litre, set`.
   - `group` is the composer tab (short, 1–2 words); the labour-day items go in group `"Labour"`
     with `unit="day"` and no recipe.
   - `recipe` = what one unit of the item consumes, as `_material(title, spec, unit, per_unit,
     pack_size=…, pack_unit=…)`; use pack rounding where a shop sells packs (bags, coils, boxes).
     Reuse shared constants for anything that repeats (see `WIRE_15`, `COIL`).
   - `bundles` = quick-set quantities keyed `1bhk` / `2bhk` / `3bhk` for home-sized trades; use
     `small` / `medium` / `large` for area-sized trades (tiling, waterproofing, demolition, AC).
   - Every reference rate is a placeholder — say so in the description like the existing items do.
     Aim for 15–30 items per trade, priced in paise (`150_00` = ₹150).
2. `backend/apps/requirements/management/commands/seed_m2_demo.py`
   - For each of your A5 services, replace the `questions=(...)` tuple with **either `()`** (the
     catalogue tile is the requirement) **or one `SINGLE_CHOICE` question** with 3–5 tiles, only
     when the answer changes who is dispatched or what they bring. No numbers, no sq ft, no
     booleans, no text.
   - Set `pricing_skill="<skill-code>"` on the `ProjectSeed` / `DaySeed`.
   - Day-hires: keep their `questions` (People + Days) and just set `pricing_skill`.

## 3. Your trades and services

| Trade skill code (must exist — see §4) | Catalogue to author | Services to point at it |
|---|---|---|
| `painter` | extend the existing `PAINTING_ITEMS`: add recipes (putty kg, primer/emulsion litres per sq ft, masking tape, sandpaper) and `bundles` | `full-home-painting` (questions → `()`), `painter-by-the-day` |
| `tiling-flooring-work` | tiling per sq ft (floor, wall, skirting per rft, grouting, old-tile removal); recipes: tiles per box, adhesive bags, grout, spacers; `bundles` small/medium/large | `tiling-flooring-work` (fork: Floors / Walls / Both) |
| `terrace-waterproofing` | membrane & coating per sq ft, crack treatment per rft, drainage; recipes: chemical litres, mesh, primer; small/medium/large | `terrace-waterproofing` (fork: Terrace / Bathroom / Water tank / Basement) |
| `home-demolition` | per wall, per room, per floor, debris bags, truck trips, labour days; small/medium/large | `home-demolition` (fork: A wall or two / One room / A full floor / A full structure) |
| `construction-helper` | helper labour days, loading/shifting per trip, packing | `construction-helpers` (A3 — keep its work tiles) |
| `ac-technician` | indoor/outdoor unit install, duct per rft, copper per m, core drilling, gas charging; recipes | `central-ac-ducting` (questions → `()`) |
| `event-catering` | per-plate menus (veg / non-veg / premium), live counters, staff per head, crockery; no recipes | `event-catering` (fork: Pure veg / Veg + non-veg) |
| `bridal-event-makeup` | bridal, HD, airbrush, reception, per extra person, trial, saree draping; no recipes | `bridal-event-makeup` (fork: Wedding / Reception / Engagement / Party) |
| `carpenter` (exists; Claude authored it) | nothing new | `interior-fit-out-project` → `pricing_skill="carpenter"` (fork: Office / Shop / Café / Bare shell) — do this **last** |

Claude owns: `plumber`, `carpenter`, `decorator`, and the electrician day-hire cleanup. Do not touch
those seeds.

## 4. Skills

`partners.Skill` rows are derived by `seed_partner_reference_data` from every active variant's
`required_skill_code` (plus the A3 wage skills `seed_m2_demo._seed_skill` writes). **Do not invent
a trade code** — a code no variant carries is deactivated on the next `--prune`. Use the codes in
the table above, all of which already exist; check with:

```
python manage.py shell -c "from apps.partners.models import Skill; print(sorted(Skill.objects.values_list('code', flat=True)))"
```

If a code from the table is missing on your database, run `seed_m2_demo` first — it re-syncs the
reference data — and note it in the report rather than creating a skill by hand.

## 5. Verify (static gates only — never run the test suites)

From `backend/`:

```
python manage.py seed_m2_demo --i-understand-this-is-dev-only
python manage.py seed_price_book_demo --i-understand-this-is-dev-only
.\.venv\Scripts\python.exe -m ruff format apps/requirements/management/commands
.\.venv\Scripts\python.exe -m ruff check apps/requirements/management/commands
.\.venv\Scripts\python.exe -m mypy apps/requirements/management/commands
```

Then one preview per trade to prove the shopping list rounds to packs:

```
python manage.py shell -c "
from apps.requirements import price_book
from apps.requirements.models import WorkItem
item = WorkItem.objects.get(skill__code='tiling-flooring-work', name='Floor tiling')
print(price_book.shopping_list_for_lines([{'work_item_id': str(item.id), 'quantity': '120'}]))"
```

Report per trade: item count, groups, whether recipes/bundles are present, the seeds' question
change, the exact gate output, and anything you could not do. Do not commit.

# A9 Stay — Property-Type Remediation Plan (post-implementation audit)

**Status:** Planning — fixes not started
**Trigger:** Owner-directed audit of the shipped `m3-planing` implementation (commit `b265479`),
2026-09-08, following the owner's specific concern: *"when we renting flat we dont need to show 1
sharing we need to show maximum 3 people"*
**Relates to:** `03-rental-stay-jobs-categories.md` §5 (A9_STAY) — this document does not change that
plan's architecture (`UnitType`, `UnitReservation`, deposit sub-lifecycle, host reassignment all stay
as designed); it corrects defects in how the *already-approved* design was implemented and seeded.
**Severity ordering is deliberate** — Wave 0 is a live money bug and should ship independently of
the larger UX rework in Waves 1–2.

---

## 1. What's wrong, in one table

| # | Defect | Class | Customer/host-visible? |
| --- | --- | --- | --- |
| D1 | Deposit charged at checkout can be **8–20× higher** than the deposit shown during browse, because of a hardcoded ₹64,000 floor applied to every listing regardless of property type | Money-correctness bug | Yes — customer is charged more than quoted |
| D2 | Host's "Sharing Type" dropdown sends values (`DOUBLE_SHARING`, `TRIPLE_SHARING`, `FOUR_SHARING`, `DORMITORY`) that don't exist in the backend's choices (`DOUBLE`, `TRIPLE`, `FOUR_PLUS`, `ENTIRE_PLACE`) | Broken form (400 on submit) | Yes — host cannot publish most room types |
| D3 | Whole-unit property types (Apartment, Villa, Independent House, Studio, Commercial) are asked for "Sharing Type" and shown "Food Included" — concepts that only apply to PG/Hostel/Co-living | Wrong domain concept applied to wrong property types | Yes — host form + customer filters |
| D4 | No occupancy/capacity field ("sleeps up to N") exists anywhere for whole-unit properties | Missing field | Yes — host cannot express this at all today |
| D5 | Filter-question seeding (`ServiceQuestion`) applies the same 5 filters (sharing type, furnishing, bathroom type, AC, food) to all 12 A9 subcategories uniformly, including Godown/Warehouse, Office Space, Commercial Space | Wrong domain concept applied to wrong subcategories | Yes — customer filters |
| D6 | "Gents PG" / "Ladies PG" exist only as service *names*; there is no structured `gender_restriction` field enforced anywhere | Missing field / taxonomy gap | Partially — no functional impact yet, but the taxonomy implies a facet that doesn't exist |
| D7 | `UnitType.bhk` defaults to `"1 BHK"` and displays `"Studio"` when unset, even on PG/Hostel rooms where BHK is meaningless | Wrong default / confusing copy | Yes — card badge |
| D8 | No `HOTEL` property type, no room-type vocabulary (single/double/deluxe/suite), no "Hotels" subcategory exists despite the category being named "Rooms / PG / Hostel / Hotels" | Scope gap, not a defect | Yes — hotels are simply unbuildable today |
| D9 | Customer-facing filter pills/drawer are a hardcoded static list, not driven by the backend's already-built `get_stay_filter_definitions(service_slug=...)` | Duplication / drift risk | Indirect — makes D3/D5's fix harder to keep correct over time |

D1–D7 are fixable inside the existing `UnitType`/`Property` design. D8 is new scope, not a fix, and is
called out separately (§6) so it isn't accidentally bundled into "the sharing-type fix."

---

## 2. Root cause

The plan's approved design (§5.1a, §5.3) never actually distinguishes property types at the *filter
and form* layer — it was written and implemented assuming "a room is a room." The seed command
(`seed_stay_catalog.py`) reinforces this: one loop generates the same five `ServiceQuestion` rows for
all 12 subcategories, and one constant (`default_deposit_paise = ₹64,000`) is applied inside that same
loop regardless of what's being seeded. The *seed data itself* (actual `UnitType` rows) is more
careful — PG/Hostel/Co-living rows correctly use `PRIVATE`/`DOUBLE`/`TRIPLE`/`FOUR_PLUS`, and
Villa/Apartment rows correctly use `ENTIRE_PLACE` — which shows whoever wrote the example properties
understood the distinction the filter-seeding code never encoded.

**The fix, therefore, is not "add a special case for flats."** It's: give `Property.property_type`
one authoritative classification the rest of the system reads from, instead of leaving every
consumer (filter seeding, forms, deposit floor, pricing) to each independently assume "PG-like."

---

## 3. Design — one flag, read everywhere

### 3.1 `Property.OccupancyModel` (new, backend)

```text
Property.occupancy_model   CharField, choices:
    SHARED        # PG, Hostel, Co-Living, Bed Space, Student/Worker Accommodation
    ENTIRE_UNIT   # Apartment, Villa, Independent House, Studio, Commercial, Rental Properties, Premium Stays
    HOTEL_ROOM    # reserved now, populated when Wave 3 (§6) ships — not used by any code path yet
```

This is a **derived, stored** field, not computed on the fly — set once from `property_type` at
create time (mapping table below) and editable by the host only through re-selecting property type
(not a free-standing toggle, to avoid a host setting `SHARED` on a Villa by mistake).

| `property_type` | `occupancy_model` |
| --- | --- |
| `PG`, `HOSTEL`, `CO_LIVING` | `SHARED` |
| `VILLA`, `APARTMENT`, `STUDIO_APT`, `INDEPENDENT_HOUSE`, `COMMERCIAL` | `ENTIRE_UNIT` |

Every other consumer below reads `property.occupancy_model` — no consumer re-derives "is this
PG-like" from `property_type` strings again. This is the same "one source of truth, everything else
reads it" pattern the base plan already uses for `config_hash` (§5.1a) and `terms_snapshot`
(wallet/referral plan §2.5.2) — consistent with how this codebase avoids drift.

### 3.2 `UnitType` changes

```text
UnitType.sharing_type          # UNCHANGED field, but:
                                #   - required only when property.occupancy_model == SHARED
                                #   - nullable/hidden when ENTIRE_UNIT
UnitType.occupancy_capacity    # NEW: PositiveSmallIntegerField, "sleeps up to N"
                                #   - required only when property.occupancy_model == ENTIRE_UNIT
                                #   - nullable when SHARED (a PG bed's "capacity" is always 1 occupant
                                #     of that bed and is not a customer-facing concept)
```

Model-level `clean()` validation (not just serializer-level) enforces the pairing, so a bad row can't
enter through Django admin or a script either:

```text
if property.occupancy_model == SHARED and not sharing_type:
    raise ValidationError("sharing_type is required for shared-occupancy properties")
if property.occupancy_model == ENTIRE_UNIT and not occupancy_capacity:
    raise ValidationError("occupancy_capacity is required for entire-unit properties")
```

`ENTIRE_PLACE` stays in `SharingType` as a legacy value during migration (§4) but new `ENTIRE_UNIT`
rows should populate `occupancy_capacity` instead of relying on it going forward — after backfill,
`ENTIRE_PLACE` should not be selectable for new rows (enforced in the serializer, not removed from the
DB enum, to avoid a second migration).

### 3.3 `food_included` and other SHARED-only filters

`food_included`, and any other filter that is meaningfully PG/hostel-specific, is gated the same way:
shown/asked only when `occupancy_model == SHARED`. This is a **filter-visibility rule**, not a new
field — `UnitType.food_included` already exists and is unaffected structurally.

---

## 4. Migration plan (existing data)

1. Add `Property.occupancy_model` (nullable at first), add `UnitType.occupancy_capacity` (nullable).
2. Data migration: backfill `occupancy_model` from the mapping table in §3.1 for every existing
   `Property` row (staging seed data only at this point — no production data exists yet per
   `milestones.md`, so this is a clean backfill, not a live-traffic migration).
3. Data migration: for every `UnitType` where `property.occupancy_model == ENTIRE_UNIT` and
   `sharing_type == ENTIRE_PLACE`, set `occupancy_capacity` from a **reasonable default derived from
   `bhk`** (e.g. `1 BHK → 2`, `2 BHK → 4`, `3 BHK → 6`, `Studio → 2`) as a starting value — flag these
   rows for the seed script maintainer (owner or intern) to review and correct with real per-property
   numbers rather than trusting the derived default long-term.
4. Make `Property.occupancy_model` non-nullable after backfill.
5. Re-run `seed_stay_catalog.py` (updated per §5) against a fresh staging DB to replace the
   auto-backfilled example data with intentionally correct example data.

---

## 5. Fixes, in priority order

### Wave 0 — D1, the money bug (ship first, independently)

**File:** `backend/apps/stays/services.py`

Current (defect):
```python
deposit_rate = max(rule.deposit_paise, config.default_deposit_paise) if config.deposit_required else 0
```

Fixed:
```python
deposit_rate = (
    rule.deposit_paise if rule.deposit_paise else config.default_deposit_paise
) if config.deposit_required else 0
```

`config.default_deposit_paise` becomes a **fallback for when a host hasn't set a per-`UnitType`
deposit at all**, never a floor that overrides a host's explicit, lower number. Add a model-level
constraint or serializer validation that `UnitPricingRule.deposit_paise`, once set, cannot be `0`
unless `deposit_required=False` (prevents a host accidentally setting a `0` deposit that then falls
through to the ₹64,000 default by the old logic's `max()` habit — the new logic must not reintroduce
this by treating `0` and "unset" the same way it shouldn't).

**Acceptance criteria:**

| ID | Scenario |
| --- | --- |
| `M3-A9-R01` | A `UnitPricingRule` with `deposit_paise=350000` (₹3,500) charges exactly ₹3,500 at checkout, not `default_deposit_paise` |
| `M3-A9-R02` | A `UnitType` with no `UnitPricingRule.deposit_paise` set falls back to `config.default_deposit_paise` |
| `M3-A9-R03` | The deposit amount shown during browse (`get_property_detail`, `browse_stays`) exactly equals the amount charged at checkout confirmation, for every seeded property — add a regression test asserting this equality across the full seed dataset, not just one example |

**Also fix:** seed differentiated `default_deposit_paise` per subcategory in `seed_stay_catalog.py`
instead of one global constant — a sensible per-category fallback (e.g. PG/Hostel ~₹5,000, Apartment
~₹25,000, Villa ~₹75,000) rather than one number that was never right for most listings.

This wave ships alone — it does not depend on §3's `occupancy_model` work and should not wait for it.

### Wave 1 — D2, the broken dropdown (quick, ships next)

**Files:** `frontend/apps/partner/features/stays/view/stay-properties.tsx`,
`contracts/proposals/0018-a9-stays-frontend-contract.md`

Align the `<option value>`s to the real backend enum:

```text
Private (Single)     → PRIVATE
Double Sharing       → DOUBLE
Triple Sharing       → TRIPLE
Four+ Sharing        → FOUR_PLUS
Entire Place         → ENTIRE_PLACE   # only offered pre-migration; see §3.2 for post-migration state
```

Correct the contract doc's example JSON payload to match (it currently shows the same wrong
`DOUBLE_SHARING`/`TRIPLE_SHARING` strings the frontend was built against — this is very likely *why*
the frontend got it wrong, so fix the doc and the code together, not just the code).

**Acceptance criteria:**

| ID | Scenario |
| --- | --- |
| `M3-A9-R04` | Host selects "Double Sharing" in the partner form → `PartnerUnitTypeCreateSerializer` accepts it, no 400 |
| `M3-A9-R05` | Same for Triple, Four+ |

### Wave 2 — D3, D4, D5: the occupancy-model split (the real fix)

Implement §3 (`Property.occupancy_model`, `UnitType.occupancy_capacity`, gating rules) and:

1. **Host form** (`stay-properties.tsx`): when `property.occupancy_model == SHARED`, show "Sharing
   Type" (fixed dropdown per Wave 1) and "Food / Meals Included"; when `ENTIRE_UNIT`, hide both and
   show "Sleeps up to" (numeric stepper, `occupancy_capacity`). Gate this on the property's own
   `occupancy_model`, read once when the property is selected/created — not re-derived from a
   free-text property-type string inline in the component.
2. **Customer filter UI** (`stay-catalog-listing-pane.tsx` and the advanced-filter drawer): replace
   the hardcoded static `filterPills`/drawer sections with a call to the existing
   `get_stay_filter_definitions(service_slug=...)` endpoint (already built — this closes D9 as a side
   effect, not extra scope) so filters are property-type/subcategory-aware by construction, not by a
   second hand-maintained list that can drift from the backend's.
3. **Filter-question seeding** (`seed_stay_catalog.py`): split the current single per-subcategory
   loop into two: a `SHARED`-subcategory loop seeding `sharing_type`/`food_included` questions, and an
   `ENTIRE_UNIT`-subcategory loop seeding `occupancy_capacity` (as a numeric range filter, e.g. "sleeps
   2+") instead. Godown/Warehouse/Office/Commercial rows get neither — they're excluded from both
   loops and get only the property-type-agnostic filters (furnishing, AC, bathroom type) that
   genuinely still apply.
4. **`browse_stays` / `get_stay_filter_definitions`** (`selectors.py`): scope the `sharing_type`
   filter query param to only apply when filtering within `occupancy_model=SHARED` results; add an
   `occupancy_capacity__gte` filter for `ENTIRE_UNIT` queries.

**Acceptance criteria:**

| ID | Scenario |
| --- | --- |
| `M3-A9-R06` | Creating a Villa property offers "Sleeps up to N," never "Sharing Type" |
| `M3-A9-R07` | Creating a PG property offers "Sharing Type," never "Sleeps up to N" |
| `M3-A9-R08` | Customer filtering "2-Sharing, PG" returns only `SHARED` results; filtering "Sleeps 4+" returns only `ENTIRE_UNIT` results with `occupancy_capacity >= 4` |
| `M3-A9-R09` | Browsing "Rental Properties" (Villa/Independent House) subcategory shows no "Food Included" filter pill |
| `M3-A9-R10` | Browsing Godown/Warehouse/Office/Commercial shows neither sharing-type nor food-included nor occupancy-capacity filters — only furnishing/AC/bathroom-type where applicable |
| `M3-A9-R11` | Customer filter UI and `get_stay_filter_definitions` response never diverge — verified by the UI consuming that endpoint directly rather than a separate hardcoded list |

### Wave 2b — D7, the BHK default (small, bundle into Wave 2)

`UnitType.bhk` becomes nullable with no default; the card badge falls back to the room's
`sharing_type` label (e.g. "2-Sharing") when `occupancy_model == SHARED` and `bhk` is unset, instead
of the misleading `"Studio"` string. Update `seed_stay_catalog.py` to stop relying on the field's old
default for PG/Hostel rows.

### Wave 2c — D6, gender restriction (small, optional — confirm with owner before building)

If the "Gents PG"/"Ladies PG" distinction should be enforced (not just implied by name), add
`Property.gender_restriction` (`ANY` / `MALE_ONLY` / `FEMALE_ONLY`), surfaced as a filter for
`occupancy_model == SHARED` only, and checked at booking time (reject/warn if a guest's stated gender
— if the platform collects it at all — conflicts with the property's restriction). **This needs an
owner decision first**: does the platform collect guest gender at signup/booking today? If not, this
becomes a bigger identity-model question than a Stay-specific fix, and should be scoped separately
rather than folded into this remediation.

---

## 6. Hotels (D8) — explicitly out of scope for this remediation

Hotels are unbuilt, not broken. Adding `PropertyType.HOTEL_ROOM`, a room-type vocabulary
(single/double/deluxe/suite), and a "Hotels" subcategory in the taxonomy is new feature scope
comparable in size to the original A9 planning work, not a defect fix. Do not bundle it into Wave 2 —
track it as a separate future planning item if the owner wants Hotels launched under A9 rather than
deferred.

---

## 7. What does NOT change

- `Unit` / `UnitReservation` exclusion-constraint locking (§5.2 of the base plan) — untouched.
- `UnitType` de-duplication / `config_hash` (§5.1a) — untouched; `occupancy_capacity` and the
  corrected `sharing_type` simply become two more fields inside the same hash.
- Host-initiated reassignment (`host_reassign_unit`) — untouched; still matches on `unit_type_id`,
  which now correctly carries either a sharing-type or an occupancy-capacity depending on the
  property, but the reassignment logic itself doesn't need to know which.
- Pricing/`duration_mode` engine — untouched; this remediation doesn't touch nightly/weekly/monthly
  logic at all.
- A7_RENTAL — entirely unaffected; this document is A9-only.

---

## 8. Task list additions (for `M3/task.md` Phase D)

```text
- [ ] M3-BE-361  Wave 0: fix deposit floor bug (services.py deposit_rate calc) + differentiated
                 default_deposit_paise per subcategory + regression test M3-A9-R01–R03
- [ ] M3-FE-331  Wave 1: fix sharing_type dropdown enum mismatch (stay-properties.tsx) +
                 correct 0018 contract doc example payload
- [ ] M3-BE-362  Wave 2: Property.occupancy_model field + migration + backfill (§4)
- [ ] M3-BE-363  Wave 2: UnitType.occupancy_capacity field + model-level clean() validation (§3.2)
- [ ] M3-BE-364  Wave 2: split seed_stay_catalog.py filter-question seeding by occupancy_model (§5.3)
- [ ] M3-BE-365  Wave 2: browse_stays / get_stay_filter_definitions occupancy_model-aware filtering
- [ ] M3-FE-332  Wave 2: host form conditional fields by occupancy_model (§5.1)
- [ ] M3-FE-333  Wave 2: customer filter UI consumes get_stay_filter_definitions instead of
                 hardcoded pill list (closes D9)
- [ ] M3-FE-334  Wave 2b: UnitType.bhk nullable, card badge fallback fix
- [ ] M3-BE-366  Wave 2c: Property.gender_restriction — BLOCKED on owner decision (does platform
                 collect guest gender today?)
```

Task IDs continue from the highest existing `M3-BE-3xx`/`M3-FE-3xx` numbers already in `task.md` —
renumber against the actual current file before committing, do not assume these exact numbers are
free.

---

## 9. Suggested execution order

1. **Wave 0 alone, today** — it's a live money-correctness bug independent of everything else here.
2. **Wave 1 alone, right after** — five-minute fix, unblocks hosts from being unable to publish
   shared rooms at all.
3. **Wave 2 + 2b together** — the real structural fix; do these as one coherent change since the
   model field, the two forms, and the seed data all need to move together or the system will be
   inconsistent mid-way (e.g. a host form that only partially understands `occupancy_model`).
4. **Wave 2c** — only after the owner answers the gender-data question in §5.
5. **Hotels (§6)** — separate future planning exercise, not part of this remediation.

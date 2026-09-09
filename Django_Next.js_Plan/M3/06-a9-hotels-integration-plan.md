# M3 — A9_STAY: Hotels Integration Plan

**Status:** Wave H0 implemented (2026-09-08) -- taxonomy/model foundation done, verified via
`manage.py check` + `makemigrations --check --dry-run`, not committed. Waves H1 (filter surface)
and H2 (date-aware pricing, G4) still pending -- see section 7 below.
**Depends on:** `Django_Next.js_Plan/M3/03-rental-stay-jobs-categories.md` (base A9_STAY design),
`Django_Next.js_Plan/M3/05-a9-stay-property-type-remediation.md` (occupancy-model split — Hotels
was explicitly deferred out of that remediation in its section 6, and this document is that deferred
follow-up).

---

## 1. Why this is a plan, not a patch

Hotels are unbuilt, not broken (`05-...remediation.md` D8). The category has always been
labelled "Rooms / PG / Hostel / Hotels" -- in `milestones.md`, the M3 handover brief, and the
`03-...categories.md` archetype table -- but no `PropertyType`, no room-class vocabulary
(single/double/deluxe/suite), and no "Hotels" subcategory were ever built. `Property.OccupancyModel`
already carries a `HOTEL_ROOM` member, added in the Wave 2 remediation specifically as a placeholder
for this work, marked "reserved -- unused by any code path yet."

This plan's central finding, after reading the actual A9_STAY implementation end to end
(`backend/apps/stays/models.py`, `services.py`, `selectors.py`, and the frontend property/browse
components), is that **hotels need far less new machinery than a fresh archetype would suggest**.
The core booking primitives A9_STAY already has -- nightly pricing with per-date overrides,
configurable cancellation policies including 24-hour flexible terms, per-variant deposit toggles,
date-range exclusion-constraint locking on physical `Unit` rows -- were built generally enough that
a hotel room slots into the existing model as a third occupancy shape, not a parallel system. The
work is concentrated in taxonomy (a room-class vocabulary hotels need that PG/rental never did),
a few UI conditionals, and one real architectural gap (multi-night nightly-rate browsing, covered
in section 5).

---

## 2. What already fits, with no changes

Confirmed by reading the code, not assumed from the archetype description:

| Existing mechanism | Why it already works for hotels |
|---|---|
| `UnitPricingRule.DurationMode.NIGHTLY` | Already a first-class duration mode (`backend/apps/stays/models.py:442-447`), already used by Short Stay/Premium Stays. |
| `UnitPricingOverride` (per-date rate table) | `create_stay_hold()` already sums per-date overrides for NIGHTLY/DAILY bookings (`services.py` ~line 300) -- this is exactly hotel rate-calendar behaviour (weekday/weekend/seasonal pricing), already live. |
| `PropertyPolicy.CancellationPolicy` | FLEXIBLE (24h), MODERATE (5 days), STRICT (7 days, 50% refund), NON_REFUNDABLE are already modelled, versioned, and effective-dated (`models.py:174-233`) -- this is hotel cancellation terminology verbatim, not something invented for PG. |
| `PropertyPolicy.no_show_*` fields | No-show grace period, first-night charge basis points, deposit forfeit basis points -- already exist and already flow into `policy_snapshot` at hold-creation time (`services.py`). Hotels need these more than PG does; they're already there. |
| `A9VariantConfiguration.deposit_required` / `default_deposit_paise` | Per-variant, not global -- a "Hotels" `ServiceVariant` can set `deposit_required=False` (or a small pre-auth-style amount) independently of every other A9 variant. No model change needed. |
| `A9VariantConfiguration.min_stay_nights` / `max_stay_nights` | Per-variant -- Hotels can be `min=1, max=30` without touching PG's or Rental Properties' values. |
| `Unit` / `UnitReservation` exclusion-constraint locking | Archetype-agnostic already -- a hotel room is just a `Unit` row under a hotel-flavoured `UnitType`; the `ExclusionConstraint` on `occupied_range` handles overlapping night bookings with zero changes (`models.py:533-568`). |
| `UnitType.config_hash` de-duplication | Already generic over whatever fields feed the hash -- extending it (section 4) is additive, not a redesign. |
| `ServiceQuestion`/`ServiceQuestionOption` filter-seeding pattern | The exact mechanism the Wave 2 remediation used to split SHARED vs ENTIRE_UNIT filters per subcategory extends the same way for a third `HOTEL_ROOM` branch (section 4). |

This list matters because it means Hotels is not "A9_STAY v2" -- it's a third leaf on a tree the
existing model already has room for. The plan below adds only what's genuinely missing.

---

## 3. What's genuinely missing

| Gap | Detail |
|---|---|
| G1 | No `PropertyType.HOTEL` value -- `_occupancy_model_for_property_type()` (`models.py`) has no branch that maps to `HOTEL_ROOM`. |
| G2 | No room-class vocabulary. `UnitType.sharing_type` (PG-flavoured: PRIVATE/DOUBLE/TRIPLE/FOUR_PLUS) and `bhk`/`occupancy_capacity` (rental-flavoured) are both meaningless for a hotel room; hotels need Single/Double/Twin/Deluxe/Suite instead. |
| G3 | No `HOTEL_ROOM`-branch `ServiceQuestion` seeding for the services that are genuinely hotel-shaped (mirrors the SHARED/ENTIRE_UNIT split from Wave 2, needs a third branch). **Revised per owner decision below: no new subcategory -- carve the branch out of `Premium Stays`'s existing services instead.** |
| G4 | Multi-night browsing is awkward today: `browse_stays()` de-duplicates `UnitType` rows and shows one representative price, which is right for PG/rental (a "type" has one steady rate) but wrong for hotels, where the same room class' effective nightly rate changes by check-in date via `UnitPricingOverride`. A hotel browse card needs to show the *rate for the dates the customer picked*, not a flat de-duplicated price. This is the one piece needing new selector logic, not just new data (section 5). |
| G5 | No inventory-count-at-a-glance concept for hotels ("3 rooms left at this rate") -- PG/rental show `units_available` today (`selectors.py`), which is directly reusable, but the frontend hotel card needs to foreground it differently (urgency messaging is a normal hotel-booking pattern; PG/rental don't currently surface it as prominently). |
| G6 | Partner property-creation form (`stay-properties.tsx`) has no `HOTEL` option in the Property Category dropdown, and no room-class equivalent of the Wave-2 conditional Sharing Type / Sleeps-Up-To fields. |
| G7 | Customer filter UI has no room-class filter definition branch (parallels the Wave 2 `sharing_type` vs `occupancy_capacity` split in `get_stay_filter_definitions`). |
| G8 | No "star rating" / hotel-class field on `Property` -- every hotel listing site surfaces this; nothing analogous exists on PG/rental (`rating`/`reviews_count` exist but are review-derived, not a declared class). Worth deciding whether to include in v1 or defer. |

G4 is the only item that is architecturally non-trivial. Everything else is taxonomy, seeding, and
UI conditionals following the exact pattern the Wave 2 remediation already established.

---

## 4. Design

### 4.1 `Property.PropertyType.HOTEL` and the occupancy-model mapping

Add one new choice:

```python
class PropertyType(models.TextChoices):
    ...
    HOTEL = "HOTEL", "Hotel"
```

Extend `_occupancy_model_for_property_type()`:

```python
hotel_types = {Property.PropertyType.HOTEL}
...
if property_type in hotel_types:
    return Property.OccupancyModel.HOTEL_ROOM
```

No change to `OccupancyModel` itself -- `HOTEL_ROOM` already exists, reserved for exactly this.

### 4.2 Room-class vocabulary -- new field, not a repurposed one

Do **not** overload `sharing_type` or `bhk` for hotel room classes -- Wave 2 spent real effort
separating occupancy concepts that were wrongly sharing one field, and collapsing hotel room
classes into either of those fields would reintroduce the same defect this remediation lineage
keeps fixing. Add a dedicated field:

```python
class UnitType(models.Model):
    class RoomClass(models.TextChoices):
        SINGLE = "SINGLE", "Single"
        DOUBLE = "DOUBLE", "Double"
        TWIN = "TWIN", "Twin"
        DELUXE = "DELUXE", "Deluxe"
        SUITE = "SUITE", "Suite"
        EXECUTIVE = "EXECUTIVE", "Executive"

    ...
    room_class = models.CharField(
        max_length=16,
        choices=RoomClass.choices,
        null=True,
        blank=True,
        help_text=(
            "Hotel room-class label (Single/Double/Twin/Deluxe/Suite/Executive). "
            "Required for HOTEL_ROOM properties, null otherwise -- see occupancy-model "
            "pairing rule in UnitType.clean()."
        ),
    )
```

Extend `UnitType.clean()`'s pairing rule (same shape as the Wave 2 SHARED/ENTIRE_UNIT check) with
a third branch: `room_class` required when `property.occupancy_model == HOTEL_ROOM`, and -- mirroring
the Wave 2 fix already applied for the other two branches -- actually enforced server-side via
`PartnerUnitTypeCreateSerializer.validate()`, not left as dead model-level validation the way the
original Wave 2 `clean()` was before that gap was caught and fixed.

`occupancy_capacity` remains meaningful for hotel rooms too (max occupancy per room is standard
hotel-listing information) -- reuse it rather than adding a second capacity field; its `clean()`
requirement extends to `HOTEL_ROOM` alongside `ENTIRE_UNIT`.

`sharing_type` and `bhk` become simply unset (null) for `HOTEL_ROOM` UnitTypes, same treatment
`bhk` already gets for `SHARED` properties post-Wave-2.

`config_hash` gains `room_class` as an input, same pattern as `occupancy_capacity` was added in
Wave 2.

### 4.3 Optional: hotel "star rating" / class (G8)

Recommend deferring to a fast-follow rather than blocking Wave 0 on it. If wanted for v1, it's a
single additive field:

```python
class Property(models.Model):
    ...
    star_rating = models.PositiveSmallIntegerField(null=True, blank=True)  # 1-5, HOTEL only
```

Not required for the booking engine to function -- it's a display/trust-signal field, safe to add
in a later wave without touching pricing, availability, or the reservation lifecycle.

### 4.4 Taxonomy and filter seeding (`seed_stay_catalog.py`) -- REVISED per owner decision

**Owner decision (2026-09-08):** the actual category spreadsheet
(`V Solve Hub-Categories & Sub Categories.csv`) has no "Hotels" subcategory or room-class service
rows at all -- "Hotels" only ever existed in the category's display label ("Rooms / PG / Hostel /
Hotels"), never broken down into its own services the way the other 11 subcategories were. Rather
than invent a subcategory the source-of-truth spreadsheet doesn't have, the owner chose to treat
the existing `Premium Stays` subcategory as covering hotels: its five services already read as
hotel/serviced-stay concepts (`Luxury Apartment`, `Premium Villa`, `Executive Suite`,
`Corporate Stay`, `Serviced Residence`).

This means **no new subcategory is added to `STAY_TAXONOMY`** -- G3 is now a service-level carve-out
within `Premium Stays`, not a new top-level entry. `Premium Stays` is currently entirely in
`ENTIRE_UNIT_SUBCATEGORIES` (`seed_stay_catalog.py`), which is right for `Luxury Apartment` and
`Premium Villa` (genuinely whole-unit premium listings) but wrong for `Executive Suite`,
`Corporate Stay`, and `Serviced Residence` (room-class, hotel-style stays within a serviced
building). Premium Stays becomes the first subcategory whose services span more than one
occupancy model -- add a service-level override set, mirroring the existing
`COMMERCIAL_SERVICE_NAMES` pattern that already carves exceptions out of
`Rental Properties`/`Property Listing`:

```python
HOTEL_SERVICE_NAMES: set[str] = {
    "Executive Suite",
    "Corporate Stay",
    "Serviced Residence",
}
```

In the seeding loop, a service in `Premium Stays` whose name is in `HOTEL_SERVICE_NAMES` gets the
`room_class` `ServiceQuestion` (`SINGLE`/`DOUBLE`/`TWIN`/`DELUXE`/`SUITE`/`EXECUTIVE` options)
instead of the subcategory's default `ENTIRE_UNIT` treatment (`bhk`/`occupancy_capacity`); `Luxury
Apartment` and `Premium Villa` keep the existing `ENTIRE_UNIT` seeding unchanged. `food_included`
does not apply to the hotel-branch services the way it does to PG (breakfast-included is a
rate-plan concept, not a per-room static flag) -- leave it unseeded there, same as it's already
correctly left unseeded for `ENTIRE_UNIT_SUBCATEGORIES`.

`PropertyType.HOTEL` (section 4.1) is still added as planned -- a real hotel/serviced-residence
building is still its own property type at the `Property` level, it just lists its rooms under the
existing `Premium Stays` subcategory rather than a new one.

`get_stay_filter_definitions()` gets a third branch (`occupancy_model == HOTEL_ROOM`) returning a
`room_class` filter instead of `sharing_type` or `occupancy_capacity`, following the exact
if/elif/else structure Wave 2 already established in `selectors.py`.

### 4.5 Selector filter scoping

`browse_stays()`'s `sharing_type` filter is already scoped to `occupancy_model=SHARED` only
(Wave 2 fix). Add a `room_class` filter scoped to `occupancy_model=HOTEL_ROOM` only, same
`queryset.filter(room_class=..., property__occupancy_model=Property.OccupancyModel.HOTEL_ROOM)`
pattern as the existing `occupancy_capacity_gte` branch.

---

## 5. The one real architectural gap: date-aware hotel browsing (G4)

### The problem, precisely

`browse_stays()` today de-duplicates on `UnitType` (via `config_hash`) and returns one card per
distinct room configuration, with a single representative price pulled from that `UnitType`'s
active `UnitPricingRule`. This is correct for PG/rental, where a room configuration has one steady
rate that doesn't meaningfully vary day-to-day. It is wrong for hotels: a Deluxe Double room's real
nightly rate on a Friday during a local festival is not the same as on a random Tuesday, and that's
exactly what `UnitPricingOverride` already exists to encode per date. If hotel browsing reuses the
existing de-dup path unmodified, customers will see a rate that doesn't match what checkout
actually charges once dates are picked -- the same class of bait-and-switch bug the Wave 0 deposit
fix in the remediation plan closed for deposits.

### The fix

`browse_stays()` already accepts `start_date`/`end_date` params (used today for availability
filtering -- confirm current signature before implementing, the exact param names may have shifted
since this plan was written). Extend the `HOTEL_ROOM` price-resolution path so that, when dates are
supplied, the returned `price_paise` for a hotel `UnitType` card is computed the same way
`create_stay_hold()` already computes it for NIGHTLY bookings -- summing `UnitPricingOverride` rows
across the requested date range, falling back to `UnitPricingRule.base_rate_paise` for
un-overridden dates -- rather than reading one static rule row. This reuses `create_stay_hold()`'s
existing per-date-override summing logic (`services.py` ~line 300) rather than reimplementing it;
factor that summing into a small shared helper (e.g. `_nightly_rate_for_range()`) called from both
`create_stay_hold()` and `browse_stays()`'s hotel branch, so there is one source of truth for "what
does this room cost for these nights," not two copies that can drift.

When no dates are supplied (customer hasn't picked check-in/check-out yet), fall back to today's
behaviour -- show the `UnitPricingRule.base_rate_paise` as a representative "from Rs X/night" price,
clearly labelled as a starting rate rather than a quote, which is standard hotel-listing practice
and avoids implying false precision.

This is the only piece of this plan requiring new selector logic rather than following an existing
pattern -- call it out explicitly in review rather than letting it slip in as "just more seeding."

---

## 6. Migration plan

Same shape as the Wave 2 remediation's four-step sequence, extended:

1. Add `Property.PropertyType.HOTEL`, `UnitType.RoomClass` choices, `UnitType.room_class` field
   (nullable) -- no backfill needed since no `HOTEL_ROOM` properties exist yet (this is genuinely
   new data, not a reclassification of existing rows the way Wave 2's `occupancy_model` backfill
   was).
2. Update `config_hash` computation to include `room_class`.
3. Seed script changes (`seed_stay_catalog.py`): `HOTEL_SERVICE_NAMES` carve-out within the
   existing `Premium Stays` subcategory (no new subcategory -- see revised section 4.4), demo
   hotel property + room-type + pricing-rule + override rows for staging verification.
4. (Optional, deferrable) `Property.star_rating` field if G8 is included in this wave rather than
   deferred.

No non-nullable-field backfill step is needed here the way Wave 2 needed one for
`occupancy_model` -- because `HOTEL_ROOM` properties don't exist yet, there's no existing data to
migrate, only new data to seed.

---

## 7. Suggested execution order

1. **Wave H0 -- taxonomy & model foundation -- DONE (2026-09-08).** G1 (`PropertyType.HOTEL`),
   G2 (`UnitType.room_class` field + `RoomClass` choices + `clean()` pairing rule +
   `PartnerUnitTypeCreateSerializer.validate()` check), revised G3 (seed script:
   `HOTEL_SERVICE_NAMES` carve-out within `Premium Stays` -- no new subcategory, per the
   owner decision in section 4.4), migration `0018_hotel_room_class.py` (additive only, no
   backfill needed -- no HOTEL_ROOM properties existed before). Also corrected the existing
   "Executive Suite" demo property, previously mis-seeded as VILLA/ENTIRE_UNIT, to a genuine
   HOTEL property with room_class, NIGHTLY pricing, and a demo per-date rate override.
   Verified: `manage.py check` and `makemigrations --check --dry-run` both pass; content
   personally reviewed via diff, not just compiled. Not committed.
2. **Wave H1 -- selector & filter surface -- DONE (2026-09-08), built alongside H0.** G7
   (`get_stay_filter_definitions()`'s `HOTEL_ROOM` branch returning `room_class` +
   `occupancy_capacity`), `room_class` query param + filter scoping in `browse_stays()`/
   `StayBrowseView` (parallels section 4.5), `room_class` exposed on browse cards and the
   partner unit-types endpoint.
3. **Wave H2 -- date-aware pricing (G4) -- NOT STARTED.** The one real new-logic piece; build
   and test the shared
   `_nightly_rate_for_range()` helper against `create_stay_hold()`'s existing per-date-override
   logic before wiring it into `browse_stays()`, so the two call sites are provably consistent
   from day one rather than reconciled after the fact.
4. **Wave H3 -- frontend -- NOT STARTED.** Partner property-creation form (`HOTEL` option,
   room-class conditional fields mirroring the Wave 2 Sharing-Type/Sleeps-Up-To pattern in
   `stay-properties.tsx`); customer filter UI (room-class filter branch in
   `stay-catalog-listing-pane.tsx`, same pattern as the Wave 2 SHARED/ENTIRE_UNIT branches
   already wired there); hotel-appropriate card display (per-night rate framing,
   availability-count urgency messaging per G5).
5. **Wave H4 (optional) -- NOT STARTED.** G8 star rating, if wanted; genuinely independent of
   H0-H3 and safe to slot in whenever, including after go-live of H0-H3.

Each wave should get the same independent verification discipline applied throughout this session:
read the actual diff content personally (not just `py_compile`), run `manage.py check` +
`makemigrations --check --dry-run`, run `tsc --noEmit` on both affected frontend apps, and leave
everything as uncommitted working-tree changes until explicitly told to commit.

---

## 8. What does NOT change

- PG/Hostel/Co-Living (`SHARED`) and Apartment/Villa/Rental (`ENTIRE_UNIT`) flows -- entirely
  unaffected; `HOTEL_ROOM` is strictly additive as a third occupancy branch.
- `Unit` / `UnitReservation` exclusion-constraint locking -- untouched, already generic.
- The deposit-floor fix, sharing-type enum fix, and occupancy-capacity split from Wave 0-2 of the
  prior remediation -- untouched, all still apply to their respective occupancy models unchanged.
- Rental (A7_RENTAL) -- entirely separate archetype, unaffected.
- `host_reassign_unit` / `operations_reassign_unit` -- archetype-agnostic already, no changes
  needed for hotels to use them.

---

## 9. Open questions for the owner before Wave H0 starts

1. **RESOLVED (2026-09-08):** Room-class vocabulary and which services are hotel-shaped --
   confirmed against the owner's actual category spreadsheet, which has no separate Hotels
   subcategory. Owner decision: treat `Premium Stays`'s `Executive Suite`/`Corporate Stay`/
   `Serviced Residence` services as the `HOTEL_ROOM` carve-out (see revised section 4.4);
   `Luxury Apartment`/`Premium Villa` stay `ENTIRE_UNIT`. Room-class vocabulary itself
   (Single/Double/Twin/Deluxe/Suite/Executive) is still this plan's proposal, not yet confirmed
   against the spreadsheet (the spreadsheet has no room-class breakdown to check against) --
   reasonable to proceed with it as a first cut and adjust based on partner/host feedback once
   live.
2. **Star rating (G8)** -- include in v1 or defer as a fast-follow? Recommend defer; it's fully
   decoupled from the booking engine.
3. **Breakfast/meal-plan handling** -- hotels commonly sell "room only" vs "room + breakfast" as
   separate rate plans rather than a single boolean the way PG's `food_included` works. Modelling
   this properly (as distinct `UnitPricingRule` rows per meal plan, most likely) is a real design
   decision this plan intentionally leaves open rather than guessing -- worth a short follow-up
   conversation before Wave H0, since it affects whether `Hotels` needs its own pricing-rule
   pattern beyond what's described in sections 4.4-4.5.
4. **Multi-room-type search / compare** (e.g. "show me all room classes at this hotel side by
   side") -- the existing rental `RentalListingGroup` query-time rollup is the closest analog in the
   codebase; whether hotels need something similar depends on how many room classes a typical
   partner hotel will list, which isn't yet known. Flagging as a possible Wave H4+ item rather than
   speculatively building it now.

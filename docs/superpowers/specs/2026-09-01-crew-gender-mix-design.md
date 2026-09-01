# Crew gender mix, end to end

**Date:** 2026-09-01
**Status:** approved, implementing
**Supersedes:** the client-invented `<role>__men` / `<role>__women` answer keys, and the
`staff_preference` (`any` / `female` / `male`) catalogue question.

## The problem

The customer's crew composer asks for a per-role men/women split. Today that split:

- is written into client-invented answer keys (`waiter_count__men`) that are **not** in the
  catalogue schema;
- is therefore invisible to `crew_brief.brief_lines`, which iterates the schema — **the partner is
  never told**;
- is unread by `matching.evaluate_candidates`, which sizes on `worker_count` alone;
- could not be satisfied if it were read, because `CrewMember` records no gender;
- and is a latent `400`: `carts.item_inputs.validate_scope` rejects unknown answer keys, and
  `submit_requirement` calls it. Only the A3 rate-card path's not calling it hides this today.

Meanwhile `staff_preference` asks the same question in a second, incompatible way — a customer can
answer "Female staff" *and* set three men, with the contradiction visible to nobody.

## The shape of the answer

Headcount is the same problem one dimension over, and it is already solved in four layers. Gender
mix rides that ladder rather than inventing a parallel one:

| Layer | Headcount today | Mix, added |
|---|---|---|
| Dispatch | `CREW_TOO_SMALL` on **ACTIVE** memberships — loose, "right for a quote" | `CREW_MIX_UNMET`, and **only when provably impossible** |
| Accept | `verified_roster_size` — verified only, "right for an instant booking" | re-check the mix against the verified roster |
| Assignment | `assign_crew` refuses more names than `attendance.expected_count` | a **fifth refusal**: the named crew must meet the mix |
| Attendance | shortfall → customer chooses carry-on / extra day / cancel | **unchanged** — a mix shortfall settles the same way |

## Data model

`partners.CrewMember.gender` — the global person, deduplicated across agencies by `identity_hash`.

```
MAN | WOMAN | OTHER | UNDISCLOSED     (blank = never asked)
```

Four rules:

1. **Blank is not male.** Blank means nobody has asked. It is the default for every existing row
   and must never be inferred from a name, a photo or a title.
2. **Only `MAN` counts toward a man-slot and only `WOMAN` toward a woman-slot.** `OTHER` and
   `UNDISCLOSED` count toward the headcount and toward no gendered slot. This is a real consequence
   for a real person and is stated on the roster screen rather than discovered.
3. **First write wins; a conflicting write is refused, not overwritten.** `CrewMember` is one row
   per person across agencies. An agency may set gender while it is blank. An agency writing a
   *different* value gets `m2_crew_gender_conflict` and Operations resolves it — silently letting
   the second agency overwrite would let one partner flip another partner's roster.
4. **Personal data.** Nullable, never required to register a worker, and collected at the moment it
   first matters (below), not at onboarding.

## Catalogue schema

For `event-staff-by-the-day`, as a **new `M2VariantConfiguration` version**. Requirements pin a
`configuration` FK, so in-flight requirements keep reading the version they were captured under and
nothing needs backfilling.

- **Removed:** `staff_preference`.
- **Kept:** `<role>_count` — still the role's total, and still where the role's label and display
  order live.
- **Added, per role:** `<role>_men` and `<role>_women`, `INTEGER`, `required=False`.

Six roles: `waiter`, `bar_staff`, `hostess`, `kitchen_helper`, `cleanup`, `setup`.

**The redundancy is deliberate and enforced.** `<role>_count == <role>_men + <role>_women` is
checked server-side on submit. Three numbers where two would do is a real cost, paid to keep the
label, the display order and the client's `isRoleQuestion` detection exactly where they are — and
it is the same relationship `worker_count` already has to the role totals.

## The projection the partner reads

`brief_lines` renders prose, one line per question. Six roles × two genders would be twelve lines
of noise, so the gendered codes join `SIZE_CODES` in the excluded set and a **structured**
projection carries the mix instead:

```python
# apps/requirements/crew_mix.py
CrewMixLine(role_code, role_label, men, women, total)
```

Published as `crew_mix` on the A3 crew offer and on `EnquiryDetail`, so the partner app renders a
table with real counters rather than parsing a sentence. This is the "clear visibility" the whole
change exists for: a lead sees *3 men · 2 women* per role, on the offer, before accepting.

## The four gates

**1. Dispatch — unknown-tolerant.** New `ExclusionReason.CREW_MIX_UNMET`. Fires only when the lead
**provably cannot** field the mix:

```
known_men   + unknown < required_men   →  excluded
known_women + unknown < required_women →  excluded
```

where `unknown` counts memberships whose person has blank gender. A lead whose roster gender is
unrecorded stays eligible. This mirrors `RankingSignals`, which already gives an unknown-distance
vendor the *median* band rather than last place — the house treatment of missing data is "assume
typical", not "assume worst".

**2. Accept — re-check.** The invitation is a snapshot and rosters change. `accept_crew_offer`
re-checks against the **verified** roster and refuses with `m2_crew_mix_unmet`, naming the shortfall.

**3. Assign — the fifth refusal.** `assign_crew` gains one rule, after the existing four: the named
crew must satisfy the booked mix. A worker with blank gender is a hard stop here with a prompt to
record it — this is the progressive collection point, matching `assert_crew_roster_present`, which
the code already describes as *"a progressive gate at the first assignment, not at registration."*

**4. Attendance — unchanged.** A mix shortfall is a headcount shortfall and settles through the
existing customer-choice path.

## Partner-side visibility

Three screens, so the lead can never be surprised:

1. **Offer / enquiry** — the `crew_mix` table, before accepting.
2. **Roster** — gender on each crew member, with an "unknown blocks gendered work" note, so a lead
   can fill it in ahead of time instead of at the gate.
3. **Assignment** — a live counter per role: *"2 of 3 men · 1 of 2 women"*, so the crew being named
   is checked against the promise as it is built, not on submit.

## Testing

Backend: the gender-count helper (blank / OTHER / UNDISCLOSED never satisfy a gendered slot), the
dispatch exclusion's unknown-tolerance in both directions, the accept refusal, the fifth refusal in
`assign_crew`, the conflicting-write refusal, and `crew_mix` projection ordering.

Frontend: the customer composer writing **real** question codes; the partner offer rendering the
mix; the assignment counter.

## Out of scope

Ranking on mix (a lead who covers it does not sort higher — exclusion only). Roster-gender bulk
import. Gender for A1 technicians, who are individuals rather than crews.

## Known gap, flagged not fixed

A lead who accepts and then cannot staff the mix has no clean early exit:
`cancel_rate_card_booking` is customer-initiated and only reachable from `EXHAUSTED`. Gate 3 turns
that into a hard stop at assignment. A partner-initiated early hand-back that re-dispatches is the
right companion to this work and is **not** included here — it is its own change, and it is listed
so the omission is deliberate rather than forgotten.

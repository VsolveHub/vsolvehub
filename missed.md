# plan.md — Required Updates (gap list vs final_prd/PRD.md)

> Action list for updating `[plan.md](plan.md)`. Each item says **what's wrong**, **where**,
> and **what to change**. The plan was written against the older *6-archetype* PRD, so most
> gaps trace back to that. Two product decisions are baked in below:
>
> - **Worker sees the full address BEFORE accepting** (deliberate change from PRD §9).
> - **Admin is a later phase.** Build the full **Customer + Provider** sites first, then Admin.

---

## 🔴 Critical — structural

### 1. Type G (Job Opportunities / job board) is completely absent

The PRD defines **7 booking types** ([PRD §3](final_prd/PRD.md)); the plan is A–F only:

- [plan.md:163](plan.md#L163) registry: `code (A–F)`
- [plan.md:166](plan.md#L166) archetype files: only `a-dispatch … f-quote`
- [plan.md:228](plan.md#L228) DB column comment: `archetype (A–F)`
- [plan.md:284](plan.md#L284) `archetype (A–F)`
- [plan.md:302](plan.md#L302) "The **six** archetypes"

Category **8. Job Opportunities** (8 sub-services in [services.md](services.md)) has nowhere to live, and the seed ([plan.md:425](plan.md#L425)) can't tag those services.

**Change:** add **G** everywhere C–F appear as Phase-2 stubs — an enum value, a `g-jobboard.ts` config in `lib/booking/archetypes`, and the status machine `POSTED → APPLIED → SHORTLISTED → HIRED → CLOSED` so `StatusTimeline` ([plan.md:147](plan.md#L147)) can render it. Schema + seed must be forward-compatible even though G isn't built in Phase 1. Update all "A–F" / "six archetypes" text to "A–G" / "seven archetypes".

### 2. The "Employer" provider mode is missing

PRD = "one provider app, **6 faces**" incl. **Employer** ([PRD §3](final_prd/PRD.md)). Plan = "one app, **five modes**" ([plan.md:353](plan.md#L353), [plan.md:384-392](plan.md#L384)).

**Change:** add a 6th slot to `lib/provider/modes` and `components/provider/modes/employer/` as a Phase-2 stub so the registry reserves it. Update "five modes" → "six modes".

### 3. `resolve()` must accept a runtime intent — services that branch

The plan models `service → ONE archetype column → flow` ([plan.md:282-284](plan.md#L282)). Two PRD cases can't be expressed that way:

- **Manpower** ([PRD §4.9](final_prd/PRD.md) + Resolved Decision #3): a **required permanent-vs-daily-wage toggle on the booking form** picks **C or B at booking time**.
- **Painting** ([PRD §4.1](final_prd/PRD.md)): **A** for single-room/touch-up, **F** for full-home repaint.

**Change:** `resolve(service, formInput)` returns the final archetype using a per-service rule, not just the seeded column. Seed these services with a `resolveRule` (e.g. `MANPOWER_INTENT`, `PAINTING_SCOPE`) and add the toggle field to their Zod schema + form. The fixed-`F` services (Home Automation, Waterproofing, Demolition, Civil & Road, Bridal, Vehicle Docs & Insurance) are just a static column — no toggle needed.

---

## 🟠 Important — rule

### 4. Privacy / contact rule is not in the dispatch flow — and the address rule changes

The dispatch description ([plan.md:400-407](plan.md#L400)) never states the contact rules. Bake these into the offer + track payloads now (hard to retrofit):

- **Worker SEES the full customer address BEFORE accepting.** *(Decision: we are NOT gating address behind accept — this overrides PRD §9.)*
- Customer sees worker **name + skill + rating**, not raw phone (keep this).

---

## 🟡 Admin — explicitly deferred to a later phase

**Decision: finish the entire Customer + Provider experience first, then build Admin as its own phase.** Add a short note to [plan.md §0 / §6](plan.md#L14) recording this. Until Admin exists, handle its current dependencies in the demo:

- **Worker approval:** the KYC gate is mocked ([plan.md:398](plan.md#L398)) but nothing flips a worker to `ACTIVE`. → **Seed captains as already `ACTIVE`** (auto-approved) so dispatch works without an admin.
- **Custom / Other triage** ([PRD §4.10](final_prd/PRD.md)): "Describe your requirement" needs an admin to route it. → out of scope until the Admin phase; seed/label these as "request received" only.
- **Admin catalog CRUD, dispute resolution, no-worker-found intervention, analytics:** all Admin-phase. Catalog stays **seed-driven** for now.

These are deferrals, not omissions — note them in the plan so nothing silently breaks.

---

## 🟢 Minor / acknowledged (no action needed for demo)

- **Google Maps / Places** (PRD P1): plan uses a saved address, no geocoding — fine for demo.
- **Referral, Membership, Multi-language, Re-booking** (P2/P3): correctly absent; the `wallets` table exists, referral logic does not.
- **DigiLocker**: collapsed to a KYC mock (status + last4) — fine.

---

## Summary

- Add **Type G** (enum, config stub, status machine, "A–G" text) — Phase-2 stub
- Add **Employer** provider mode (6th mode) — Phase-2 stub
- Make `resolve()` take a **runtime intent** → Manpower (B/C) + Painting (A/F) branch
- Dispatch payload: **worker sees address before accepting**; customer sees worker name/skill/rating (no phone)
- **Seed captains as ACTIVE** (no admin to approve yet)
- Add a note: **Admin is a later phase**, after Customer + Provider are complete


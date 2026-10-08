# Job skills that accumulate · Stay rooms grouped by look · Guest preview for hosts

**Status:** Planned — owner decisions taken 8 Oct 2026 (below); not built
**Effective date:** 2026-10-08
**Base:** `main` @ `4aab07f`

Three client asks:

1. **Jobs:** a candidate's skills accumulate across applications instead of being replaced, so
   one person matches several job categories (Accounts *and* Sales) and employers see them in
   "Matching candidates" for both.
2. **Stays:** one room type ("1 BHK") can hold rooms that look different. Rooms 101–103 share
   photos, 104–105 have their own. Guests see **one card per look** (one for 101–103, one for
   104–105), never room numbers. Hosts keep all five under "1 BHK", and when adding a room either
   reuse an existing look's photos or upload new ones.
3. **Stays:** while adding or editing rooms, the host sees exactly how guests will see each room.

---

## Part 1 — Job skills accumulate

### 1.1 Audit (`backend/apps/listings`)

| Where | Today | Problem |
| --- | --- | --- |
| `seekers.ensure_profile_from_application` (`seekers.py:252`) | Builds a profile from the **first** form application: `skills`, `roles=[listing.title]` | *"An existing profile is never overwritten"*: the **second and later** applications add nothing. The Accounts applicant who applies for Sales keeps only Accounts skills |
| `views.ListingApplicationView` (`views.py:340`) | Passes the form's `skills` to the function above | Same |
| `seekers.quick_apply` | Applies with the saved profile | Never asks which of this job's skills the person has, so nothing new is learned |
| `seekers.save_profile` | `skills` and `roles` are replaced by what the seeker sends | Correct for a seeker editing their own profile, but only if the editor sends back everything it loaded |
| Caps | `MAX_SKILLS = 20`, `MAX_ROLES = 3` | Two or three categories overflow 20 skills / 3 roles |
| `matching.score_match` | Must-have skills scored as *found ÷ required* | **Good news:** extra unrelated skills don't lower a score, so accumulating is safe for relevance |

### 1.2 Design

- **Merge, never replace, on apply.** New `merge_into_profile(profile, skills, role)` in `seekers.py`:
  - Union of skills: existing first, new appended, compared case- and space-insensitively.
  - The listing title appended to `roles` the same way.
  - Nothing else touched (name, salary, city, visibility stay the seeker's own).
- **Called on every application:**
  - Form apply: the first application creates the profile (today's path); later ones merge.
  - Quick apply: gains an optional `skills` list. The apply sheet shows this job's must-have and
    nice-to-have skills as chips, "Tick the ones you have", and the ticked ones merge.
- **Remember which job a skill came from**, so the profile reads as categories, not a jumble.
  Add `JobSeekerProfile.skill_groups` (JSON): `[{category, role, skills[], added_at}]`, one entry
  per job category applied to. `skills` stays the flat union that matching reads, so `matching.py`
  is unchanged.
- **Caps:** skills 20 → **60**, roles 3 → **10**. When full, new items aren't added (never
  silently drop older ones), and the profile page says "Your profile is full — remove skills you
  no longer use."
- **The seeker's own edits still win.** `save_profile` keeps replacing, and the editor always
  loads and sends the full accumulated list. Removing a skill removes it from `skills` and from
  its group.
- **Employer side:** no matching change. "Matching candidates" on an Accounts job and on a Sales
  job will both include this person. The match reasons ("Has 4 of 5 must-have skills") already
  explain the relevance.

### 1.3 Screens

- **Seeker profile:** skills grouped by category, e.g. *Accounts — Tally, GST, Excel* and *Sales —
  Negotiation, CRM*, each chip removable, with "+ add skill".
- **Quick-apply sheet:** "Which of these do you have?" chips from the job's skills, pre-ticked
  where the profile already has them.
- **After applying:** a toast, "Added 3 new skills to your profile".

### 1.4 Tests (written; owner runs them)

- Apply to Accounts then Sales: both skill sets kept, roles `[Accounts …, Sales …]`, no
  duplicates by case or spacing.
- Quick apply with ticked skills merges them; unticked ones aren't added.
- At the cap: nothing dropped, nothing added, response says so.
- `save_profile` removing a skill removes it from `skills` and from `skill_groups`.
- `score_match` for an Accounts job is unchanged after Sales skills are added (regression).
- Employer "Matching candidates" lists the person on both an Accounts and a Sales job.

---

## Part 2 — Stay rooms grouped by look

### 2.1 Audit (`backend/apps/stay`, `frontend/apps/*/features/stays`)

| Piece | Today |
| --- | --- |
| `Unit` | A room type ("1 BHK") with one price, `available_count`, and **one** photo set (`UnitMedia`) |
| `Room` | A numbered room (`101`) under a unit. Status AVAILABLE / UNAVAILABLE / BOOKED. **No photos of its own** |
| Customer search (`customer/features/stays/room-cards.ts`) | One card **per unit**, at most `ROOM_CARDS_PER_PROPERTY = 2` per property, hidden until the unit has a photo. Room numbers are never shown ✔ |
| Enquiry / visit | Point at a `unit` only |
| Partner (`room-type-block.tsx`, `room-photos.tsx`) | One photo strip per room type, then a grid of room-number chips with ON/OFF and Booked |

So 101–105 under "1 BHK" can only ever share one photo set, and guests see one card.

### 2.2 Concept: a "look" inside a room type

A **look** is a set of photos shared by some rooms of a type. "1 BHK" with rooms 101–105 has:

```
1 BHK  ·  ₹18,000 / month                          (one Unit: name, price, sharing)
├── Look A  "Standard"        photos ▣▣▣   rooms 101 · 102 · 103
└── Look B  "Garden-facing"   photos ▣▣▣▣  rooms 104 · 105
```

The guest sees two cards. Each shows that look's photos and "N available", with no room numbers:

```
[ photo A ]  1 BHK                     [ photo B ]  1 BHK · Garden-facing
             Sunrise Residency                      Sunrise Residency
             3 available · ₹18,000/mo               2 available · ₹18,000/mo
```

### 2.3 Data model

New `RoomLook`:

| Field | Notes |
| --- | --- |
| `unit` | `FK(Unit, CASCADE, related_name="looks")` |
| `name` | `CharField(60, blank)`, the label guests see as a suffix ("With balcony"). The first look may stay blank (card reads "1 BHK"); **every other look must be named** once a type has two or more looks |
| `display_order` | First look = the type's main card |

Changes:
- `UnitMedia.look` → `FK(RoomLook, CASCADE, related_name="media")`. Photos belong to a look.
- `Room.look` → `FK(RoomLook, PROTECT, related_name="rooms")`. Every room has exactly one look.
- `StayEnquiry.look`, `StayVisit.look` → nullable `FK(RoomLook, SET_NULL)`, so the host knows
  which look the guest asked about.
- Rules: a room's look must belong to the room's own unit (enforced in the service, with a test);
  a unit always has at least one look; a look that still has rooms can't be deleted.
- **Data migration:** each existing unit gets one look ("", order 0); all its rooms and photos
  move to it. Customer output is unchanged until a host adds a second look.

**Price stays per room type.** A different price is a different room type ("1 BHK Premium"), as
today. See open question Q-3.

### 2.4 Services and API

- `create_look(unit, name, photo_urls)`, `rename_look`, `delete_look` (refused while it has
  rooms), `add_look_media` / `remove_look_media` (replace the unit-level media calls; old
  endpoints map to the unit's first look for one release).
- `add_room(unit, number, look_id | new_look={name, photo_urls})`: **reuse an existing look's
  photos, or create a new look with new photos**, in one call.
- `move_room(room, look)`: change a room's look later.
- `sync_unit_rooms` keeps the unit totals. The serializer adds per-look `available_count`.
- Public payload: `units[].looks[] = {id, name, media[], available_count}`, with no room numbers.
  `units[].media` stays as the first look's photos for one release, so old clients keep working.
- Enquiry / visit / quote endpoints accept an optional `look_id`. `mark_room_booked` offers
  rooms of the guest's look first.

### 2.5 Customer screens

- **Search:** one card per *look* with ≥ 1 available room and ≥ 1 photo. Title: unit name, plus
  " · {look name}" when the type has more than one look and the look is named. Keep at most 2
  cards per property in search (Q-2); the property page shows them all.
- **Room page / property page — "Other looks of this room":** when a guest opens one look, a
  switcher right under the title shows every look of the same room type as photo chips:
  `[▣ 1 BHK] [▣ With balcony]`, with the line *"Same room, same price — different look. 2 looks
  available."* Tapping a chip swaps the gallery and the availability count in place, without
  leaving the page or changing the price, so the guest understands it's the same room type with
  the same features. `?room=<unit>&look=<look>` preselects a look; the enquiry carries the chosen
  `look_id`.
- **Search card hint:** a look's card in search also says "+1 more look" when its room type has
  other looks, so the guest knows to open it and compare.
- Room numbers stay hidden everywhere.

---

## Part 3 — "How guests see this room" for hosts

### 3.1 Partner room manager, redesigned

```
┌ 1 BHK · ₹18,000/month · 2 sharing ─────────────────────── 3 of 5 available ┐
│                                                                              │
│  LOOKS                                         HOW GUESTS SEE IT             │
│  ┌ Look A · Standard ──────────────┐           ┌──────────────┐ ┌──────────┐ │
│  │ ▣ ▣ ▣  + photo                  │           │  [photo A]   │ │[photo B] │ │
│  │ 101 ● ON   102 ● ON   103 ○ OFF │           │ 1 BHK        │ │1 BHK ·   │ │
│  └─────────────────────────────────┘           │ 2 available  │ │Garden-…  │ │
│  ┌ Look B · Garden-facing ─────────┐           │ ₹18,000/mo   │ │1 avail.  │ │
│  │ ▣ ▣ ▣ ▣  + photo                │           └──────────────┘ └──────────┘ │
│  │ 104 ● ON   105 ■ Booked         │           Guests see 2 cards. Room      │
│  └─────────────────────────────────┘           numbers are never shown.      │
│  [ + Add room ]                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Each look is a panel: its photos (add / remove / reorder), its room chips with the existing
  ON/OFF and Booked controls, and a ⋯ menu to rename, or move a room to another look.
- **"How guests see it" preview** beside the looks (below them on a phone). It shows the real
  guest card for every look and updates live as photos, rooms and switches change:
  - A look with no photo shows a dimmed card: "Hidden from guests — add a photo".
  - A look with no available room shows "Hidden — no room available".
  - A footer counts what guests see: "Guests see 2 cards for 1 BHK."
- **Add room** opens a short sheet:
  1. Room number (`106`).
  2. "How does this room look?" — one choice card per existing look, showing its cover photo
     and "Same as 101, 102, 103", plus **"＋ New look"**, which opens a photo picker and an
     optional name.
  3. The same live preview at the bottom of the sheet, so the host sees whether the new room adds
     a card or joins an existing one.

### 3.2 One card component for both apps

The preview must look *exactly* like the guest card. So the card's markup moves into
`frontend/packages/ui` as a presentational `StayRoomCard` (photo, title, subtitle, place, chips,
price, CTA, optional link). The customer `RoomCard` wraps it with the link and live data. The
partner preview renders it with the draft data and no link. One component, so the two can't
drift.

---

## Owner decisions — 8 October 2026

| ID | Decision |
| --- | --- |
| Q-1 | **A look can't have its own price.** Same room type = same price; a different price is a new room type |
| Q-2 | **Search shows up to 3 cards per property**, counted per look. The property page shows them all |
| Q-3 | **A look must be named once the type has more than one look.** Cards read "1 BHK" and "1 BHK · With balcony". Adding a second look asks for its name; the service refuses an unnamed non-first look (`look_name_required`) |
| Q-4 | **60 skills, 10 roles**, never auto-dropping |
| Q-5 | **Employers see the flat skills only.** The grouping is for the candidate's own profile |
| Q-6 | **Guests can switch between looks** of the same room type on the room page ("Other looks of this room"), so they see it's the same room and price with a different look |

## Work breakdown

| # | Task | Area |
| --- | --- | --- |
| J1 | `merge_into_profile`, call on form and quick apply, `skill_groups`, caps, migration | backend |
| J2 | Quick-apply skill chips, grouped profile skills, "added N skills" toast | customer |
| J3 | Tests in §1.4 | backend + customer |
| S1 | `RoomLook` model, FKs, data migration, constraints | backend |
| S2 | Look services, `add_room` with reuse/new look, `move_room`, enquiry/visit `look_id`, serializers, contract | backend |
| S3 | Customer search per look (cap 3, "+1 more look"), room page look switcher, enquiry with `look_id` | customer |
| S4 | `StayRoomCard` in `packages/ui`; customer `RoomCard` wraps it | ui + customer |
| S5 | Partner room manager by look, Add-room sheet, live "How guests see it" preview | partner |
| S6 | Tests: migration keeps today's output, per-look availability, look/unit invariant, no room numbers in public payloads, preview states | all |

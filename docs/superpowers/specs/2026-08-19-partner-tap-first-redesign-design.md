# Partner app redesign: one tap-first WORK surface

2026-08-19

## Problem

The Partner app's navigation is organised by Vsolve's internal commercial
model (A3 "Workforce" vs A5 "Projects"), plus a separate always-there M1
tier (Home / Jobs / Money / You). A Partner switches a "workspace" toggle
and gets a different tab bar underneath it, and "Enquiries" appears twice
meaning two different things depending which workspace is active. Every
screen leads with a paragraph of explanatory prose.

The target user is a tradesperson who may not read comfortably — in some
cases not at all. The ask: rebuild the app so it operates entirely by
tapping pictures and numbers, merge the three parallel navigation
structures into one, and follow the existing brand palette (`tokens.css`)
rather than introduce a new one.

## Approved direction

Design canvas (14 artboards, approved by the user 2026-08-19):
https://claude.ai/code/artifact/382babf0-aa73-489e-9b9b-0c4c2d4bc749

Full rationale and the four approved decisions (icon language, IA depth,
feature picks, canvas scope) are in memory at
`project_partner_tap_first_redesign.md`. Summary:

- **Three tabs replace eight nav targets:** `WORK · MONEY · ME`. One
  stack on WORK holds every offer, enquiry, and in-progress job, sorted
  by urgency. The commercial archetype becomes a stripe/colour on the
  card, never a separate place.
- **One timeline, four card states:** somebody asked → I answered → I'm
  doing it → I got paid. Signal-orange gradient = a clock is running
  (max one such card per screen). Navy left-border = doing it now. Green
  surface = done/held. Plain white = needs a price.
- **Drawn SVG pictograms, not emoji.** 24 viewBox, 1.8 stroke, round
  caps/joins. Replaces the emoji glyphs in
  `features/proposal/model/estimate-presets.ts`.
- **Three gradients, one job each**, built from existing tokens only —
  no new colours: heat (`signal-400→600`, the running-clock card only),
  depth (`navy-700→900`, money plates/headers), paper
  (`warm-25→50`, canvas background).
- Space-filling features approved: ON/OFF availability switch paired
  with today's ₹ at the top of WORK; a large call-customer button on
  every active job card; a km-distance pin on every card.
- Rejected: a listen-aloud/TTS button. Pictures and numbers alone must
  carry the meaning, so captions stay to one word.

## What actually has to be unified (confirmed against the running code)

This is narrower than it first looked. Four Partner-facing resources
feed the WORK stack, and two of the four are **already unified
server-side** — the merge is a client presentation problem, not a new
backend:

| Resource | Query module | Already unified? |
|---|---|---|
| A1 single-visit bookings | `features/work/queries.ts` (`usePartnerJobs`) | Own `VisitStatus` machine (11 states, 3 shelves: active/completed/cancelled). Genuinely separate lifecycle. |
| A3 crew offers (cascade, ~2 min deadline) | `features/crew-offer/queries.ts` (`usePartnerCrewOffers`) | Genuinely separate — the only resource with a live countdown against `server_now`. |
| Enquiries (A3 + A5) | `features/enquiry/queries.ts` | **Already one list.** `EnquirySummary.archetype` (`A3_TIME_BLOCK` \| `A5_CUSTOM_PROJECT`) is the published discriminator. "Enquiries" appearing twice in the current nav is a navigation artifact, not a data split. |
| Engagements (shift-days + project stages) | `features/engagement/queries.ts` (`GET /engagements/`) | **Already one list.** Split by the server-published `commercial_mode`; vocabulary kept separate via `WORKFORCE_WORDING` / `PROJECT_WORDING` in `engagement-copy.ts`. |

So the WORK stack is one client-side adapter merging **four** query
results (not the naive "eight nav targets → eight data sources" reading)
into a single `WorkItem` shape, sorted by urgency:

```
type WorkItem =
  | { kind: "offer"; ...crew offer fields, respondsBy, server_now }
  | { kind: "enquiry"; ...archetype, respondsBy }
  | { kind: "job"; ...A1 visit, status }
  | { kind: "engagement"; ...commercial_mode, phase }
```

Sort: live offers (countdown ascending) → needs-a-price (enquiries) →
doing-today (in-progress jobs/engagements, ordered by start time) →
recently-settled (last 24h, done/held). This mirrors the four card states
in the design.

**Scope decision — folding A1 Jobs into WORK:** `registry.ts` currently
documents this as a known, deliberately-deferred gap ("a pure A3 agency
still sees Jobs and Money" unconditionally, gating tracked as
`M2-FE-111`). Since the whole point of this redesign is presenting by
state rather than by category, A1 jobs get the same treatment as any
other WorkItem rather than staying a separate tab. This closes that
tracked gap as a side effect. Flagging because it widens the blast radius
slightly beyond "M2 workspaces only" — if this is unwanted, A1 jobs can
stay a distinct feed with no other part of the plan changing.

## Confirmed gap: no backing data for a day-level calendar

`Days.dc.html` in the canvas draws a monthly calendar with booked/free
days. Investigated and confirmed: no such endpoint exists.
`features/presence` is session/heartbeat on/off only (`PresenceStatus`:
checking/offline/connecting/online/stale/location_denied/unknown), and
`/availability` renders exactly that toggle. A comment in
`crew-offer-card.tsx` references the *server* checking "everything else
in your calendar, including your task jobs" for double-booking, which
confirms Django has the concept internally for conflict-checking, but
there is no Partner-facing read of it.

**Decision needed from the user before this screen is built for real**
(see Open questions). Not a blocker for the rest of the plan.

## Routing

New routes replace the workspace-scoped ones. Old routes redirect rather
than 404, since the app is deployed to real users mid-session.

| New | Replaces | Notes |
|---|---|---|
| `/work` | `/dashboard`, `/workforce`, `/projects` | The merged home. |
| `/work/offers` | `/offers`, `/workforce/offers` | Full offer list; `LiveOfferSheet` in the shell is unchanged. |
| `/work/enquiries/[invitationId]` | `/workforce/enquiries/[id]`, `/projects/enquiries/[id]` | One detail screen; the tap-estimate composer already lives under the A5 path and is reused as-is. |
| `/work/enquiries/[invitationId]/estimate` | `/projects/enquiries/[id]/estimate` | Unchanged — already built (`TapEstimate`). Just moves. |
| `/work/jobs/[id]` | `/jobs/[bookingId]`, `/workforce/shifts/[id]`, `/projects/stages/[id]` | One in-progress screen; branches its action set on `kind` (A1 visit vs engagement), same pattern `describeEngagementStatus(engagement, wording)` already uses to keep vocabulary apart while sharing the machine. |
| `/work/jobs/[id]/days/[stageId]` | `/workforce/shifts/[id]/days/[id]` | Shift-day detail, workforce-only, unchanged besides the path. |
| `/money` | `/earnings` | `EarningsPanel`/`PerformanceSummary` content, restyled per canvas. |
| `/me` | `/profile` | Adds tiles linking to Crew and (pending the open question) Days. |
| `/me/crew` | `/workforce/crew` | `features/crew` views, restyled. |
| `/me/language` | new | First-run + revisitable from Me. Locale plumbing already exists in `@vsolve/ui`'s `i18n.tsx` (`en-IN`/`te-IN`/`hi-IN`); this screen is the picker UI, not new catalog content — see Non-goals. |

`app/apply/*` (onboarding) and `app/(marketing)/*` are untouched.

## Component work

1. **Pictogram library** — new module at
   `apps/partner/components/pictogram.tsx`, partner-local rather than in
   `@vsolve/ui`, so this redesign never touches the shared package's
   public surface (other apps can adopt it later by promoting the file
   if wanted). One `<Pictogram name="…" />` per glyph drawn in
   `Icons.dc.html` on the canvas (trades, do/state, know-facts sets —
   ~40 icons total). Extracted directly from the canvas SVG paths, not
   redrawn.
2. **`estimate-presets.ts`** — `glyph: string` (emoji) becomes
   `icon: PictogramName`. `Tile` in `tap-estimate.tsx` renders
   `<Pictogram name={icon} />` instead of an emoji span. This is the
   only change to the already-shipped tap-estimate code.
3. **WORK stack adapter + hook** — new `features/work-stack/` (or similar)
   module: the `WorkItem` union above, one hook composing the four
   existing query hooks (no new network calls — same queries the current
   screens already run, TanStack dedupes), and the sort function.
4. **New shell nav** — `registry.ts`'s `WORKSPACE_REGISTRY` and
   `WorkspaceSwitcher` are deleted; `partner-shell.tsx`'s `BottomTabBar`
   becomes a fixed 3-item list. Action-gating (`hasWorkspaceAction`)
   moves from "which tab shows" to "which control renders on a given
   WorkItem card" — same principle registry.ts documents today
   ("actions gate controls, not routes"), just applied per-card instead
   of per-tab.
5. **Screen-by-screen**, each restyled against the canvas and wired to
   existing queries (no new endpoints except where the open question
   below says otherwise):
   - WORK home, Offer detail, Enquiry detail (reuses existing tap-estimate),
     Job/engagement detail (today + evidence capture), Money, Me, Crew,
     Language picker, Empty state.

## Non-goals

- No backend/API changes. Every screen binds to an endpoint that already
  exists, except the calendar question below.
- No Telugu/Hindi copy. The `i18n.tsx` seam and font stack
  (`Mukta`/`Hind Guntur`) already exist per `tokens.css`; this pass wires
  the picker UI and keeps every string on the `t()` seam, but ships
  English catalog values only. Translation is a follow-on.
- No test-suite rewrite in this pass. `registry.test.ts`,
  `feed.test.ts`, and `notification-bell.test.tsx` assert the current
  two-workspace shape and will go red. Per standing project policy,
  tests get written/updated alongside the code but are not run by
  Claude — marked "owner verification pending" for the user to run.
- No change to `/apply` onboarding, admin app, or customer app.
- No change to the payment/settlement model, dispute flow, or any
  Django-side authorization rule — this is a presentation-layer
  reorganisation over existing, already-authorized reads and commands.

## Decisions confirmed with the user (2026-08-19)

**Days/calendar screen: dropped from this pass.** No Partner-facing
read of busy/free dates exists today (checked — `/availability` is
on/off only; the server-side calendar check in `crew-offer-card.tsx`'s
copy is internal to Django's dispatch conflict logic, never published).
`Days.dc.html` stays as a canvas reference for a future backend-plus-
frontend pass; it is not built against real data now. The existing
`PartnerPresence` on/off control moves into `/me` as-is, restyled to
match the canvas's card language but with no new data underneath it.

**A1 Jobs fold into the WORK stack.** Confirmed — not left as a
separate feed. `features/work`'s `usePartnerJobs` becomes the fourth
source in the `WorkItem` adapter alongside offers/enquiries/engagements.
This closes the gap `registry.ts` already flags as deferred
(`M2-FE-111`: A1 partners unconditionally seeing Jobs/Money tabs) as a
side effect of the merge.

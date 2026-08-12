# M2 Frontend Information Architecture

**Closes:** `M2-FE-001`, `M2-FE-002`, `M2-FE-003`, `M2-FE-004`, `M2-FE-005`
**Owner:** Claude
**Revision:** 3 — visit-first A5 per [ADR-0008](../../docs/adr/0008-m2-visit-first-estimation-for-a5.md);
revision 2 per [06-audit-gaps-and-simplification.md](06-audit-gaps-and-simplification.md)
**Task board:** [task.md](task.md)

This is the route and navigation contract for the three existing Next.js applications. A route not
listed here does not exist in M2. No new application is created: Customer, Partner and
`frontend/apps/admin` (product label **Operations**) each absorb their own M2 surfaces.

The Partner half of this document is **implemented as code**, not prose — see
`frontend/apps/partner/features/workspace/registry.ts`. Where the two disagree, the registry is the
truth and this document is stale.

## Principles that decide every route below

1. **A skill is not a lifecycle.** No route is selected by profession, category or skill name. The
   Partner app renders navigation from server-authorized `{workspace_key, actions[]}` and nothing else.
2. **Records keep their own nouns.** An A3 shift-day is a *shift*; an A5 milestone is a *stage*. One
   backend spine (ADR-0007) does not mean one word in the UI.
3. **Nothing is charged before a real accepted commitment exists.** No route in the Customer
   requirement flow may reach a payment surface. For A3 the first is `/requests/[id]/unlock`, and it
   exists only once a usable quote does. For A5 the first is `/requests/[id]/book-visits`, and it
   exists only once a vendor holds a visit slot.
4. **Unknown means nothing.** An unrecognised workspace key renders no tab and no route.

## 1. Customer routes — `frontend/apps/customer`

Added under the existing `(flow)` group, beside `/cart`, `/checkout` and `/bookings`.

| Route | Purpose | Flow-weight |
|---|---|---|
| `/requests/new` | Category-first entry. Plain language: hiring people for a period, or commissioning a defined outcome. Never asks the customer to pick an archetype. | — |
| `/requests/new/[service]` | **The four screens, mounted as one route** (corrected 2026-08-13 — see the note below). Screen 1: service, scale, and the answers the lifecycle is inferred from. Screen 2: location, dates, flexibility, hard `service_by`, `requested_start`. Screen 3: photos, short video, documents, **voice note as a peer of the questions**. Screen 4: the single confirmation, where submitting happens — optional callback, site-visit interest, access constraints and communication preference are reachable *from* it, never as extra steps, and **for an A5-inferred requirement it carries the visit-plan chooser (1/2/3 vendors) — a control, not a fifth screen.** | 1–4 of 4 |
| `/requests` | `My requests`: matching status, teaser count (A3) / visit state (A5), delivery deadline, latest activity. | — |
| `/requests/[id]` | Request timeline: requirement, matching, aggregate invitation state, questions, visits (A5: the per-slot tracker), quote/estimate delivery, recovery. | — |
| `/requests/[id]/quotes` | A3: teasers before unlock, full quotes after — one route, two states, so a cached "unlocked" URL cannot outlive a refunded unlock. A5: delivered estimates in full, each linked to its completed visit; **no paywall state exists on this route for A5**. | — |
| `/requests/[id]/unlock` | A3 only: the INR 149 unlock, against visible delivered value. **Only reachable when a usable quote exists.** 404s on an A5 requirement. | Payment 1 of 1 (A3) |
| `/requests/[id]/book-visits` | A5 only: the visit-plan checkout, opened when the first vendor holds a slot. **Only reachable while a held slot exists.** 404s on an A3 requirement. | Payment 1 of 2 (A5) |
| `/requests/[id]/compare` | Accessible side-by-side on the single tax basis, with non-equivalent assumptions shown as such. | — |

> **Correction, 2026-08-13 (Gate 1).** This table listed the four capture screens as four routes —
> `/requests/new/what`, `/where-when`, `/details`, `/review`. They are built as a single
> `/requests/new/[service]`, on the `/book/[service]` and `/checkout` precedent already set in this
> app: the flow is one reducer, Back is a screen change rather than a navigation, and
> `canNavigateTo` refuses a forward jump. Four URLs would have to either skip every guard on a
> pasted `/review` or bounce the customer to screen 1, and neither is a route worth having. **The
> four-screen budget is enforced by `SCREENS.length === 4` in `features/requirement/boundary.test.ts`,
> not by counting folders** — which is the stronger guarantee, because it fails at build time.
| `/bookings/[engagementId]` | A3 engagement: schedule, agreed crew composition, daily one-tap attendance confirm/dispute, direct-payment reminder. Under the existing `/bookings` because from the customer's side it is a booking. | — |
| `/projects` | `My projects`: progress, active stage, funded amount, next action, issue status. | — |
| `/projects/[engagementId]` | A5 engagement: stages, evidence review, amendments, deliverable acceptance, warranty. | — |
| `/projects/[engagementId]/stages/[stageId]` | Stage review: evidence viewer, approve, request correction, dispute. | Payment 2 of 2 (A5) |

**Why A3 lands in `/bookings` and A5 in `/projects`.** A3 completes as a connection the customer pays
for directly; A5 is a funded, staged, platform-protected engagement. Filing both under one noun would
require one set of words for two different promises about who holds the money — which is exactly the
misrepresentation `M2-FE-415` forbids.

## 2. Partner routes — `frontend/apps/partner`

**Implemented.** See `features/workspace/registry.ts`. Reproduced here for review only.

Base navigation, unconditional, unchanged from M1: `/dashboard`, `/jobs`, `/earnings`, `/profile`.

| Workspace key | Label | Home | Routes | Gating action |
|---|---|---|---|---|
| `A3_TIME_BLOCK` | Workforce | `/workforce` | `/workforce` | — |
| | | | `/workforce/enquiries` | `enquiry.view` |
| | | | `/workforce/shifts` | `attendance.confirm` |
| | | | `/workforce/crew` | `crew.manage` |
| `A5_CUSTOM_PROJECT` | Projects | `/projects` | `/projects` | — |
| | | | `/projects/enquiries` | `enquiry.view` |
| | | | `/projects/stages` | `stage.submit_evidence` |

Registration stays on the existing `/apply` tree, extended per `M2-FE-105`/`M2-FE-106` rather than
forked — a second onboarding tree is how two definitions of "verified" appear.

**Revision 3:** the A5 enquiry response at `/projects/enquiries` is the one-screen **visit-slot
confirmation** (`M2-FE-314`), and the on-site estimate mode of the composer (`M2-FE-315`) lives on
the enquiry detail once the visit is `COMPLETED`. No new workspace key and no new registry entry —
both are screens inside the existing `A5_CUSTOM_PROJECT` workspace.

**Tab budget: six.** Past six the labels truncate on a small Android viewport. A Partner holding both
capabilities moves between them with the workspace switcher, not with more tabs.

## 3. Operations routes — `frontend/apps/admin`

No new application. Product label stays **Operations**.

| Route | Purpose |
|---|---|
| `/operations/requests` | The unified queue: unmatched, under-quoted, SLA-breached, vendor-unconfirmed, fulfilment-exception, safety-incident, disputed, refund-pending, payout-held. |
| `/operations/requests/[id]` | One request end to end — requirement, snapshots, matching, questions, visits and plan shares (A5), proposals, unlock (A3), engagement, stages, cases, money — with actor, source, timestamp and reason on every privileged transition. |
| `/operations/requests/[id]/assisted-quote` | Assisted A3 quote capture with a call script. A **primary path**, not a fallback (`SIM-10`). Attribution to the named Partner is visible throughout; Operations never becomes the vendor. |
| `/operations/capabilities` | Capability review: approve, request correction, suspend, reinstate, with the audit trail. |
| `/operations/capabilities/[id]` | One capability under review. |
| `/operations/cases` | **Existing route.** M2 case kinds join it rather than forking a second case system. |

Safety incidents surface in `/operations/requests` as their own queue and open a case — they are never
a cancellation reason (`GAP-022`).

## 4. Navigation behaviour — every state

`M2-FE-004`. The first four are implemented in the registry; the last three need the capability-status
read requested in proposal 0012 and are specified here so they are not invented per screen later.

| State | Navigation | Why |
|---|---|---|
| No M2 capability (A1 Partner) | Base tabs only. No switcher. | Today's behaviour, unchanged. The overwhelming majority of Partners. |
| One M2 capability | Base tabs + that workspace's tabs; switcher shows Home and the workspace. | — |
| Two M2 capabilities | Switcher shows Home, Workforce and Projects. Records stay in their own lifecycle views; global Home may aggregate only clearly labelled summaries. | Merging a shift and a stage into one "work" list is the erasure `M2-FE-111` forbids. |
| Unknown workspace key | Renders nothing. No tab, no route, no generic fallback. | A key this bundle has no screens for produces a 404 if offered. Django refuses the actions either way. |
| Capability pending review | Base tabs only, plus an explicit review banner naming the next permitted action. | **Not implemented.** Indistinguishable from "no capability" until the status read exists — and inferring it from an empty grant list would show a review banner to every existing Partner. |
| Capability suspended | Workspace tabs hidden, in-flight records still readable, every command disabled server-side with recovery guidance. | **Not implemented.** Same blocker. Must fail closed, and must never fall back to Jobs. |
| Suspended mid-session | Refetch grants on focus, drop the workspace, keep the person on a route that still exists. | `SESSION_STATE` freshness on grants gives the refetch; the fallback route needs the status read. |

## 5. Responsive flows

`M2-FE-005`. One diagram per archetype. There is deliberately **no commercial-mode branch** — A3 is
always lead-only and A5 always managed (`SIM-03`).

### A3 workforce — one payment, ever

```text
CUSTOMER                          PARTNER                        MONEY
────────────────────────────────  ─────────────────────────────  ──────────────
/requests/new  (4 screens, free)
        │
        ▼
/requests/[id]  matching ────────► /workforce/enquiries
                                          │ accept  (capacity hold)
                                          ▼
                                   one-screen composer
                                   rate · days · inclusions
        ┌─────────────────────────────────┘
        ▼
/requests/[id]/quotes  TEASERS
   verification · rating · band
        │
        ▼
/requests/[id]/unlock ───────────────────────────────────────►  INR 149  ◄── the only charge
        │
        ▼
/requests/[id]/compare  ──select──► reconfirm request
                                          │ reconfirm
        ┌─────────────────────────────────┘
        ▼
/bookings/[id]   contact released        /workforce/shifts
   one-tap confirm or dispute  ◄──────── supervisor: "n of m present"
        │
        ▼
   completion                                                    paid direct
                                                                 to the Partner
```

Mobile: every screen is single-column. The attendance confirm is one tap from the notification, above
the fold, with no intermediate list — a supervisor is standing on a site, not browsing.

### A5 project — visit-first, two payments, staged (revision 3)

```text
CUSTOMER                          PARTNER                        MONEY
────────────────────────────────  ─────────────────────────────  ──────────────
/requests/new  (4 screens, free;
 review carries the plan chooser:
 1 / 2 / 3 vendors — charges nothing)
        │
        ▼
/requests/[id]  matching ────────► /projects/enquiries
                                          │ confirm a visit slot
                                          │ (one screen: slot picker on the
                                          │  shared availability grid)
        ┌─────────────────────────────────┘
        ▼
/requests/[id]/book-visits ──────────────────────────────────►  visit plan charged  ◄── one charge,
   "Vendor confirmed Tue 10am —                                  (proposed 49/99/199)    whole plan
    book your visits"                     later vendors book
        │                                 with no further payment
        ▼
/requests/[id]  visit tracker             VISIT DAY
   vendor identity disclosed              arrival confirmed (fallback; OTP in M3)
   per confirmed slot                            │
        │                                        ▼
        │                                 full composer ON SITE, prefilled:
        │                                 price · working days · materials ·
        │                                 tax · exclusions · warranty · validity
        ▼                                        │
/requests/[id]/quotes  ESTIMATES ◄───────────────┘
   readable in full, no paywall;                                 unfilled slots
   each linked to its visit                                      auto-refund at SLA
        │
        ▼
/requests/[id]/compare ──select──► reconfirm
        │
        ▼
/projects/[id]  agreement ──────────────────────────────────►  stage 1 funded     ◄── protected
        │                                                       visit payouts paid      work starts
        ▼                                  /projects/stages      to visiting vendors
/projects/[id]/stages/[stageId] ◄────────── evidence submitted
   approve · correct · dispute
        │                                                       stage released
        ▼                                                       retention held
   completion ──► warranty window ──► retention released
```

Mobile: the stage evidence viewer is the only route that assumes a large image. It degrades to a
single-column gallery with explicit download rather than a side-by-side comparison.

## 6. What is deliberately not here

- **No route module has been created for any Customer or Operations route above.** They are specified,
  not scaffolded. Empty route files for screens with no endpoint behind them are the per-archetype
  scaffolding `SIM-09` rejects, and each one would be a live link to a blank page.
- **No fixtures.** Every route above waits on its published contract.
- **No per-variant commercial-mode branch** anywhere in the IA. Reintroducing one is a revision-2
  regression, not a detail.

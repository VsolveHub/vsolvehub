# 12. A10 listing engine

- Status: Proposed
- Date: 2026-09-13

## Context

Milestone 3 Phase D adds three category engines: A7 rental, A9 stay, and A10 listing/careers.
Design authority is [`Django_Next.js_Plan/M3/03-rental-stay-jobs-categories.md`](../../Django_Next.js_Plan/M3/03-rental-stay-jobs-categories.md).
ADR-0010 (customer wallet) and ADR-0011 (A7/A9 engines) remain reserved and unused on this branch.

Career/Jobs is the only A10 launch subcategory (OQ-D4). A listing is a moderated posting. An
application is interest against that posting. Neither is a visit, a quote, a requirement, or a
booking. The existing `BookingGroup` / `FulfilmentUnit` / work-session chain would force dead
columns (`fulfilment_status`, assignment, arrival OTP) onto every job post, which
`03-lifecycle-and-state-machines.md` already forbids for A10.

Two independent Customer-type actors meet through the posting: the poster is a Partner with an
approved `A10_LISTING` capability; the applicant is an ordinary customer. The only money in the
archetype is B2B — poster to platform — for a vendor subscription or a premium listing. The
applicant never pays. There is no chat product and no Elasticsearch.

A working A10 stack already exists on `origin/m3-changes` (`3fa3016`). That commit also mixes A7/A9,
hand-edited OpenAPI, and generated clients. This record is the A10-only integration onto current
`main`, not a merge of that branch.

The Phase D plan names listing statuses
`DRAFT → SUBMITTED_FOR_MODERATION → MODERATION_APPROVED → PUBLISHED → ACTIVE`. The ported engine
keeps two stored fields — `Listing.status` (`DRAFT` / `PUBLISHED` / `CLOSED` / `EXPIRED` /
`REMOVED` / `ARCHIVED`) and `Listing.moderation_status` (`DRAFT` / `PENDING` / `APPROVED` /
`REJECTED` / `REMOVED`) — because moderation is a gate on a posting, not a second lifecycle of
the posting itself. The frontend must not invent plan names the serializer does not emit.

## Decision

A10 is a first-class Django app (`apps.listings`) beside catalog, commerce, partners, and cases.
It is not a Booking Group, not a Fulfilment Unit, and not a cart line.

**Archetype.** `ServiceVariant.BookingArchetype` gains `A10_LISTING` only. A7 and A9 stay off this
branch. Category policy lives in `A10VariantConfiguration` with the same versioned ACTIVE
uniqueness as `A1VariantConfiguration` and `M2VariantConfiguration`. Commands fail closed when no
ACTIVE configuration exists for the variant, and when the poster lacks an approved `A10_LISTING`
`PartnerCapability`.

**Domain.** `Listing` + `ListingMedia` + `ListingModerationEvent` + `ListingReport`. `Application`
+ `ApplicationAttachment` + `ApplicationStatusEvent` + `ApplicationReport`.
`VendorSubscriptionPlan` + `VendorSubscription`. Poster identity is `PartnerProfile`. Applicant
identity is `User`. Contact phone and email stay masked until an explicit, rate-limited, audited
reveal command. A unique constraint forbids a second active application of the same applicant on
the same listing.

**Public listing state.** Persistence stays two fields. Serializers emit both stored fields and
one derived `public_state` the UI may render:

| `status` | `moderation_status` | `public_state` |
| --- | --- | --- |
| `DRAFT` | `DRAFT` | `DRAFT` |
| `DRAFT` | `PENDING` | `PENDING_REVIEW` |
| `DRAFT` | `REJECTED` | `REJECTED` |
| `PUBLISHED` | `APPROVED` | `PUBLISHED` |
| `CLOSED` | any | `CLOSED` |
| `EXPIRED` | any | `EXPIRED` |
| `REMOVED` | any | `REMOVED` |
| `ARCHIVED` | any | `ARCHIVED` |

`SUBMITTED_FOR_MODERATION` and `MODERATION_APPROVED` are plan vocabulary, not stored or serialized
values. Public browse returns only `PUBLISHED` + `APPROVED` rows.

**Money.** `PaymentAttempt.Purpose` gains `A10_VENDOR_SUBSCRIPTION` and `A10_PREMIUM_LISTING`.
Both sit in `CHECKOUT_FREE_PURPOSES`. Capture activates the matching command
(`complete_subscription_payment` or premium activation) once; webhook replay must not
double-extend. There is no applicant `PaymentAttempt`, no listing `PaymentAllocation` to a
Fulfilment Unit, and no hidden default plan that auto-publishes. Premium is a real activation, not
a dead success path on the subscription reducer. Publish without an active
`VendorSubscription` is allowed when the poster still holds an approved `A10_LISTING`
capability and the variant has an ACTIVE `A10VariantConfiguration` — that is an explicit
free tier, not a silent default plan. `max_active_listings` caps apply only while a
subscription is ACTIVE.

**Discovery.** ORM filters over indexed columns and declared `structured_fields` keys. No search
engine.

**Operations.** Abuse opens `OperationsCase` kinds `LISTING_ABUSE` and `APPLICATION_ABUSE`.
Moderate, remove, and reinstate always require a reason. The poster cannot self-reinstate.

**Dispatch.** Outbox events `listing.published|expired|removed` and
`application.submitted|status_changed`. Celery beat sweeps `expire_published_listings` and
`expire_vendor_subscriptions`.

## Consequences

Partner A1 `/work` and `/jobs` remain task-visit work. An A10 grant renders Home / Listings /
Leads / Billing / You. An unknown workspace key still renders nothing.

The two-field persistence plus derived `public_state` costs a mapping the frontend must not
re-derive. Inventing plan status names in badges is a contract bug.

A10 money reuses `PaymentAttempt` without inventing a second billing product. It also cannot reuse
`PaymentAllocation` (that table requires Fulfilment Units). Subscription and premium activation
are therefore domain commands on `VendorSubscription` / `Listing.is_premium`, guarded by
conditional updates.

Fail-closed configuration means a Career/Jobs tile without an ACTIVE `A10VariantConfiguration`
cannot accept create, submit, or apply. That is deliberate: a missing policy is not a default
plan.

This record does not authorize A7, A9, wallet spend on listing purposes, MSG91, mobile, or
analytics dashboards. Those stay on ADR-0010 / ADR-0011 and later Phase D/E waves.

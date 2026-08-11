# contract-pending — M2 Partner capability, gates and crew

Every type in this directory describes an endpoint that **does not exist yet**.

`contracts/openapi/v1.yaml` v1.20.0 publishes no M2 path at all and `M2-BE-013` is unstarted. The
Partner-side surface is requested in
[`contracts/proposals/0013-m2-partner-capability-crew-and-gates.md`](../../../../../../contracts/proposals/0013-m2-partner-capability-crew-and-gates.md)
and modelled here in the meantime.

Same rule and same reasoning as [`apps/customer/features/booking/contract-pending/`](../../../../customer/features/booking/contract-pending/README.md),
copied deliberately rather than improved on. A second quarantine convention would be a second thing to
learn.

## Why the crew types live here too

Proposal 0013 is one surface — capability, gates and crew are the same review lifecycle seen from
three angles — and `features/crew/adapters/` imports these types across the feature boundary rather
than keeping a second copy. Two quarantines for one proposal would publish two versions of
`CrewMemberRecord` that could drift, and the whole point of a quarantine is that there is exactly one
place to change when the contract lands.

## The rule

Nothing under `features/capability/view/`, `features/crew/view/` or any `app/` route may import from
this directory. Components consume view models from `../adapters/` and `../../crew/adapters/`, which
are the only code that knows these shapes exist.

`boundary.test.ts` enforces this, and also carries the app-wide half: no production module in the
Partner app may name an unpublished endpoint path. That is the rule the type quarantine could not
enforce on its own — the Customer app still shipped a raw `fetch` to a proposal-only path once, so a
production bundle sent a request Django has never been able to answer.

## Why there are no query keys here

`@vsolve/query`'s `m2-keys.ts` already exists for exactly this reason and carries its own standing
rule that no query may use a key from it until the endpoint publishes. Use `m2QueryKeys` when the
hooks land; do not re-declare keys here.

## What "built" means for the screens above this

The registration and capability screens are built against these shapes and mount **no query**. There
is no fixture, no mock and no placeholder record in application code: with no endpoint, each screen
shows its real loading state and then its real error state, and every command reports honestly that
the service is not available yet. That is the real state, not a simulated one.

No route file exists for any screen here. An empty route with nothing behind it is a live link to a
blank page, which is the per-archetype scaffolding `SIM-09` rejects.

## Deleting this directory

When Codex publishes the operations:

1. Regenerate `@vsolve/api-client` from the new `v1.yaml`.
2. Fold `m2QueryKeys` into `@vsolve/query`'s `queryKeys.m2` and delete the standing note in
   `m2-keys.ts`.
3. Rewrite each adapter in `../adapters/` and `../../crew/adapters/` to read `Schemas[...]` instead of
   `./types`.
4. Mount the hooks in `../queries.ts` and `../../crew/queries.ts`, and create the routes.
5. Remove the M2 entries from `UNPUBLISHED_PATHS` in `boundary.test.ts`.
6. Delete this directory.

No component and no component test should need to change. If one does, an adapter was leaking and the
leak is the bug.

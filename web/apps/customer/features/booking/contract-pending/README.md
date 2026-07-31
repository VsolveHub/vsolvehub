# contract-pending

Every type in this directory describes an endpoint that **does not exist yet**.

`contracts/openapi/v1.yaml` v1.2.0 publishes the catalog, serviceability, addresses and session. It
publishes nothing for slots, eligible Partners, capacity holds, the Instant pool pre-check, quotes or
the cart. B3 needs all six, so they are requested in
[`contracts/proposals/0002-booking-workspace.md`](../../../../../../contracts/proposals/0002-booking-workspace.md)
and modelled here in the meantime — which tasks.md §3 rule 7 permits, and rule 10 qualifies: *a
proposal is not an API*.

## The rule

Nothing under `features/booking/view/` may import from this directory. Components consume view models
from `../adapters/`, which is the only code that knows these shapes exist.
`boundary.test.ts` fails the build if that is ever violated.

This is the same structural trick as `lib/api/public.ts` versus `private.ts`: make the guarantee
impossible to break by accident rather than write a comment asking people to remember it.

## Why the query keys are here too

`@vsolve/query`'s `keys.ts` states in its own header that keys exist only for published endpoints —
"adding a domain means the contract gained it, not that the client guessed". These endpoints have not
been gained, so their keys live here and move to `@vsolve/query` on integration.

## Deleting this directory

When Codex publishes the operations:

1. Regenerate `@vsolve/api-client` from the new `v1.yaml`.
2. Move the query keys into `@vsolve/query`'s `keys.ts`.
3. Rewrite each adapter in `../adapters/` to map from `Schemas[...]` instead of from `./types`.
4. Repoint `packages/testing`'s handlers at fixtures built from the contract's published examples.
5. Delete this directory and `boundary.test.ts`.

No component and no component test should need to change. If one does, an adapter was leaking and the
leak is the bug.

# M3/M4 merge strategy (aligned to M1/M2)

## Decision
**M3 does not land on `main` piece-by-piece.** Follow the M2 integration-branch pattern:

`slice branches` → **M3 integration trunk** (continuous) → **one** `merge: integrate M3 into main` (owner-approved, when M3 exit gate passes).

Same for M4 after M3 is on `main` (or a dedicated M4 trunk if the owner wants parallel).

## Evidence from repo history
- M2 developed on `M2-revamp` / `feat/m2-workforce-projects`; contributor branches merged **into** that trunk.
- `main` got M2 only at `4a08ad3` — `merge: integrate M2-revamp into main`.
- Reason recorded in `Django_Next.js_Plan/M2/README.md`: separate acceptance/payment from M1; `main` was the M1 build until combine.
- `AGENTS.md` / `CONTRIBUTING.md`: still use feature branches; confirm before pushing `main`.
- `Django_Next.js_Plan/M3/README.md`: work on `feature/m3-*`; no direct `main` commits without approval.

## Implications for current A10 work
- `feature/m3-a10-listings` + draft PR #1 should be treated as **start of the M3 trunk** (or renamed to `feature/m3` / `M3-revamp`), **not** as an early `main` merge.
- Rental, Stay, wallet, payments slices: PR **into the trunk**.
- Do not merge `origin/m3-changes` / cherry-pick `3fa3016`.

## Staging
Deploy/smoke the **integration trunk**, not `main`, until the milestone integrate.

# Architecture Decision Records

An ADR records one architectural decision: the forces that constrained it, the choice that was
made, and what that choice costs. It exists so that a decision already load-bearing in the code
does not have to be re-derived, or silently re-litigated, by whoever reads that code next.

## Format

Every record uses the same four-part structure.

```markdown
# N. Title

- Status: Proposed | Accepted | Superseded by ADR-NNNN
- Date: YYYY-MM-DD

## Context

## Decision

## Consequences
```

**Context** states the situation and the constraints, without naming the outcome. **Decision**
states what was chosen, in the active voice and the present tense — "money is allocated across
unit lines", not "we will allocate money". **Consequences** states what follows, including the
costs, the new obligations the decision creates and the things it forecloses. A record with no
downside in its Consequences section has not been thought through.

## Immutability

An Accepted ADR is a historical record and is never edited to reflect a change of direction.
Rewriting it destroys the reasoning that the code was actually built on and makes the git history
of the decision unreadable.

When a decision changes, write a new ADR that supersedes the old one, and edit the old one only to
set `Status: Superseded by ADR-NNNN`. Corrections to typographical errors and broken links are the
sole exception.

## Numbering

Numbers are allocated at merge time, not when drafting. Two branches that both reserve the next
number in advance will collide; take the next free number when the record actually lands. Numbers
are never reused, including for records that are superseded or withdrawn.

The next free number is **0008**.

## Index

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-booking-group-over-singleton-cart.md) | Booking group over singleton cart | Accepted |
| [0002](0002-outbox-and-celery-own-dispatch.md) | The outbox and Celery own dispatch | Accepted |
| [0003](0003-allocation-based-money-model.md) | Allocation-based money model | Accepted |
| [0004](0004-fail-closed-provider-selection.md) | Fail-closed provider selection | Accepted |
| [0005](0005-server-clock-calibration.md) | Server clock calibration | Accepted |
| [0006](0006-outbox-visibility-deadline-recovery.md) | Outbox visibility deadline and recovery | Accepted |
| [0007](0007-m2-engagement-spine-and-fee-after-value.md) | M2 engagement spine and fee after value | Accepted |

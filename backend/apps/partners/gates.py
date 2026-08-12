"""The three progressive-registration gates, as closed vocabularies.

Supply is the scarce side of this marketplace, so nothing here stands between a new Partner and the
masked demand list. Each gate bites at the moment it becomes necessary — identity before the first
accept, bank details before the first payout, a roster before the first crew assignment — and each
one carries its own explanation.

The explanation lives here, on the server, and not in the Partner app, for one reason: the same
sentence has to arrive two ways. `GET /api/v1/partner/gates/` publishes it *before* the Partner
tries, and the `403` from `assert_kyc_complete` and its siblings carries it *after*. Two copies of
that sentence drift the first time the rule changes, and the version that drifts is always the one
nobody remembers is a duplicate.

These are `TextChoices` without a model field on purpose: they are wire vocabularies, not stored
state, and naming them here is what lets `ENUM_NAME_OVERRIDES` publish them as stable components
instead of positional `GateEnum` digits that move when an unrelated app adds a `gate` field.
"""

from dataclasses import dataclass

from django.db import models


class ProgressiveGate(models.TextChoices):
    KYC = "KYC", "Identity verification"
    PAYOUT_DETAILS = "PAYOUT_DETAILS", "Payout account"
    CREW_ROSTER = "CREW_ROSTER", "Crew roster"


class GateNextAction(models.TextChoices):
    """What the Partner does about it. A machine value the client maps to a route it owns.

    Same split as the workspace registry, and for the same reason: the backend knows what must
    happen next, the frontend knows where that lives, and a server that published `/apply/documents`
    would be shipping a route it cannot see.
    """

    SUBMIT_APPLICATION = "SUBMIT_APPLICATION", "Submit the Partner application"
    ADD_PAYOUT_ACCOUNT = "ADD_PAYOUT_ACCOUNT", "Add a payout account"
    ADD_CREW_MEMBER = "ADD_CREW_MEMBER", "Add a crew member"


@dataclass(frozen=True, slots=True)
class GateState:
    gate: str
    is_satisfied: bool
    #: Actions, never screens. An unsatisfied gate never hides demand; it explains the one control
    #: it stands in front of.
    blocks: tuple[str, ...]
    reason: str
    next_action: str | None


#: The reason and next action per gate, keyed by the error code the matching guard raises. The code
#: is the join: `assert_kyc_complete` raises `m2_kyc_required`, and the gate read and the refusal
#: both resolve their copy through this one table, so they cannot disagree.
GATE_COPY: dict[str, tuple[str, str, str]] = {
    "m2_kyc_required": (
        ProgressiveGate.KYC,
        "We check identity before you accept your first job, so customers know who is coming.",
        GateNextAction.SUBMIT_APPLICATION,
    ),
    "m2_payout_details_required": (
        ProgressiveGate.PAYOUT_DETAILS,
        "We need a verified bank account before money can leave Vsolve.",
        GateNextAction.ADD_PAYOUT_ACCOUNT,
    ),
    "m2_crew_roster_required": (
        ProgressiveGate.CREW_ROSTER,
        "A named team means the customer knows who is arriving, and we can check nobody is "
        "double-booked.",
        GateNextAction.ADD_CREW_MEMBER,
    ),
}

#: Which actions each gate stands in front of, in the same `workspace.action` vocabulary
#: `capabilities.WORKSPACE_ACTIONS` publishes.
GATE_BLOCKS: dict[str, tuple[str, ...]] = {
    ProgressiveGate.KYC: ("enquiry.accept",),
    ProgressiveGate.PAYOUT_DETAILS: ("payout.receive",),
    ProgressiveGate.CREW_ROSTER: ("crew.assign",),
}

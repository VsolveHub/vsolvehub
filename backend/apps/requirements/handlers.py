"""Transactional-outbox consumers for M2.

The one consumer here answers the question `M2-BE-113` has been blocked on since 10 August: what
happens to money already committed against a capability that Operations has just suspended.

It runs through the outbox rather than inside `partners.capabilities.transition_capability` for
two reasons, and the second is the one that decides it:

* `apps.requirements` imports `apps.partners`, so a direct call the other way would close an
  import cycle.
* A review decision has to be recorded even if the routing fails. Refunding stages and flagging
  engagements for replacement touches a payment provider; a suspension that could not be saved
  because a refund adapter timed out would be a Partner left approved on a decision an operator
  already made. The outbox keeps the two facts separate and retries the second.
"""

from uuid import UUID

from apps.foundation.models import OutboxEvent
from apps.foundation.tasks import register_outbox_handler
from apps.requirements.engagements import route_suspended_capability_engagements


@register_outbox_handler(event_type="m2.capability.suspended")
def handle_capability_suspended(event: OutboxEvent) -> None:
    """Route funded or committed engagements belonging to a suspended capability.

    Idempotent by state rather than by key: every action it takes — refunding a stage, recording
    an event — is idempotent on its own, so a re-driven event settles on the same outcome. The
    refund in particular is keyed on the stage and the amount inside
    `commerce.request_standalone_refund`, so a retry returns the refund it already asked for.
    """
    partner_id = event.payload.get("partner_id")
    variant_id = event.payload.get("variant_id")
    if not isinstance(partner_id, str) or not isinstance(variant_id, str):
        raise ValueError("m2.capability.suspended requires partner_id and variant_id.")
    route_suspended_capability_engagements(
        partner_id=UUID(partner_id),
        variant_ids=[UUID(variant_id)],
        reason_code=str(event.payload.get("reason_code") or "capability_suspended"),
    )

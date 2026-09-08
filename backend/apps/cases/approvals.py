from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.cases.models import OperationsCase, OperationsSettlementApproval


@transaction.atomic
def propose_or_approve_settlement(
    *, case: OperationsCase, operator: Any, proposal: dict[str, Any]
) -> bool:
    """Return true only when a different operator approves the unchanged proposal."""
    approval, created = OperationsSettlementApproval.objects.select_for_update().get_or_create(
        case=case,
        defaults={"proposal": proposal, "proposed_by": operator},
    )
    if created:
        return False
    if approval.proposal != proposal:
        raise ValueError(
            "The settlement proposal changed; withdraw it before proposing new amounts."
        )
    if approval.status == OperationsSettlementApproval.Status.APPROVED:
        return True
    if approval.proposed_by_id == operator.id:
        raise ValueError("A different Operations user must approve this settlement.")
    approval.approved_by = operator
    approval.approved_at = timezone.now()
    approval.status = OperationsSettlementApproval.Status.APPROVED
    approval.save(update_fields=("approved_by", "approved_at", "status"))
    return True

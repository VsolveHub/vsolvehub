"""Shared spine for the M2 view package.

Error translation, the request helpers every slice reaches for and the cursor paginators the
collection routes page with. `_raise_api_error` alone has a call site in almost every module
beside this one, which is why they live together rather than beside any single caller.

This module imports from no sibling in the package: the dependency arrows point one way, into
`base`, so there is no import cycle to unpick later.
"""

import uuid
from typing import Any, NoReturn, cast

from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response

from apps.identity.models import User
from apps.partners.exceptions import PartnerDomainError
from apps.partners.selectors import partner_profile_for_user
from apps.requirements.exceptions import (
    PolicyUnavailableError,
    RequirementDomainError,
    RequirementNotFoundError,
)
from apps.requirements.models import CustomerRequirement, Proposal
from apps.requirements.serializers import RequirementDraftSerializer
from common.pagination import StrictCursorPagination

DomainError = RequirementDomainError | PartnerDomainError


class M2ApiException(APIException):
    """Carries a domain refusal into `common.errors.handler` with its code intact."""

    def __init__(self, error: DomainError) -> None:
        self.status_code = error.status_code
        self.default_code = error.code
        self.retryable = error.retryable
        super().__init__(detail=error.message, code=error.code)


def _raise_api_error(error: DomainError) -> NoReturn:
    """Always raises.

    Typed `NoReturn` deliberately: it is what lets `except ...: _raise_api_error(exc)` narrow, so
    the happy path below an error branch does not need a redundant re-raise to convince the type
    checker that a record is bound.
    """
    raise M2ApiException(error)


def _idempotency_key(request: Request) -> str:
    key = request.headers.get("Idempotency-Key")
    if not key:
        raise ValidationError(
            {"Idempotency-Key": "This header is required."},
            code="idempotency_key_required",
        )
    return key


def _draft_response(
    requirement: CustomerRequirement,
    *,
    http_status: int = status.HTTP_200_OK,
) -> Response:
    payload = RequirementDraftSerializer(
        requirement,
        context={"server_now": timezone.now()},
    ).data
    return Response(payload, status=http_status)


def _partner_profile(request: Request) -> Any:
    profile = partner_profile_for_user(cast(User, request.user))
    if profile is None:
        raise RequirementNotFoundError()
    return profile


def _checkout_payload(attempt: Any) -> dict[str, object]:
    """One M2 charge, as much of it as a client is entitled to see.

    `provider_order_id` is usually blank in this response and that is correct rather than a race to
    paper over: the order is created by the outbox consumer that
    `initiate_standalone_payment_attempt` enqueues, so the attempt exists before the provider knows
    about it. The client polls the state read beside it. Creating the order inline would put a
    third-party HTTP call inside the transaction that took the Customer's slot.
    """
    return {
        "payment_attempt_id": attempt.id,
        "amount_paise": attempt.amount_paise,
        "currency": attempt.currency,
        "provider": attempt.provider,
        "provider_order_id": attempt.provider_order_id,
        "status": attempt.status,
        "expires_at": attempt.expires_at,
        "server_now": timezone.now(),
    }


def _optional_policy(read: Any) -> Any:
    """Read an owner-blocked policy value, or `None` when the owner has not set it.

    Used **only on reads**. Every command still fails closed — `m2_policy_unavailable` — because a
    command that guessed would act on a rule nobody approved. A read is different: refusing the
    whole screen because one optional number is unset would hide a request the Customer can still
    see the rest of, so the field arrives `null` and the UI renders nothing where it would have
    rendered a promise.
    """
    try:
        return read()
    except PolicyUnavailableError:
        return None


def _proposal_for_customer(*, requirement: CustomerRequirement, proposal_id: uuid.UUID) -> Proposal:
    proposal = Proposal.objects.filter(id=proposal_id, requirement=requirement).first()
    if proposal is None:
        _raise_api_error(RequirementNotFoundError())
    return proposal


# Cursor paginators, one per paginated collection: requirements, Partner enquiries,
# Partner proposals and engagements. Each is used by exactly one slice.
class RequirementCursorPagination(StrictCursorPagination):
    page_size = 20
    ordering = ("-created_at", "id")


class EnquiryCursorPagination(StrictCursorPagination):
    page_size = 20
    ordering = ("-created_at", "id")


class ProposalCursorPagination(StrictCursorPagination):
    page_size = 20
    ordering = ("-submitted_at", "id")


class EngagementCursorPagination(StrictCursorPagination):
    page_size = 20
    # Was missing, and inherited DRF's default `-created` — a column no model in this project
    # has. Every read of `/api/v1/engagements/` was a 500 from `FieldError`, which is why the
    # base class now refuses a subclass that does not name its own ordering.
    ordering = ("-created_at", "id")

# BE-07 Dispatch Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the last three BE-07 gaps in `backend/apps/assignments/` — idempotent, authorized, audited revoke/release/manual-recovery commands; persisted ranking provenance Operations can read; and real-PostgreSQL concurrency proof for the accept / expiry / payment-hold / worker-death races.

**Architecture:** Three new Operations commands live in a new `recovery_services.py` and are served by a new `operations_views.py`, both reusing the exact primitives proposal 0009 proved on the Partner command: `execute_idempotent` for replay, a domain command that raises `ValueError`/`PermissionError`, and a replay path that re-reads the current projection rather than the frozen body. Every command is guarded by the target Fulfilment Unit's existing `version` column and writes exactly one immutable `DispatchCommandAudit` row inside the same transaction. Ranking provenance is computed by a new pure `ranking.py` module that classifies every Partner in the unit's service area as ranked-or-excluded with a named reason, and is persisted on `AssignmentAttempt.ranking_snapshot` at offer creation.

**Tech Stack:** Django 5 / DRF, PostgreSQL (GiST exclusion constraints, `SELECT … FOR UPDATE`), drf-spectacular, Celery, pytest + `pytest-django` with `transaction=True`, ruff, strict mypy.

## Global Constraints

- **Standing rule 2:** Django owns authorization, assignment and workflow. Nothing is derived client-side.
- **Standing rule 3:** Never invent a field or code in the frontend; here we *publish* new ones, so every new code must appear in the regenerated `contracts/openapi/v1.yaml` and in `contracts/openapi/CHANGELOG.md`.
- **Standing rule 4:** No mock, placeholder or fallback data in any production path.
- **Standing rule 7:** Mutations are idempotent only under a stable key. Version conflicts refetch server truth.
- **Standing rule 8:** One idempotency helper (`apps.foundation.services.execute_idempotent`), one error presenter (`common.errors.handler`), one permission (`apps.partners.permissions.IsOperationsUser`). Match them; do not invent a second.
- **Standing rule 9:** One commit at the end of the whole task, not per file.
- **TDD is non-negotiable** (roadmap skill chain): a failing test first for every race and every command.
- **Lane discipline:** this lane owns `backend/apps/assignments/**`, `backend/tests/assignments/**`, `contracts/openapi/**` and exactly one line of `backend/config/settings/base.py` (the `SPECTACULAR_SETTINGS["VERSION"]` bump at line 178). It must not touch `apps/foundation/**`, `config/celery.py` or `docs/runbooks/**` — those belong to the BE-OPS lane, which is dirty in this working tree.
- **OpenAPI version:** committed contract is `1.14.0`. This lane publishes `1.15.0`. Never hand-edit `v1.yaml`; regenerate with `manage.py spectacular`.
- **Gate:** `ruff format --check`, `ruff check`, strict `mypy apps common config`, focused pytest for touched modules, then the full `.\scripts\quality.cmd`. Branch coverage must stay **at or above 86.47%**.
- **Ranking decision (locked with the user, 2026-08-05):** *explain only*. Persist the provenance of the order that already exists. Do **not** introduce a business ranking — that would change which Partner receives offers and invalidate existing dispatch tests.
- **Explainability surface (locked):** persist **and** publish a read endpoint under `IsOperationsUser`.
- **Release scope (locked):** `release` acts on a **Reservation**, not on a unit or group.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `backend/apps/assignments/ranking.py` | **Create.** Pure candidate evaluation: classify every Partner in the unit's service area as ranked (with factors) or excluded (with a named reason), and build the JSON provenance document. No DB writes. |
| `backend/apps/assignments/recovery_services.py` | **Create.** The three transactional Operations commands + the audit writer. |
| `backend/apps/assignments/operations_views.py` | **Create.** The four Operations HTTP surfaces. Kept out of `views.py`, which already carries the Customer and Partner surfaces at 270 lines. |
| `backend/apps/assignments/models.py` | **Modify.** Add `AssignmentAttempt.ranking_snapshot` and the immutable `DispatchCommandAudit`. |
| `backend/apps/assignments/migrations/0005_dispatch_audit_and_ranking_snapshot.py` | **Create.** Generated, not hand-written. |
| `backend/apps/assignments/group_services.py` | **Modify.** `_eligible_candidates` delegates to `ranking.py`; `_create_offer` persists the provenance. |
| `backend/apps/assignments/serializers.py` | **Modify.** Add the command request serializer and the three new response projections. |
| `backend/apps/assignments/exceptions.py` | **Modify.** Add `DispatchCommandInvalidApiError` and `DispatchVersionConflictApiError`. |
| `backend/apps/assignments/urls.py` | **Modify.** Four new routes. |
| `backend/config/settings/base.py:178` | **Modify.** `"VERSION": "1.14.0"` → `"1.15.0"`. One line only. |
| `backend/tests/assignments/test_dispatch_explainability.py` | **Create.** Provenance persistence + the Operations read endpoint. |
| `backend/tests/assignments/test_dispatch_recovery_commands.py` | **Create.** The three commands: authorization, version guard, idempotent replay, audit-exactly-once. |
| `backend/tests/assignments/test_dispatch_concurrency.py` | **Create.** Real-PostgreSQL races, `transaction=True`, threads and barriers. |
| `contracts/openapi/v1.yaml` | **Regenerate.** |
| `contracts/openapi/CHANGELOG.md` | **Modify.** New `1.15.0` section at the top. |
| `Django_Next.js_Plan/M1/02-backend-tasks.md` | **Modify.** Flip the two B6 `[~]`/`[ ]` lines this closes. |

---

### Task 1: Ranking provenance — the pure evaluator

**Files:**
- Create: `backend/apps/assignments/ranking.py`
- Test: `backend/tests/assignments/test_dispatch_explainability.py`

**Interfaces:**
- Consumes: `apps.carts.models.FulfilmentUnit`, `apps.partners.models.PartnerProfile`, `apps.partners.selectors.partner_available_during`.
- Produces:
  - `RANKING_POLICY: Final[str] = "service_area_stable_uuid"`
  - `RANKING_POLICY_VERSION: Final[int] = 1`
  - `class ExclusionReason(models.TextChoices)` with members `APPLICATION_NOT_APPROVED`, `VARIANT_NOT_OFFERED`, `ALREADY_ATTEMPTED`, `UNAVAILABLE_AT_START`
  - `@dataclass(frozen=True, slots=True) class CandidateEvaluation: partner: PartnerProfile; exclusions: tuple[str, ...]`
  - `@dataclass(frozen=True, slots=True) class UnitRanking: evaluations: tuple[CandidateEvaluation, ...]` with properties `ordered: tuple[PartnerProfile, ...]` and method `provenance(self, *, unit: FulfilmentUnit, selected: PartnerProfile) -> dict[str, object]`
  - `def evaluate_unit_candidates(unit: FulfilmentUnit) -> UnitRanking`

**Why the pool is one service area:** an explanation that considered every Partner in the country would be unbounded and would disclose Partner identities far outside the job. The pool boundary is the unit's service area, recorded in the document so Operations can see where the explanation stops. That is the "bounded privacy policy" B6 asks for.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/assignments/test_dispatch_explainability.py`:

```python
"""BE-07 — dispatch decisions must be explainable to Operations.

`AssignmentAttempt` recorded which candidate was offered and the eligibility inputs,
but never why that candidate was first, nor why the Partners in the same service area
who were not offered were passed over. An Operations agent answering "why did this
Partner get this job" had only a UUID sort in code to point at.

There is no business ranking yet (B6), and these tests do not invent one. They hold
that the order which *does* run is recorded honestly: the policy that ran, the pool it
considered, the factor that decided it, and a named reason for every exclusion.
"""

from http import HTTPStatus

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.assignments.models import AssignmentAttempt, PartnerOffer
from apps.assignments.ranking import (
    RANKING_POLICY,
    RANKING_POLICY_VERSION,
    ExclusionReason,
    evaluate_unit_candidates,
)
from apps.carts.models import BookingGroup, FulfilmentUnit
from apps.identity.models import Role, User, UserRole
from tests.assignments.test_group_dispatch import _checkout, _quote
from tests.carts.test_fulfilment_planning import (
    _add_item,
    _address_payload,
    _partner,
    _plan,
)
from tests.helpers import force_role_client

pytestmark = pytest.mark.django_db(transaction=True)

CUSTOMER = "+919876543210"


def _dispatched_unit(*, phone: str, key: str) -> FulfilmentUnit:
    """Run one Customer from empty cart to dispatch and return the unit it produced."""
    customer = User.objects.create_user(phone_number=phone)
    client = APIClient()
    client.force_authenticate(customer)
    cart_version = client.get("/api/v1/cart/").json()["version"]
    address = client.post("/api/v1/addresses/", _address_payload(), format="json")
    assert address.status_code == HTTPStatus.CREATED
    item = _add_item(client, slug="switch-socket-repair", cart_version=cart_version)
    plans = _plan(client, address_id=address.json()["id"], cart_version=int(item["version"]))
    quote = _quote(client, plans["plans"][0]["id"], key=f"{key}-quote")
    checkout = _checkout(client, quote["id"], key=f"{key}-checkout")
    group = BookingGroup.objects.get(id=checkout["booking_group"]["id"])
    return FulfilmentUnit.objects.select_related("service_area").get(booking_group=group)


def test_the_evaluator_names_a_reason_for_every_excluded_candidate() -> None:
    call_command("seed_technician_catalog")
    offered = _partner(suffix="80", variant_slugs=("switch-socket-repair",))
    wrong_service = _partner(suffix="81", variant_slugs=("fan-installation",))
    unit = _dispatched_unit(phone=CUSTOMER, key="evaluator")

    ranking = evaluate_unit_candidates(unit)

    by_partner = {item.partner.id: item for item in ranking.evaluations}
    assert by_partner[wrong_service.id].exclusions == (ExclusionReason.VARIANT_NOT_OFFERED,)
    # The Partner who already holds the live offer has an attempt against this unit.
    assert ExclusionReason.ALREADY_ATTEMPTED in by_partner[offered.id].exclusions
    assert wrong_service.id not in {item.id for item in ranking.ordered}


def test_the_provenance_document_records_the_policy_pool_and_factors() -> None:
    call_command("seed_technician_catalog")
    _first = _partner(suffix="82", variant_slugs=("switch-socket-repair",))
    _second = _partner(suffix="83", variant_slugs=("switch-socket-repair",))
    unit = _dispatched_unit(phone=CUSTOMER, key="provenance")
    attempt = AssignmentAttempt.objects.get(fulfilment_unit=unit)

    snapshot = attempt.ranking_snapshot

    assert snapshot["policy"] == RANKING_POLICY
    assert snapshot["policy_version"] == RANKING_POLICY_VERSION
    assert snapshot["pool"]["scope"] == "service_area"
    assert snapshot["pool"]["service_area_id"] == str(unit.service_area_id)
    assert snapshot["selected"]["partner_id"] == str(attempt.candidate_id)
    assert snapshot["selected"]["rank"] == 1
    ranked = snapshot["ranked"]
    assert [entry["rank"] for entry in ranked] == list(range(1, len(ranked) + 1))
    # The order has exactly one input today, and the document says so rather than
    # publishing a score that no code computes.
    assert ranked[0]["factors"] == {"tiebreak_partner_id": str(attempt.candidate_id)}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
backend/.venv/Scripts/python.exe -m pytest tests/assignments/test_dispatch_explainability.py -v --no-cov
```

Expected: FAIL — `ModuleNotFoundError: No module named 'apps.assignments.ranking'`.

- [ ] **Step 3: Write `backend/apps/assignments/ranking.py`**

```python
"""Deterministic candidate ordering, recorded so Operations can explain it.

There is no business ranking in M1. Candidate order is a stable sort on Partner UUID,
which is arbitrary but reproducible. Explainability here is therefore not about
justifying a score — there is no score — it is about recording honestly what actually
decided the order, and giving every Partner who was considered and passed over a named
reason rather than silent absence.

The pool is bounded to the unit's service area on purpose. A wider pool would be both
unbounded to compute and a disclosure of Partner identities with no bearing on the job.
The boundary is written into the document so a reader can see where the explanation stops.
"""

from dataclasses import dataclass
from typing import Final

from django.db import models
from django.utils import timezone

from apps.carts.models import FulfilmentUnit
from apps.partners.models import PartnerApplication, PartnerProfile
from apps.partners.selectors import partner_available_during

RANKING_POLICY: Final[str] = "service_area_stable_uuid"
RANKING_POLICY_VERSION: Final[int] = 1


class ExclusionReason(models.TextChoices):
    APPLICATION_NOT_APPROVED = "application_not_approved", "Application not approved"
    VARIANT_NOT_OFFERED = "variant_not_offered", "Variant not offered"
    ALREADY_ATTEMPTED = "already_attempted", "Already attempted for this unit"
    UNAVAILABLE_AT_START = "unavailable_at_start", "Unavailable at the requested start"


@dataclass(frozen=True, slots=True)
class CandidateEvaluation:
    partner: PartnerProfile
    exclusions: tuple[str, ...]

    @property
    def included(self) -> bool:
        return not self.exclusions


@dataclass(frozen=True, slots=True)
class UnitRanking:
    evaluations: tuple[CandidateEvaluation, ...]

    @property
    def ordered(self) -> tuple[PartnerProfile, ...]:
        return tuple(item.partner for item in self.evaluations if item.included)

    def provenance(self, *, unit: FulfilmentUnit, selected: PartnerProfile) -> dict[str, object]:
        ranked = [
            {
                "partner_id": str(partner.id),
                "rank": index,
                "factors": {"tiebreak_partner_id": str(partner.id)},
            }
            for index, partner in enumerate(self.ordered, start=1)
        ]
        selected_rank = next(
            (entry["rank"] for entry in ranked if entry["partner_id"] == str(selected.id)),
            None,
        )
        return {
            "policy": RANKING_POLICY,
            "policy_version": RANKING_POLICY_VERSION,
            "evaluated_at": timezone.now().isoformat(),
            "pool": {
                "scope": "service_area",
                "service_area_id": str(unit.service_area_id),
                "considered": len(self.evaluations),
            },
            "selected": {"partner_id": str(selected.id), "rank": selected_rank},
            "ranked": ranked,
            "excluded": [
                {"partner_id": str(item.partner.id), "reasons": list(item.exclusions)}
                for item in self.evaluations
                if not item.included
            ],
        }


def _unit_variant_ids(unit: FulfilmentUnit) -> frozenset[str]:
    return frozenset(
        str(value)
        for value in unit.lines.filter(cart_item__isnull=False)
        .values_list("cart_item__variant_id", flat=True)
        .distinct()
    )


def evaluate_unit_candidates(unit: FulfilmentUnit) -> UnitRanking:
    """Classify every Partner in the unit's service area as ranked or excluded."""

    from apps.assignments.models import AssignmentAttempt

    required = _unit_variant_ids(unit)
    attempted = set(
        str(value)
        for value in AssignmentAttempt.objects.filter(fulfilment_unit=unit).values_list(
            "candidate_id", flat=True
        )
    )
    pool = (
        PartnerProfile.objects.filter(
            service_area_links__service_area=unit.service_area,
            service_area_links__is_active=True,
        )
        .select_related("application")
        .prefetch_related("service_links")
        .distinct()
        .order_by("id")
    )
    evaluations: list[CandidateEvaluation] = []
    for candidate in pool:
        reasons: list[str] = []
        if candidate.application.status != PartnerApplication.Status.APPROVED:
            reasons.append(ExclusionReason.APPLICATION_NOT_APPROVED)
        offered = {
            str(link.variant_id) for link in candidate.service_links.all() if link.is_active
        }
        if not required or not required.issubset(offered):
            reasons.append(ExclusionReason.VARIANT_NOT_OFFERED)
        if str(candidate.id) in attempted:
            reasons.append(ExclusionReason.ALREADY_ATTEMPTED)
        if not reasons and not partner_available_during(
            partner=candidate,
            service_area=unit.service_area,
            starts_at=unit.requested_start,
            duration_minutes=unit.estimated_duration_minutes,
        ):
            reasons.append(ExclusionReason.UNAVAILABLE_AT_START)
        evaluations.append(CandidateEvaluation(partner=candidate, exclusions=tuple(reasons)))
    return UnitRanking(evaluations=tuple(evaluations))
```

> Availability is evaluated last and only for otherwise-eligible candidates: it is the one
> check that costs a query per Partner, and a Partner excluded for the wrong service does
> not need their calendar read.

- [ ] **Step 4: Add `ranking_snapshot` to `AssignmentAttempt`**

In `backend/apps/assignments/models.py`, directly after `eligibility_snapshot`:

```python
    eligibility_snapshot = models.JSONField(default=dict)
    # Why this candidate was ordered where it was: the policy that ran, the pool it
    # considered, and a named reason for every Partner it passed over. Operations-only;
    # it is never merged into `PartnerOffer.partner_projection_snapshot`.
    ranking_snapshot = models.JSONField(default=dict)
```

- [ ] **Step 5: Persist the provenance in `group_services.py`**

Replace `_eligible_candidates` (lines 45–66) with a delegation, and record the document on the attempt inside `_create_offer`:

```python
from apps.assignments.ranking import evaluate_unit_candidates


def _eligible_candidates(unit: FulfilmentUnit) -> list[PartnerProfile]:
    return list(evaluate_unit_candidates(unit).ordered)
```

In `_create_offer`, replace the `candidates = _eligible_candidates(unit)` block with:

```python
    ranking = evaluate_unit_candidates(unit)
    candidates = list(ranking.ordered)
    if not candidates:
        _compensate_group(group, terminal_status=BookingGroup.Status.REPLAN_REQUIRED)
        return None
    candidate = selected_candidate or candidates[0]
    if candidate not in candidates:
        raise ValueError("The selected Partner is not eligible for this Fulfilment Unit.")
    attempt = AssignmentAttempt.objects.create(
        fulfilment_unit=unit,
        candidate=candidate,
        rank=attempt_count + 1,
        eligibility_snapshot={
            "service_area_id": str(unit.service_area_id),
            "variant_ids": [str(value) for value in _unit_variant_ids(unit)],
            "requested_start": unit.requested_start.isoformat(),
            "estimated_duration_minutes": unit.estimated_duration_minutes,
        },
        ranking_snapshot=ranking.provenance(unit=unit, selected=candidate),
    )
```

Leave the `_partner_available` helper in place — `accept_unit_offer` still calls it directly.

- [ ] **Step 6: Generate the migration**

```bash
backend/.venv/Scripts/python.exe manage.py makemigrations assignments
```

Expected: creates `0005_…` adding `assignmentattempt.ranking_snapshot`. Never hand-write it.

- [ ] **Step 7: Run the test to verify it passes**

```bash
backend/.venv/Scripts/python.exe -m pytest tests/assignments/test_dispatch_explainability.py -v --no-cov
```

Expected: both tests PASS.

- [ ] **Step 8: Run the whole assignments and carts suite for regressions**

```bash
backend/.venv/Scripts/python.exe -m pytest tests/assignments tests/carts -q --no-cov
```

Expected: all pass. `_eligible_candidates` now evaluates a wider pool and filters in Python; if a dispatch test's expected Partner changed, the evaluator's ordering does not match the old queryset and must be fixed in `ranking.py`, not in the test.

---

### Task 2: The Operations dispatch-explanation read endpoint

**Files:**
- Modify: `backend/apps/assignments/serializers.py`
- Create: `backend/apps/assignments/operations_views.py`
- Modify: `backend/apps/assignments/urls.py`
- Test: `backend/tests/assignments/test_dispatch_explainability.py`

**Interfaces:**
- Consumes: `AssignmentAttempt.ranking_snapshot` (Task 1).
- Produces: `GET /api/v1/operations/fulfilment-units/{unit_id}/dispatch-explanation/`, operation id `operations_fulfilment_unit_dispatch_explanation`, response `DispatchExplanation`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/assignments/test_dispatch_explainability.py`:

```python
def _operations_client(*, phone: str) -> APIClient:
    role, _created = Role.objects.get_or_create(
        code="operations",
        defaults={"name": "Operations", "is_system": True},
    )
    user = User.objects.create_user(phone_number=phone)
    UserRole.objects.create(user=user, role=role)
    return force_role_client(user=user, role_code="operations")


def test_operations_can_read_why_each_candidate_was_ordered() -> None:
    call_command("seed_technician_catalog")
    _first = _partner(suffix="84", variant_slugs=("switch-socket-repair",))
    _excluded = _partner(suffix="85", variant_slugs=("fan-installation",))
    unit = _dispatched_unit(phone=CUSTOMER, key="ops-read")
    offer = PartnerOffer.objects.get(fulfilment_unit=unit)

    response = _operations_client(phone="+919876540084").get(
        f"/api/v1/operations/fulfilment-units/{unit.id}/dispatch-explanation/"
    )

    assert response.status_code == HTTPStatus.OK
    body = response.json()
    assert body["fulfilment_unit_id"] == str(unit.id)
    assert body["policy"] == RANKING_POLICY
    attempt = body["attempts"][0]
    assert attempt["rank"] == 1
    assert attempt["partner_id"] == str(offer.partner_id)
    assert attempt["offer_status"] == PartnerOffer.Status.OFFERED
    assert attempt["ranked"][0]["factors"] == {"tiebreak_partner_id": str(offer.partner_id)}
    assert any(
        entry["reasons"] == [ExclusionReason.VARIANT_NOT_OFFERED] for entry in attempt["excluded"]
    )


def test_a_partner_session_cannot_read_the_dispatch_explanation() -> None:
    call_command("seed_technician_catalog")
    partner = _partner(suffix="86", variant_slugs=("switch-socket-repair",))
    unit = _dispatched_unit(phone=CUSTOMER, key="ops-denied")

    response = force_role_client(user=partner.user, role_code="partner").get(
        f"/api/v1/operations/fulfilment-units/{unit.id}/dispatch-explanation/"
    )

    assert response.status_code == HTTPStatus.FORBIDDEN
    assert response.json()["error"]["code"] == "permission_denied"
```

> If `_partner()` does not expose `.user`, read the Partner's user with
> `User.objects.get(partner_profile=partner)` — check `tests/carts/test_fulfilment_planning.py`
> for the helper's actual return shape before writing this line.

- [ ] **Step 2: Run to verify it fails**

```bash
backend/.venv/Scripts/python.exe -m pytest tests/assignments/test_dispatch_explainability.py -k operations -v --no-cov
```

Expected: FAIL with `404` — the route does not exist.

- [ ] **Step 3: Add the serializers**

In `backend/apps/assignments/serializers.py`:

```python
class RankedCandidateSerializer(serializers.Serializer[dict[str, object]]):
    partner_id = serializers.UUIDField()
    rank = serializers.IntegerField()
    factors = serializers.DictField(child=serializers.JSONField())


class ExcludedCandidateSerializer(serializers.Serializer[dict[str, object]]):
    partner_id = serializers.UUIDField()
    reasons = serializers.ListField(child=serializers.CharField())


class DispatchAttemptSerializer(serializers.Serializer[dict[str, object]]):
    attempt_id = serializers.UUIDField()
    rank = serializers.IntegerField()
    partner_id = serializers.UUIDField()
    created_at = serializers.DateTimeField()
    offer_status = serializers.CharField(allow_null=True)
    eligibility = serializers.DictField(child=serializers.JSONField())
    ranked = RankedCandidateSerializer(many=True)
    excluded = ExcludedCandidateSerializer(many=True)


class DispatchExplanationSerializer(serializers.Serializer[dict[str, object]]):
    fulfilment_unit_id = serializers.UUIDField()
    unit_status = serializers.CharField()
    unit_version = serializers.IntegerField()
    policy = serializers.CharField()
    policy_version = serializers.IntegerField()
    attempts = DispatchAttemptSerializer(many=True)
    server_now = serializers.DateTimeField()
```

- [ ] **Step 4: Write `operations_views.py` with the read view**

```python
"""Operations dispatch surfaces: explain a decision, then correct it.

These four operations are the human override on autonomous dispatch. Each is scoped to
`IsOperationsUser`, guarded by the Fulfilment Unit's optimistic `version`, replayable
under a stable `Idempotency-Key`, and leaves one immutable audit row behind. The
idempotency and replay handling is the same helper the Partner offer command uses —
there is one way to do this in the repo (proposal 0009) and this is it.
"""

from typing import Any, cast
from uuid import UUID

from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.assignments.models import AssignmentAttempt, PartnerOffer
from apps.assignments.ranking import RANKING_POLICY, RANKING_POLICY_VERSION
from apps.assignments.serializers import DispatchExplanationSerializer
from apps.carts.models import FulfilmentUnit
from apps.partners.permissions import IsOperationsUser
from common.errors.serializers import ApiErrorSerializer


def _attempt_projection(attempt: AssignmentAttempt) -> dict[str, Any]:
    snapshot = attempt.ranking_snapshot
    offer = getattr(attempt, "offer", None)
    return {
        "attempt_id": attempt.id,
        "rank": attempt.rank,
        "partner_id": attempt.candidate_id,
        "created_at": attempt.created_at,
        "offer_status": offer.status if offer is not None else None,
        "eligibility": attempt.eligibility_snapshot,
        "ranked": snapshot.get("ranked", []),
        "excluded": snapshot.get("excluded", []),
    }


class OperationsDispatchExplanationView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_fulfilment_unit_dispatch_explanation",
        responses={200: DispatchExplanationSerializer, 403: ApiErrorSerializer, 404: ApiErrorSerializer},
    )
    def get(self, _request: Request, unit_id: UUID) -> Response:
        unit = get_object_or_404(FulfilmentUnit, id=unit_id)
        attempts = (
            AssignmentAttempt.objects.filter(fulfilment_unit=unit)
            .select_related("offer")
            .order_by("rank")
        )
        return Response(
            DispatchExplanationSerializer(
                {
                    "fulfilment_unit_id": unit.id,
                    "unit_status": unit.status,
                    "unit_version": unit.version,
                    "policy": RANKING_POLICY,
                    "policy_version": RANKING_POLICY_VERSION,
                    "attempts": [_attempt_projection(item) for item in attempts],
                    "server_now": timezone.now(),
                }
            ).data
        )
```

- [ ] **Step 5: Route it**

In `backend/apps/assignments/urls.py`, import `OperationsDispatchExplanationView` from
`apps.assignments.operations_views` and add:

```python
    path(
        "operations/fulfilment-units/<uuid:unit_id>/dispatch-explanation/",
        OperationsDispatchExplanationView.as_view(),
    ),
```

- [ ] **Step 6: Run to verify it passes**

```bash
backend/.venv/Scripts/python.exe -m pytest tests/assignments/test_dispatch_explainability.py -v --no-cov
```

Expected: all four tests PASS.

---

### Task 3: The audit row and the three commands

**Files:**
- Modify: `backend/apps/assignments/models.py`
- Create: `backend/apps/assignments/recovery_services.py`
- Modify: `backend/apps/assignments/exceptions.py`
- Test: `backend/tests/assignments/test_dispatch_recovery_commands.py`

**Interfaces:**
- Consumes: `apps.assignments.group_services._locked_offer_context`, `_create_offer`, `_set_unit_status`, `_sync_group_state`, `_compensate_group`, `GROUP_TERMINAL_STATUSES`.
- Produces:
  - `DispatchCommandAudit` with `Command` and `Reason` text choices
  - `revoke_unit_offer(*, actor: User, offer_id: UUID, expected_unit_version: int, reason: str, note: str, idempotency_key: str) -> PartnerOffer`
  - `release_unit_reservation(*, actor: User, reservation_id: UUID, expected_unit_version: int, reason: str, note: str, idempotency_key: str) -> Reservation`
  - `recover_fulfilment_unit(*, actor: User, unit_id: UUID, expected_unit_version: int, reason: str, note: str, idempotency_key: str) -> FulfilmentUnit`
  - `DispatchVersionConflictApiError(current_version: int)`, `DispatchCommandInvalidApiError(reason: str)`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/assignments/test_dispatch_recovery_commands.py`:

```python
"""BE-07 — Operations must be able to revoke, release and recover, safely.

`REVOKED` existed only as a `PartnerOffer.Status` value that group compensation wrote in
bulk. There was no way for an Operations agent to revoke one offer, free one Partner's
held slot, or push one stuck unit back into dispatch — and therefore no authorization,
no replay protection and no audit trail on any of it.

These are consequential commands: revoking an offer takes work away from a Partner who
may already be driving to it. So each one is scoped to Operations, guarded by the unit's
version so a stale console cannot act on a decision it never saw, replayable exactly once
under a stable key, and evidenced by an immutable audit row naming the actor and reason.
"""

from datetime import timedelta
from http import HTTPStatus
from typing import Any

import pytest
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.assignments.models import DispatchCommandAudit, PartnerOffer, Reservation
from apps.carts.models import BookingGroup, FulfilmentUnit
from apps.foundation.models import IdempotencyRecord
from apps.identity.models import Role, User, UserRole
from tests.assignments.test_group_dispatch import _checkout, _partner_client, _quote
from tests.carts.test_fulfilment_planning import (
    _add_item,
    _address_payload,
    _partner,
    _plan,
)
from tests.helpers import force_role_client

pytestmark = pytest.mark.django_db(transaction=True)

CUSTOMER = "+919876543210"


def _dispatch(*, phone: str, key: str) -> tuple[FulfilmentUnit, PartnerOffer]:
    customer = User.objects.create_user(phone_number=phone)
    client = APIClient()
    client.force_authenticate(customer)
    cart_version = client.get("/api/v1/cart/").json()["version"]
    address = client.post("/api/v1/addresses/", _address_payload(), format="json")
    assert address.status_code == HTTPStatus.CREATED
    item = _add_item(client, slug="switch-socket-repair", cart_version=cart_version)
    plans = _plan(client, address_id=address.json()["id"], cart_version=int(item["version"]))
    quote = _quote(client, plans["plans"][0]["id"], key=f"{key}-quote")
    checkout = _checkout(client, quote["id"], key=f"{key}-checkout")
    group = BookingGroup.objects.get(id=checkout["booking_group"]["id"])
    unit = FulfilmentUnit.objects.get(booking_group=group)
    return unit, PartnerOffer.objects.select_related("partner").get(fulfilment_unit=unit)


def _operations_client(*, phone: str) -> APIClient:
    role, _created = Role.objects.get_or_create(
        code="operations",
        defaults={"name": "Operations", "is_system": True},
    )
    user = User.objects.create_user(phone_number=phone)
    UserRole.objects.create(user=user, role=role)
    return force_role_client(user=user, role_code="operations")


def _revoke(
    client: APIClient, offer: PartnerOffer, *, version: int, key: str
) -> tuple[int, dict[str, Any]]:
    response = client.post(
        f"/api/v1/operations/offers/{offer.id}/revoke/",
        {
            "expected_unit_version": version,
            "reason": DispatchCommandAudit.Reason.PARTNER_UNREACHABLE,
            "note": "No answer on three calls.",
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=key,
    )
    return response.status_code, response.json()


def test_revoking_a_live_offer_frees_the_unit_and_writes_one_audit_row() -> None:
    call_command("seed_technician_catalog")
    _first = _partner(suffix="90", variant_slugs=("switch-socket-repair",))
    _second = _partner(suffix="91", variant_slugs=("switch-socket-repair",))
    unit, offer = _dispatch(phone=CUSTOMER, key="revoke")
    client = _operations_client(phone="+919876540090")

    status_code, body = _revoke(client, offer, version=unit.version, key="revoke-once")

    assert status_code == HTTPStatus.OK
    assert body["status"] == PartnerOffer.Status.REVOKED
    offer.refresh_from_db()
    assert offer.status == PartnerOffer.Status.REVOKED
    # The unit is not abandoned: dispatch moves to the next candidate.
    successor = PartnerOffer.objects.exclude(id=offer.id).get(fulfilment_unit=unit)
    assert successor.partner_id != offer.partner_id
    audit = DispatchCommandAudit.objects.get(fulfilment_unit=unit)
    assert audit.command == DispatchCommandAudit.Command.REVOKE_OFFER
    assert audit.reason == DispatchCommandAudit.Reason.PARTNER_UNREACHABLE
    assert audit.offer_id == offer.id
    assert audit.before_state["offer_status"] == PartnerOffer.Status.OFFERED
    assert audit.after_state["offer_status"] == PartnerOffer.Status.REVOKED


def test_replaying_a_revoke_under_the_same_key_audits_exactly_once() -> None:
    call_command("seed_technician_catalog")
    _first = _partner(suffix="92", variant_slugs=("switch-socket-repair",))
    _second = _partner(suffix="93", variant_slugs=("switch-socket-repair",))
    unit, offer = _dispatch(phone=CUSTOMER, key="revoke-replay")
    client = _operations_client(phone="+919876540092")

    first_status, first_body = _revoke(client, offer, version=unit.version, key="revoke-key")
    replay_status, replay_body = _revoke(client, offer, version=unit.version, key="revoke-key")

    assert first_status == replay_status == HTTPStatus.OK
    assert first_body["status"] == replay_body["status"] == PartnerOffer.Status.REVOKED
    assert DispatchCommandAudit.objects.count() == 1
    assert PartnerOffer.objects.filter(fulfilment_unit=unit).count() == 2


def test_a_stale_unit_version_refuses_the_revoke_and_publishes_the_current_one() -> None:
    call_command("seed_technician_catalog")
    _first = _partner(suffix="94", variant_slugs=("switch-socket-repair",))
    unit, offer = _dispatch(phone=CUSTOMER, key="revoke-stale")
    client = _operations_client(phone="+919876540094")

    status_code, body = _revoke(client, offer, version=unit.version + 5, key="stale-key")

    assert status_code == HTTPStatus.CONFLICT
    assert body["error"]["code"] == "dispatch_version_conflict"
    assert body["error"]["details"]["current_version"] == unit.version
    assert body["error"]["retryable"] is True
    offer.refresh_from_db()
    assert offer.status == PartnerOffer.Status.OFFERED
    assert not DispatchCommandAudit.objects.exists()
    # A refused command must not burn its key: nothing happened, so a retry is allowed.
    assert not IdempotencyRecord.objects.filter(key="stale-key").exists()


def test_a_partner_session_cannot_revoke_its_own_offer() -> None:
    call_command("seed_technician_catalog")
    _first = _partner(suffix="95", variant_slugs=("switch-socket-repair",))
    unit, offer = _dispatch(phone=CUSTOMER, key="revoke-authz")

    response = _partner_client(offer.partner).post(
        f"/api/v1/operations/offers/{offer.id}/revoke/",
        {
            "expected_unit_version": unit.version,
            "reason": DispatchCommandAudit.Reason.PARTNER_UNREACHABLE,
            "note": "",
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="partner-revoke",
    )

    assert response.status_code == HTTPStatus.FORBIDDEN
    offer.refresh_from_db()
    assert offer.status == PartnerOffer.Status.OFFERED
    assert not DispatchCommandAudit.objects.exists()


def test_releasing_a_held_reservation_returns_the_unit_to_matching() -> None:
    call_command("seed_technician_catalog")
    _first = _partner(suffix="96", variant_slugs=("switch-socket-repair",))
    _second = _partner(suffix="97", variant_slugs=("switch-socket-repair",))
    unit, offer = _dispatch(phone=CUSTOMER, key="release")
    accepted = _partner_client(offer.partner).post(
        f"/api/v1/partner/offers/{offer.id}/accept/",
        HTTP_IDEMPOTENCY_KEY="release-accept",
    )
    assert accepted.status_code == HTTPStatus.OK
    reservation = Reservation.objects.get(fulfilment_unit=unit)
    unit.refresh_from_db()
    client = _operations_client(phone="+919876540096")

    response = client.post(
        f"/api/v1/operations/reservations/{reservation.id}/release/",
        {
            "expected_unit_version": unit.version,
            "reason": DispatchCommandAudit.Reason.SAFETY_CONCERN,
            "note": "Reported unsafe site.",
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="release-once",
    )

    assert response.status_code == HTTPStatus.OK
    assert response.json()["status"] == Reservation.Status.RELEASED
    reservation.refresh_from_db()
    assert reservation.status == Reservation.Status.RELEASED
    offer.refresh_from_db()
    assert offer.status == PartnerOffer.Status.REVOKED
    unit.refresh_from_db()
    assert unit.status == FulfilmentUnit.Status.MATCHING
    assert DispatchCommandAudit.objects.get().command == (
        DispatchCommandAudit.Command.RELEASE_RESERVATION
    )


def test_releasing_a_payment_pending_hold_compensates_the_whole_group() -> None:
    """All-or-nothing is the Booking Group's contract, and a release cannot break it.

    Once the group is `PAYMENT_PENDING` every unit is held and the Customer has been asked
    to pay. Freeing one unit's capacity and leaving the rest held would sell the Customer a
    booking that can no longer be delivered, so the release compensates the group to
    `REPLAN_REQUIRED` instead of silently producing a partial one.
    """
    call_command("seed_technician_catalog")
    _first = _partner(suffix="98", variant_slugs=("switch-socket-repair",))
    unit, offer = _dispatch(phone=CUSTOMER, key="release-payment")
    accepted = _partner_client(offer.partner).post(
        f"/api/v1/partner/offers/{offer.id}/accept/",
        HTTP_IDEMPOTENCY_KEY="payment-accept",
    )
    assert accepted.status_code == HTTPStatus.OK
    PartnerOffer.objects.filter(id=offer.id).update(
        undo_deadline=timezone.now() - timedelta(seconds=1)
    )
    committed = _partner_client(offer.partner).post(
        f"/api/v1/partner/offers/{offer.id}/commit/",
        HTTP_IDEMPOTENCY_KEY="payment-commit",
    )
    assert committed.status_code == HTTPStatus.OK
    reservation = Reservation.objects.get(fulfilment_unit=unit)
    unit.refresh_from_db()

    response = _operations_client(phone="+919876540098").post(
        f"/api/v1/operations/reservations/{reservation.id}/release/",
        {
            "expected_unit_version": unit.version,
            "reason": DispatchCommandAudit.Reason.SAFETY_CONCERN,
            "note": "",
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="payment-release",
    )

    assert response.status_code == HTTPStatus.OK
    reservation.refresh_from_db()
    assert reservation.status == Reservation.Status.RELEASED
    group = BookingGroup.objects.get(units=unit)
    assert group.status == BookingGroup.Status.REPLAN_REQUIRED


def test_recovering_a_unit_with_a_lapsed_offer_re_dispatches_it() -> None:
    call_command("seed_technician_catalog")
    _first = _partner(suffix="99", variant_slugs=("switch-socket-repair",))
    _second = _partner(suffix="100", variant_slugs=("switch-socket-repair",))
    unit, offer = _dispatch(phone=CUSTOMER, key="recover")
    # A lapsed offer with no sweep behind it is exactly the stuck state Operations is
    # called about: the Partner never answered and the unit is holding no one.
    PartnerOffer.objects.filter(id=offer.id).update(
        expires_at=timezone.now() - timedelta(seconds=1)
    )
    unit.refresh_from_db()

    response = _operations_client(phone="+919876540099").post(
        f"/api/v1/operations/fulfilment-units/{unit.id}/recover/",
        {
            "expected_unit_version": unit.version,
            "reason": DispatchCommandAudit.Reason.STUCK_DISPATCH,
            "note": "",
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="recover-once",
    )

    assert response.status_code == HTTPStatus.OK
    offer.refresh_from_db()
    assert offer.status == PartnerOffer.Status.EXPIRED
    successor = PartnerOffer.objects.exclude(id=offer.id).get(fulfilment_unit=unit)
    assert successor.status == PartnerOffer.Status.OFFERED
    assert response.json()["live_offer_id"] == str(successor.id)
    audit = DispatchCommandAudit.objects.get()
    assert audit.command == DispatchCommandAudit.Command.RECOVER_UNIT
    assert audit.reason == DispatchCommandAudit.Reason.STUCK_DISPATCH


def test_an_audit_row_cannot_be_rewritten() -> None:
    call_command("seed_technician_catalog")
    _first = _partner(suffix="101", variant_slugs=("switch-socket-repair",))
    _second = _partner(suffix="102", variant_slugs=("switch-socket-repair",))
    unit, offer = _dispatch(phone=CUSTOMER, key="immutable")
    client = _operations_client(phone="+919876540101")
    status_code, _body = _revoke(client, offer, version=unit.version, key="immutable-key")
    assert status_code == HTTPStatus.OK

    audit = DispatchCommandAudit.objects.get()
    audit.note = "rewritten"

    with pytest.raises(ValueError, match="immutable"):
        audit.save(update_fields=("note",))
```

- [ ] **Step 2: Run to verify they fail**

```bash
backend/.venv/Scripts/python.exe -m pytest tests/assignments/test_dispatch_recovery_commands.py -v --no-cov
```

Expected: FAIL — `ImportError: cannot import name 'DispatchCommandAudit'`.

- [ ] **Step 3: Add `DispatchCommandAudit` to `models.py`**

Append to `backend/apps/assignments/models.py`:

```python
class DispatchCommandAudit(models.Model):
    """Immutable evidence of an Operations override on autonomous dispatch.

    Revoking an offer takes work away from a Partner who may already be travelling to it,
    and releasing a hold frees capacity a Customer believes they have. Neither is
    reconstructable from the resulting state — a `REVOKED` offer looks the same whether an
    agent revoked it or group compensation did. This row is the only record of who decided,
    why, and what the unit looked like on either side of the decision.
    """

    class Command(models.TextChoices):
        REVOKE_OFFER = "REVOKE_OFFER", "Revoke offer"
        RELEASE_RESERVATION = "RELEASE_RESERVATION", "Release reservation"
        RECOVER_UNIT = "RECOVER_UNIT", "Recover fulfilment unit"

    class Reason(models.TextChoices):
        PARTNER_UNREACHABLE = "PARTNER_UNREACHABLE", "Partner unreachable"
        CUSTOMER_REQUEST = "CUSTOMER_REQUEST", "Customer request"
        SAFETY_CONCERN = "SAFETY_CONCERN", "Safety concern"
        DUPLICATE_DISPATCH = "DUPLICATE_DISPATCH", "Duplicate dispatch"
        STUCK_DISPATCH = "STUCK_DISPATCH", "Stuck dispatch"
        OPERATIONS_ERROR = "OPERATIONS_ERROR", "Operations error"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="dispatch_commands_issued",
    )
    command = models.CharField(max_length=32, choices=Command.choices)
    reason = models.CharField(max_length=32, choices=Reason.choices)
    note = models.CharField(max_length=500, blank=True)
    fulfilment_unit = models.ForeignKey(
        FulfilmentUnit,
        on_delete=models.PROTECT,
        related_name="dispatch_command_audits",
    )
    offer = models.ForeignKey(
        PartnerOffer,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="dispatch_command_audits",
    )
    reservation = models.ForeignKey(
        Reservation,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="dispatch_command_audits",
    )
    idempotency_key = models.CharField(max_length=128)
    unit_version_before = models.PositiveIntegerField()
    before_state = models.JSONField(default=dict)
    after_state = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at", "-id")
        indexes = [models.Index(fields=("fulfilment_unit", "created_at"))]

    def __str__(self) -> str:
        return f"{self.fulfilment_unit_id}:{self.command}:{self.created_at.isoformat()}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        """Refuse any write that is not the original insert.

        Audit evidence that can be edited is not evidence. The database has no rewrite
        path either — nothing in this app updates these rows — and this makes an
        accidental one fail loudly rather than silently rewriting history.
        """
        if not self._state.adding:
            raise ValueError("Dispatch command audit rows are immutable.")
        super().save(*args, **kwargs)
```

Add to the imports at the top of `models.py`:

```python
from typing import Any

from django.conf import settings
```

- [ ] **Step 4: Add the two API errors**

Append to `backend/apps/assignments/exceptions.py`:

```python
class DispatchCommandInvalidApiError(APIException):
    """The Operations command cannot apply to the dispatch state it found.

    Revoking an offer that already lapsed, releasing a reservation already released, or
    recovering a Booking Group that has reached a terminal state are all refusals of the
    same shape: the state moved before the command arrived, and re-reading is the recovery.
    """

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "dispatch_command_invalid"
    error_code = "dispatch_command_invalid"
    retryable = False

    def __init__(self, *, reason: str) -> None:
        super().__init__(detail=reason, code=self.default_code)


class DispatchVersionConflictApiError(APIException):
    """The Operations console acted on a Fulfilment Unit that had already moved.

    Unlike the other refusals this one is retryable, because the operator's intent may
    still be valid against the current state. `current_version` is published so the
    console can refetch and re-decide rather than guess.
    """

    status_code = status.HTTP_409_CONFLICT
    default_code = "dispatch_version_conflict"
    error_code = "dispatch_version_conflict"
    safe_message = "This Fulfilment Unit changed since it was read. Refresh and try again."
    retryable = True

    def __init__(self, *, current_version: int) -> None:
        super().__init__(detail=self.safe_message, code=self.default_code)
        self.api_details: dict[str, object] = {"current_version": current_version}
```

> `api_details` is the hook `common/errors/handler.py:108` reads to publish structured
> detail instead of the serialised DRF body. `apps/carts/exceptions.py` uses the same hook
> for `cart_version_conflict`; read it before writing this so the shape matches.

- [ ] **Step 5: Write `recovery_services.py`**

```python
"""Operations overrides on autonomous dispatch: revoke, release and manual recovery.

Every command here follows one shape, and it is the shape `group_services` already uses:
take the group and unit locks in the same order, guard on the unit's optimistic version,
apply the transition, re-sync the group, then write one immutable audit row inside the
same transaction. Nothing is written outside a lock and nothing is audited that did not
commit.
"""

from typing import Any
from uuid import UUID

from django.db import transaction
from django.utils import timezone

from apps.assignments.exceptions import DispatchCommandInvalidApiError, DispatchVersionConflictApiError
from apps.assignments.group_services import (
    GROUP_TERMINAL_STATUSES,
    _compensate_group,
    _create_offer,
    _locked_offer_context,
    _set_unit_status,
    _sync_group_state,
    reconcile_group_dispatch,
)
from apps.assignments.models import DispatchCommandAudit, PartnerOffer, Reservation
from apps.carts.models import BookingGroup, FulfilmentUnit
from apps.identity.models import User

# `PAYMENT_PENDING` onwards the Customer has been asked to pay for every unit at once.
# Freeing one unit's capacity there cannot leave the rest held.
GROUP_PAYMENT_STATUSES = (BookingGroup.Status.PAYMENT_PENDING,)


def _unit_state(unit: FulfilmentUnit) -> dict[str, Any]:
    offer = (
        PartnerOffer.objects.filter(
            fulfilment_unit=unit,
            status__in=(PartnerOffer.Status.OFFERED, PartnerOffer.Status.ACCEPTED_PENDING_UNDO),
        )
        .order_by("-created_at")
        .first()
    )
    reservation = (
        Reservation.objects.filter(fulfilment_unit=unit).order_by("-created_at").first()
    )
    return {
        "unit_status": unit.status,
        "unit_version": unit.version,
        "group_status": unit.booking_group.status,
        "offer_id": str(offer.id) if offer is not None else None,
        "offer_status": offer.status if offer is not None else None,
        "reservation_status": reservation.status if reservation is not None else None,
    }


def _guard_version(unit: FulfilmentUnit, expected: int) -> None:
    if unit.version != expected:
        raise DispatchVersionConflictApiError(current_version=unit.version)


def _audit(
    *,
    actor: User,
    command: str,
    reason: str,
    note: str,
    unit: FulfilmentUnit,
    offer: PartnerOffer | None,
    reservation: Reservation | None,
    idempotency_key: str,
    unit_version_before: int,
    before_state: dict[str, Any],
) -> None:
    unit.refresh_from_db()
    DispatchCommandAudit.objects.create(
        actor=actor,
        command=command,
        reason=reason,
        note=note,
        fulfilment_unit=unit,
        offer=offer,
        reservation=reservation,
        idempotency_key=idempotency_key,
        unit_version_before=unit_version_before,
        before_state=before_state,
        after_state=_unit_state(unit),
    )


@transaction.atomic
def revoke_unit_offer(
    *,
    actor: User,
    offer_id: UUID,
    expected_unit_version: int,
    reason: str,
    note: str,
    idempotency_key: str,
) -> PartnerOffer:
    """Withdraw a live offer from a Partner and hand the unit to the next candidate."""

    group, unit, offer = _locked_offer_context(offer_id)
    _guard_version(unit, expected_unit_version)
    if group.status in GROUP_TERMINAL_STATUSES:
        raise DispatchCommandInvalidApiError(
            reason="This Booking Group has already reached a terminal state."
        )
    if offer.status not in (
        PartnerOffer.Status.OFFERED,
        PartnerOffer.Status.ACCEPTED_PENDING_UNDO,
    ):
        raise DispatchCommandInvalidApiError(reason="This offer is no longer live to revoke.")
    before = _unit_state(unit)
    version_before = unit.version
    reservation_id = offer.reservation_id
    offer.status = PartnerOffer.Status.REVOKED
    offer.responded_at = timezone.now()
    offer.save(update_fields=("status", "responded_at"))
    reservation = None
    if reservation_id is not None:
        reservation = Reservation.objects.select_for_update().get(id=reservation_id)
        if reservation.status != Reservation.Status.RELEASED:
            reservation.release()
    _set_unit_status(unit, FulfilmentUnit.Status.MATCHING)
    _sync_group_state(group)
    _create_offer(group=group, unit=unit)
    _audit(
        actor=actor,
        command=DispatchCommandAudit.Command.REVOKE_OFFER,
        reason=reason,
        note=note,
        unit=unit,
        offer=offer,
        reservation=reservation,
        idempotency_key=idempotency_key,
        unit_version_before=version_before,
        before_state=before,
    )
    offer.refresh_from_db()
    return offer


@transaction.atomic
def release_unit_reservation(
    *,
    actor: User,
    reservation_id: UUID,
    expected_unit_version: int,
    reason: str,
    note: str,
    idempotency_key: str,
) -> Reservation:
    """Free a Partner's held slot, and refuse to leave a half-held Booking Group behind."""

    reservation = Reservation.objects.select_for_update().get(id=reservation_id)
    if reservation.fulfilment_unit_id is None:
        raise DispatchCommandInvalidApiError(
            reason="This is not a Fulfilment Unit reservation."
        )
    group_id = FulfilmentUnit.objects.values_list("booking_group_id", flat=True).get(
        id=reservation.fulfilment_unit_id
    )
    group = BookingGroup.objects.select_for_update().get(id=group_id)
    unit = (
        FulfilmentUnit.objects.select_for_update()
        .select_related("service_area", "booking_group", "quote_unit__quote")
        .get(id=reservation.fulfilment_unit_id)
    )
    _guard_version(unit, expected_unit_version)
    if reservation.status == Reservation.Status.RELEASED:
        raise DispatchCommandInvalidApiError(reason="This reservation is already released.")
    if group.status in GROUP_TERMINAL_STATUSES:
        raise DispatchCommandInvalidApiError(
            reason="This Booking Group has already reached a terminal state."
        )
    before = _unit_state(unit)
    version_before = unit.version
    offer = (
        PartnerOffer.objects.select_for_update().filter(reservation_id=reservation.id).first()
    )
    reservation.release()
    if offer is not None and offer.status in (
        PartnerOffer.Status.ACCEPTED_PENDING_UNDO,
        PartnerOffer.Status.COMMITTED,
    ):
        offer.status = PartnerOffer.Status.REVOKED
        offer.responded_at = timezone.now()
        offer.save(update_fields=("status", "responded_at"))
    if group.status in GROUP_PAYMENT_STATUSES:
        _compensate_group(group, terminal_status=BookingGroup.Status.REPLAN_REQUIRED)
    else:
        _set_unit_status(unit, FulfilmentUnit.Status.MATCHING)
        _sync_group_state(group)
        _create_offer(group=group, unit=unit)
    _audit(
        actor=actor,
        command=DispatchCommandAudit.Command.RELEASE_RESERVATION,
        reason=reason,
        note=note,
        unit=unit,
        offer=offer,
        reservation=reservation,
        idempotency_key=idempotency_key,
        unit_version_before=version_before,
        before_state=before,
    )
    reservation.refresh_from_db()
    return reservation


@transaction.atomic
def recover_fulfilment_unit(
    *,
    actor: User,
    unit_id: UUID,
    expected_unit_version: int,
    reason: str,
    note: str,
    idempotency_key: str,
) -> FulfilmentUnit:
    """Run the dispatch reconciliation an operator is waiting on, under audit.

    This is deliberately the same reconciliation Celery beat runs, not a second one: a
    stuck unit is almost always a sweep that has not landed yet, and giving Operations a
    divergent recovery path would create states the sweep can never reach. What the
    command adds is a named actor, a version guard and a durable record that a human
    intervened at this instant.
    """

    unit = (
        FulfilmentUnit.objects.select_for_update()
        .select_related("service_area", "booking_group", "quote_unit__quote")
        .get(id=unit_id)
    )
    _guard_version(unit, expected_unit_version)
    group = BookingGroup.objects.select_for_update().get(id=unit.booking_group_id)
    if group.status in GROUP_TERMINAL_STATUSES:
        raise DispatchCommandInvalidApiError(
            reason="This Booking Group has already reached a terminal state."
        )
    before = _unit_state(unit)
    version_before = unit.version
    reconcile_group_dispatch(group_id=group.id)
    unit.refresh_from_db()
    _audit(
        actor=actor,
        command=DispatchCommandAudit.Command.RECOVER_UNIT,
        reason=reason,
        note=note,
        unit=unit,
        offer=None,
        reservation=None,
        idempotency_key=idempotency_key,
        unit_version_before=version_before,
        before_state=before,
    )
    unit.refresh_from_db()
    return unit
```

> `_locked_offer_context`, `_create_offer`, `_set_unit_status`, `_sync_group_state` and
> `_compensate_group` are underscore-private to `group_services`. Importing them across
> modules inside the same app is deliberate — they are the app's internal lock discipline,
> and reimplementing them here would be the "second way to do it" standing rule 8 forbids.
> If ruff objects to the private import, promote the five names by dropping the underscore
> in `group_services.py` and updating its call sites — do not copy the bodies.

- [ ] **Step 6: Generate the migration and run the tests**

```bash
backend/.venv/Scripts/python.exe manage.py makemigrations assignments
backend/.venv/Scripts/python.exe -m pytest tests/assignments/test_dispatch_recovery_commands.py -v --no-cov
```

Expected: still FAIL on the HTTP routes (Task 4), but `test_an_audit_row_cannot_be_rewritten` and the model imports now resolve.

---

### Task 4: The three Operations command endpoints

**Files:**
- Modify: `backend/apps/assignments/serializers.py`
- Modify: `backend/apps/assignments/operations_views.py`
- Modify: `backend/apps/assignments/urls.py`
- Test: `backend/tests/assignments/test_dispatch_recovery_commands.py`

**Interfaces:**
- Consumes: `revoke_unit_offer`, `release_unit_reservation`, `recover_fulfilment_unit` (Task 3); `execute_idempotent` and `ResponseBody` from `apps.foundation.services`.
- Produces:
  - `POST /api/v1/operations/offers/{offer_id}/revoke/` → `Offer`
  - `POST /api/v1/operations/reservations/{reservation_id}/release/` → `DispatchReservation`
  - `POST /api/v1/operations/fulfilment-units/{unit_id}/recover/` → `FulfilmentUnitDispatch`

- [ ] **Step 1: Add the request and response serializers**

In `backend/apps/assignments/serializers.py`:

```python
class DispatchCommandRequestSerializer(serializers.Serializer[dict[str, object]]):
    expected_unit_version = serializers.IntegerField(min_value=1)
    reason = serializers.ChoiceField(choices=DispatchCommandAudit.Reason.choices)
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")


class DispatchReservationSerializer(serializers.ModelSerializer[Reservation]):
    fulfilment_unit_id = serializers.UUIDField(read_only=True, allow_null=True)
    partner_id = serializers.UUIDField(read_only=True)
    server_now = serializers.SerializerMethodField()

    class Meta:
        model = Reservation
        fields = (
            "id",
            "fulfilment_unit_id",
            "partner_id",
            "status",
            "expires_at",
            "released_at",
            "created_at",
            "server_now",
        )
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(serializers.DateTimeField())
    def get_server_now(_reservation: Reservation) -> str:
        return timezone.now().isoformat()


class FulfilmentUnitDispatchSerializer(serializers.Serializer[dict[str, object]]):
    id = serializers.UUIDField()
    position = serializers.IntegerField()
    status = serializers.CharField()
    version = serializers.IntegerField()
    group_status = serializers.CharField()
    live_offer_id = serializers.UUIDField(allow_null=True)
    live_offer_status = serializers.CharField(allow_null=True)
    reservation_status = serializers.CharField(allow_null=True)
    server_now = serializers.DateTimeField()
```

Add `from apps.assignments.models import DispatchCommandAudit, PartnerOffer, Reservation` to the
serializer imports.

- [ ] **Step 2: Add the three views to `operations_views.py`**

```python
DISPATCH_REVOKE_OPERATION = "dispatch.offer_revoke"
DISPATCH_RELEASE_OPERATION = "dispatch.reservation_release"
DISPATCH_RECOVER_OPERATION = "dispatch.unit_recover"


def _required_key(request: Request) -> str:
    key = request.headers.get("Idempotency-Key")
    if not key:
        raise ValidationError(
            {"Idempotency-Key": "This header is required."},
            code="idempotency_key_required",
        )
    return key


def _unit_dispatch_projection(unit_id: UUID) -> dict[str, Any]:
    unit = FulfilmentUnit.objects.select_related("booking_group").get(id=unit_id)
    offer = (
        PartnerOffer.objects.filter(
            fulfilment_unit=unit,
            status__in=(PartnerOffer.Status.OFFERED, PartnerOffer.Status.ACCEPTED_PENDING_UNDO),
        )
        .order_by("-created_at")
        .first()
    )
    reservation = Reservation.objects.filter(fulfilment_unit=unit).order_by("-created_at").first()
    return cast(
        dict[str, Any],
        FulfilmentUnitDispatchSerializer(
            {
                "id": unit.id,
                "position": unit.position,
                "status": unit.status,
                "version": unit.version,
                "group_status": unit.booking_group.status,
                "live_offer_id": offer.id if offer is not None else None,
                "live_offer_status": offer.status if offer is not None else None,
                "reservation_status": reservation.status if reservation is not None else None,
                "server_now": timezone.now(),
            }
        ).data,
    )


class OperationsOfferRevokeView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_offer_revoke",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=DispatchCommandRequestSerializer,
        responses={
            200: OfferSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, offer_id: UUID) -> Response:
        serializer = DispatchCommandRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        offer = get_object_or_404(PartnerOffer, id=offer_id, fulfilment_unit__isnull=False)
        user = cast(User, request.user)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            revoke_unit_offer(
                actor=user,
                offer_id=offer.id,
                expected_unit_version=serializer.validated_data["expected_unit_version"],
                reason=serializer.validated_data["reason"],
                note=serializer.validated_data["note"],
                idempotency_key=key,
            )
            return status.HTTP_200_OK, _offer_projection(offer.id)

        result = execute_idempotent(
            actor=user,
            operation=DISPATCH_REVOKE_OPERATION,
            key=key,
            request_payload={"offer_id": str(offer.id), **serializer.validated_data},
            command=command,
        )
        return _replayable(result, lambda: _offer_projection(offer.id))
```

`OperationsReservationReleaseView` and `OperationsUnitRecoverView` follow the identical
shape, differing only in: the looked-up object (`Reservation` / `FulfilmentUnit`), the
domain call, the operation constant, the request payload key
(`reservation_id` / `fulfilment_unit_id`) and the projection
(`DispatchReservationSerializer(...).data` / `_unit_dispatch_projection(unit.id)`).

The shared replay helper, which mirrors `PartnerOfferCommandView` exactly:

```python
def _replayable(
    result: CommandResult, projection: Callable[[], ResponseBody]
) -> Response:
    """Answer a replay with current truth, not the frozen body.

    Every one of these projections carries `server_now` and live deadlines. Republishing
    the stored body would hand a console a stale clock and a state that has since moved.
    """
    if not result.replayed:
        return Response(result.body, status=result.status_code)
    response = Response(projection(), status=result.status_code)
    response["Idempotent-Replay"] = "true"
    return response
```

Import `_offer_projection` from `apps.assignments.views`, and `CommandResult`,
`ResponseBody`, `execute_idempotent` from `apps.foundation.services`.

- [ ] **Step 3: Route the three commands**

```python
    path("operations/offers/<uuid:offer_id>/revoke/", OperationsOfferRevokeView.as_view()),
    path(
        "operations/reservations/<uuid:reservation_id>/release/",
        OperationsReservationReleaseView.as_view(),
    ),
    path(
        "operations/fulfilment-units/<uuid:unit_id>/recover/",
        OperationsUnitRecoverView.as_view(),
    ),
```

- [ ] **Step 4: Run the command tests**

```bash
backend/.venv/Scripts/python.exe -m pytest tests/assignments/test_dispatch_recovery_commands.py -v --no-cov
```

Expected: all eight PASS.

- [ ] **Step 5: Run the full assignments suite**

```bash
backend/.venv/Scripts/python.exe -m pytest tests/assignments -q --no-cov
```

Expected: all pass.

---

### Task 5: Concurrency hardening against real PostgreSQL

**Files:**
- Create: `backend/tests/assignments/test_dispatch_concurrency.py`

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: no production interface. If a test fails, the fix goes in `recovery_services.py` or `group_services.py` — never in the test.

**Coverage note:** the task's first race — *two partners accept the same unit simultaneously* — is already proven in `tests/assignments/test_partner_offer_commands.py` by
`test_a_second_partner_can_never_hold_a_live_offer_for_the_same_unit` (the schema forbids
two live offers per unit) and `test_concurrent_accepts_for_one_partner_capacity_produce_one_winner`
(the reachable race, decided by the GiST exclusion constraint). Do not duplicate them.
This file adds the four races that have no coverage.

- [ ] **Step 1: Write the failing tests**

```python
"""BE-07 — the races that decide dispatch, run against real PostgreSQL.

Nothing in this file is mocked. Each test opens two real connections and lets the
database arbitrate, because every one of these outcomes is decided by a lock, an
exclusion constraint or a transaction boundary — and a mock would only prove that the
test author's mental model is self-consistent.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from http import HTTPStatus
from threading import Barrier, Event
from typing import Any

import pytest
from django.core.management import call_command
from django.db import close_old_connections, connection, connections, transaction
from django.utils import timezone
from rest_framework.test import APIClient

from apps.assignments.group_services import reconcile_group_dispatch
from apps.assignments.models import DispatchCommandAudit, PartnerOffer, Reservation
from apps.assignments.recovery_services import revoke_unit_offer
from apps.carts.models import BookingGroup, FulfilmentUnit
from apps.foundation.models import IdempotencyRecord
from apps.identity.models import Role, User, UserRole
from tests.assignments.test_group_dispatch import _checkout, _partner_client, _quote
from tests.carts.test_fulfilment_planning import (
    _add_item,
    _address_payload,
    _partner,
    _plan,
)
from tests.helpers import force_role_client

pytestmark = pytest.mark.django_db(transaction=True)

CUSTOMER = "+919876543210"
RACERS = 2
```

Reuse `_dispatch` and `_operations_client` from the recovery-command test module by
importing them:

```python
from tests.assignments.test_dispatch_recovery_commands import _dispatch, _operations_client
```

Then the four tests:

```python
def test_a_revoke_and_an_accept_cannot_both_win_the_same_offer() -> None:
    """One offer, two commands, opposite intents, no application-level ordering.

    Both take `SELECT … FOR UPDATE` on the offer row, so PostgreSQL serialises them. What
    must never exist is the interleaving where the accept's reservation survives a revoke:
    a Partner holding capacity on an offer Operations withdrew.
    """
    call_command("seed_technician_catalog")
    _first = _partner(suffix="110", variant_slugs=("switch-socket-repair",))
    _second = _partner(suffix="111", variant_slugs=("switch-socket-repair",))
    unit, offer = _dispatch(phone=CUSTOMER, key="revoke-race")
    partner_client = _partner_client(offer.partner)
    operations_client = _operations_client(phone="+919876540110")
    barrier = Barrier(RACERS)

    def accept() -> int:
        close_old_connections()
        try:
            barrier.wait(timeout=15)
            return partner_client.post(
                f"/api/v1/partner/offers/{offer.id}/accept/",
                HTTP_IDEMPOTENCY_KEY="race-accept",
            ).status_code
        finally:
            connections.close_all()

    def revoke() -> int:
        close_old_connections()
        try:
            barrier.wait(timeout=15)
            return operations_client.post(
                f"/api/v1/operations/offers/{offer.id}/revoke/",
                {
                    "expected_unit_version": unit.version,
                    "reason": DispatchCommandAudit.Reason.PARTNER_UNREACHABLE,
                    "note": "",
                },
                format="json",
                HTTP_IDEMPOTENCY_KEY="race-revoke",
            ).status_code
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=RACERS) as executor:
        outcomes = [future.result(timeout=30) for future in (
            executor.submit(accept),
            executor.submit(revoke),
        )]

    offer.refresh_from_db()
    assert HTTPStatus.OK in outcomes
    if offer.status == PartnerOffer.Status.REVOKED:
        # A revoked offer never leaves a live reservation behind.
        assert not Reservation.objects.filter(
            fulfilment_unit=unit,
            status__in=(Reservation.Status.TENTATIVE, Reservation.Status.CONFIRMED),
        ).exists()
    else:
        assert offer.status == PartnerOffer.Status.ACCEPTED_PENDING_UNDO
        assert Reservation.objects.filter(fulfilment_unit=unit).count() == 1
    # Whichever lost, the audit records only commands that actually committed.
    assert DispatchCommandAudit.objects.count() <= 1


def test_an_accept_landing_exactly_as_the_offer_expires_resolves_one_way() -> None:
    """The 45-second boundary, contested rather than assumed.

    The offer expires at this instant and the reconcile sweep is running at this instant.
    Either outcome is correct; an accepted-and-expired offer, or a reservation with no
    accepted offer behind it, is not.
    """
    call_command("seed_technician_catalog")
    _first = _partner(suffix="112", variant_slugs=("switch-socket-repair",))
    _second = _partner(suffix="113", variant_slugs=("switch-socket-repair",))
    unit, offer = _dispatch(phone=CUSTOMER, key="expiry-race")
    group_id = unit.booking_group_id
    PartnerOffer.objects.filter(id=offer.id).update(expires_at=timezone.now())
    partner_client = _partner_client(offer.partner)
    barrier = Barrier(RACERS)

    def accept() -> int:
        close_old_connections()
        try:
            barrier.wait(timeout=15)
            return partner_client.post(
                f"/api/v1/partner/offers/{offer.id}/accept/",
                HTTP_IDEMPOTENCY_KEY="expiry-accept",
            ).status_code
        finally:
            connections.close_all()

    def sweep() -> int:
        close_old_connections()
        try:
            barrier.wait(timeout=15)
            reconcile_group_dispatch(group_id=group_id)
            return 0
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=RACERS) as executor:
        for future in (executor.submit(accept), executor.submit(sweep)):
            future.result(timeout=30)

    offer.refresh_from_db()
    assert offer.status in (
        PartnerOffer.Status.ACCEPTED_PENDING_UNDO,
        PartnerOffer.Status.EXPIRED,
    )
    reservations = Reservation.objects.filter(fulfilment_unit=unit)
    if offer.status == PartnerOffer.Status.EXPIRED:
        assert not reservations.filter(
            status__in=(Reservation.Status.TENTATIVE, Reservation.Status.CONFIRMED)
        ).exists()
    else:
        assert reservations.count() == 1
    # At most one live offer for the unit, whichever way it went.
    assert (
        PartnerOffer.objects.filter(
            fulfilment_unit=unit,
            status__in=(
                PartnerOffer.Status.OFFERED,
                PartnerOffer.Status.ACCEPTED_PENDING_UNDO,
            ),
        ).count()
        <= 1
    )


def test_a_payment_hold_release_and_the_expiry_sweep_do_not_double_release() -> None:
    """Two paths to freeing the same capacity, run at once.

    Operations releasing a payment-pending hold and the reconcile sweep finding that hold
    expired both end in a released reservation and a compensated group. Running together
    they must still release exactly once — a second `released_at` would mean the hold was
    freed twice and the group compensated on top of an already-compensated group.
    """
    call_command("seed_technician_catalog")
    _first = _partner(suffix="114", variant_slugs=("switch-socket-repair",))
    unit, offer = _dispatch(phone=CUSTOMER, key="hold-race")
    group_id = unit.booking_group_id
    partner_client = _partner_client(offer.partner)
    assert partner_client.post(
        f"/api/v1/partner/offers/{offer.id}/accept/",
        HTTP_IDEMPOTENCY_KEY="hold-accept",
    ).status_code == HTTPStatus.OK
    PartnerOffer.objects.filter(id=offer.id).update(
        undo_deadline=timezone.now() - timedelta(seconds=1)
    )
    assert partner_client.post(
        f"/api/v1/partner/offers/{offer.id}/commit/",
        HTTP_IDEMPOTENCY_KEY="hold-commit",
    ).status_code == HTTPStatus.OK
    reservation = Reservation.objects.get(fulfilment_unit=unit)
    Reservation.objects.filter(id=reservation.id).update(expires_at=timezone.now())
    unit.refresh_from_db()
    operations_client = _operations_client(phone="+919876540114")
    barrier = Barrier(RACERS)

    def release() -> int:
        close_old_connections()
        try:
            barrier.wait(timeout=15)
            return operations_client.post(
                f"/api/v1/operations/reservations/{reservation.id}/release/",
                {
                    "expected_unit_version": unit.version,
                    "reason": DispatchCommandAudit.Reason.SAFETY_CONCERN,
                    "note": "",
                },
                format="json",
                HTTP_IDEMPOTENCY_KEY="hold-release",
            ).status_code
        finally:
            connections.close_all()

    def sweep() -> int:
        close_old_connections()
        try:
            barrier.wait(timeout=15)
            reconcile_group_dispatch(group_id=group_id)
            return 0
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=RACERS) as executor:
        for future in (executor.submit(release), executor.submit(sweep)):
            future.result(timeout=30)

    reservation.refresh_from_db()
    assert reservation.status == Reservation.Status.RELEASED
    assert Reservation.objects.filter(fulfilment_unit=unit).count() == 1
    group = BookingGroup.objects.get(id=group_id)
    assert group.status in (
        BookingGroup.Status.REPLAN_REQUIRED,
        BookingGroup.Status.EXPIRED,
    )
    assert DispatchCommandAudit.objects.count() <= 1


def test_a_worker_killed_mid_command_commits_nothing_and_burns_no_key() -> None:
    """A real backend termination, not a raised exception standing in for one.

    The command does all of its writes, then the process holding the transaction is
    killed by PostgreSQL before `COMMIT`. Nothing may survive: not the revoked offer, not
    the audit row, and not a `COMPLETED` idempotency record — a burnt key would mean a
    retry replays a success that never happened.
    """
    call_command("seed_technician_catalog")
    _first = _partner(suffix="115", variant_slugs=("switch-socket-repair",))
    _second = _partner(suffix="116", variant_slugs=("switch-socket-repair",))
    unit, offer = _dispatch(phone=CUSTOMER, key="crash")
    actor_id = _operations_user_id(phone="+919876540115")
    ready = Event()
    killed = Event()
    backend_pids: list[int] = []

    def dying_worker() -> None:
        close_old_connections()
        try:
            with connections["default"].cursor() as cursor:
                cursor.execute("SELECT pg_backend_pid()")
                row = cursor.fetchone()
                backend_pids.append(int(row[0]))
            try:
                with transaction.atomic():
                    revoke_unit_offer(
                        actor=User.objects.get(id=actor_id),
                        offer_id=offer.id,
                        expected_unit_version=unit.version,
                        reason=DispatchCommandAudit.Reason.PARTNER_UNREACHABLE,
                        note="",
                        idempotency_key="crash-key",
                    )
                    ready.set()
                    # Hold the transaction open, uncommitted, until the backend is killed.
                    killed.wait(timeout=20)
            except Exception:  # noqa: BLE001 - the death itself is the assertion
                pass
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(dying_worker)
        assert ready.wait(timeout=20)
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_terminate_backend(%s)", [backend_pids[0]])
        killed.set()
        future.result(timeout=30)

    offer.refresh_from_db()
    assert offer.status == PartnerOffer.Status.OFFERED
    assert not DispatchCommandAudit.objects.exists()
    assert not IdempotencyRecord.objects.filter(
        key="crash-key",
        status=IdempotencyRecord.Status.COMPLETED,
    ).exists()
    assert PartnerOffer.objects.filter(fulfilment_unit=unit).count() == 1
```

Add the small helper the crash test uses:

```python
def _operations_user_id(*, phone: str) -> Any:
    role, _created = Role.objects.get_or_create(
        code="operations",
        defaults={"name": "Operations", "is_system": True},
    )
    user = User.objects.create_user(phone_number=phone)
    UserRole.objects.create(user=user, role=role)
    return user.id
```

- [ ] **Step 2: Run them**

```bash
backend/.venv/Scripts/python.exe -m pytest tests/assignments/test_dispatch_concurrency.py -v --no-cov
```

Expected on the first run: at least one failure. Do not weaken an assertion to make it
pass. Use `superpowers:systematic-debugging` — find which lock or ordering is missing and
fix `recovery_services.py` or `group_services.py`.

Two likely real defects these will surface:
1. `revoke_unit_offer` takes the group lock via `_locked_offer_context` but the Partner
   accept path (`accept_unit_offer`) takes the same locks in the same order — confirm it
   does, or a deadlock appears here rather than in production.
2. `_create_offer` called after a revoke can select the Partner who just lost the offer if
   the `ALREADY_ATTEMPTED` exclusion is not applied — Task 1's evaluator must be the only
   candidate source.

- [ ] **Step 3: Re-run the whole assignments suite**

```bash
backend/.venv/Scripts/python.exe -m pytest tests/assignments -q --no-cov
```

Expected: all pass.

---

### Task 6: Publish the contract and close the board

**Files:**
- Modify: `backend/config/settings/base.py:178`
- Regenerate: `contracts/openapi/v1.yaml`
- Modify: `contracts/openapi/CHANGELOG.md`
- Modify: `Django_Next.js_Plan/M1/02-backend-tasks.md`

- [ ] **Step 1: Bump the contract version**

`backend/config/settings/base.py` line 178: `"VERSION": "1.14.0"` → `"VERSION": "1.15.0"`.
Change nothing else in this file — the BE-OPS lane owns the Celery block below it.

- [ ] **Step 2: Regenerate the contract**

```bash
backend/.venv/Scripts/python.exe manage.py spectacular --file ../contracts/openapi/v1.yaml --validate
```

Never hand-edit the result. Confirm the diff adds exactly four paths and the new
`DispatchExplanation`, `DispatchAttempt`, `RankedCandidate`, `ExcludedCandidate`,
`DispatchCommandRequest`, `DispatchReservation` and `FulfilmentUnitDispatch` components,
and that no existing path changed.

- [ ] **Step 3: Write the changelog section**

Prepend to `contracts/openapi/CHANGELOG.md` a `## 1.15.0 - Operations dispatch override and
explainability` section covering, in prose matching the file's existing register:
the four new paths and their operation ids; that all three commands require
`Idempotency-Key` and `expected_unit_version`; the two new codes
`dispatch_command_invalid` (400, `retryable: false`) and `dispatch_version_conflict`
(409, `retryable: true`, `details.current_version`); that replay returns the current
projection and writes exactly one audit row; that `release` on a `PAYMENT_PENDING` group
compensates the group to `REPLAN_REQUIRED` rather than producing a partial hold; that
`recover` runs the same reconciliation Celery beat runs and adds an actor, a version guard
and a durable record rather than a divergent recovery path; and that the explanation
endpoint is Operations-only, bounded to the unit's service area, and discloses Partner ids
that are never published to the Partner or Customer surfaces.

- [ ] **Step 4: Flip the board lines**

In `Django_Next.js_Plan/M1/02-backend-tasks.md`, B6:
- line 324 `[~] Assignment-attempt audit records basic eligibility inputs…` → `[x]` with the
  new text naming `ranking_snapshot`, the service-area pool bound and the Operations
  endpoint, and stating plainly that no business ranking was added.
- line 353 `[ ] Complete revoke/release/manual-recovery commands…` → `[x]` naming the three
  endpoints, the version guard, the audit model and the four concurrency tests.
- line 28 in the audit snapshot: mark BE-07 remaining hardening closed.

- [ ] **Step 5: Run the full gate**

```bash
backend/scripts/quality.cmd
```

Expected: ruff format clean, ruff check clean, mypy clean, all tests pass, coverage ≥86.47%,
no migration drift, generated OpenAPI identical to the committed file.

- [ ] **Step 6: `/security-review`**

Run it over the branch diff. Pay specific attention to: whether
`OperationsDispatchExplanationView` leaks Partner identity or availability to any
non-Operations caller; whether `get_object_or_404` on the three commands can be used to
probe for ids across tenants; and whether `note` is echoed into any Partner- or
Customer-facing projection (it must not be).

- [ ] **Step 7: Commit once**

```bash
git add backend/apps/assignments backend/tests/assignments backend/config/settings/base.py contracts/openapi Django_Next.js_Plan/M1/02-backend-tasks.md docs/superpowers/plans/2026-08-05-be07-dispatch-hardening.md
git commit -m "feat(assignments): Operations dispatch override, ranking provenance and race hardening (1.15.0)"
```

Stage nothing from `apps/foundation/`, `config/celery.py`, `docs/runbooks/` or
`backend/scripts/` — those are the BE-OPS lane's uncommitted work.

---

## Self-Review

**Spec coverage**

| Task requirement | Covered by |
| --- | --- |
| Idempotency for revoke | Task 3 `revoke_unit_offer` + Task 4 view; `test_replaying_a_revoke_under_the_same_key_audits_exactly_once` |
| Idempotency for release | Task 3/4; same-key replay through `execute_idempotent`, audit-once assertion |
| Idempotency for manual recovery | Task 3/4 `recover_fulfilment_unit` |
| Same pattern as proposal 0009, not a second one | `execute_idempotent`, `_required_key`, `_replayable` all mirror `PartnerOfferCommandView` |
| Ranking explainability, Operations-readable | Task 1 `ranking_snapshot` + Task 2 endpoint |
| No opaque score with no provenance | `factors` names its one input; there is no score field |
| Two partners accept the same unit | Already covered — cited in Task 5, not duplicated |
| Accept lands as the offer expires | Task 5 test 2 |
| Payment hold and reservation expiry collide | Task 5 test 3 |
| Worker dies mid-command | Task 5 test 4, real `pg_terminate_backend` |
| Typed, versioned, idempotent, immutable audit row | `DispatchCommandRequestSerializer` (typed), `expected_unit_version` (versioned), `execute_idempotent`, `DispatchCommandAudit.save` guard |
| Celery owns every timer | Unchanged; `recover` delegates to the same `reconcile_group_dispatch` beat runs |
| Regenerate OpenAPI, update CHANGELOG | Task 6 |
| Gate: pytest, ruff, mypy, coverage ≥86.47% | Task 6 step 5 |

**Known boundary, stated rather than hidden:** the legacy Checkout-scoped dispatch path in
`services.py` keeps its existing `eligibility_snapshot` and gains no ranking provenance.
B6 re-keyed dispatch to the Fulfilment Unit and that is the live path; adding a second
explanation shape for a deprecated one would be the duplicate this plan exists to avoid.
Say so in the final report — do not let it read as complete coverage.

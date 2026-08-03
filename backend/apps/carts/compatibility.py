"""Reviewed Operations lifecycle for exact-variant compatibility rules."""

from datetime import datetime
from typing import Any
from uuid import UUID

from django.db import IntegrityError, transaction
from django.db.models import Max, QuerySet
from django.utils import timezone

from apps.carts.exceptions import (
    CompatibilityRuleActivationApiError,
    CompatibilityRuleConflictApiError,
)
from apps.carts.models import ServiceCompatibilityRule
from apps.catalog.models import ServiceVariant
from apps.identity.models import User
from apps.identity.services import record_access_event

EXPECTED_VARIANT_COUNT = 2


def _canonical_pair(left_variant_id: UUID, right_variant_id: UUID) -> tuple[UUID, UUID]:
    if left_variant_id == right_variant_id:
        raise CompatibilityRuleActivationApiError(reason="variants_must_differ")
    ordered = sorted((left_variant_id, right_variant_id), key=str)
    return ordered[0], ordered[1]


def compatibility_rules() -> QuerySet[ServiceCompatibilityRule]:
    return ServiceCompatibilityRule.objects.select_related(
        "left_variant__service",
        "right_variant__service",
        "created_by",
        "reviewed_by",
    ).order_by("left_variant_id", "right_variant_id", "-version")


@transaction.atomic
def create_compatibility_rule_draft(
    *,
    actor: User,
    left_variant_id: UUID,
    right_variant_id: UUID,
    mode: str,
    dependency: str,
    conditions: dict[str, Any],
    effective_from: datetime,
    effective_to: datetime | None,
    change_reason: str,
    request_id: str,
) -> ServiceCompatibilityRule:
    left_id, right_id = _canonical_pair(left_variant_id, right_variant_id)
    variants = {
        variant.id: variant for variant in ServiceVariant.objects.filter(id__in=(left_id, right_id))
    }
    if len(variants) != EXPECTED_VARIANT_COUNT:
        raise CompatibilityRuleActivationApiError(reason="variant_not_found")
    pair = ServiceCompatibilityRule.objects.select_for_update().filter(
        left_variant_id=left_id,
        right_variant_id=right_id,
    )
    version = (pair.aggregate(value=Max("version"))["value"] or 0) + 1
    try:
        rule = ServiceCompatibilityRule.objects.create(
            left_variant_id=left_id,
            right_variant_id=right_id,
            version=version,
            mode=mode,
            dependency=dependency,
            conditions=conditions,
            effective_from=effective_from,
            effective_to=effective_to,
            is_active=False,
            lifecycle_status=ServiceCompatibilityRule.LifecycleStatus.DRAFT,
            change_reason=change_reason,
            created_by=actor,
        )
    except IntegrityError as exc:
        raise CompatibilityRuleConflictApiError(
            reason="concurrent_version_created",
            current_version=version,
        ) from exc
    record_access_event(
        actor=actor,
        subject_user=None,
        action="operations.compatibility_rule.create_draft",
        object_type="service_compatibility_rule",
        object_id=rule.id,
        request_id=request_id,
        metadata={"version": version, "change_reason": change_reason},
    )
    return rule


def _validate_activation(rule: ServiceCompatibilityRule, *, actor: User) -> None:
    if rule.lifecycle_status != ServiceCompatibilityRule.LifecycleStatus.DRAFT:
        raise CompatibilityRuleConflictApiError(
            reason="rule_is_not_draft",
            current_version=rule.version,
        )
    if rule.created_by_id == actor.id:
        raise CompatibilityRuleActivationApiError(reason="maker_checker_required")
    if not rule.left_variant.is_active or not rule.right_variant.is_active:
        raise CompatibilityRuleActivationApiError(reason="variant_inactive")
    if rule.conditions:
        raise CompatibilityRuleActivationApiError(reason="conditions_not_supported")
    if (
        rule.mode == ServiceCompatibilityRule.Mode.PARALLEL_ALLOWED
        and rule.dependency != ServiceCompatibilityRule.Dependency.NONE
    ):
        raise CompatibilityRuleActivationApiError(reason="parallel_dependency_invalid")


@transaction.atomic
def activate_compatibility_rule(
    *,
    actor: User,
    rule_id: UUID,
    expected_version: int,
    review_reason: str,
    request_id: str,
) -> ServiceCompatibilityRule:
    rule = (
        ServiceCompatibilityRule.objects.select_for_update()
        .select_related("left_variant", "right_variant")
        .get(id=rule_id)
    )
    if rule.version != expected_version:
        raise CompatibilityRuleConflictApiError(
            reason="version_changed",
            current_version=rule.version,
        )
    _validate_activation(rule, actor=actor)
    pair_rules = list(
        ServiceCompatibilityRule.objects.select_for_update()
        .filter(
            left_variant_id=rule.left_variant_id,
            right_variant_id=rule.right_variant_id,
            lifecycle_status=ServiceCompatibilityRule.LifecycleStatus.ACTIVE,
            is_active=True,
        )
        .exclude(id=rule.id)
    )
    for current in pair_rules:
        if current.effective_to is not None and current.effective_to <= rule.effective_from:
            continue
        if current.effective_from >= rule.effective_from:
            raise CompatibilityRuleActivationApiError(reason="effective_window_overlap")
        current.effective_to = rule.effective_from
        current.save(update_fields=("effective_to",))
    now = timezone.now()
    rule.lifecycle_status = ServiceCompatibilityRule.LifecycleStatus.ACTIVE
    rule.is_active = True
    rule.reviewed_by = actor
    rule.reviewed_at = now
    rule.review_reason = review_reason
    rule.save(
        update_fields=(
            "lifecycle_status",
            "is_active",
            "reviewed_by",
            "reviewed_at",
            "review_reason",
        )
    )
    record_access_event(
        actor=actor,
        subject_user=None,
        action="operations.compatibility_rule.activate",
        object_type="service_compatibility_rule",
        object_id=rule.id,
        request_id=request_id,
        metadata={"version": rule.version, "review_reason": review_reason},
    )
    return rule


@transaction.atomic
def reject_compatibility_rule(
    *,
    actor: User,
    rule_id: UUID,
    expected_version: int,
    review_reason: str,
    request_id: str,
) -> ServiceCompatibilityRule:
    rule = ServiceCompatibilityRule.objects.select_for_update().get(id=rule_id)
    if rule.version != expected_version or (
        rule.lifecycle_status != ServiceCompatibilityRule.LifecycleStatus.DRAFT
    ):
        raise CompatibilityRuleConflictApiError(
            reason="rule_is_not_current_draft",
            current_version=rule.version,
        )
    if rule.created_by_id == actor.id:
        raise CompatibilityRuleActivationApiError(reason="maker_checker_required")
    rule.lifecycle_status = ServiceCompatibilityRule.LifecycleStatus.REJECTED
    rule.reviewed_by = actor
    rule.reviewed_at = timezone.now()
    rule.review_reason = review_reason
    rule.save(
        update_fields=(
            "lifecycle_status",
            "reviewed_by",
            "reviewed_at",
            "review_reason",
        )
    )
    record_access_event(
        actor=actor,
        subject_user=None,
        action="operations.compatibility_rule.reject",
        object_type="service_compatibility_rule",
        object_id=rule.id,
        request_id=request_id,
        metadata={"version": rule.version, "review_reason": review_reason},
    )
    return rule


@transaction.atomic
def retire_compatibility_rule(
    *,
    actor: User,
    rule_id: UUID,
    expected_version: int,
    reason: str,
    request_id: str,
) -> ServiceCompatibilityRule:
    rule = ServiceCompatibilityRule.objects.select_for_update().get(id=rule_id)
    if rule.version != expected_version or (
        rule.lifecycle_status != ServiceCompatibilityRule.LifecycleStatus.ACTIVE
    ):
        raise CompatibilityRuleConflictApiError(
            reason="rule_is_not_current_active",
            current_version=rule.version,
        )
    now = timezone.now()
    rule.lifecycle_status = ServiceCompatibilityRule.LifecycleStatus.RETIRED
    rule.is_active = False
    if now > rule.effective_from and (rule.effective_to is None or rule.effective_to > now):
        rule.effective_to = now
    rule.review_reason = reason
    rule.reviewed_by = actor
    rule.reviewed_at = now
    rule.save(
        update_fields=(
            "lifecycle_status",
            "is_active",
            "effective_to",
            "review_reason",
            "reviewed_by",
            "reviewed_at",
        )
    )
    record_access_event(
        actor=actor,
        subject_user=None,
        action="operations.compatibility_rule.retire",
        object_type="service_compatibility_rule",
        object_id=rule.id,
        request_id=request_id,
        metadata={"version": rule.version, "reason": reason},
    )
    return rule

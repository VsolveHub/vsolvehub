"""Operations services for managing service areas, postal codes, area requests, and coverage."""

from __future__ import annotations

import csv
import io
import uuid
from collections import Counter, defaultdict
from collections.abc import Sequence
from datetime import timedelta
from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Count, Prefetch, Q
from django.utils import timezone

from apps.catalog.models import Service, ServiceVariant
from apps.identity.models import User
from apps.locations.models import (
    PostalCode,
    ServiceArea,
    ServiceAreaPostalCode,
    ServiceAreaService,
    indian_postal_code_validator,
)
from apps.partners.exceptions import (
    PartnerApplicationNotFoundError,
    PartnerDomainError,
    PartnerNoScheduleToCopyError,
    PostalCodeInOtherAreaError,
    PostalCodeNotFoundError,
    ServiceAreaNotFoundError,
)
from apps.partners.models import (
    AreaSupplyTarget,
    PartnerApplication,
    PartnerAreaRequest,
    PartnerAvailabilityException,
    PartnerAvailabilityRule,
    PartnerConsent,
    PartnerProfile,
    PartnerScheduleChangeAudit,
    PartnerService,
    PartnerServiceArea,
)
from apps.partners.services.base import _notify_application_event
from apps.partners.services.schedule import _schedule_snapshot
from apps.partners.services.supply import (
    FLAG_AMBER,
    FLAG_GREEN,
    FLAG_RED,
    approved_supply,
    area_trends,
    coverage_flag,
    turned_away_by_pin,
    worst_flag,
)


def get_operations_service_areas() -> Sequence[ServiceArea]:
    """List all service areas with annotated counts and prefetched postal codes."""
    areas: list[ServiceArea] = list(
        ServiceArea.objects.annotate(
            postal_code_count=Count("postal_code_links", distinct=True),
            services_total_count=Count("service_links", distinct=True),
            services_active_count=Count(
                "service_links",
                filter=Q(service_links__is_active=True),
                distinct=True,
            ),
            partner_count=Count(
                "partner_links",
                filter=Q(
                    partner_links__is_active=True,
                    partner_links__partner__application__status=PartnerApplication.Status.APPROVED,
                ),
                distinct=True,
            ),
        )
        .prefetch_related(
            Prefetch(
                "postal_code_links",
                queryset=ServiceAreaPostalCode.objects.select_related("postal_code"),
            ),
        )
        .order_by("name"),
    )
    # "On / total" means switched on out of every service that could be offered, so a new area
    # with no links reads 0 of N rather than 0 of 0.
    offerable_total = ServiceVariant.objects.filter(
        is_active=True, service__status=Service.Status.ACTIVE
    ).count()
    for area in areas:
        area.prefetched_postal_codes = [
            link.postal_code.code for link in area.postal_code_links.all()
        ]
        area.services_total_count = max(offerable_total, area.services_total_count)  # type: ignore[attr-defined]
    return areas


def get_operations_service_area_detail(area_id: uuid.UUID | str) -> ServiceArea:
    area = (
        ServiceArea.objects.filter(id=area_id)
        .annotate(
            postal_code_count=Count("postal_code_links", distinct=True),
            services_total_count=Count("service_links", distinct=True),
            services_active_count=Count(
                "service_links",
                filter=Q(service_links__is_active=True),
                distinct=True,
            ),
            partner_count=Count(
                "partner_links",
                filter=Q(
                    partner_links__is_active=True,
                    partner_links__partner__application__status=PartnerApplication.Status.APPROVED,
                ),
                distinct=True,
            ),
        )
        .prefetch_related(
            Prefetch(
                "postal_code_links",
                queryset=ServiceAreaPostalCode.objects.select_related("postal_code").order_by(
                    "postal_code__code"
                ),
            ),
            Prefetch(
                "service_links",
                queryset=ServiceAreaService.objects.select_related(
                    "variant__service__subcategory__category"
                ).order_by("variant__name"),
            ),
        )
        .first()
    )
    if not area:
        raise ServiceAreaNotFoundError
    area.prefetched_postal_codes = [link.postal_code.code for link in area.postal_code_links.all()]
    # Every service that can be offered, switched on or not. A new area has no links yet, so
    # listing only links would leave Operations unable to switch anything on.
    offerable = _offerable_services(area)
    area.offerable_services = offerable  # type: ignore[attr-defined]
    area.services_total_count = len(offerable)
    area.services_active_count = len([item for item in offerable if item["is_active"]])
    return area


def _offerable_services(area: ServiceArea) -> list[dict[str, Any]]:
    links = {link.variant_id: link for link in area.service_links.all()}
    variants = (
        ServiceVariant.objects.filter(
            Q(is_active=True, service__status=Service.Status.ACTIVE) | Q(id__in=list(links)),
        )
        .select_related("service__subcategory__category")
        .order_by("name")
    )
    items: list[dict[str, Any]] = []
    for variant in variants:
        link = links.get(variant.id)
        trade_name = "General"
        subcategory = variant.service.subcategory if variant.service_id else None
        if subcategory is not None and subcategory.category_id:
            trade_name = subcategory.category.name
        items.append(
            {
                "variant_id": variant.id,
                "variant_name": variant.name,
                "trade_name": trade_name,
                "skill_code": variant.required_skill_code,
                "is_active": bool(link and link.is_active),
            }
        )
    return items


@transaction.atomic
def create_service_area(
    *,
    slug: str,
    name: str,
    zone: str = "",
    state_code: str = "",
    timezone_name: str = "Asia/Kolkata",
    is_accepting_partners: bool = True,
    is_active: bool = True,
    actor: User | None = None,
) -> ServiceArea:
    del actor
    if ServiceArea.objects.filter(slug=slug).exists():
        raise PartnerDomainError(
            code="service_area_slug_exists",
            message=f"A service area with slug '{slug}' already exists.",
            status_code=400,
        )
    return ServiceArea.objects.create(
        slug=slug,
        name=name,
        zone=zone,
        state_code=state_code,
        timezone=timezone_name,
        is_accepting_partners=is_accepting_partners,
        is_active=is_active,
    )


@transaction.atomic
def update_service_area(
    *,
    area_id: uuid.UUID | str,
    name: str | None = None,
    zone: str | None = None,
    state_code: str | None = None,
    timezone_name: str | None = None,
    is_accepting_partners: bool | None = None,
    is_active: bool | None = None,
    actor: User | None = None,
) -> ServiceArea:
    del actor
    area = ServiceArea.objects.filter(id=area_id).first()
    if not area:
        raise ServiceAreaNotFoundError

    if name is not None:
        area.name = name
    if zone is not None:
        area.zone = zone
    if state_code is not None:
        area.state_code = state_code
    if timezone_name is not None:
        area.timezone = timezone_name
    if is_accepting_partners is not None:
        area.is_accepting_partners = is_accepting_partners
    if is_active is not None:
        area.is_active = is_active

    area.save()
    return get_operations_service_area_detail(area.id)


@transaction.atomic
def add_pin_to_service_area(
    *,
    area_id: uuid.UUID | str,
    postal_code: str,
    city: str = "",
    state: str = "",
    actor: User | None = None,
) -> ServiceAreaPostalCode:
    del actor
    area = ServiceArea.objects.filter(id=area_id).first()
    if not area:
        raise ServiceAreaNotFoundError

    clean_pin = postal_code.strip()
    try:
        indian_postal_code_validator(clean_pin)
    except ValidationError as exc:
        raise PartnerDomainError(
            code="invalid_postal_code",
            message="Enter a valid six-digit Indian postal code.",
            status_code=400,
        ) from exc

    pc = PostalCode.objects.filter(code=clean_pin).first()
    if not pc:
        if not (city.strip() and state.strip()):
            raise PostalCodeNotFoundError(clean_pin)
        pc = PostalCode.objects.create(
            code=clean_pin,
            city=city.strip(),
            state=state.strip(),
            country_code="IN",
            is_active=True,
        )

    existing = (
        ServiceAreaPostalCode.objects.filter(postal_code=pc)
        .exclude(service_area_id=area.id)
        .select_related("service_area")
        .first()
    )
    if existing:
        raise PostalCodeInOtherAreaError(
            postal_code=clean_pin,
            area_id=existing.service_area_id,
            area_name=existing.service_area.name,
        )

    link, _ = ServiceAreaPostalCode.objects.get_or_create(
        service_area=area,
        postal_code=pc,
    )
    return link


@transaction.atomic
def remove_pin_from_service_area(
    *,
    area_id: uuid.UUID | str,
    postal_code: str,
    actor: User | None = None,
) -> bool:
    del actor
    area = ServiceArea.objects.filter(id=area_id).first()
    if not area:
        raise ServiceAreaNotFoundError

    deleted, _ = ServiceAreaPostalCode.objects.filter(
        service_area=area,
        postal_code__code=postal_code.strip(),
    ).delete()
    return deleted > 0


@transaction.atomic
def toggle_service_area_service(
    *,
    area_id: uuid.UUID | str,
    variant_id: uuid.UUID | str | None = None,
    variant_ids: list[uuid.UUID | str] | None = None,
    is_active: bool,
    actor: User | None = None,
) -> None:
    del actor
    area = ServiceArea.objects.filter(id=area_id).first()
    if not area:
        raise ServiceAreaNotFoundError

    ids: list[uuid.UUID | str] = []
    if variant_ids:
        ids.extend(variant_ids)
    if variant_id:
        ids.append(variant_id)

    if not ids:
        raise PartnerDomainError(
            code="service_variant_not_found",
            message="No service variants specified.",
            status_code=400,
        )

    valid_variants = list(ServiceVariant.objects.filter(id__in=ids))
    if not valid_variants:
        raise PartnerDomainError(
            code="service_variant_not_found",
            message="Service variant not found.",
            status_code=404,
        )

    existing_links = {
        link.variant_id: link
        for link in ServiceAreaService.objects.filter(service_area=area, variant__in=valid_variants)
    }

    to_update = []
    to_create = []
    for variant in valid_variants:
        if variant.id in existing_links:
            link = existing_links[variant.id]
            if link.is_active != is_active:
                link.is_active = is_active
                to_update.append(link)
        else:
            to_create.append(ServiceAreaService(service_area=area, variant=variant, is_active=is_active))

    if to_update:
        ServiceAreaService.objects.bulk_update(to_update, fields=["is_active"])
    if to_create:
        ServiceAreaService.objects.bulk_create(to_create)


def _parse_csv_rows(csv_content: str) -> list[dict[str, str]]:
    f = io.StringIO(csv_content.strip())
    reader = csv.DictReader(f)
    rows: list[dict[str, str]] = []
    if not reader.fieldnames:
        return rows
    # Standardize column headers
    header_map = {name.lower().strip(): name for name in reader.fieldnames if name}
    pin_col = header_map.get("pin") or header_map.get("postal_code") or header_map.get("code")
    slug_col = header_map.get("area_slug") or header_map.get("slug") or header_map.get("area")
    city_col = header_map.get("city")
    state_col = header_map.get("state")

    for row in reader:
        pin = row.get(pin_col, "").strip() if pin_col else ""
        slug = row.get(slug_col, "").strip() if slug_col else ""
        city = row.get(city_col, "").strip() if city_col else ""
        state = row.get(state_col, "").strip() if state_col else ""
        if pin and slug:
            rows.append({"pin": pin, "area_slug": slug, "city": city, "state": state})
    return rows


def preview_bulk_pins(
    *,
    csv_content: str = "",
    rows: Sequence[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    items: list[dict[str, str]] = []
    if csv_content:
        items = _parse_csv_rows(csv_content)
    elif rows:
        for r in rows:
            items.append(
                {
                    "pin": str(r.get("pin", "")).strip(),
                    "area_slug": str(r.get("area_slug", "")).strip(),
                    "city": str(r.get("city", "")).strip(),
                    "state": str(r.get("state", "")).strip(),
                }
            )

    total = len(items)
    add_count = 0
    same_count = 0
    conflict_count = 0
    invalid_count = 0
    unknown_area_count = 0
    unknown_pin_count = 0

    conflicts: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []

    areas_by_slug = {a.slug: a for a in ServiceArea.objects.all()}
    existing_postal_codes = {pc.code: pc for pc in PostalCode.objects.all()}
    existing_links = {
        (link.postal_code.code, link.service_area.slug): link
        for link in ServiceAreaPostalCode.objects.select_related(
            "postal_code", "service_area"
        ).all()
    }
    pin_to_area_link = {
        link.postal_code.code: link
        for link in ServiceAreaPostalCode.objects.select_related(
            "postal_code", "service_area"
        ).all()
    }

    for row_idx, item in enumerate(items, start=1):
        pin = item["pin"]
        slug = item["area_slug"]
        city = item["city"]
        state = item["state"]

        try:
            indian_postal_code_validator(pin)
        except ValidationError:
            invalid_count += 1
            errors.append({"row": row_idx, "pin": pin, "reason": "Invalid 6-digit postal code."})
            continue

        target_area = areas_by_slug.get(slug)
        if not target_area:
            unknown_area_count += 1
            errors.append({"row": row_idx, "pin": pin, "reason": f"Unknown area slug '{slug}'."})
            continue

        pc = existing_postal_codes.get(pin)
        if not pc and not (city and state):
            unknown_pin_count += 1
            errors.append(
                {
                    "row": row_idx,
                    "pin": pin,
                    "reason": "Unknown PIN: city and state required to register new PIN.",
                }
            )
            continue

        if (pin, slug) in existing_links:
            same_count += 1
            continue

        current_link = pin_to_area_link.get(pin)
        if current_link and current_link.service_area_id != target_area.id:
            conflict_count += 1
            conflicts.append(
                {
                    "pin": pin,
                    "target_area_slug": slug,
                    "target_area_id": str(target_area.id),
                    "current_area_slug": current_link.service_area.slug,
                    "current_area_id": str(current_link.service_area.id),
                    "current_area_name": current_link.service_area.name,
                }
            )
            continue

        add_count += 1

    return {
        "total": total,
        "add": add_count,
        "same": same_count,
        "conflict": conflict_count,
        "invalid": invalid_count,
        "unknown_area": unknown_area_count,
        "unknown_pin": unknown_pin_count,
        "conflicts": conflicts,
        "row_errors": errors,
    }


@transaction.atomic
def apply_bulk_pins(
    *,
    csv_content: str = "",
    rows: Sequence[dict[str, Any]] | None = None,
    conflict_resolutions: dict[str, str] | None = None,
    actor: User | None = None,
) -> dict[str, Any]:
    del actor
    resolutions = conflict_resolutions or {}
    items: list[dict[str, str]] = []
    if csv_content:
        items = _parse_csv_rows(csv_content)
    elif rows:
        for r in rows:
            items.append(
                {
                    "pin": str(r.get("pin", "")).strip(),
                    "area_slug": str(r.get("area_slug", "")).strip(),
                    "city": str(r.get("city", "")).strip(),
                    "state": str(r.get("state", "")).strip(),
                }
            )

    added = 0
    moved = 0
    skipped = 0
    created_postal_codes = 0
    errors: list[dict[str, Any]] = []

    areas_by_slug = {a.slug: a for a in ServiceArea.objects.all()}

    for row_idx, item in enumerate(items, start=1):
        pin = item["pin"]
        slug = item["area_slug"]
        city = item["city"]
        state = item["state"]

        try:
            indian_postal_code_validator(pin)
        except ValidationError:
            errors.append({"row": row_idx, "pin": pin, "reason": "Invalid postal code."})
            continue

        target_area = areas_by_slug.get(slug)
        if not target_area:
            errors.append({"row": row_idx, "pin": pin, "reason": f"Unknown area slug '{slug}'."})
            continue

        pc = PostalCode.objects.filter(code=pin).first()
        if pc is None:
            # Same rule as the preview: a PIN we have never loaded needs its city and state.
            if not (city and state):
                errors.append(
                    {
                        "row": row_idx,
                        "pin": pin,
                        "reason": "Unknown PIN: city and state required to register new PIN.",
                    }
                )
                continue
            pc = PostalCode.objects.create(
                code=pin, city=city, state=state, country_code="IN", is_active=True
            )
            created_postal_codes += 1

        existing_links = list(
            ServiceAreaPostalCode.objects.filter(postal_code=pc).select_related("service_area"),
        )
        in_target = any(link.service_area_id == target_area.id for link in existing_links)
        if in_target:
            skipped += 1
            continue

        other_links = [
            existing_link
            for existing_link in existing_links
            if existing_link.service_area_id != target_area.id
        ]
        if other_links:
            action = resolutions.get(pin, "SKIP")
            if action == "MOVE":
                ServiceAreaPostalCode.objects.filter(postal_code=pc).delete()
                ServiceAreaPostalCode.objects.create(service_area=target_area, postal_code=pc)
                moved += 1
            else:
                skipped += 1
            continue

        ServiceAreaPostalCode.objects.create(service_area=target_area, postal_code=pc)
        added += 1

    return {
        "added": added,
        "moved": moved,
        "skipped": skipped,
        "created_postal_codes": created_postal_codes,
        "row_errors": errors,
    }


# --- Area Requests Services ---


def _partner_holds_covering_area(
    request: PartnerAreaRequest,
    pin_area_ids: set[uuid.UUID],
) -> bool:
    """Done: the asking partner already holds an active area that covers the PIN."""
    held = {
        link.service_area_id
        for link in request.application.partner.service_area_links.all()
        if link.is_active
    }
    return bool(held & pin_area_ids)


def _resolve_group_status(
    pin_reqs: list[PartnerAreaRequest],
    covering_area: ServiceArea | None,
    *,
    has_open: bool = True,
) -> str:
    if all(r.dismissed_at is not None for r in pin_reqs):
        return "NOT_VALID"
    if not has_open:
        return "DONE"
    if covering_area:
        return "READY" if covering_area.is_accepting_partners else "AREA_FULL"
    return "WAITING"


def get_operations_area_requests(
    *,
    status_filter: str | None = None,
    trade_filter: str | None = None,
    search: str = "",
) -> list[dict[str, Any]]:
    """Grouped partner area requests with live status and active requesting trade counts."""
    all_requests = list(
        PartnerAreaRequest.objects.select_related(
            "application__partner",
        )
        .prefetch_related(
            "application__partner__skill_links__skill",
            "application__partner__service_links__variant__service__subcategory__category",
            "application__partner__service_area_links",
        )
        .order_by("postal_code", "-created_at"),
    )

    postal_codes_set = {r.postal_code for r in all_requests}
    known_pcs = {pc.code: pc for pc in PostalCode.objects.filter(code__in=postal_codes_set)}
    links_by_pin: dict[str, list[ServiceArea]] = defaultdict(list)
    for link in ServiceAreaPostalCode.objects.filter(
        service_area__is_active=True,
        postal_code__code__in=postal_codes_set,
    ).select_related("service_area", "postal_code"):
        links_by_pin[link.postal_code.code].append(link.service_area)

    lookups_by_pin = turned_away_by_pin(postal_codes_set)

    by_pin: dict[str, list[PartnerAreaRequest]] = defaultdict(list)
    for req in all_requests:
        by_pin[req.postal_code].append(req)

    results: list[dict[str, Any]] = []

    for pin, pin_reqs in by_pin.items():
        pc = known_pcs.get(pin)
        place = pc.city if pc else None
        state = pc.state if pc else None
        in_pin_list = pc is not None

        # A PIN can sit in two areas: prefer one that is open to partners, then the first by name.
        pin_areas = sorted(
            links_by_pin.get(pin, []),
            key=lambda a: (not a.is_accepting_partners, a.name),
        )
        covering_area = pin_areas[0] if pin_areas else None
        pin_area_ids = {a.id for a in pin_areas}
        open_reqs = [
            r
            for r in pin_reqs
            if r.dismissed_at is None and not _partner_holds_covering_area(r, pin_area_ids)
        ]
        covering_area_id = covering_area.id if covering_area else None
        covering_area_name = covering_area.name if covering_area else None

        live_status = _resolve_group_status(pin_reqs, covering_area, has_open=bool(open_reqs))

        # Done requests are not demand: Operations lists leave them out unless asked for.
        if live_status == "DONE" and (not status_filter or status_filter.upper() == "ALL"):
            continue
        counted_reqs = open_reqs or pin_reqs

        # Check if partners who asked already have an area covering it -> DONE
        # For the group summary, we report WAITING / READY / AREA_FULL / NOT_VALID
        trade_counter: Counter[tuple[str, str]] = Counter()
        for r in counted_reqs:
            for s in r.application.partner.skill_links.all():
                if s.is_active:
                    trade_counter[(s.skill.code, s.skill.name)] += 1

        trade_counts = [
            {"trade_name": name, "skill_code": code, "count": count}
            for (code, name), count in trade_counter.most_common()
        ]
        trade_names = [name for (_code, name), _ in trade_counter.most_common()]

        first_created = min(r.created_at for r in counted_reqs)
        latest_created = max(r.created_at for r in counted_reqs)
        notified_dates = [r.notified_at for r in counted_reqs if r.notified_at]
        latest_notified = max(notified_dates) if notified_dates else None

        # Search filter
        if search:
            query = search.lower().strip()
            if query not in pin and (not place or query not in place.lower()):
                continue

        # Status filter
        if (
            status_filter
            and status_filter != "ALL"
            and live_status.upper() != status_filter.upper()
        ):
            continue

        # Trade filter
        if (
            trade_filter
            and trade_filter != "ALL"
            and trade_filter.lower() not in [t.lower() for t in trade_names]
        ):
            continue

        results.append(
            {
                "postal_code": pin,
                "place": place,
                "state": state,
                "in_pin_list": in_pin_list,
                "status": live_status,
                "covering_area_id": covering_area_id,
                "covering_area_name": covering_area_name,
                "request_count": len(counted_reqs),
                "trades": trade_names,
                "trade_counts": trade_counts,
                "first_requested_at": first_created,
                "latest_requested_at": latest_created,
                "notified_at": latest_notified,
                "customer_lookups_28d": lookups_by_pin.get(pin, 0),
            }
        )

    return sorted(results, key=lambda x: (-x["request_count"], x["postal_code"]))


@transaction.atomic
def notify_area_requests(
    *,
    postal_code: str,
    actor: User | None = None,
) -> dict[str, Any]:
    """Notify all partners with open requests for a postal code."""
    clean_pin = postal_code.strip()
    requests = list(
        PartnerAreaRequest.objects.filter(
            postal_code=clean_pin,
            dismissed_at__isnull=True,
        ).select_related("application__partner__user"),
    )

    # Only an area that is open to partners can be announced. Telling someone "we now work in
    # your area" for an area that is full, or does not exist, would be wrong.
    covering_areas = sorted(
        (
            link.service_area
            for link in ServiceAreaPostalCode.objects.filter(
                postal_code__code=clean_pin,
                service_area__is_active=True,
                service_area__is_accepting_partners=True,
            ).select_related("service_area")
        ),
        key=lambda a: a.name,
    )
    if not covering_areas:
        raise PartnerDomainError(
            code="area_request_not_ready",
            message="No open service area covers this PIN yet, so there is nothing to announce.",
            status_code=409,
        )
    area = covering_areas[0]
    area_ids = {a.id for a in covering_areas}

    now = timezone.now()
    notified_applications: list[dict[str, Any]] = []
    skipped_applications: list[dict[str, Any]] = []

    for req in requests:
        app = req.application
        holds = PartnerServiceArea.objects.filter(
            partner=app.partner, service_area_id__in=area_ids, is_active=True
        ).exists()
        if holds:
            # Done on its own: they already work there.
            continue

        if app.status in (
            PartnerApplication.Status.DRAFT,
            PartnerApplication.Status.CHANGES_REQUIRED,
        ):
            template_code = "area-opened-draft"
        elif app.status in (
            PartnerApplication.Status.SUBMITTED,
            PartnerApplication.Status.UNDER_REVIEW,
        ):
            template_code = "area-ready-in-review"
        elif app.status == PartnerApplication.Status.APPROVED:
            # FLOW.md section 2: an approved partner gets the area added with their usual hours,
            # and is told once it is true (the add itself sends the message).
            try:
                with transaction.atomic():
                    add_area_to_approved_partner(
                        partner_id=app.partner_id,
                        service_area_id=area.id,
                        actor=actor,
                    )
            except PartnerDomainError as exc:
                skipped_applications.append(
                    {"application_id": str(app.id), "status": app.status, "reason": exc.code}
                )
                continue
            req.notified_at = now
            req.save(update_fields=["notified_at"])
            notified_applications.append(
                {
                    "application_id": str(app.id),
                    "status": app.status,
                    "template_code": "area-added-approved",
                }
            )
            continue
        else:
            continue

        req.notified_at = now
        req.save(update_fields=["notified_at"])
        _notify_application_event(
            application=app,
            template_code=template_code,
            purpose="area_opened",
            idempotency_key=f"area-notify-{clean_pin}-{app.id}-{now.date().isoformat()}",
            context={"postal_code": clean_pin, "area_name": area.name},
        )
        notified_applications.append(
            {
                "application_id": str(app.id),
                "status": app.status,
                "template_code": template_code,
            }
        )

    return {
        "postal_code": clean_pin,
        "notified_count": len(notified_applications),
        "notified_applications": notified_applications,
        "skipped_applications": skipped_applications,
    }


@transaction.atomic
def dismiss_area_requests(
    *,
    postal_code: str = "",
    request_id: uuid.UUID | str | None = None,
    application_id: uuid.UUID | str | None = None,
    actor: User | None = None,
) -> int:
    """Dismiss request(s) ('Mark not valid')."""
    now = timezone.now()
    qs = PartnerAreaRequest.objects.filter(dismissed_at__isnull=True)
    if request_id:
        qs = qs.filter(id=request_id)
    elif postal_code:
        qs = qs.filter(postal_code=postal_code.strip())
        if application_id:
            qs = qs.filter(application_id=uuid.UUID(str(application_id)))
    else:
        return 0

    count = qs.update(dismissed_at=now, dismissed_by=actor)
    return count


# --- Add Area to Approved Partner ---


@transaction.atomic
def add_area_to_approved_partner(
    *,
    partner_id: uuid.UUID | str,
    service_area_id: uuid.UUID | str,
    reason: str = "Area opened for partner",
    actor: User | None = None,
) -> dict[str, Any]:
    del reason
    partner = PartnerProfile.objects.select_for_update().filter(id=partner_id).first()
    if not partner or not partner.application:
        raise PartnerApplicationNotFoundError

    if partner.application.status != PartnerApplication.Status.APPROVED:
        raise PartnerDomainError(
            code="partner_not_approved",
            message="Area can only be added directly to an approved partner.",
            status_code=400,
        )

    area = ServiceArea.objects.filter(id=service_area_id, is_active=True).first()
    if not area:
        raise ServiceAreaNotFoundError

    # Check that area offers at least one of the partner's active variants
    partner_variant_ids = set(
        PartnerService.objects.filter(partner=partner, is_active=True).values_list(
            "variant_id", flat=True
        ),
    )
    area_variant_ids = set(
        ServiceAreaService.objects.filter(service_area=area, is_active=True).values_list(
            "variant_id", flat=True
        ),
    )
    if partner_variant_ids and not (partner_variant_ids & area_variant_ids):
        raise PartnerDomainError(
            code="area_trade_mismatch",
            message=f"Service area '{area.name}' does not offer any of this partner's services.",
            status_code=400,
        )

    # Link partner to area
    _link, _ = PartnerServiceArea.objects.update_or_create(
        partner=partner,
        service_area=area,
        defaults={"is_active": True},
    )

    # Copy schedule rules (gap 9):
    # Find active area with the most active weekly availability rules
    area_rule_counts = list(
        PartnerAvailabilityRule.objects.filter(
            partner=partner,
            is_active=True,
        )
        .values("service_area_id")
        .annotate(count=Count("id"))
        .order_by("-count"),
    )

    if not area_rule_counts:
        raise PartnerNoScheduleToCopyError

    source_area_id = area_rule_counts[0]["service_area_id"]
    source_rules = list(
        PartnerAvailabilityRule.objects.filter(
            partner=partner,
            service_area_id=source_area_id,
            is_active=True,
        ),
    )

    previous_schedule = _schedule_snapshot(partner=partner)

    # Delete existing rules for this area if any, then copy
    PartnerAvailabilityRule.objects.filter(partner=partner, service_area=area).delete()
    new_rules = [
        PartnerAvailabilityRule(
            partner=partner,
            service_area=area,
            weekday=r.weekday,
            starts_at=r.starts_at,
            ends_at=r.ends_at,
            ends_next_day=r.ends_next_day,
            is_active=True,
        )
        for r in source_rules
    ]
    PartnerAvailabilityRule.objects.bulk_create(new_rules)

    # Copy active exceptions too
    source_exceptions = list(
        PartnerAvailabilityException.objects.filter(
            partner=partner,
            service_area_id=source_area_id,
        ),
    )
    PartnerAvailabilityException.objects.filter(partner=partner, service_area=area).delete()
    new_exceptions = [
        PartnerAvailabilityException(
            partner=partner,
            service_area=area,
            date=e.date,
            is_available=e.is_available,
            starts_at=e.starts_at,
            ends_at=e.ends_at,
            ends_next_day=e.ends_next_day,
            reason=e.reason,
        )
        for e in source_exceptions
    ]
    PartnerAvailabilityException.objects.bulk_create(new_exceptions)

    updated_schedule = _schedule_snapshot(partner=partner)

    # Audit evidence
    consent = (
        PartnerConsent.objects.filter(
            partner=partner,
            withdrawn_at__isnull=True,
        )
        .order_by("-accepted_at")
        .first()
    )
    if consent and actor:
        PartnerScheduleChangeAudit.objects.create(
            partner=partner,
            actor=actor,
            consent=consent,
            previous_schedule=previous_schedule,
            updated_schedule=updated_schedule,
        )

    # Notify partner
    _notify_application_event(
        application=partner.application,
        template_code="area-added-approved",
        purpose="area_added",
        idempotency_key=f"partner-add-area-{partner.id}-{area.id}",
        context={
            "postal_code": area.name,
            "area_name": area.name,
        },
    )

    return {
        "status": "added",
        "service_area_id": str(area.id),
        "service_area_name": area.name,
        "rules_copied_count": len(new_rules),
        "exceptions_copied_count": len(new_exceptions),
    }


# --- Coverage Lite Service ---


def _area_supply(
    *,
    area_targets: list[AreaSupplyTarget],
    approved_here: int,
    approved_by_trade: dict[tuple[uuid.UUID, uuid.UUID], int],
    area_id: uuid.UUID,
) -> dict[str, Any]:
    """An area's approved partners against its targets, with the flag Operations acts on."""
    overall_target = next((t for t in area_targets if t.skill_id is None), None)
    trade_targets = []
    for target in area_targets:
        if target.skill is None or target.skill_id is None:
            continue
        approved_trade = approved_by_trade.get((area_id, target.skill_id), 0)
        trade_targets.append(
            {
                "skill_code": target.skill.code,
                "skill_name": target.skill.name,
                "target_partners": target.target_partners,
                "alert_below": target.alert_below,
                "approved_partners": approved_trade,
                "flag": coverage_flag(approved_trade, target.target_partners, target.alert_below),
            }
        )
    own_flag = coverage_flag(
        approved_here,
        overall_target.target_partners if overall_target else None,
        overall_target.alert_below if overall_target else None,
    )
    return {
        "approved_partners": approved_here,
        "target_partners": overall_target.target_partners if overall_target else None,
        "alert_below": overall_target.alert_below if overall_target else None,
        # A red trade makes the whole area at least that urgent.
        "flag": worst_flag([own_flag, *(str(t["flag"]) for t in trade_targets)]),
        "trade_targets": trade_targets,
    }


def _platform_trend(area_items: list[dict[str, Any]], weeks: int) -> list[int | None]:
    """Sum of the shown areas per week; a week no area has a snapshot for stays None."""
    series: list[int | None] = []
    for index in range(weeks):
        values = [item["trend"][index] for item in area_items if item["trend"][index] is not None]
        series.append(sum(values) if values else None)
    return series


def get_operations_coverage_lite(
    *,
    zone_filter: str | None = None,
    trade_filter: str | None = None,
) -> dict[str, Any]:
    """Aggregated coverage metrics per area and across the platform."""
    areas_qs = ServiceArea.objects.all().order_by("zone", "name")
    if zone_filter:
        areas_qs = areas_qs.filter(zone__iexact=zone_filter)

    areas_list = list(
        areas_qs.prefetch_related(
            "postal_code_links__postal_code",
            "partner_links__partner__application",
            "partner_links__partner__skill_links__skill",
        ),
    )

    # Open asked PINs by PIN and area
    open_requests = (
        PartnerAreaRequest.objects.filter(dismissed_at__isnull=True)
        .values("postal_code")
        .annotate(count=Count("id"))
    )
    open_asked_by_pin = {r["postal_code"]: r["count"] for r in open_requests}

    since = timezone.now() - timedelta(days=28)
    from apps.assignments.models import PartnerOffer  # noqa: PLC0415
    from apps.commerce.models import Booking  # noqa: PLC0415

    bookings_by_area = {
        row["fulfilment_unit__service_area_id"]: row["n"]
        for row in Booking.objects.filter(created_at__gte=since)
        .values("fulfilment_unit__service_area_id")
        .annotate(n=Count("id"))
    }
    expiries_by_area = {
        row["fulfilment_unit__service_area_id"]: row["n"]
        for row in PartnerOffer.objects.filter(
            status=PartnerOffer.Status.EXPIRED, created_at__gte=since
        )
        .values("fulfilment_unit__service_area_id")
        .annotate(n=Count("id"))
    }

    # Phase 2: supply against target, customers turned away, and the 12-week trend.
    area_ids = [a.id for a in areas_list]
    approved_overall, approved_by_trade = approved_supply(area_ids)
    targets_by_area: dict[uuid.UUID, list[AreaSupplyTarget]] = defaultdict(list)
    for target in AreaSupplyTarget.objects.filter(service_area_id__in=area_ids).select_related(
        "skill"
    ):
        targets_by_area[target.service_area_id].append(target)
    all_pins = [link.postal_code.code for a in areas_list for link in a.postal_code_links.all()]
    away_by_pin = turned_away_by_pin(all_pins)
    weeks, trends = area_trends(area_ids, approved_overall)

    area_items: list[dict[str, Any]] = []
    total_partners_set: set[uuid.UUID] = set()
    total_pins_set: set[str] = set()
    zones_set: set[str] = set()

    for area in areas_list:
        if area.zone:
            zones_set.add(area.zone)
        area_pins = [link.postal_code.code for link in area.postal_code_links.all()]
        total_pins_set.update(area_pins)

        # Count partners by application status
        partner_counts: Counter[str] = Counter()
        partner_trades: Counter[str] = Counter()

        for link in area.partner_links.all():
            if not link.is_active:
                continue
            p = link.partner
            total_partners_set.add(p.id)
            status_str = p.application.status if p.application else "UNKNOWN"
            partner_counts[status_str] += 1
            for sl in p.skill_links.all():
                if sl.is_active:
                    partner_trades[sl.skill.name] += 1

        # Trade filter check
        if (
            trade_filter
            and trade_filter != "ALL"
            and trade_filter.lower() not in [t.lower() for t in partner_trades]
        ):
            continue

        # Open asked PINs for this area's PINs
        open_asked_for_area = sum(open_asked_by_pin.get(pin, 0) for pin in area_pins)

        supply = _area_supply(
            area_targets=targets_by_area.get(area.id, []),
            approved_here=approved_overall.get(area.id, 0),
            approved_by_trade=approved_by_trade,
            area_id=area.id,
        )
        area_items.append(
            {
                "id": area.id,
                "name": area.name,
                "slug": area.slug,
                "zone": area.zone,
                "is_active": area.is_active,
                "is_accepting_partners": area.is_accepting_partners,
                "postal_codes": sorted(area_pins),
                "partner_counts": dict(partner_counts),
                "partner_trades": dict(partner_trades),
                "open_asked_pins_count": open_asked_for_area,
                "bookings_28d_count": bookings_by_area.get(area.id, 0),
                "offer_expiries_28d_count": expiries_by_area.get(area.id, 0),
                "approved_partners": supply["approved_partners"],
                "target_partners": supply["target_partners"],
                "alert_below": supply["alert_below"],
                "flag": supply["flag"],
                "trade_targets": supply["trade_targets"],
                "turned_away_28d_count": sum(away_by_pin.get(pin, 0) for pin in area_pins),
                "trend": trends.get(area.id, []),
            }
        )

    summary = {
        "total_areas": len(area_items),
        "total_zones": len(zones_set),
        "total_pins": len(total_pins_set),
        "total_partners": len(total_partners_set),
        "total_open_asked_pins": sum(open_asked_by_pin.values()),
        "total_bookings_28d": sum(item["bookings_28d_count"] for item in area_items),
        "total_offer_expiries_28d": sum(item["offer_expiries_28d_count"] for item in area_items),
        "total_turned_away_28d": sum(item["turned_away_28d_count"] for item in area_items),
        "red_areas": sum(1 for item in area_items if item["flag"] == FLAG_RED),
        "amber_areas": sum(1 for item in area_items if item["flag"] == FLAG_AMBER),
        "green_areas": sum(1 for item in area_items if item["flag"] == FLAG_GREEN),
        "trend_weeks": weeks,
        "trend": _platform_trend(area_items, len(weeks)),
    }

    return {"summary": summary, "areas": area_items}

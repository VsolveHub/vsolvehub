"""Operations partner import from a CSV file (contract proposal 0029).

Each valid row becomes a partner account with a **DRAFT** application, filled in as far as
Operations can fill it: name, track, experience and, for home services, one service area and
its skills. Nobody is approved by importing. The partner signs in with their phone, accepts the
agreements, uploads their ID and submits, and review runs as it always does — Operations cannot
accept agreements or upload KYC on a partner's behalf.

`check` reads and validates the file and changes nothing. `import` validates it again and creates
every ready row in one transaction, or nothing at all when any row has a problem.
"""

import csv
import hashlib
import io
from dataclasses import asdict, dataclass, field
from http import HTTPStatus
from typing import Final, Literal

from django.db import IntegrityError, transaction

from apps.identity.models import User
from apps.identity.phone import InvalidPhoneNumberError, normalize_phone_number
from apps.locations.models import ServiceArea
from apps.partners.exceptions import PartnerDomainError
from apps.partners.models import (
    PartnerApplication,
    PartnerProfile,
    PartnerServiceArea,
    PartnerSkill,
    Skill,
)

from .application import _ensure_partner_role
from .base import _record_transition

ImportMode = Literal["check", "import"]

MAX_IMPORT_BYTES: Final = 1024 * 1024
MAX_IMPORT_ROWS: Final = 500
REQUIRED_COLUMNS: Final = ("phone", "full_name", "track")
OPTIONAL_COLUMNS: Final = ("service_area", "skills", "experience_years")
MIN_NAME_LENGTH: Final = 2
MAX_NAME_LENGTH: Final = 120
MAX_EXPERIENCE_YEARS: Final = 60
INDIAN_PREFIX: Final = "+91"
#: The only track that travels to customers, so the only one with an area and skills.
SERVICES_TRACK: Final = PartnerApplication.Track.SERVICES


class PartnerImportError(PartnerDomainError):
    """A whole-file refusal: nothing was checked row by row, or nothing was created."""

    def __init__(self, *, code: str, message: str, status_code: int = HTTPStatus.BAD_REQUEST):
        super().__init__(code=code, message=message, status_code=status_code)


@dataclass
class ImportRowResult:
    row: int
    status: str
    phone: str
    full_name: str
    track: str
    problems: list[dict[str, str]] = field(default_factory=list)
    message: str = ""
    partner_id: str | None = None

    def fail(self, column: str, message: str) -> None:
        self.problems.append({"column": column, "message": message})


@dataclass(frozen=True)
class _ParsedRow:
    number: int
    values: dict[str, str]


def file_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _parse(data: bytes) -> list[_ParsedRow]:
    if len(data) > MAX_IMPORT_BYTES:
        raise PartnerImportError(
            code="import_file_too_large",
            message="This file is over 1 MB.",
            status_code=HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
        )
    try:
        # `utf-8-sig` accepts the byte-order mark spreadsheet apps write at the start.
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise PartnerImportError(
            code="import_file_invalid", message="This file is not a readable UTF-8 CSV."
        ) from exc

    reader = csv.reader(io.StringIO(text))
    try:
        header = next(reader)
    except (StopIteration, csv.Error) as exc:
        raise PartnerImportError(
            code="import_file_invalid", message="This file is not a readable UTF-8 CSV."
        ) from exc
    columns = [name.strip().lower() for name in header]

    missing = [name for name in REQUIRED_COLUMNS if name not in columns]
    if missing:
        raise PartnerImportError(
            code="import_columns_invalid", message=f"Missing column: {', '.join(missing)}."
        )
    unknown = [name for name in columns if name and name not in REQUIRED_COLUMNS + OPTIONAL_COLUMNS]
    if unknown:
        raise PartnerImportError(
            code="import_columns_invalid", message=f"Unknown column: {', '.join(unknown)}."
        )

    rows: list[_ParsedRow] = []
    try:
        for number, cells in enumerate(reader, start=2):
            if not any(cell.strip() for cell in cells):
                continue  # A blank line, usually the last one a spreadsheet writes.
            padded = [*cells, *([""] * (len(columns) - len(cells)))]
            values = {name: padded[index].strip() for index, name in enumerate(columns) if name}
            rows.append(_ParsedRow(number=number, values=values))
    except csv.Error as exc:
        raise PartnerImportError(
            code="import_file_invalid", message="This file is not a readable UTF-8 CSV."
        ) from exc

    if len(rows) > MAX_IMPORT_ROWS:
        raise PartnerImportError(
            code="import_too_many_rows",
            message=f"This file has {len(rows)} rows. Import at most {MAX_IMPORT_ROWS} at a time.",
        )
    if not rows:
        raise PartnerImportError(code="import_file_invalid", message="This file has no rows.")
    return rows


def _normalised_phone(raw: str) -> str | None:
    try:
        phone = normalize_phone_number(raw)
    except InvalidPhoneNumberError:
        return None
    return phone if phone.startswith(INDIAN_PREFIX) else None


def _check_identity(
    result: ImportRowResult, *, phone: str | None, name: str, seen: dict[str, int]
) -> None:
    if phone is None:
        result.fail("phone", "Enter a 10-digit Indian mobile number.")
    elif phone in seen:
        result.fail("phone", f"This phone is already on row {seen[phone]}.")
    else:
        seen[phone] = result.row

    if not name:
        result.fail("full_name", "Name is required.")
    elif not MIN_NAME_LENGTH <= len(name) <= MAX_NAME_LENGTH:
        result.fail("full_name", "Name must be 2 to 120 characters.")


def _check_track(
    result: ImportRowResult,
    *,
    values: dict[str, str],
    areas: dict[str, ServiceArea],
    skills: dict[str, Skill],
) -> None:
    track = result.track
    tracks = set(PartnerApplication.Track.values)
    if track not in tracks:
        result.fail("track", f"Track must be one of: {', '.join(sorted(tracks))}.")
        return

    area_slug = values.get("service_area", "")
    skill_codes = _skill_codes(values)
    if track != SERVICES_TRACK:
        if area_slug:
            result.fail("service_area", f"Leave empty: {track} partners have no service area.")
        if skill_codes:
            result.fail("skills", f"Leave empty: {track} partners have no skills.")
        return

    if not area_slug:
        result.fail("service_area", "Service area is required for SERVICES.")
    elif area_slug not in areas:
        result.fail("service_area", f"Unknown or closed service area: {area_slug}.")
    if not skill_codes:
        result.fail("skills", "At least one skill is required for SERVICES.")
    for code in skill_codes:
        if code not in skills:
            result.fail("skills", f"Unknown skill: {code}.")


def _check_experience(result: ImportRowResult, raw: str) -> None:
    if raw and not (raw.isdigit() and 0 <= int(raw) <= MAX_EXPERIENCE_YEARS):
        result.fail("experience_years", "Experience must be a whole number from 0 to 60.")


def _skill_codes(values: dict[str, str]) -> list[str]:
    return sorted({code.strip() for code in values.get("skills", "").split("|") if code.strip()})


def _check(rows: list[_ParsedRow]) -> list[ImportRowResult]:
    """Every rule from proposal 0029, row by row, reporting every problem rather than the first."""
    phones = {row.number: _normalised_phone(row.values.get("phone", "")) for row in rows}
    registered = set(
        User.objects.filter(phone_number__in=[p for p in phones.values() if p]).values_list(
            "phone_number", flat=True
        )
    )
    areas = {
        area.slug: area
        for area in ServiceArea.objects.filter(is_active=True, is_accepting_partners=True)
    }
    skills = {skill.code: skill for skill in Skill.objects.filter(is_active=True)}

    seen: dict[str, int] = {}
    results: list[ImportRowResult] = []
    for row in rows:
        phone = phones[row.number]
        result = ImportRowResult(
            row=row.number,
            status="ready",
            phone=phone or row.values.get("phone", ""),
            full_name=row.values.get("full_name", ""),
            track=row.values.get("track", "").upper(),
        )
        _check_identity(result, phone=phone, name=result.full_name, seen=seen)
        _check_track(result, values=row.values, areas=areas, skills=skills)
        _check_experience(result, row.values.get("experience_years", ""))

        if result.problems:
            result.status = "error"
        elif phone in registered:
            result.status = "skipped"
            result.message = "This phone is already registered."
        results.append(result)
    return results


def _create(*, actor: User, row: _ParsedRow, result: ImportRowResult) -> None:
    values = row.values
    experience = values.get("experience_years", "")
    user = User.objects.create_user(phone_number=result.phone, full_name=result.full_name)
    _ensure_partner_role(user)
    partner = PartnerProfile.objects.create(
        user=user,
        display_name=result.full_name,
        experience_years=int(experience) if experience else 0,
    )
    application = PartnerApplication.objects.create(partner=partner, track=result.track)
    if result.track == SERVICES_TRACK:
        PartnerServiceArea.objects.create(
            partner=partner,
            service_area=ServiceArea.objects.get(slug=values["service_area"]),
        )
        for skill in Skill.objects.filter(code__in=_skill_codes(values)):
            PartnerSkill.objects.create(partner=partner, skill=skill)
    _record_transition(
        application=application,
        from_status="",
        actor=actor,
        reason_code="operations_import",
    )
    result.status = "created"
    result.partner_id = str(partner.id)


def _payload(*, mode: ImportMode, sha: str, results: list[ImportRowResult]) -> dict[str, object]:
    done_key = "created" if mode == "import" else "ready"
    summary: dict[str, int] = {
        "total": len(results),
        done_key: sum(1 for r in results if r.status in {"ready", "created"}),
        "skipped": sum(1 for r in results if r.status == "skipped"),
        "problems": sum(1 for r in results if r.status == "error"),
    }
    rows = []
    for result in results:
        row = asdict(result)
        if not row["message"]:
            row.pop("message")
        if row["partner_id"] is None:
            row.pop("partner_id")
        rows.append(row)
    return {"mode": mode, "file_sha256": sha, "summary": summary, "rows": rows}


def check_partner_import(data: bytes) -> dict[str, object]:
    """Validate the file. Changes nothing."""
    rows = _parse(data)
    return _payload(mode="check", sha=file_sha256(data), results=_check(rows))


@transaction.atomic
def import_partners(*, actor: User, data: bytes) -> dict[str, object]:
    """Validate the file again and create every ready row, or nothing when any row has a problem."""
    rows = _parse(data)
    results = _check(rows)
    problems = sum(1 for result in results if result.status == "error")
    if problems:
        raise PartnerImportError(
            code="import_has_row_errors",
            message=(
                f"Fix the {problems} row{'s' if problems != 1 else ''} with problems, then import "
                "again. Nothing was created."
            ),
            status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
        )
    try:
        with transaction.atomic():
            for row, result in zip(rows, results, strict=True):
                if result.status == "ready":
                    _create(actor=actor, row=row, result=result)
    except IntegrityError as exc:
        # Someone registered one of these phones between the check and this write.
        raise PartnerImportError(
            code="import_conflict",
            message="A phone in this file was registered a moment ago. Check the file again.",
            status_code=HTTPStatus.CONFLICT,
        ) from exc
    return _payload(mode="import", sha=file_sha256(data), results=results)

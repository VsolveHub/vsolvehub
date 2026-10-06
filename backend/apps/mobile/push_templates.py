"""Copy for push intents the in-app registry does not know about.

These four codes are written with `channel="PUSH"` by assignments and fulfilment. The
in-app feed never renders them, so a missing row here would surface as a blank banner on
the phone. The owner signs this wording off in Phase 15.
"""

from dataclasses import dataclass


class UnknownPushTemplateError(RuntimeError):
    """A PUSH `template_code` with no registered copy."""

    def __init__(self, template_code: str) -> None:
        super().__init__(f"No push template registered for {template_code!r}.")
        self.template_code = template_code


@dataclass(frozen=True, slots=True)
class PushCopy:
    title: str
    body: str
    target: dict[str, str] | None


@dataclass(frozen=True, slots=True)
class _Template:
    title: str
    body: str
    target_kind: str | None
    context_id_key: str | None


_TEMPLATES: dict[str, _Template] = {
    "partner_offer_created": _Template(
        title="New job offer",
        body="Open to see the job and accept before it expires.",
        target_kind="PARTNER_OFFERS",
        context_id_key="offer_id",
    ),
    "partner_job_assigned": _Template(
        title="Job confirmed",
        body="A job has been assigned to you. Open for the details.",
        target_kind="PARTNER_WORK",
        context_id_key="fulfilment_unit_id",
    ),
    "partner_job_cancelled": _Template(
        title="Job cancelled",
        body="A job you were holding has been cancelled.",
        target_kind="PARTNER_WORK",
        context_id_key="fulfilment_unit_id",
    ),
    "customer_booking_unstaffable": _Template(
        title="We could not find a professional",
        body="Open your booking to see your options.",
        target_kind=None,
        context_id_key=None,
    ),
}


def registered_push_template_codes() -> tuple[str, ...]:
    return tuple(_TEMPLATES)


def render_push_template(*, template_code: str, context: dict[str, object]) -> PushCopy:
    template = _TEMPLATES.get(template_code)
    if template is None:
        raise UnknownPushTemplateError(template_code)
    target: dict[str, str] | None = None
    if template.target_kind and template.context_id_key:
        raw_id = context.get(template.context_id_key)
        if isinstance(raw_id, str) and raw_id:
            target = {"kind": template.target_kind, "id": raw_id}
    return PushCopy(title=template.title, body=template.body, target=target)

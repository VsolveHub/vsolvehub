"""What each notification says, and the one place it is written.

## Why copy is not stored on the row

`NotificationIntent.context` deliberately holds the values a template needs and never the rendered
message. That decision has a consequence this module exists to serve: a feed row must be rendered
on the way **out**, from today's copy, not on the way in. A body frozen into a row in August is a
body still being shown in December, after the product stopped working that way — and it would put
a customer's address and a vendor's name into a table that has no need to hold either.

## Why an unknown template is refused at write time

Rendering happens while somebody is looking at their feed, which is the worst possible moment to
discover that a `template_code` was mistyped four weeks ago. `assert_template_registered` is
therefore called by `request_notification` when the channel is in-app: the write fails loudly at
the call site that got it wrong, and the read can never fail. The same reasoning as the outbox's
"a missing handler is a code defect, not a transient fault".

## Why a missing context key raises rather than degrading

A body reading "A crew is holding your dates for {headcount}" is worse than no notification at
all: it is visibly broken in the one surface whose whole job is to be trusted. `str.format` raising
`KeyError` here is the desired behaviour, re-raised as `NotificationTemplateError` so a caller can
tell a template fault from any other `KeyError`.
"""

from typing import Any, NamedTuple

__all__ = [
    "NotificationTemplateError",
    "RenderedNotification",
    "UnknownTemplateError",
    "assert_template_registered",
    "registered_template_codes",
    "render_notification",
]


class NotificationTemplateError(RuntimeError):
    """A notification could not be rendered from its stored context."""


class UnknownTemplateError(NotificationTemplateError):
    """A `template_code` that no registered template answers to."""

    def __init__(self, template_code: str) -> None:
        super().__init__(f"No notification template registered for {template_code!r}.")
        self.template_code = template_code


class RenderedNotification(NamedTuple):
    """One notification as a person reads it."""

    title: str
    body: str


#: `template_code` → (title, body). Both are `str.format` templates over the intent's context.
#:
#: House style for the copy itself: say what happened and what it means for the reader, in that
#: order, and never make the title carry the only information. A title is what arrives in a push
#: notification later; a body is what is read in the feed.
_TEMPLATES: dict[str, tuple[str, str]] = {
    # ---- A3: rate-card crews -------------------------------------------------------------
    "m2_crew_offer_accepted": (
        "A crew is holding your dates",
        "{partner_name} can send {headcount} for your job. They are holding the dates while you "
        "pay the booking fee — the hold does not last long.",
    ),
    "m2_booking_fee_charged_customer": (
        "Your crew is confirmed",
        "{partner_name} is booked. Pay the crew directly at the end of each day, at the published "
        "rate you agreed.",
    ),
    "m2_booking_fee_charged_partner": (
        "The customer paid — this job is yours",
        "The booking fee cleared, so this job is confirmed. Do not travel before the agreed day.",
    ),
    "m2_crew_vendor_no_show": (
        "Your crew did not arrive",
        "We have refunded your booking fee in full and started looking for another crew at no "
        "extra cost.",
    ),
    "m2_rate_card_fell_back": (
        "No crew accepted — moving you to quotes",
        "We could not confirm a crew at the published rate. Nothing has been charged. Vendors can "
        "now send you quotes instead.",
    ),
    # ---- A5: visit-first projects --------------------------------------------------------
    "m2_visit_plan_charged": (
        "Your site visits are booked",
        "Your visit plan is paid and {visit_count} scheduled. Each professional will estimate on "
        "site.",
    ),
    "m2_proposal_selected": (
        "You were selected — confirm to start",
        "The customer chose your estimate. Reconfirm to open the job; the invitation lapses if you "
        "do not.",
    ),
    "m2_proposal_rejected": (
        "Your quote was not selected",
        "The customer went another way on this request. Your slot is free again.",
    ),
    # ---- The shared engagement spine -----------------------------------------------------
    "m2_engagement_opened_customer": (
        "Your job is live",
        "Everything is agreed with {partner_name} and the job is open.",
    ),
    "m2_engagement_opened_partner": (
        "The job is open",
        "The customer has confirmed. You can start work as the agreed schedule allows.",
    ),
    "m2_stage_awaiting_review": (
        "Work is waiting for your review",
        "{partner_name} submitted work for your approval. If you do not answer, it is approved "
        "automatically when the review window closes and the money is released.",
    ),
    "m2_stage_disputed": (
        "The customer raised a dispute",
        "Work on this job is disputed, so its payment is on hold until it is resolved.",
    ),
    "m2_amendment_authorized": (
        "The scope and price changed",
        "A change to this job was authorised. The agreed amount has moved accordingly.",
    ),
    "m2_cancellation_evaluated": (
        "A cancellation needs your answer",
        "The other party asked to cancel this job. Confirm it or dispute it — if you do nothing, "
        "it goes ahead when the window closes.",
    ),
    "m2_requirement_closed": (
        "Your request is closed",
        "This request has ended. Anything you paid that was not used has been refunded.",
    ),
}


def registered_template_codes() -> frozenset[str]:
    """Every template code the feed can render. Used by tests to keep the registry honest."""

    return frozenset(_TEMPLATES)


def assert_template_registered(template_code: str) -> None:
    """Refuse a template code the feed could not render later.

    Raises `UnknownTemplateError`, which is a code defect rather than a runtime condition — see
    the module docstring for why it is refused here rather than at read time.
    """

    if template_code not in _TEMPLATES:
        raise UnknownTemplateError(template_code)


def render_notification(*, template_code: str, context: dict[str, Any]) -> RenderedNotification:
    """Render one notification from today's copy and the values stored with it."""

    assert_template_registered(template_code)
    title_template, body_template = _TEMPLATES[template_code]
    try:
        return RenderedNotification(
            title=title_template.format(**context),
            body=body_template.format(**context),
        )
    except KeyError as missing:
        raise NotificationTemplateError(
            f"Notification template {template_code!r} needs context key {missing.args[0]!r}."
        ) from missing

"""Settings shared by every Vsolve Hub backend environment."""

from pathlib import Path

import environ
from corsheaders.defaults import default_headers

BASE_DIR = Path(__file__).resolve().parents[2]

env = environ.Env(
    DJANGO_DEBUG=(bool, False),
    API_DOCS_ENABLED=(bool, False),
    SECURE_HSTS_SECONDS=(int, 0),
)

SECRET_KEY = env("DJANGO_SECRET_KEY", default="unsafe-development-only")
DEBUG = env.bool("DJANGO_DEBUG")
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])
CSRF_TRUSTED_ORIGINS = env.list("DJANGO_CSRF_TRUSTED_ORIGINS", default=[])
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = (*default_headers, "idempotency-key")
# A browser hides every response header outside the CORS safelist from JavaScript,
# and `Date` is not on that safelist.  Shared countdown calibration reads it on every
# response, so leaving it unexposed makes each offer, undo, hold and OTP deadline
# measure against the device clock with no error state to reveal it.
CORS_EXPOSE_HEADERS = env.list("CORS_EXPOSE_HEADERS", default=["Date"])
CORS_URLS_REGEX = r"^/api/.*$"

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
    "rest_framework",
    "apps.health",
    "apps.foundation",
    "apps.identity",
    "apps.carts",
    "apps.assignments",
    "apps.commerce",
    "apps.fulfilment",
    "apps.cases",
    "apps.payouts",
    "apps.notifications",
    "apps.catalog",
    "apps.pricing",
    "apps.locations",
    "apps.partners",
    "apps.requirements",
]

MIDDLEWARE = [
    "common.observability.middleware.RequestIdMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": env.db(
        "DATABASE_URL",
        default="postgresql://vsolve:vsolve-local-only@127.0.0.1:15432/vsolve",
    ),
}
DATABASES["default"]["CONN_MAX_AGE"] = 60
DATABASES["default"]["CONN_HEALTH_CHECKS"] = True

CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": env("REDIS_URL", default="redis://127.0.0.1:56379/0"),
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
            "SOCKET_CONNECT_TIMEOUT": 2,
            "SOCKET_TIMEOUT": 2,
        },
    },
}

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

LANGUAGE_CODE = "en-in"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "identity.User"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.identity.authentication.RevocableSessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "common.errors.handler.api_exception_handler",
    "NON_FIELD_ERRORS_KEY": "non_field_errors",
    "DEFAULT_THROTTLE_RATES": {
        "geocoding": "30/min",
        "serviceability": "60/min",
    },
}

# M1 operational limits.  These are server-authoritative and deliberately
# separate from editable commercial configuration such as tax and platform fee.
M1_PARTNER_SEARCH_TIMEOUT_SECONDS = 180
M1_PAYMENT_WINDOW_SECONDS = 300
M1_TODAY_LEAD_TIME_MINUTES = 120
M1_SCHEDULED_MAX_DAYS = 7
M1_ARRIVAL_WINDOW_MINUTES = 60
# Duration-aware arrival windows (spec §4). A 60-minute grid offered for every
# service promises a 40-minute switch repair the same vagueness as a 3-hour deep
# clean. Three tiers rather than a continuous function of duration, so a 41- and a
# 44-minute job never render visibly different grids for a difference nobody asked
# about. Widths are the grid step as well as the window, so slots stay contiguous.
# 45: at or under three quarters of an hour the visit is short enough that half an
# hour of arrival vagueness is already most of the job — offer a tighter promise.
M1_ARRIVAL_WINDOW_SHORT_THRESHOLD_MINUTES = 45
# 120: past two hours the visit dominates the day, and a one-hour promise the
# partner cannot honour after a long preceding job is worse than an honest two.
M1_ARRIVAL_WINDOW_LONG_THRESHOLD_MINUTES = 120
M1_ARRIVAL_WINDOW_SHORT_MINUTES = 30
# The standard tier is today's flat M1_ARRIVAL_WINDOW_MINUTES, kept identical so
# the ordinary catalog's grid is unchanged by the tiering.
M1_ARRIVAL_WINDOW_STANDARD_MINUTES = 60
M1_ARRIVAL_WINDOW_LONG_MINUTES = 120
M1_WINDOW_TOKEN_TTL_SECONDS = 15 * 60
# Partner offer event stream (contracts/proposals/partner-offer-events.md).
# 2: the offer clock is M1_PARTNER_OFFER_TIMEOUT_SECONDS (45), so a two-second
# poll costs a partner at most 4% of their window — small next to the seconds a
# human takes to read the card, and cheap enough to hold open.
M1_OFFER_STREAM_POLL_SECONDS = 2
# 300: every open stream occupies one WSGI worker thread for its whole life, so
# the connection is capped rather than held forever and `EventSource` reconnects
# on its own. Five minutes bounds a leaked connection's cost without making
# reconnects frequent enough to matter.
M1_OFFER_STREAM_MAX_SECONDS = 300
# 30: an offer created between the client's list fetch and its stream connecting
# belongs to neither, so a connection replays this far back. Clients de-duplicate
# on `offer_id`; the contract document says so.
M1_OFFER_STREAM_REPLAY_SECONDS = 30
M1_QUOTE_TTL_SECONDS = 15 * 60
M1_PARTNER_OFFER_TIMEOUT_SECONDS = 45
M1_PARTNER_SEARCH_CANDIDATE_LIMIT = 3
M1_PARTNER_UNDO_TIMEOUT_SECONDS = 120
M1_CART_ITEM_LIMIT = 5
M1_FULFILMENT_UNIT_LIMIT = 5
M1_CONCURRENT_PARTNER_LIMIT = 2
M1_SEQUENTIAL_UNIT_MAX_MINUTES = 240
M1_FULFILMENT_PLAN_LIMIT = 3
M1_FULFILMENT_PLAN_TTL_SECONDS = 15 * 60
# Dynamic reachability (spec 2026-08-07-work-based-slot-booking-design.md §7)
# replaces the flat M1_TODAY_LEAD_TIME_MINUTES for slots where a partner has a
# usable location fix. M1_TODAY_LEAD_TIME_MINUTES stays as the fallback ceiling
# for an area with nobody reachably located.
M1_COMMIT_WINDOW_MINUTES = 15
M1_DEFAULT_TRAVEL_MINUTES = 30
# Reservations occupy the visit plus this gap, so a Partner is never offered two
# jobs back to back with no travel time between them (spec §5, D7).
M1_TURNAROUND_MINUTES = 20

# M1 booking-fulfilment clocks (05-initial-configuration.md).
M1_LATE_ARRIVAL_GRACE_MINUTES = 15
M1_CUSTOMER_WAIT_MINUTES = 10
M1_CUSTOMER_CONTACT_ATTEMPT_MINUTES = (0, 5)
M1_START_OTP_TTL_SECONDS = 5 * 60
M1_START_OTP_MAX_ATTEMPTS = 5
# 60: what "nearing deadline" means on the Operations home screen. An hour is the point a case
# stops being something to schedule and starts being something to pick up now.
M1_CASE_DUE_SOON_MINUTES = 60
M1_COMPLETION_RESPONSE_HOURS = 24
M1_QUALITY_DISPUTE_WINDOW_HOURS = 72
M1_SCOPE_AMENDMENT_RESPONSE_MINUTES = 30
# The earliest a Customer may move a visit to. Mirrors the fee ladder's two-hour boundary below,
# which the frozen configuration already treats as "too close to the visit to change for free".
# A guard that only required a *future* time let a Customer 24h out drop the visit to twenty
# minutes away, make the Partner unreachably late, and waive their own cancellation fee.
M1_RESCHEDULE_MIN_NOTICE_MINUTES = 120
# 4: how long before the visit a Customer may still move it, free of charge.
#
# Deliberately its own number rather than "whatever the free cancellation band is". Reschedule
# used to piggyback on the fee ladder's 24-hour boundary, which made a visit fourteen hours out
# unmovable — and pushed a Customer who only wanted a different time into cancelling and paying
# a fee to rebook the same work. The two decisions are not the same: cancelling releases the
# Partner and loses the job, while rescheduling keeps both and only re-times them, so it can be
# allowed far closer to the visit than a fee-free cancellation can.
#
# Four hours, not less, because a reschedule is a re-booking: the original Partner is preferred
# but a new one may have to be found, and inside four hours there is not enough of the working
# day left to find anybody. Past this point the honest answer is to cancel under the fee ladder.
M1_RESCHEDULE_FREE_NOTICE_HOURS = 4
# Post-payment Partner recovery. 60: the search stops this long before the visit, so a Customer
# who is going to be refunded finds out with an hour to make other plans rather than at the door.
M1_REPLACEMENT_DEADLINE_MINUTES = env.int("M1_REPLACEMENT_DEADLINE_MINUTES", default=60)
# 180: inside three hours of the visit the search cycles candidates faster, because a silent
# Partner is the expensive case — three of them at the full 45-second offer clock burns most of
# the remaining time. Eligibility is never relaxed; a Partner who does not offer the variant
# still cannot do the job. Only the clock moves.
M1_REPLACEMENT_URGENT_MINUTES = env.int("M1_REPLACEMENT_URGENT_MINUTES", default=180)
# 30: two thirds of M1_PARTNER_OFFER_TIMEOUT_SECONDS. Still long enough for a Partner with the
# app open to read the job and answer, short enough that three candidates fit in 90 seconds.
M1_REPLACEMENT_URGENT_OFFER_TTL_SECONDS = env.int(
    "M1_REPLACEMENT_URGENT_OFFER_TTL_SECONDS", default=30
)
M1_CANCELLATION_BAND_MORE_THAN_24H = "more-than-24-hours"
M1_CANCELLATION_BAND_24_TO_2H = "24-to-2-hours"
M1_CANCELLATION_BAND_LESS_THAN_2H = "less-than-2-hours"
M1_CANCELLATION_BAND_VERIFIED_ARRIVAL = "verified-arrival"

SPECTACULAR_SETTINGS = {
    "TITLE": "Vsolve Hub API",
    "DESCRIPTION": "Authoritative API for Vsolve Hub customer, partner and operations clients.",
    "VERSION": "1.25.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": r"/api/v1",
    "COMPONENT_SPLIT_REQUEST": True,
    "SORT_OPERATIONS": True,
    "POSTPROCESSING_HOOKS": [
        "drf_spectacular.hooks.postprocess_schema_enums",
        "common.schema.publish_parameter_enum_components",
    ],
    # Every choice set that shares a field name with another must be named here.
    # Left to itself the generator resolves a collision by hashing — `Status7a2Enum`,
    # `Kind0bfEnum` — and those names reach the published contract and the generated
    # TypeScript client, where they mean nothing to a reader and change whenever an
    # unrelated model adds a choice.
    "ENUM_NAME_OVERRIDES": {
        "PartnerApplicationStatusEnum": "apps.partners.models.PartnerApplication.Status",
        "PartnerDocumentKindEnum": "apps.partners.models.PartnerDocument.Kind",
        # Named when the Partner directory added a second serializer over `PartnerDocument`.
        # Two `status` fields on one model made the generator disambiguate both, renaming
        # `PartnerDocumentStatusEnum` to a positional `StatusD12Enum` and breaking the partner
        # app's documents step — the same silent-rename trap as `CompletionResponseDecisionEnum`
        # below.
        "PartnerDocumentStatusEnum": "apps.partners.models.PartnerDocument.Status",
        "QuoteLineKindEnum": "apps.carts.models.QuoteLine.Kind",
        "PrivacyRequestKindEnum": "apps.identity.models.PrivacyRequest.Kind",
        "ScopeAmendmentStatusEnum": "apps.fulfilment.models.ScopeAmendment.Status",
        "ScopeAmendmentLineKindEnum": "apps.fulfilment.models.ScopeAmendmentLine.Kind",
        "WorkTaskKindEnum": "apps.fulfilment.models.WorkTask.Kind",
        "WorkEvidenceKindEnum": "apps.fulfilment.models.WorkEvidence.Kind",
        "WorkOutcomeEnum": "apps.fulfilment.models.WorkOutcome.Outcome",
        "BookingStatusEnum": "apps.commerce.models.Booking.Status",
        # Named so the *existing* `DecisionEnum` keeps its name. Adding a second `decision`
        # field made the generator disambiguate both, silently renaming a component the admin
        # app already imported — a published rename is a breaking change, and a new model is
        # not a reason to inflict one on an existing consumer.
        "CompletionResponseDecisionEnum": "apps.fulfilment.models.CompletionResponse.Decision",
        # B9/B10 choice sets. Same reasoning as above — `status` and `kind` are the two most
        # reused field names in the schema, so every new one has to be named on arrival.
        "OperationsCaseKindEnum": "apps.cases.models.OperationsCase.Kind",
        "OperationsCaseStatusEnum": "apps.cases.models.OperationsCase.Status",
        "OperationsCaseSeverityEnum": "apps.cases.models.OperationsCase.Severity",
        "OperationsCaseTeamEnum": "apps.cases.models.OperationsCase.Team",
        "OperationsCaseEventKindEnum": "apps.cases.models.OperationsCaseEvent.Kind",
        "LedgerEntryKindEnum": "apps.payouts.models.PartnerLedgerEntry.Kind",
        "LedgerEntryStatusEnum": "apps.payouts.models.PartnerLedgerEntry.Status",
        "PayoutAccountStatusEnum": "apps.payouts.models.PartnerPayoutAccount.Status",
        "PayoutBatchStatusEnum": "apps.payouts.models.PayoutBatch.Status",
        "PayoutBatchItemStatusEnum": "apps.payouts.models.PayoutBatchItem.Status",
        "KillSwitchScopeEnum": "apps.notifications.models.KillSwitch.Scope",
        "NotificationChannelEnum": "apps.notifications.models.NotificationIntent.Channel",
        "NotificationIntentStatusEnum": "apps.notifications.models.NotificationIntent.Status",
        "NotificationDeliveryStatusEnum": "apps.notifications.models.NotificationDelivery.Status",
        # M2. Same reasoning again: `status` is the most reused field name in the schema, and an
        # unnamed choice set is published as a positional `StatusD6aEnum` whose digits move the
        # next time an unrelated app adds a `status`. Naming all four now — not only the two that
        # collided today — keeps a future M2 serializer from renaming a component the frontend
        # has already imported.
        "RequirementStatusEnum": "apps.requirements.models.CustomerRequirement.Status",
        "VendorInvitationStatusEnum": "apps.requirements.models.VendorInvitation.Status",
        "ProposalStatusEnum": "apps.requirements.models.Proposal.Status",
        "ProposalUsabilityEnum": "apps.requirements.models.Proposal.Usability",
        "ProposalTaxBasisEnum": "apps.requirements.models.Proposal.TaxBasis",
        "SiteVisitStatusEnum": "apps.requirements.models.SiteVisit.Status",
        "RequirementAttachmentKindEnum": "apps.requirements.models.RequirementAttachment.Kind",
        "RequirementScanStatusEnum": (
            "apps.requirements.models.RequirementAttachment.ProcessingStatus"
        ),
        # M2 Wave C1, the proposal 0013 registration surface. `business_type` is the collision
        # waiting to happen — it is a name any future customer- or vendor-side model will reuse —
        # and `gate` / `next_action` are named for the same reason the eight above are: an unnamed
        # choice set is published positionally, and the digits move when an unrelated app adds a
        # field with the same name.
        "PartnerBusinessTypeEnum": "apps.partners.models.PartnerBusinessProfile.BusinessType",
        "ProgressiveGateEnum": "apps.partners.gates.ProgressiveGate",
        "GateNextActionEnum": "apps.partners.gates.GateNextAction",
        # M2 Wave C2 — the access, selection and engagement choice sets.
        #
        # `RejectionReasonEnum` is pinned rather than renamed: it was published at 1.22.0 from
        # `Proposal.rejection_reason`, and Wave C2 added a *second* field over the same choice set
        # (`ProposalRejectRequest.reason`). Without this entry the generator resolved the collision
        # positionally to `Reason9ecEnum` — a component whose digits move the next time an
        # unrelated `reason` field appears. Naming it keeps the published name and gives both
        # fields one component.
        "RejectionReasonEnum": "apps.requirements.models.Proposal.RejectionReason",
        # And the one that had to be pinned to stop C2 *renaming* a published component. At 1.23.0
        # `DispatchCommandAudit.Reason` was the only `reason` choice set in the schema, so it
        # published as the bare `ReasonEnum` — which is what
        # `apps/admin/features/dispatch-recovery/model/commands.ts` imports. Adding two more
        # `reason` fields in Wave C2 made the generator disambiguate *all three*, silently renaming
        # it to `DispatchCommandRequestReasonEnum` and breaking an app that had not changed. Caught
        # by `pnpm typecheck` on regeneration; fixed here rather than in the client, because the
        # rename was the defect.
        "ReasonEnum": "apps.assignments.models.DispatchCommandAudit.Reason",
        # The six new status sets. They resolve to these names today because no other model shares
        # the class name, which is exactly the property that stops being true later — the C1 note
        # above is about this and it applies unchanged.
        "QuoteUnlockStatusEnum": "apps.requirements.models.QuoteUnlock.Status",
        "VisitPlanStatusEnum": "apps.requirements.models.VisitPlan.Status",
        "VisitPlanShareStatusEnum": "apps.requirements.models.VisitPlanShare.Status",
        "ProposalSelectionStatusEnum": "apps.requirements.models.ProposalSelection.Status",
        "EngagementStatusEnum": "apps.requirements.models.Engagement.Status",
        "EngagementStageStatusEnum": "apps.requirements.models.EngagementStage.Status",
        # Four sets whose *field* names are the collision risk rather than their model names:
        # `commercial_mode`, `funding_state`, `arrival_method` and `party` are all short, generic
        # and certain to be reused. Named on arrival rather than after a rename breaks a client.
        "EngagementCommercialModeEnum": "apps.requirements.models.Engagement.CommercialMode",
        "EngagementStageFundingStateEnum": (
            "apps.requirements.models.EngagementStage.FundingState"
        ),
        "VisitArrivalMethodEnum": "apps.requirements.models.SiteVisit.ArrivalMethod",
        # The two vocabularies that live in the serializer layer on purpose. The decline reasons
        # are published only on the surface a vendor types into — the same database column also
        # carries system reasons, so constraining the model would refuse the platform's own
        # writes — and the no-show party is a request-shape choice with no column behind it.
        "InvitationDeclineReasonEnum": ("apps.requirements.serializers.INVITATION_DECLINE_REASONS"),
        "VisitNoShowPartyEnum": "apps.requirements.serializers.VISIT_NO_SHOW_PARTIES",
        # M2 Wave C3 — the engagement stage spine and the M2 amendment surface.
        #
        # **`ProcessingStatusEnum` is pinned to stop C3 renaming a published component**, which is
        # the `ReasonEnum` lesson from 1.24.0 arriving a second time.
        # `WorkEvidence.ProcessingStatus`
        # was the only `processing_status` choice set in the schema, so it published as the bare
        # `ProcessingStatusEnum`; adding a second `processing_status` field made the generator
        # disambiguate both and rename it to `WorkEvidenceProcessingStatusEnum` — a break for an
        # M1 client that had not changed. `StageEvidence.ProcessingStatus` is an alias of
        # `RequirementAttachment.ProcessingStatus` rather than a copy for the same reason, which is
        # why `ScanStatusEnum` needs no entry here: there is still exactly one such choice set.
        "ProcessingStatusEnum": "apps.fulfilment.models.WorkEvidence.ProcessingStatus",
        # The four genuinely new choice sets. `kind`, `reason_code` and `outcome` are all names
        # another app will reuse, so they are named on arrival rather than after a rename breaks a
        # client — the standing rule since the C1 note above.
        "StageEvidenceKindEnum": "apps.requirements.models.StageEvidence.Kind",
        "EngagementAmendmentKindEnum": "apps.requirements.models.EngagementAmendment.Kind",
        "StageDisputeReasonEnum": "apps.requirements.serializers.STAGE_DISPUTE_REASONS",
        "StageDisputeOutcomeEnum": "apps.requirements.serializers.STAGE_DISPUTE_OUTCOMES",
    },
}
API_DOCS_ENABLED = env.bool("API_DOCS_ENABLED")

SESSION_COOKIE_NAME = "vsolve_session"
SESSION_COOKIE_AGE = 60 * 60 * 24 * 30

# Per-host sessions, deliberately.
#
# The three apps are deployed on separate hosts — vsolvehub.com,
# partner.vsolvehub.com and consolve.vsolvehub.com. Leaving the cookie domain
# unset means the browser scopes each session cookie to the exact host that set
# it, so signing in to the Customer site grants nothing on the Operations
# console and vice versa.
#
# The alternative — `.vsolvehub.com` — would give one sign-in across all three,
# and would also mean a stolen Customer session cookie is a valid credential
# against the console that approves payouts. Convenience for a handful of staff
# is not worth widening the blast radius of every Customer session on the
# platform. Staff sign in to the console separately, which takes one OTP.
#
# `None` is Django's default; it is named here so that a future change is a
# deliberate edit to a documented line rather than an env var somebody adds
# without reading this.
SESSION_COOKIE_DOMAIN = env("SESSION_COOKIE_DOMAIN", default=None) or None
CSRF_COOKIE_DOMAIN = env("CSRF_COOKIE_DOMAIN", default=None) or None
SESSION_SAVE_EVERY_REQUEST = False

OTP_CODE_LENGTH = 6
OTP_TTL_SECONDS = 5 * 60
OTP_RESEND_COOLDOWN_SECONDS = 60
OTP_RATE_WINDOW_SECONDS = 10 * 60
OTP_PHONE_RATE_LIMIT = 5
OTP_IP_RATE_LIMIT = 20
OTP_PROVIDER = env("OTP_PROVIDER", default="unconfigured")
OTP_DEVELOPMENT_CODE_ENABLED = env.bool("OTP_DEVELOPMENT_CODE_ENABLED", default=False)
OPERATIONS_STEP_UP_TTL_SECONDS = env.int("OPERATIONS_STEP_UP_TTL_SECONDS", default=10 * 60)

PAYMENT_PROVIDER = env("PAYMENT_PROVIDER", default="unconfigured")
PAYMENT_WEBHOOK_SECRET = env("PAYMENT_WEBHOOK_SECRET", default="")
#: Lets a caller mark their own payment captured without a real provider.
#:
#: Fail-closed, and `production.py` refuses it outright. It exists so a developer
#: can drive a booking through capture — and everything capture triggers — with no
#: gateway credentials. Mirrors `PAYOUTS_ALLOW_FAKE_PROVIDER` on the payouts side.
PAYMENTS_ALLOW_SIMULATED_CAPTURE = env.bool("PAYMENTS_ALLOW_SIMULATED_CAPTURE", default=False)
RAZORPAY_API_BASE_URL = env("RAZORPAY_API_BASE_URL", default="https://api.razorpay.com/v1")
RAZORPAY_KEY_ID = env("RAZORPAY_KEY_ID", default="")
RAZORPAY_KEY_SECRET = env("RAZORPAY_KEY_SECRET", default="")
PAYMENT_PROVIDER_CONNECT_TIMEOUT_SECONDS = env.float(
    "PAYMENT_PROVIDER_CONNECT_TIMEOUT_SECONDS", default=3.0
)
PAYMENT_PROVIDER_READ_TIMEOUT_SECONDS = env.float(
    "PAYMENT_PROVIDER_READ_TIMEOUT_SECONDS", default=10.0
)
PAYMENT_LEGAL_ENTITY_CODE = env("PAYMENT_LEGAL_ENTITY_CODE", default="vsolve")
PAYMENT_LIVE_COLLECTIONS_APPROVED = env.bool("PAYMENT_LIVE_COLLECTIONS_APPROVED", default=False)

# Outbound payouts. Separate credentials from collections on purpose: the key that can move
# money *out* is the more dangerous of the two, and sharing one secret between them means a
# read-only integration cannot be granted without also granting payout rights.
PAYOUT_PROVIDER = env("PAYOUT_PROVIDER", default="unconfigured")
RAZORPAYX_API_BASE_URL = env("RAZORPAYX_API_BASE_URL", default="https://api.razorpay.com/v1")
RAZORPAYX_KEY_ID = env("RAZORPAYX_KEY_ID", default="")
RAZORPAYX_KEY_SECRET = env("RAZORPAYX_KEY_SECRET", default="")
RAZORPAYX_ACCOUNT_NUMBER = env("RAZORPAYX_ACCOUNT_NUMBER", default="")
RAZORPAYX_WEBHOOK_SECRET = env("RAZORPAYX_WEBHOOK_SECRET", default="")
# Credentials are not activation. A deployment that merely *has* keys has not decided to start
# paying people, and a wrong payout — unlike a wrong capture — cannot be refunded.
PAYOUTS_LIVE_ENABLED = env.bool("PAYOUTS_LIVE_ENABLED", default=False)
PAYOUTS_ALLOW_FAKE_PROVIDER = env.bool("PAYOUTS_ALLOW_FAKE_PROVIDER", default=False)

# Outbound message transport for SMS, WhatsApp and voice. MSG91 is the intended provider and is
# not implemented yet, so this stays `unconfigured` and `get_message_transport` refuses. A
# transport that silently no-ops would report success to the escalation ladder while the vendor
# heard nothing, which is the one failure the ladder exists to prevent.
MESSAGE_TRANSPORT = env("MESSAGE_TRANSPORT", default="unconfigured")
NOTIFICATIONS_ALLOW_FAKE_TRANSPORT = env.bool("NOTIFICATIONS_ALLOW_FAKE_TRANSPORT", default=False)

GEOCODING_PROVIDER = env("GEOCODING_PROVIDER", default="unconfigured")
GEOCODING_NOMINATIM_URL = env(
    "GEOCODING_NOMINATIM_URL",
    default="https://nominatim.openstreetmap.org",
)
GEOCODING_USER_AGENT = env(
    "GEOCODING_USER_AGENT",
    default="VsolveHub/0.1 (configure-production-contact)",
)
GEOCODING_TIMEOUT_SECONDS = env.float("GEOCODING_TIMEOUT_SECONDS", default=3.0)
GEOCODING_CACHE_SECONDS = env.int("GEOCODING_CACHE_SECONDS", default=60 * 60 * 24 * 7)
GEOCODING_CACHE_COORDINATE_PRECISION = env.int(
    "GEOCODING_CACHE_COORDINATE_PRECISION",
    default=5,
)

PARTNER_REQUIRED_DOCUMENT_KINDS = ("GOVERNMENT_ID",)
DOCUMENT_STORAGE_PROVIDER = env("DOCUMENT_STORAGE_PROVIDER", default="unconfigured")
SUPABASE_STORAGE_URL = env("SUPABASE_STORAGE_URL", default="")
SUPABASE_SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY", default="")
PARTNER_DOCUMENT_BUCKET = env("PARTNER_DOCUMENT_BUCKET", default="partner-kyc")
DOCUMENT_STORAGE_CONNECT_TIMEOUT_SECONDS = env.float(
    "DOCUMENT_STORAGE_CONNECT_TIMEOUT_SECONDS",
    default=3.0,
)
DOCUMENT_STORAGE_READ_TIMEOUT_SECONDS = env.float(
    "DOCUMENT_STORAGE_READ_TIMEOUT_SECONDS",
    default=15.0,
)
PARTNER_DOCUMENT_REVIEW_URL_TTL_SECONDS = env.int(
    "PARTNER_DOCUMENT_REVIEW_URL_TTL_SECONDS",
    default=300,
)
PARTNER_DOCUMENT_ORPHAN_RETENTION_HOURS = env.int(
    "PARTNER_DOCUMENT_ORPHAN_RETENTION_HOURS",
    default=24,
)
FULFILMENT_EVIDENCE_BUCKET = env("FULFILMENT_EVIDENCE_BUCKET", default="fulfilment-evidence")
# M2 adds a bucket, not a storage adapter. `apps.foundation.storage` is one signed-upload boundary
# shared by every app that needs one; a second implementation here is the duplication
# `02-backend-tasks.md` §"Reuse before building" names against `M2-BE-202`.
REQUIREMENT_ATTACHMENT_BUCKET = env(
    "REQUIREMENT_ATTACHMENT_BUCKET",
    default="requirement-attachments",
)
# Short: an attachment view URL is handed to a vendor whose invitation may expire while they hold
# it. Five minutes means a leaked link is worthless long before `M2-BE-310` has to revoke anything.
REQUIREMENT_ATTACHMENT_ACCESS_URL_TTL_SECONDS = env.int(
    "REQUIREMENT_ATTACHMENT_ACCESS_URL_TTL_SECONDS",
    default=300,
)
# How long a signed A5 visit-slot token stays redeemable. Fifteen minutes, matching the A1 arrival
# window token: a slot picker that is left open for an hour is showing a diary that has moved, and
# the token expiring is what forces a refresh rather than a booking against a stale grid. This is
# a token lifetime, not a business policy — no owner decision is blocked on it.
M2_VISIT_SLOT_TOKEN_TTL_SECONDS = env.int("M2_VISIT_SLOT_TOKEN_TTL_SECONDS", default=900)
# How long the *first* vendor's visit slot is held while the Customer completes the plan checkout.
# The hold is a `TENTATIVE` reservation, so when it lapses the slot simply returns to the grid and
# nothing was charged — which is the whole point of charging at the first confirmed slot rather
# than at request time. Same duration as the M1 payment window, for the same reason: it is how
# long a person reasonably takes to finish paying.
M2_VISIT_PLAN_HOLD_SECONDS = env.int("M2_VISIT_PLAN_HOLD_SECONDS", default=1800)
PARTNER_PRESENCE_TTL_SECONDS = env.int("PARTNER_PRESENCE_TTL_SECONDS", default=90)
PARTNER_PRESENCE_DB_TOUCH_SECONDS = env.int(
    "PARTNER_PRESENCE_DB_TOUCH_SECONDS",
    default=300,
)
PARTNER_LOCATION_MAX_ACCURACY_METERS = env.int(
    "PARTNER_LOCATION_MAX_ACCURACY_METERS",
    default=500,
)
PARTNER_LOCATION_STALE_SECONDS = env.int(
    "PARTNER_LOCATION_STALE_SECONDS",
    default=30 * 60,
)

CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://127.0.0.1:56379/1")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default="redis://127.0.0.1:56379/2")
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_TASK_TIME_LIMIT = env.int("CELERY_TASK_TIME_LIMIT_SECONDS", default=60)
CELERY_TASK_SOFT_TIME_LIMIT = env.int("CELERY_TASK_SOFT_TIME_LIMIT_SECONDS", default=45)

# `OutboxEvent.available_at` is a visibility deadline, not a creation stamp. A worker that claims
# an event pushes the deadline out by the lease; a worker that dies without publishing lets the
# deadline lapse, and the recovery sweep re-drives the event. The lease must exceed
# CELERY_TASK_TIME_LIMIT, otherwise the sweep re-queues work that is still legitimately running.
OUTBOX_LEASE_SECONDS = env.int("OUTBOX_LEASE_SECONDS", default=120)
OUTBOX_MAX_ATTEMPTS = env.int("OUTBOX_MAX_ATTEMPTS", default=10)
OUTBOX_RETRY_BACKOFF_SECONDS = env.int("OUTBOX_RETRY_BACKOFF_SECONDS", default=30)
OUTBOX_RETRY_BACKOFF_MAX_SECONDS = env.int("OUTBOX_RETRY_BACKOFF_MAX_SECONDS", default=900)
OUTBOX_RECOVERY_BATCH_SIZE = env.int("OUTBOX_RECOVERY_BATCH_SIZE", default=200)

CELERY_BEAT_SCHEDULE = {
    "recover-outbox-events": {
        "task": "apps.foundation.tasks.recover_outbox_events",
        "schedule": 30.0,
    },
    "reconcile-booking-group-dispatch": {
        "task": "apps.assignments.tasks.reconcile_booking_group_dispatch",
        "schedule": 10.0,
    },
    "cleanup-partner-document-uploads": {
        "task": "apps.partners.tasks.cleanup_partner_document_uploads",
        "schedule": 60.0 * 60,
    },
    "sweep-late-bookings": {
        "task": "apps.fulfilment.tasks.sweep_late_bookings",
        "schedule": 60.0,
    },
    "sweep-bookings-awaiting-replacement": {
        "task": "apps.fulfilment.tasks.sweep_bookings_awaiting_replacement",
        # 60s. The release itself starts the search through the outbox; this only catches the
        # cases nothing else will — an offer that expired, and a Partner who never answered.
        "schedule": 60.0,
    },
    "sweep-completion-auto-finalize": {
        "task": "apps.fulfilment.tasks.sweep_completion_auto_finalize",
        "schedule": 300.0,
    },
    "reconcile-partner-presence-sessions": {
        "task": "apps.partners.tasks.reconcile_partner_presence_sessions",
        "schedule": 60.0,
    },
    "reconcile-payments": {
        "task": "apps.commerce.tasks.reconcile_payments",
        "schedule": 30.0,
    },
    "reconcile-refunds": {
        "task": "apps.commerce.tasks.reconcile_refunds",
        "schedule": 60.0,
    },
    "reconcile-payouts": {
        "task": "apps.payouts.tasks.reconcile_payouts",
        # Hourly. Ambiguous payouts are never re-submitted — this only *reads* the provider
        # and settles an item once it is definite, so a slow cadence costs nothing.
        "schedule": 60.0 * 60,
    },
    "identity-retention-sweep": {
        "task": "apps.identity.tasks.run_retention_sweep",
        # Daily. Deleting expired OTP challenges, sessions and audit events is not urgent;
        # doing it in the middle of a booking peak would be.
        "schedule": 60.0 * 60 * 24,
    },
    # M2. Until 12 August these four selectors existed with no schedule behind them, which meant
    # an unanswered invitation wave stalled forever and a requirement whose needed-by date had
    # passed was never closed by anything. The cadences below are deliberately different: two of
    # these sweeps only close records, and two of them invite real vendors.
    "sweep-expired-requirements": {
        "task": "apps.requirements.tasks.sweep_expired_requirements",
        # 15 minutes. `service_by` is a date, so the worst case is a requirement staying open a
        # quarter-hour into a day on which its quotes were already worthless.
        "schedule": 60.0 * 15,
    },
    "sweep-sla-breached-requirements": {
        "task": "apps.requirements.tasks.sweep_sla_breached_requirements",
        # 5 minutes. This one tells a Customer we missed a promise we made them, and a promise
        # broken quietly for an hour is worse than the breach.
        "schedule": 60.0 * 5,
    },
    "sweep-expired-invitations": {
        "task": "apps.requirements.tasks.sweep_expired_invitations",
        # 2 minutes. Expiring an invitation releases a quote slot and invites a replacement, so
        # this is the sweep the delivery SLA actually depends on.
        "schedule": 60.0 * 2,
    },
    "sweep-expired-proposals": {
        "task": "apps.requirements.tasks.sweep_expired_proposals",
        # 5 minutes. A quote past its validity must stop being selectable before a Customer pays
        # to unlock it.
        "schedule": 60.0 * 5,
    },
    "sweep-orphaned-attachment-uploads": {
        "task": "apps.requirements.tasks.sweep_orphaned_attachment_uploads",
        # Hourly, like its Partner-document twin. An abandoned upload intent costs storage and
        # nothing else.
        "schedule": 60.0 * 60,
    },
    # M2 Wave C2 — the visit plan and the selection clock. Cadences follow the same rule as the
    # four above: the sweeps that hand a resource back run often, and the ones that only settle
    # money run at the pace the money actually moves.
    "sweep-expired-visit-holds": {
        "task": "apps.requirements.tasks.sweep_expired_visit_holds",
        # 2 minutes, like the invitation sweep and for the same reason: this one returns a
        # vendor's time to the shared availability grid, and every minute it waits is a slot the
        # vendor cannot be offered for an A1 job either.
        "schedule": 60.0 * 2,
    },
    "sweep-expired-selections": {
        "task": "apps.requirements.tasks.sweep_expired_selections",
        # 5 minutes. A silent vendor otherwise freezes a requirement in `SELECTED`, and the
        # Customer's entitlement is intact the moment this runs.
        "schedule": 60.0 * 5,
    },
    "sweep-unfilled-visit-shares": {
        "task": "apps.requirements.tasks.sweep_unfilled_visit_shares",
        # 15 minutes. The refund is owed from the instant the fill SLA passes; a quarter-hour of
        # latency on a bank refund that takes days to land is not the slow part.
        "schedule": 60.0 * 15,
    },
    "sweep-missed-estimate-windows": {
        "task": "apps.requirements.tasks.sweep_missed_estimate_windows",
        # 15 minutes, same reasoning.
        "schedule": 60.0 * 15,
    },
    "sweep-visit-payout-holds": {
        "task": "apps.requirements.tasks.sweep_visit_payout_holds",
        # Hourly, matching `reconcile-payouts`. A vendor who finishes onboarding waits at most an
        # hour for money that was already theirs, and the payout batch itself runs no faster.
        "schedule": 60.0 * 60,
    },
    # M2 Wave C3 — the engagement stage spine. Same cadence rule as the ten entries above: a sweep
    # that *decides something on a party's behalf* runs often enough that the decision lands near
    # the deadline it was promised against, and a sweep that only moves already-earned money runs
    # at the pace money actually moves.
    "sweep-stage-reviews": {
        "task": "apps.requirements.tasks.sweep_stage_reviews",
        # 15 minutes. This one turns a Customer's silence into an approval and a vendor's payout,
        # so the promise is "shortly after the window closes" rather than "within the hour" — but
        # it is not the two-minute class either, because nothing is held hostage while it waits.
        "schedule": 60.0 * 15,
    },
    "sweep-stage-payout-holds": {
        "task": "apps.requirements.tasks.sweep_stage_payout_holds",
        # Hourly, matching `sweep-visit-payout-holds` and `reconcile-payouts` for the same reason:
        # the money is already earned and the payout batch itself runs no faster.
        "schedule": 60.0 * 60,
    },
    "sweep-orphaned-stage-evidence-uploads": {
        "task": "apps.requirements.tasks.sweep_orphaned_stage_evidence_uploads",
        # Hourly, like its two upload-intent twins. An abandoned intent costs storage and nothing
        # else.
        "schedule": 60.0 * 60,
    },
}

SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SAMESITE = "Lax"
X_FRAME_OPTIONS = "DENY"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"

LOG_LEVEL = env("LOG_LEVEL", default="INFO")
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "()": "common.observability.logging.JsonFormatter",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": LOG_LEVEL,
    },
    "loggers": {
        "django.server": {
            "handlers": ["console"],
            "level": LOG_LEVEL,
            "propagate": False,
        },
    },
}

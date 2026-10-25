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
    "apps.ratings",
    "apps.listings",
    "apps.rental",
    "apps.stay",
    "apps.wallet",
    "apps.loyalty",
    "apps.ops_reports",
]

MIDDLEWARE = [
    "common.observability.middleware.RequestIdMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    # Ahead of SessionMiddleware so its response hook runs afterwards and can
    # re-issue the sign-out Set-Cookie with the Secure flag Django's own
    # delete omits. See apps.identity.middleware.
    "apps.identity.middleware.ClearAuthCookiesMiddleware",
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

# --- Cloudflare R2 --------------------------------------------------------------------------------
# Every stored file lives in R2 once these are set. Two buckets:
# - public:  photos guests see (stays, rentals, reviews), served from R2_PUBLIC_BASE_URL unsigned.
# - private: résumés and every private document (KYC, crew IDs, job evidence, attachments), only
#            ever reached through short-lived signed links. The document "buckets" named further
#            down become folders inside it.
# Unset (local development, tests), files stay on this machine's disk exactly as before.
R2_ACCOUNT_ID = env("R2_ACCOUNT_ID", default="")
R2_ACCESS_KEY_ID = env("R2_ACCESS_KEY_ID", default="")
R2_SECRET_ACCESS_KEY = env("R2_SECRET_ACCESS_KEY", default="")
R2_PUBLIC_BUCKET = env("R2_PUBLIC_BUCKET", default="")
R2_PUBLIC_BASE_URL = env("R2_PUBLIC_BASE_URL", default="").rstrip("/")
R2_PRIVATE_BUCKET = env("R2_PRIVATE_BUCKET", default="")
R2_ENDPOINT_URL = f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com" if R2_ACCOUNT_ID else ""
R2_CREDENTIALS_CONFIGURED = bool(R2_ACCOUNT_ID and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY)
R2_PUBLIC_ENABLED = R2_CREDENTIALS_CONFIGURED and bool(R2_PUBLIC_BUCKET and R2_PUBLIC_BASE_URL)
R2_PRIVATE_ENABLED = R2_CREDENTIALS_CONFIGURED and bool(R2_PRIVATE_BUCKET)
#: How long a signed link to a private file stays valid.
R2_PRIVATE_URL_TTL_SECONDS = env.int("R2_PRIVATE_URL_TTL_SECONDS", default=300)

_R2_CONNECTION = {
    "access_key": R2_ACCESS_KEY_ID,
    "secret_key": R2_SECRET_ACCESS_KEY,
    "endpoint_url": R2_ENDPOINT_URL,
    "region_name": "auto",
    "signature_version": "s3v4",
    # Never overwrite: every upload gets a fresh random name, and a clash must not replace a photo.
    "file_overwrite": False,
    "default_acl": None,
}
STORAGES = {
    "default": (
        {
            "BACKEND": "storages.backends.s3.S3Storage",
            "OPTIONS": {
                **_R2_CONNECTION,
                "bucket_name": R2_PUBLIC_BUCKET,
                "custom_domain": R2_PUBLIC_BASE_URL.split("://", 1)[-1],
                "url_protocol": "https:",
                "querystring_auth": False,
            },
        }
        if R2_PUBLIC_ENABLED
        else {"BACKEND": "django.core.files.storage.FileSystemStorage"}
    ),
    "private": (
        {
            "BACKEND": "storages.backends.s3.S3Storage",
            "OPTIONS": {
                **_R2_CONNECTION,
                "bucket_name": R2_PRIVATE_BUCKET,
                "location": "files",
                "querystring_auth": True,
                "querystring_expire": R2_PRIVATE_URL_TTL_SECONDS,
            },
        }
        if R2_PRIVATE_ENABLED
        else {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
            "OPTIONS": {"location": BASE_DIR / "private-media", "base_url": "/private-media/"},
        }
    ),
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}

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
        "firebase_verify": "30/minute",
        "geocoding": "30/min",
        "serviceability": "60/min",
        # M2 abuse controls (`M2-BE-803`), enforced by `common.throttling.ScopedWriteThrottle`
        # and keyed per authenticated user.
        #
        # Every rate below is a **ceiling on abuse, not a pacing limit**: each is set well above
        # what the fastest honest use of the screen behind it can produce, so a real Customer or
        # vendor never meets one, and a script does. Setting them near honest use would produce a
        # steady drip of 429s on the busiest legitimate accounts, which is how a rate limit gets
        # turned off in production.
        #
        # These are operational limits, not commercial policy, so they are code and not
        # `M2VariantConfiguration` — nothing here is an owner decision and nothing fails closed on
        # them being absent (a scope with no rate is simply not enforced by DRF).
        #
        # Registration: a vendor requesting capabilities and submitting applications. Low, because
        # the honest act happens a handful of times in an onboarding session and the abusive one
        # enumerates variants.
        "m2_partner_registration": "20/hour",
        # Uploads: one presign plus one finalize per file, and `MAXIMUM_ATTACHMENTS_PER_REQUIREMENT`
        # is 12. Sixty an hour covers several requirements' worth of retried photographs on a bad
        # connection and stops a loop that mints signed URLs.
        "m2_attachment_upload": "60/hour",
        # Clarification: the per-thread cap in `proposals.ask_question` is the real control (a rate
        # cannot express "three unanswered"). This is the second layer, against a script writing to
        # many threads at once.
        "m2_clarification": "60/hour",
        # Money: every checkout creation, on every product. Deliberately the tightest scope here.
        # A Customer taps pay once and retries a handful of times when a bank is slow; nothing
        # honest needs thirty in an hour, and a payment-creation loop is both a cost and a way to
        # fill the provider's books with orphaned orders.
        "m2_money": "30/hour",
        # A vendor answering enquiries, offers and proposals. Generous: a busy lead on a good day
        # genuinely answers a great many offers, and throttling that would cost real supply.
        "m2_partner_response": "300/hour",
        # Marking notifications read. Generous because it is one write per notice opened and a
        # busy day legitimately produces a lot of them; the polled feed and badge reads are
        # exempt through `ThrottledWriteMixin`, which is what keeps this scope affordable.
        "m2_notification_read": "300/hour",
        # A Customer acting on quotes: selection, rejection, revalidation. The non-responsive
        # rejection path is here, and it is the one worth naming — it reopens a quote slot each
        # time, so a loop on it churns real vendors' invitations.
        "m2_quote_action": "120/hour",
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
    "VERSION": "1.69.0",
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
        "CommercialAmountBasisEnum": "apps.requirements.models.CommercialPolicy.AmountBasis",
        "CommercialPolicyTaxBasisEnum": "apps.requirements.models.CommercialPolicy.TaxBasis",
        "CommercialSupplierOfRecordEnum": (
            "apps.requirements.models.CommercialPolicy.SupplierOfRecord"
        ),
        "PartnerApplicationStatusEnum": "apps.partners.models.PartnerApplication.Status",
        "RevisionRequestStatusEnum": "apps.requirements.models.RevisionRequest.Status",
        "RevisionRequestReasonCodeEnum": "apps.requirements.models.RevisionRequest.ReasonCode",
        "PartnerDocumentKindEnum": "apps.partners.models.PartnerDocument.Kind",
        # Named when the Partner directory added a second serializer over `PartnerDocument`.
        # Two `status` fields on one model made the generator disambiguate both, renaming
        # `PartnerDocumentStatusEnum` to a positional `StatusD12Enum` and breaking the partner
        # app's documents step — the same silent-rename trap as `CompletionResponseDecisionEnum`
        # below.
        "PartnerDocumentStatusEnum": "apps.partners.models.PartnerDocument.Status",
        # Crew identity documents, added with the crew-verification surface. `kind` and `status`
        # each already existed on several models, so without these the generator emits positional
        # `Kind461Enum` / `StatusD62Enum` — names that shift the next time any unrelated model
        # gains a `kind`, silently renaming a component both frontends import.
        "CrewDocumentKindEnum": "apps.partners.models.CrewDocument.Kind",
        "CrewDocumentStatusEnum": "apps.partners.models.CrewDocument.Status",
        # The platform-feedback chip vocabulary. `code` is a common field name, so without this
        # the generator emits a positional `CodeF25Enum` that shifts whenever any unrelated model
        # gains a `code` choice set — silently renaming a component both frontends import.
        "PlatformFeedbackTagEnum": "apps.ratings.models.PlatformFeedback.Tag",
        "QuoteLineKindEnum": "apps.carts.models.QuoteLine.Kind",
        "PrivacyRequestKindEnum": "apps.identity.models.PrivacyRequest.Kind",
        "ScopeAmendmentStatusEnum": "apps.fulfilment.models.ScopeAmendment.Status",
        "ScopeAmendmentLineKindEnum": "apps.fulfilment.models.ScopeAmendmentLine.Kind",
        "WorkTaskKindEnum": "apps.fulfilment.models.WorkTask.Kind",
        "WorkEvidenceKindEnum": "apps.fulfilment.models.WorkEvidence.Kind",
        "WorkOutcomeEnum": "apps.fulfilment.models.WorkOutcome.Outcome",
        "BookingStatusEnum": "apps.commerce.models.Booking.Status",
        "ModeEnum": "apps.carts.models.ServiceCompatibilityRule.Mode",
        # Pinned when the host's enquiry view (with the guest's contact) became a second
        # serializer over `StayEnquiry`; without it the enum was renamed to a positional name.
        "StayEnquiryStatusEnum": "apps.stay.models.StayEnquiry.Status",
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
        # M2 Wave C3.5 — the material line, the no-show vocabulary and the question direction.
        #
        # `kind` is now the most contested field name in the schema — eleven choice sets share it —
        # so a twelfth goes in this table on arrival rather than after a rename breaks a client.
        # The other two are serializer-layer vocabularies, published for the same reason
        # `InvitationDeclineReasonEnum` is: the model column also carries the platform's own writes
        # and constraining it would refuse them.
        "EngagementStageKindEnum": "apps.requirements.models.EngagementStage.Kind",
        "VisitNoShowReasonEnum": "apps.requirements.serializers.VISIT_NO_SHOW_REASONS",
        "QuestionAskerRoleEnum": "apps.requirements.selectors.QUESTION_ASKER_ROLES",
        # M2 Wave C2R — the rate-card A3 front door (revision 4).
        #
        # Two more `status` sets and two more `reason_code` ones. `status` is the most reused field
        # name in the schema and `reason_code` is now second, so both go in on arrival: an unnamed
        # set publishes positionally and its digits move the next time an unrelated app adds a
        # field with the same name, which is the failure the 1.24.0 `ReasonEnum` note records.
        #
        # The crew no-show **party** deliberately has no entry: it is the same two-value choice set
        # as `VISIT_NO_SHOW_PARTIES`, so the generator resolves both to the already-published
        # `VisitNoShowPartyEnum` and gives the two surfaces one component. Naming a second one here
        # would split it and rename nothing usefully.
        "BookingFeeStatusEnum": "apps.requirements.models.BookingFee.Status",
        "RateCardBookingStatusEnum": "apps.requirements.models.RateCardBooking.Status",
        "CrewOfferDeclineReasonCodeEnum": (
            "apps.requirements.serializers.CREW_OFFER_DECLINE_REASONS"
        ),
        "CrewNoShowReasonCodeEnum": "apps.requirements.serializers.CREW_NO_SHOW_REASONS",
        # M2 Wave C4 — the A3 shift-day.
        #
        # Three more `status` sets, and `status` is still the most contested field name in the
        # schema, so all three are named on arrival rather than after a positional rename breaks a
        # client. The rest are named because their field names — `severity`, `decision`,
        # `response`, `kind`, `shortfall_choice` — are exactly the short generic ones the 1.24.0
        # `ReasonEnum` incident was about.
        "ShiftAttendanceStatusEnum": "apps.requirements.models.ShiftAttendance.Status",
        "DaySettlementStatusEnum": "apps.requirements.models.DaySettlement.Status",
        "SafetyIncidentStatusEnum": "apps.requirements.models.SafetyIncident.Status",
        "SafetyIncidentSeverityEnum": "apps.requirements.serializers.SAFETY_INCIDENT_SEVERITIES",
        "SafetyIncidentReporterRoleEnum": ("apps.requirements.models.SafetyIncident.ReporterRole"),
        "SafetyIncidentDecisionEnum": "apps.requirements.serializers.SAFETY_INCIDENT_DECISIONS",
        "AttendanceResponseEnum": "apps.requirements.serializers.ATTENDANCE_RESPONSES",
        "ShortfallChoiceEnum": "apps.requirements.serializers.SHORTFALL_CHOICES",
        "ShiftExtraKindEnum": "apps.requirements.serializers.SHIFT_EXTRA_KINDS",
        # M2 Wave C5 — the A5 project.
        #
        # Two more `status` sets and one more `kind`, which are the two most contested field names
        # in the schema, so all three are named on arrival rather than after a positional rename
        # breaks a client — the standing rule since the 1.24.0 `ReasonEnum` incident.
        #
        # Nothing is needed for the A5 milestone read even though it publishes `status`, `kind`
        # and `funding_state`: those are `ChoiceField`s over `EngagementStage`'s own choice sets,
        # which are already pinned above, so the generator resolves all three to the components
        # published since 1.24.0 and the project surface reuses them rather than splitting them.
        "ProjectDelayClaimStatusEnum": "apps.requirements.models.ProjectDelayClaim.Status",
        "ProjectTransferStatusEnum": "apps.requirements.models.ProjectTransfer.Status",
        "ProjectDeliverableKindEnum": "apps.requirements.models.ProjectDeliverable.Kind",
        # Stays/rentals and listings moderation status choice sets
        "ModerationStatusEnum": "apps.stay.models.Property.ModerationStatus",
        "ListingModerationStatusEnum": "apps.listings.models.Listing.ModerationStatus",
        # A7 rental delivery. The booking status set gained AWAITING_TRANSPORT_QUOTE, which
        # changes its hash name (it was `StatusD8aEnum`, unreferenced by name in the apps), so
        # it is named here once and for good, with the three new choice sets beside it.
        # Pinned so the new `RentalAssetDetail` component doesn't push it to a hash name.
        "RentalAssetModerationStatusEnum": "apps.rental.models.RentalAsset.ModerationStatus",
        "RentalBookingStatusEnum": "apps.rental.models.RentalBooking.Status",
        "RentalBookingModeEnum": "apps.rental.models.RentalBooking.Mode",
        "RentalTransportStatusEnum": "apps.rental.models.RentalTransportRequest.Status",
        "RentalTransportTripEnum": "apps.rental.models.RentalTransportRequest.Trip",
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

FIREBASE_PROJECT_ID = env("FIREBASE_PROJECT_ID", default="")
FIREBASE_CREDENTIALS_JSON = env("FIREBASE_CREDENTIALS_JSON", default="")
FIREBASE_AUTH_ENABLED = env.bool("FIREBASE_AUTH_ENABLED", default=False)
FIREBASE_TOKEN_MAX_AGE_SECONDS = env.int("FIREBASE_TOKEN_MAX_AGE_SECONDS", default=300)

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

# Outbound message transport for SMS, WhatsApp and voice. MSG91 sends only when MSG91_AUTH_KEY
# is set. An empty key refuses rather than reporting a send that never left.
MESSAGE_TRANSPORT = env("MESSAGE_TRANSPORT", default="unconfigured")
NOTIFICATIONS_ALLOW_FAKE_TRANSPORT = env.bool("NOTIFICATIONS_ALLOW_FAKE_TRANSPORT", default=False)
# Present only after the client sends the MSG91 account. Empty means send refuses.
MSG91_AUTH_KEY = env("MSG91_AUTH_KEY", default="")
MSG91_SENDER_ID = env("MSG91_SENDER_ID", default="")
MSG91_OTP_TEMPLATE_ID = env("MSG91_OTP_TEMPLATE_ID", default="")
MSG91_API_BASE_URL = env("MSG91_API_BASE_URL", default="https://control.msg91.com/api/v5")

GEOCODING_PROVIDER = env("GEOCODING_PROVIDER", default="unconfigured")
# Server-only Google key, restricted to the Geocoding API and the servers' IPs. The browser key the
# frontends use for the map is a different key and never reaches Django.
GOOGLE_MAPS_SERVER_KEY = env("GOOGLE_MAPS_SERVER_KEY", default="")
GEOCODING_TIMEOUT_SECONDS = env.float("GEOCODING_TIMEOUT_SECONDS", default=3.0)
GEOCODING_CACHE_SECONDS = env.int("GEOCODING_CACHE_SECONDS", default=60 * 60 * 24 * 7)
GEOCODING_CACHE_COORDINATE_PRECISION = env.int(
    "GEOCODING_CACHE_COORDINATE_PRECISION",
    default=5,
)

PARTNER_REQUIRED_DOCUMENT_KINDS = ("GOVERNMENT_ID",)
# "r2" (Cloudflare, uses R2_PRIVATE_BUCKET above), "supabase", or "unconfigured".
DOCUMENT_STORAGE_PROVIDER = env("DOCUMENT_STORAGE_PROVIDER", default="unconfigured")
# Malware scanning of uploaded Partner documents; see `apps.partners.scanning`. `unconfigured`
# leaves every document PENDING (fail closed); `development` marks everything clean and is refused
# in production.
DOCUMENT_SCAN_PROVIDER = env("DOCUMENT_SCAN_PROVIDER", default="unconfigured")
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
# A crew member's identity evidence. Its own bucket, not `partner-kyc`: these are documents about
# a *worker*, retained on a different basis from the agency's own KYC, and a shared bucket makes
# "delete everything we hold about this person" a prefix scan across two subjects.
CREW_DOCUMENT_BUCKET = env("CREW_DOCUMENT_BUCKET", default="crew-identity")
# What a crew member must have approved before Operations verification stamps itself. Government
# identity only, by default and deliberately: address proof and police verification are real
# document kinds a Partner may upload and a reviewer may approve, but requiring them would empty
# every roster the day this ships. Widening this is an owner decision with a migration plan, not a
# default.
CREW_REQUIRED_DOCUMENT_KINDS = ("GOVERNMENT_ID",)
# Generous for a phone camera photographing an ID card, small enough that a review queue is not a
# gallery of twenty-megabyte originals. Half the partner-KYC ceiling, which admits multi-page PDFs
# this never needs.
MAX_CREW_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024
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

# Wave: the A5 arrival code.
#
# Longer than M1's five-minute start OTP (`M1_START_OTP_TTL_SECONDS`) and deliberately so. That
# code is sent when a Partner is already at the door; this one is shown to a Customer against a
# booked *window* — a visit scheduled for "2 to 3pm" is a code that has to survive somebody
# arriving at ten past. Two hours covers a window plus the lateness a real site produces, and
# still expires the same day.
M2_VISIT_ARRIVAL_CODE_TTL_SECONDS = env.int(
    "M2_VISIT_ARRIVAL_CODE_TTL_SECONDS", default=2 * 60 * 60
)
# Same budget as every other OTP here. Five wrong entries is a vendor who has misread the digits,
# not one who is guessing at a six-digit space.
M2_VISIT_ARRIVAL_CODE_MAX_ATTEMPTS = env.int("M2_VISIT_ARRIVAL_CODE_MAX_ATTEMPTS", default=5)

# Customer-held consent used when a Partner closes a custom project. The plaintext display copy
# is cache-only; the database keeps only an expiring password hash.
M2_PROJECT_COMPLETION_CODE_TTL_SECONDS = env.int(
    "M2_PROJECT_COMPLETION_CODE_TTL_SECONDS", default=30 * 60
)
M2_PROJECT_COMPLETION_CODE_MAX_ATTEMPTS = env.int(
    "M2_PROJECT_COMPLETION_CODE_MAX_ATTEMPTS", default=5
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
# Wave C7: how many rows of each M2 product one `reconcile_m2_money` tick checks.
#
# The sweep used to read every settled row of every product on every hourly tick, so its cost grew
# with the lifetime size of the books rather than with what had changed. It now walks a keyset
# cursor per product and wraps at the end. 500 x 4 products x 24 ticks is 48,000 rows a day, which
# laps a book of any plausible M2 size several times over while keeping one tick bounded.
#
# Raising this does not make the check more correct — only faster to complete a lap. It reads only,
# so a row not reached this tick is a mismatch reported an hour later, never one that is missed.
M2_RECONCILIATION_BATCH_SIZE = env.int("M2_RECONCILIATION_BATCH_SIZE", default=500)

# Wave C7 (`M2-BE-805`): retention.
#
# **The financial schedule is deliberately unset, and `0` means "the hold never lapses".** It is a
# legal question, not an engineering one — `apps.identity.retention` records the same gap for
# verified KYC and refuses to guess it too — and a default here would decide how long this business
# keeps its books, on the day a Customer asks for their data to be removed. Fail-closed for a
# retention schedule means *keeping* the record, so the unset value holds rather than releases.
M2_FINANCIAL_RECORD_RETENTION_DAYS = env.int("M2_FINANCIAL_RECORD_RETENTION_DAYS", default=0)
# How long a **closed** request's attachment bytes are kept. Measured from close rather than from
# upload, because a vendor reads them for as long as the request is live and a request can
# legitimately stay open for weeks. Ninety days is an operational storage judgement and not an
# owner decision: nothing commercial turns on it and no money moves on it. `0` disables the sweep.
#
# The safety is not the number. `retention.purge_expired_attachments` skips any request under a
# financial hold, which is what stops this from destroying the photographs in an open dispute.
M2_ATTACHMENT_RETENTION_DAYS = env.int("M2_ATTACHMENT_RETENTION_DAYS", default=90)

# Wave C7 (`M2-BE-808`): how long a piece of asynchronous work may sit before
# `apps.requirements.watchdog` counts it as stuck. Operational judgements about this deployment's
# queue and provider, deliberately **not** `M2VariantConfiguration` columns — nothing here is an
# owner decision, no money moves on any of them, and none fails closed. They report.
#
# Every one is set to comfortably more than the sweep that is supposed to handle the work: the
# watchdog's job is to notice that a recovery did not happen, so a threshold at or below the
# recovery's own cadence would report normal latency as an incident and teach everyone to ignore it.
#
# Outbox: the recovery beat runs every 30 seconds, so ten minutes overdue means roughly twenty
# ticks did not happen.
M2_STUCK_OUTBOX_SECONDS = env.int("M2_STUCK_OUTBOX_SECONDS", default=600)
# Payments: `reconcile-payments` runs every 30 seconds and `M1_PAYMENT_WINDOW_SECONDS` is 300. An
# attempt unresolved after an hour is not a slow bank.
M2_STUCK_PAYMENT_SECONDS = env.int("M2_STUCK_PAYMENT_SECONDS", default=60 * 60)
# Refunds: a real bank refund genuinely takes days, so this is deliberately far looser than the
# rest. Six hours matches `reconciliation.refunds_awaiting_provider`'s own default cutoff, which is
# the queue an operator already works from.
M2_STUCK_REFUND_SECONDS = env.int("M2_STUCK_REFUND_SECONDS", default=6 * 60 * 60)
# The cascade: an *instant* product. Thirty minutes still looking for a crew is not slow, it is
# broken — the Customer has been watching a holding state that promised minutes.
M2_STUCK_CASCADE_SECONDS = env.int("M2_STUCK_CASCADE_SECONDS", default=30 * 60)
# Notifications: an intent only reaches `FAILED` once its whole retry budget is spent, so this is
# a grace period on top of a process that has already given up.
M2_STUCK_NOTIFICATION_SECONDS = env.int("M2_STUCK_NOTIFICATION_SECONDS", default=30 * 60)

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
    "expire-abandoned-payment-attempts": {
        "task": "apps.commerce.tasks.expire_abandoned_payment_attempts",
        "schedule": 60.0,
    },
    "expire-loyalty-coins": {
        "task": "apps.loyalty.tasks.expire_due_coins",
        "schedule": 60.0 * 15,
    },
    "release-loyalty-rewards": {
        # Pays booking coins and referral rewards once their waiting period is over.
        "task": "apps.loyalty.tasks.release_due_loyalty_rewards",
        "schedule": 60.0 * 15,
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
    "sweep-underfilled-quote-waves": {
        "task": "apps.requirements.tasks.sweep_underfilled_quote_waves",
        # 2 minutes, like the expiry sweep it complements. This is the safety net under the
        # inline refills: it catches slots freed by paths with no refill of their own, and it
        # re-reaches vendors who became eligible only after the opening wave went out.
        "schedule": 60.0 * 2,
    },
    "sweep-searching-visit-shares": {
        "task": "apps.requirements.tasks.sweep_searching_visit_shares",
        # 2 minutes. A SEARCHING share with no live offer is a Customer watching a spinner; each
        # tick re-dispatches to newly free Partners or settles honestly once the visit is too
        # close to staff.
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
    # M2 Wave C2R — the rate-card crew cascade (revision 4). These run on the **M1 dispatch
    # cadence**, not the M2 business-hours one, and that is the whole difference: a crew offer
    # times out in minutes of wall time, so a two-minute tick is the slow end of what it needs
    # rather than the fast end.
    "sweep-expired-crew-offers": {
        "task": "apps.requirements.tasks.sweep_expired_crew_offers",
        # 60 seconds. This is the sweep the instant promise depends on: every second an expired
        # offer sits unswept is a second the Customer is watching a holding state that has already
        # failed, and the recovery is a wider wave rather than a longer wait.
        "schedule": 60.0,
    },
    "sweep-expired-offer-holds": {
        "task": "apps.requirements.tasks.sweep_expired_offer_holds",
        # 60 seconds. It hands a lead's dates back after a Customer who never paid, and those
        # dates are also capacity the A1 grid and the next crew offer both want.
        "schedule": 60.0,
    },
    "sweep-stalled-rate-card-bookings": {
        "task": "apps.requirements.tasks.sweep_stalled_rate_card_bookings",
        # 2 minutes. A watchdog on a watchdog: everything ordinary advances the cascade inline, so
        # this only ever catches a booking the ordinary paths left behind.
        "schedule": 60.0 * 2,
    },
    "sweep-unearned-booking-fees": {
        "task": "apps.requirements.tasks.sweep_unearned_booking_fees",
        # 15 minutes, matching `sweep-unfilled-visit-shares`. The refund is owed from the instant
        # the requirement closes, and a quarter-hour is not the slow part of a bank refund.
        "schedule": 60.0 * 15,
    },
    "sweep-travel-compensation-holds": {
        "task": "apps.requirements.tasks.sweep_travel_compensation_holds",
        # Hourly, matching every other payout-hold sweep and `reconcile-payouts`.
        "schedule": 60.0 * 60,
    },
    "sweep-unproven-day-settlements": {
        "task": "apps.requirements.tasks.sweep_unproven_day_settlements",
        # Hourly. The rows it raises are already a day old by definition, so the tick rate decides
        # nothing except how long after that an operator hears — and the event is keyed per
        # settlement, so a frequent tick raises each evening exactly once.
        "schedule": 60.0 * 60,
    },
    "sweep-rate-card-decline-alarm": {
        "task": "apps.requirements.tasks.sweep_rate_card_decline_alarm",
        # 15 minutes. ADR-0009 makes this load-bearing — a stale rate kills the instant product
        # quietly — and the notification is keyed per card per day, so a frequent tick pages once
        # and then stops rather than repeating itself.
        "schedule": 60.0 * 15,
    },
    # M2 Wave C5 — the A5 project's own clocks. Two of these expire an **unanswered request**
    # rather than granting it, which is why neither is urgent: nothing is held hostage while they
    # wait, because the agreement in force is the one that stands until somebody says otherwise.
    "sweep-delay-claims": {
        "task": "apps.requirements.tasks.sweep_delay_claims",
        # 15 minutes, matching `sweep-stage-reviews`. Both turn a Customer's silence into an
        # outcome near the deadline it was promised against — but this one turns it into a
        # refusal, so the cost of a late tick is a vendor waiting rather than a schedule moving.
        "schedule": 60.0 * 15,
    },
    "sweep-project-transfers": {
        "task": "apps.requirements.tasks.sweep_project_transfers",
        # 15 minutes. A lapsed proposal hands a replacement vendor's diary back, which is the same
        # kind of debt `sweep-expired-offer-holds` settles, at the pace a project moves rather
        # than the pace a crew offer does.
        "schedule": 60.0 * 15,
    },
    "sweep-warranty-windows": {
        "task": "apps.requirements.tasks.sweep_warranty_windows",
        # Hourly, matching every other payout-hold sweep and `reconcile-payouts`. The retention is
        # already earned and merely held; a warranty period is measured in months, so the tick
        # rate decides nothing except how long after midnight the vendor sees it.
        "schedule": 60.0 * 60,
    },
    # M2 Wave C6 — recovery. Neither of these decides money, which is why neither is urgent: one
    # escalates a silence to a person and the other opens exceptions for a person to read.
    "sweep-lapsed-cancellation-confirmations": {
        "task": "apps.requirements.tasks.sweep_lapsed_cancellation_confirmations",
        # 15 minutes, matching `sweep-delay-claims`. Both turn one party's silence into an outcome
        # near the deadline it was promised against — and this one turns it into "a human decides",
        # so the cost of a late tick is a case opening a quarter-hour later, never money moving.
        "schedule": 60.0 * 15,
    },
    # M2 Wave C7 — retention (`M2-BE-805`) and the watchdog on the watchdogs (`M2-BE-808`).
    "purge-expired-m2-attachments": {
        "task": "apps.requirements.tasks.purge_expired_attachments",
        # Daily, matching `identity-retention-sweep` and for the same reason: deleting storage
        # nobody is reading is not urgent, and doing it in the middle of a booking peak would be.
        "schedule": 60.0 * 60 * 24,
    },
    "report-stuck-async-work": {
        "task": "apps.requirements.tasks.report_stuck_async_work",
        # 5 minutes. It reads counts and writes nothing, so it is cheap; and it is the series an
        # alert on "the beat itself has stopped" is written against, which only works if the series
        # is dense enough that a gap is obvious within minutes rather than within an hour.
        "schedule": 60.0 * 5,
    },
    "reconcile-m2-money": {
        "task": "apps.requirements.tasks.reconcile_m2_money",
        # Hourly, matching `reconcile-payouts`. The least urgent sweep on this list: a mismatch that
        # has existed for an hour has existed for an hour whether or not anybody looked, and the
        # exception it opens is deduplicated per row so a frequent tick would only re-read the same
        # books.
        #
        # It used to also be the most expensive, reading **every** settled M2 money row every tick.
        # Wave C7 gave it a per-product keyset cursor bounded by `M2_RECONCILIATION_BATCH_SIZE`, so
        # a tick is now bounded and the whole book is covered over a few laps instead.
        "schedule": 60.0 * 60,
    },
    # A10 Career/Jobs — listing and vendor-subscription expiry. Same family as offer/reservation
    # sweeps; 15 minutes is enough because a listing's `expires_at` is a day-scale clock.
    "sweep-expired-listings": {
        "task": "apps.listings.tasks.expire_published_listings",
        "schedule": 60.0 * 15,
    },
    "sweep-expired-subscriptions": {
        "task": "apps.listings.tasks.expire_vendor_subscriptions",
        "schedule": 60.0 * 15,
    },
    # A7 rental delivery. A quote has a 24-hour answer window, so 5 minutes late is close enough;
    # an expired request only lets go of dates nobody has paid for.
    "expire-rental-transport-requests": {
        "task": "apps.rental.tasks.expire_rental_transport_requests",
        "schedule": 60.0 * 5,
    },
}

SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = True
# `Lax` everywhere it can be, which is everywhere the app and the API share a site.
#
# It is configurable for one case and it is worth naming, because getting it wrong looks like a
# bug in the login rather than a cookie policy: when the two are served from *different* hosts —
# a developer tunnelling the frontend and the backend separately to test on a phone — the API call
# is cross-site, and a `Lax` cookie is simply not sent. The session appears to work and then every
# authenticated read comes back 403.
#
# `None` is the only value that fixes it, and browsers reject `SameSite=None` without `Secure`, so
# the two move together. Never set this in production: the deployed apps are same-site, and
# `SameSite=None` there would hand back the CSRF protection this pairing exists to provide.
SESSION_COOKIE_SAMESITE = env("SESSION_COOKIE_SAMESITE", default="Lax")
CSRF_COOKIE_SAMESITE = env("CSRF_COOKIE_SAMESITE", default="Lax")
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

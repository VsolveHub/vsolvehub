# Employer onboarding V1: "Who is hiring?"

**Execution plan for the intern** · written 19 November 2026 · branch `employer-onboarding/v1`

This replaces the current "I want to hire staff" (EMPLOYER track) onboarding. Read the whole
document once before writing any code. Every file path is relative to the repository root.

---

## 0. Ground rules

| Rule | What it means for you |
|---|---|
| Branch | Create `employer-onboarding/v1` from the latest `main`. Never commit to `main`. Open one PR to `main` at the end; the owner merges it. |
| Staging files | Stage explicit paths only. **Never `git add -A` or `git add .`.** Other people's work lives in the same tree. |
| Commits | One commit per phase is fine. Message format: `feat(employer): <what>`. |
| Backend rules | Read `AGENTS.md` (root) first. Views stay thin, business rules go in services, the database enforces invariants too, money is integer paise. |
| Contract | Frontends only talk to Django through the generated client. Never hand-edit `contracts/openapi/v1.yaml` or `frontend/packages/api-client/src/generated/schema.d.ts`; regenerate them (commands in Phase 5). |
| Mobile apps | `frontend/mobile/**` has its own rules: read `frontend/mobile/AGENTS.md` and `frontend/mobile/README.md` before Phase 9. |
| Tests | Write a test for every rule in this plan. **Running tests:** run the focused modules listed in each phase **only if the owner has allowed you to**. Otherwise list them in the PR and the owner runs them. Static checks (lint, typecheck, build, `quality-static`) you always run. |
| Fake data | No placeholder or mock data in the product. An empty state says it's empty. Seeds (demo data) are the only exception. |
| Languages | Every new partner-app text needs English, Telugu and Hindi (the `apply.ts` catalogue has all three). If you can't translate, put the English text in all three and list the keys in the PR. |
| When unsure | Ask the owner. Don't guess a business rule. Section 11 lists the questions already known. |

---

## 1. What we are building

### Decisions already made by the owner (don't reopen them)

1. After choosing **"I want to hire staff"**, the employer picks **who is hiring**:
   **For my home / myself** (individual) or **For a business** (organization).
2. **V1 is manual only.** No GST API, no DigiLocker, no PAN check, no face match, no email OTP.
   The employer types everything; Operations checks it by hand. (Integrations come in V2.)
3. **No auto-approval.** Every employer application is reviewed by Operations.
4. **No migration.** There are no live employers yet, so the old EMPLOYER onboarding is replaced
   in place.
5. **Recruitment agencies** (hiring for somebody else's company) are not allowed in V1.
6. **Individuals** can only post household jobs: no work-from-home, at most 5 vacancies per job,
   at most 3 live jobs.

### The flow

```
Login (OTP) → /apply → "I want to hire staff"
                          │
                          ▼
                 /apply/hiring-as  "Who is hiring?"
        ┌─────────────────┴──────────────────┐
        ▼                                    ▼
 🏠 For my home / myself               🏢 For a business
 /apply/employer/about                 /apply/employer/business
 (name, location, help needed,         (business name, legal name, type,
  ID type, household declaration)      industry, size, GST?, address + pin, logo)
        │                                    ▼
        │                              /apply/employer/contact
        │                              (your name, role, ID type)
        ▼                                    ▼
 /apply/documents                      /apply/documents
 (ID + selfie)                         (ID + business proof [+ authorization letter])
        ▼                                    ▼
 /apply/review  ───────────────┬──────  /apply/review
                               ▼
              Operations review (manual checklist)
                               ▼
     Approved → can publish jobs → job cards show a "Verified" badge
```

While the application is waiting, the employer may **write and save draft jobs**; publishing
unlocks only after approval (Phase 4, task 4.6).

---

## 2. What exists today (read these files first)

| Area | File | What's there |
|---|---|---|
| Track enum | `backend/apps/partners/models/onboarding.py` | `PartnerApplication.Track.EMPLOYER = "Hire staff"`, `PartnerProfile`, `PartnerDocument` (+ `Kind`) |
| Applicant API | `backend/apps/partners/views/partner_application.py` | `GET/PATCH /api/v1/partner/application/`, document upload + finalize, submit |
| Applicant services | `backend/apps/partners/services/application.py` | `update_partner_application`, `submit_partner_application` (EMPLOYER skips trades/areas/hours) |
| Shared rules | `backend/apps/partners/services/base.py` | `_base_application_is_complete`, `_latest_required_documents_are_approved` |
| Ops review | `backend/apps/partners/services/review.py` | `transition_partner_application` (approve / changes / decline) |
| Serializers | `backend/apps/partners/serializers/onboarding.py` | `PartnerApplicationSerializer` (`required_document_kinds` comes from settings today) |
| Required docs | `backend/config/settings/base.py` | `PARTNER_REQUIRED_DOCUMENT_KINDS = ("GOVERNMENT_ID",)` |
| Posting permission | `backend/apps/partners/capabilities/eligibility.py` | `is_approved_employer()` |
| Jobs | `backend/apps/listings/services.py`, `jobs.py`, `serializers.py`, `views.py` | `post_job`, `publish_job_now`, `_require_listing_capability`; job card `poster_name = poster.display_name` |
| Job templates | `backend/apps/listings/migrations/0012_seed_job_templates.py` | 12 categories; **no household category** |
| Partner web onboarding | `frontend/apps/partner/app/apply/**`, `frontend/apps/partner/features/application/**` | `model/steps.ts` (`applicationSteps`), `model/readiness.ts`, `view/about-step.tsx`, `view/documents-step.tsx`, `view/review-step.tsx`, `view/application-overview.tsx` |
| Partner web job form | `frontend/apps/partner/features/listings/view/post-job-wizard.tsx` | 4-step job wizard |
| Map pin (web) | `frontend/apps/partner/features/location/view/find-on-map.tsx` | `FindOnMap` → `@vsolve/ui/location-picker` |
| Ops console | `frontend/apps/admin/features/partner-review/view/review-detail.tsx` | Application review screen, `TRACK_CONFIG.EMPLOYER` |
| Customer web jobs | `frontend/apps/customer/features/listings/**`, `app/(flow)/listings/**` | Job cards and detail use `poster_name` |
| Partner mobile | `frontend/mobile/apps/partner/app/(app)/apply/**`, `src/features/application/**` | Same onboarding on the phone |
| Customer mobile | `frontend/mobile/apps/customer/src/features/listings/**` | Job cards on the phone |
| Demo data | `backend/apps/listings/management/commands/seed_jobs_demo.py`, `backend/apps/catalog/management/commands/seed_listing_catalog.py` | Creates approved EMPLOYER partners |
| Similar track tests | `backend/tests/partners/test_stay_host_track.py`, `backend/tests/listings/test_jobs_quick_post.py`, `backend/tests/listings/jobs_helpers.py` | Patterns to copy |

**Do not use `PartnerBusinessProfile`** (`backend/apps/partners/models/capabilities.py`). It is the
M2 tax and invoice identity for workforce agencies and project vendors. It feeds GST receipts and
has database constraints for those types. Employers get their own model (section 3).

---

## 3. Data model (backend)

### 3.1 New file `backend/apps/partners/models/employer.py`

Export both models from `backend/apps/partners/models/__init__.py`.

**`EmployerProfile`**: one per employer partner.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID pk | |
| `partner` | OneToOne → `PartnerProfile`, `PROTECT`, `related_name="employer_profile"` | |
| `hiring_as` | Char(12), choices `HiringAs`: `INDIVIDUAL` "For my home or myself", `ORGANIZATION` "For a business"; `blank=True` | `""` = not chosen yet |
| `email` | EmailField, blank | Optional for both |
| `id_document_type` | Char(20), choices `IdDocumentType`: `AADHAAR_MASKED`, `PAN`, `DRIVING_LICENCE`, `VOTER_ID`, `PASSPORT`; blank | Which ID they upload |
| `address_line` | Char(240), blank | **Business only.** Never shown publicly |
| `area` | Char(120), blank | Shown publicly ("Kondapur") |
| `city` | Char(80), blank | Shown publicly |
| `state` | Char(40), default `"Telangana"` | |
| `pin_code` | Char(6), blank | Exactly 6 digits, first digit 1–9 |
| `latitude`, `longitude` | Decimal(9,6), null | Use `pin_constraints(prefix="employer_profile", ...)` from `apps/locations/pins.py` (both-or-neither) |
| `household_needs` | JSON list, default `[]` | **Individual only.** Codes in `HouseholdNeed`: `HOUSE_HELP`, `COOK`, `DRIVER`, `CARETAKER`, `NANNY`, `PATIENT_ATTENDANT`, `TUTOR`, `GARDENER`, `OTHER` |
| `household_declared_at` | DateTime, null | **Individual only.** Set when they tick "not for a business" |
| `business_name` | Char(120), blank | **Business only.** The public name on job cards |
| `legal_name` | Char(200), blank | **Business only** |
| `legal_structure` | Char(24), choices `LegalStructure`: `PROPRIETORSHIP`, `PARTNERSHIP_LLP`, `COMPANY`, `TRUST_SOCIETY_NGO`, `GOVERNMENT`; blank | |
| `industry` | Char(24), choices `Industry`: `RETAIL`, `RESTAURANT_FOOD`, `CLINIC_HOSPITAL`, `SCHOOL_COACHING`, `OFFICE_IT`, `FACTORY`, `CONSTRUCTION`, `SECURITY_FACILITY`, `LOGISTICS`, `HOTEL`, `SALON_BEAUTY`, `OTHER`; blank | |
| `company_size` | Char(12), choices `CompanySize`: `SIZE_1_10` "1–10", `SIZE_11_50` "11–50", `SIZE_51_200` "51–200", `SIZE_200_PLUS` "200+"; blank | |
| `has_gst` | Boolean, `null=True` | `None` = not answered yet |
| `gstin` | Char(15), blank, `db_index=True` | Upper-case, no spaces |
| `business_proof_type` | Char(24), choices `BusinessProofType`: `GST_CERTIFICATE`, `INCORPORATION_CERTIFICATE`, `COMPANY_PAN`, `SHOP_ESTABLISHMENT`, `TRADE_LICENCE`, `FSSAI`, `CLINIC_REGISTRATION`, `UDYAM`; blank | Which proof they upload |
| `poster_role` | Char(12), choices `PosterRole`: `OWNER` "Owner / Partner / Director", `HR` "HR / Recruiter", `MANAGER` "Manager", `OTHER` "Other"; blank | **Business only** |
| `website_url` | URLField(300), blank | Website or Google Maps link |
| `logo` | ImageField/FileField, blank, `upload_to=employer_logo_upload_to` | **Public** file, same default storage as stay photos (`apps/stay/models.py` `stay_ad_upload_to`) |
| `created_at`, `updated_at` | auto | |

Database constraints (`Meta.constraints`):

- `partners_employer_gstin_needs_gst`: `Q(gstin="") | Q(has_gst=True)`
- `partners_employer_individual_no_business`: `~Q(hiring_as="INDIVIDUAL") | Q(business_name="", legal_name="", gstin="", address_line="")`
- the two pin constraints from `pin_constraints(...)`

**`EmployerReviewCheck`**: one row per manual check that Operations ticks. V2 will write
automatic results into the same table, which is why `method` exists now.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID pk | |
| `application` | FK → `PartnerApplication`, `PROTECT`, `related_name="employer_checks"` | |
| `code` | Char(32), choices `Code` (below) | |
| `result` | Char(8), choices `PASS`, `FAIL` | |
| `note` | Char(480), blank | Required when `FAIL` |
| `method` | Char(12), choices `MANUAL`, `AUTOMATIC`; default `MANUAL` | V1 only writes `MANUAL` |
| `checked_by` | FK → user, `PROTECT` | |
| `checked_at` | DateTime, `auto_now` | |

Unique constraint on `(application, code)`.

Check codes and when each one is required:

| Code | Label shown to Operations | Required for |
|---|---|---|
| `NAME_MATCHES_ID` | The name on the ID matches the name they gave | Individual |
| `SELFIE_MATCHES_ID` | The selfie is the same person as the ID photo | Individual |
| `HOUSEHOLD_PURPOSE` | The help is for a home, not a business | Individual |
| `GST_ACTIVE_ON_PORTAL` | GSTIN is **Active** on the GST portal and the legal name matches | Business **with** GST |
| `PROOF_MATCHES_BUSINESS` | The business proof shows the same legal name and isn't edited | Business |
| `POSTER_ID_MATCHES` | The poster's ID matches the name they gave | Business |
| `AUTHORITY_CONFIRMED` | Owner: ID name matches the business owner. Others: authorization letter is valid | Business |

### 3.2 Changes to `PartnerDocument.Kind` (`backend/apps/partners/models/onboarding.py`)

Add three kinds: `SELFIE` "Selfie", `BUSINESS_PROOF` "Business proof",
`AUTHORIZATION_LETTER` "Authorization letter". `PartnerDocumentUpload.kind` uses the same
choices, so the migration alters both fields.

`SELFIE` accepts **JPEG/PNG only** (no PDF): enforce it in
`backend/apps/partners/services/documents.py` `issue_partner_document_upload`, error code
`document_selfie_image_only`.

### 3.3 Migrations

- `backend/apps/partners/migrations/0029_employer_profile.py`: both new models + the kind
  choices. Generate it with `makemigrations partners`, then rename it. Before opening the PR,
  rebase on `main`; if `main` already has a `0029`, regenerate with the next number.
- `backend/apps/listings/migrations/0018_home_personal_templates.py`: data migration that adds
  the household job templates (task 4.4). Copy the style of `0012_seed_job_templates.py`.

---

## 4. Business rules (backend)

### 4.1 GSTIN and PAN checks: new file `backend/apps/partners/gstin.py`

Everything here runs offline. Nothing calls the internet.

```python
CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

def gstin_check_char(first14: str) -> str:
    total = 0
    for i, char in enumerate(first14):
        value = CHARSET.index(char) * (1 if i % 2 == 0 else 2)
        total += value // 36 + value % 36
    return CHARSET[(36 - total % 36) % 36]
```

Verified against public samples: `27AAPFU0939F1ZV` and `29AAGCB7383J1Z4` both pass. Put both in
your tests.

`validate_gstin(raw) -> GstinFacts` normalises (upper-case, strip spaces) and raises
`GstinInvalidError(code)` in this order:

| Order | Check | Error code | Message |
|---|---|---|---|
| 1 | Exactly 15 characters, A–Z and 0–9 only | `gstin_format` | "A GSTIN has 15 letters and numbers." |
| 2 | First 2 digits are a known state code (table below) | `gstin_state` | "The first two digits must be a state code." |
| 3 | Characters 3–12 look like a PAN: `[A-Z]{5}[0-9]{4}[A-Z]` | `gstin_pan` | "Characters 3–12 must be the business PAN." |
| 4 | Character 13 is 1–9 or A–Z | `gstin_format` | (same as 1) |
| 5 | Character 15 equals `gstin_check_char(first 14)` | `gstin_checksum` | "This GSTIN isn't valid. Check for a typo." |

`GstinFacts` returns `state_code`, `state_name`, `pan`, `pan_holder_letter` (the 4th letter of
the PAN).

State codes (cross-check against the GST portal list before you finish):
`01` Jammu & Kashmir · `02` Himachal Pradesh · `03` Punjab · `04` Chandigarh · `05` Uttarakhand ·
`06` Haryana · `07` Delhi · `08` Rajasthan · `09` Uttar Pradesh · `10` Bihar · `11` Sikkim ·
`12` Arunachal Pradesh · `13` Nagaland · `14` Manipur · `15` Mizoram · `16` Tripura ·
`17` Meghalaya · `18` Assam · `19` West Bengal · `20` Jharkhand · `21` Odisha · `22` Chhattisgarh ·
`23` Madhya Pradesh · `24` Gujarat · `26` Dadra & Nagar Haveli and Daman & Diu ·
`27` Maharashtra · `29` Karnataka · `30` Goa · `31` Lakshadweep · `32` Kerala · `33` Tamil Nadu ·
`34` Puducherry · `35` Andaman & Nicobar · `36` Telangana · `37` Andhra Pradesh · `38` Ladakh ·
`97` Other Territory · `99` Centre Jurisdiction.

PAN 4th letter → holder type, and the legal structures it is expected for:

| Letter | Holder | Expected for |
|---|---|---|
| `P` | Individual (incl. proprietor) | `PROPRIETORSHIP` |
| `F` | Firm / LLP | `PARTNERSHIP_LLP` |
| `C` | Company | `COMPANY` |
| `T` | Trust | `TRUST_SOCIETY_NGO` |
| `A` | Association of persons (societies) | `TRUST_SOCIETY_NGO` |
| `G` / `L` | Government / local authority | `GOVERNMENT` |
| `H`, `B`, `J` | HUF, body of individuals, artificial juridical person | none (always a hint) |

A mismatch is **never** an error, only a hint for Operations (4.3).

### 4.2 Which documents are required: new function in `backend/apps/partners/services/base.py`

```text
required_document_kinds(application):
    track != EMPLOYER                     → settings.PARTNER_REQUIRED_DOCUMENT_KINDS (unchanged)
    EMPLOYER, hiring_as == ""             → (GOVERNMENT_ID,)
    EMPLOYER, INDIVIDUAL                  → (GOVERNMENT_ID, SELFIE)
    EMPLOYER, ORGANIZATION                → (GOVERNMENT_ID, BUSINESS_PROOF)
                                            + AUTHORIZATION_LETTER if poster_role != OWNER

offered_document_kinds(application):
    track != EMPLOYER                     → (GOVERNMENT_ID, ADDRESS_PROOF)   ← today's web list
    EMPLOYER                              → exactly required_document_kinds(application)
```

Replace **every** direct read of `settings.PARTNER_REQUIRED_DOCUMENT_KINDS` for an application
with this function:

- `backend/apps/partners/services/application.py` (submit, around line 433)
- `backend/apps/partners/services/base.py` `_latest_required_documents_are_approved` (around line 119)
- `backend/apps/partners/serializers/onboarding.py` `get_required_document_kinds` (around line 522)
- `backend/apps/partners/capabilities/eligibility.py` (lines ~61 and ~84): read
  `partner.application` and call the function

Leave the seed commands that loop over the setting alone; they seed non-employer partners.

### 4.3 Completeness, submit and approval

**Complete employer profile** (`employer_profile_missing_fields(profile) -> list[str]` in a new
`backend/apps/partners/services/employer.py`):

| Individual needs | Business needs |
|---|---|
| `hiring_as` | `hiring_as` |
| `PartnerProfile.display_name` (≥ 2 chars) | `PartnerProfile.display_name` (the poster's name, ≥ 2 chars) |
| `area`, `city`, `pin_code` | `business_name`, `legal_name`, `legal_structure`, `industry`, `company_size` |
| ≥ 1 `household_needs` | `has_gst` answered; if `True`, a valid `gstin` |
| `household_declared_at` set | `address_line`, `area`, `city`, `state`, `pin_code`, `latitude` + `longitude` |
| `id_document_type` | `poster_role`, `id_document_type` |
| | `business_proof_type`: must be `GST_CERTIFICATE` when `has_gst`, and must **not** be when `has_gst` is `False` |

Update `_base_application_is_complete` (`services/base.py`): for EMPLOYER, require
`display_name`, required consents **and** an empty `employer_profile_missing_fields`.

**Submit** (`submit_partner_application`): when incomplete, raise
`PartnerApplicationIncompleteError` with a message naming what's missing
("Add your business address and pin code before sending."). Required documents come from 4.2.

**Resubmit:** when an EMPLOYER application goes `CHANGES_REQUIRED → SUBMITTED`, delete its
`EmployerReviewCheck` rows. Old ticks may be about details that changed.

**Approve** (`transition_partner_application` in `services/review.py`, `APPROVED` branch): for
EMPLOYER, every required check code (section 3.1 table) must exist with `result=PASS`. Otherwise
raise a new `EmployerChecksIncompleteError` → HTTP 409 `employer_checks_incomplete` with the
missing codes. The existing "required documents approved" rule still applies on top.

**Hints for Operations** (`employer_hints(profile) -> list[Hint]` in `services/employer.py`).
Each hint is `{code, level: "OK" | "WARN", message}`. They are read-only; they never block
anything.

| Code | When `WARN` |
|---|---|
| `GSTIN_STATE_MISMATCH` | GSTIN state ≠ the `state` they typed |
| `PAN_TYPE_MISMATCH` | PAN 4th letter isn't expected for their `legal_structure` (4.1) |
| `DUPLICATE_GSTIN` | Another partner's `EmployerProfile` **or** `PartnerBusinessProfile` has the same GSTIN (name them) |
| `NO_GST` | Business without GST: "Check the business proof carefully" |
| `UDYAM_PROOF` | Proof type is Udyam: "Udyam is self-declared. Look for other signs the business is real." |

When nothing is wrong, return one `OK` hint per check that ran.

### 4.4 Job rules (`backend/apps/listings/`)

1. **Public employer identity.** New function `employer_public_identity(poster)` in
   `backend/apps/listings/services.py` (or a new `employers.py`):

   | Case | `name` | `kind` |
   |---|---|---|
   | Business | `business_name` | `ORGANIZATION` |
   | Individual | first name + last initial, e.g. "Priya S." (from `display_name`) | `INDIVIDUAL` |
   | No `EmployerProfile` (old test fixtures only) | `display_name` | `""` |

   Plus `is_verified` (application `APPROVED`), `logo_url` (absolute URL or `""`),
   `industry_label`, `size_label` (business only), `locality` ("Kondapur, Hyderabad").
2. **Serializers** (`backend/apps/listings/serializers.py`): add an `employer` object (the dict
   above) to `ListingSummarySerializer`. Make `poster_name` and `ApplicationSerializer.employer_name`
   return `employer.name`. Use `select_related("poster__employer_profile")` wherever listings are
   listed, so this adds no extra queries.
   **Leave the Operations / cases serializers alone** (`apps/cases/serializers.py`); Operations
   still sees the person.
3. **Individual limits** (in `post_job`, `update_job` and `publish_job_now`). Constants go in
   `backend/apps/listings/jobs.py`:
   `HOUSEHOLD_CATEGORY = "Home & Personal"`, `INDIVIDUAL_MAX_VACANCIES = 5`,
   `INDIVIDUAL_MAX_LIVE_JOBS = 3`.

   | Rule | Error code | Message |
   |---|---|---|
   | `job_category` must be `HOUSEHOLD_CATEGORY` | `individual_job_category` | "You can post jobs for your home only." |
   | `work_mode` must not be `WORK_FROM_HOME` | `individual_no_work_from_home` | "Home jobs can't be work from home." |
   | `vacancies` ≤ 5 | `individual_vacancy_limit` | "You can hire up to 5 people per job." |
   | Live jobs ≤ 3 when publishing | `individual_live_job_limit` | "You can have up to 3 live jobs. Close one first." |

   Follow the existing `ListingStateError` → API error pattern in `apps/listings/views.py`, and
   make the `code` reach the client.
4. **Household job templates** (migration `0018_home_personal_templates.py`), category
   `"Home & Personal"`. Same tuple shape as `0012` (category, role, skills, duties, job type,
   shift, work mode, min ₹, max ₹):

   | Role | Skills | Duties | Type | Shift | Mode | ₹ min–max |
   |---|---|---|---|---|---|---|
   | House Help / Maid | Cleaning, Washing utensils, Laundry | Clean the house, Wash utensils, Fold clothes | FULL_TIME | DAY | ON_SITE | 8,000–15,000 |
   | Home Cook | Cooking, South Indian, North Indian, Hygiene | Cook daily meals, Keep the kitchen clean, Plan the menu | FULL_TIME | DAY | ON_SITE | 10,000–20,000 |
   | Personal / Family Driver | Driving licence, Safe driving, Route knowledge | Drive the family safely, Keep the car clean | FULL_TIME | DAY | FIELD | 15,000–22,000 |
   | Elderly Caretaker | Patient care, Patience, Hygiene | Help with daily needs, Give medicines on time, Keep company | FULL_TIME | ROTATIONAL | ON_SITE | 12,000–20,000 |
   | Babysitter / Nanny | Child care, Patience, Hygiene | Look after the child, Feed and bathe, Play and teach | FULL_TIME | DAY | ON_SITE | 10,000–18,000 |
   | Patient Attendant (at home) | Patient care, First aid, Hygiene | Help the patient move, Give medicines, Record vitals | FULL_TIME | ROTATIONAL | ON_SITE | 12,000–20,000 |
   | Home Tutor | Subject knowledge, Patience, Communication | Teach at home, Give practice work, Track progress | PART_TIME | FLEXIBLE | ON_SITE | 5,000–15,000 |
   | Gardener | Gardening, Plant care, Physical work | Water and trim plants, Keep the garden clean | PART_TIME | DAY | ON_SITE | 6,000–12,000 |
   | Watchman (home) | Alertness, Visitor management | Guard the gate, Check visitors, Keep the register | FULL_TIME | ROTATIONAL | ON_SITE | 10,000–15,000 |

5. **No asking candidates for money** (all employers). In `jobs.py`:
   `MONEY_ASK_PHRASES = ("registration fee", "registration charge", "joining fee", "training fee",
   "security deposit", "refundable deposit", "processing fee", "pay to apply", "advance payment",
   "pay first")`. Check `title`, `description`, `responsibilities`, `benefits`, `required_skills`
   and `preferred_skills`: lower-cased, with repeated whitespace collapsed. On a match, raise
   code `job_text_asks_for_money` with the message
   "Jobs on V Solve Hub can't ask candidates to pay. Remove “<phrase>”."
   Don't block plain "deposit": a cashier job legitimately says "cash deposit".
6. **Drafts before approval.** In `_require_listing_capability` / `post_job`: an EMPLOYER whose
   application is `SUBMITTED`, `UNDER_REVIEW` or `CHANGES_REQUIRED` may **create and edit drafts**
   (`publish=False`). Any publish still needs `APPROVED` → 403 `employer_not_approved`
   ("You can publish once your account is approved."). Suspended or offboarded employers can do
   neither (unchanged).

---

## 5. API contract

Bump `SPECTACULAR_SETTINGS["VERSION"]` in `backend/config/settings/base.py` from `1.102.0` to
the **next free minor** (check `contracts/openapi/CHANGELOG.md` on `main` and the open PRs when
you open yours; `1.103.0` at the time of writing). Add a CHANGELOG entry in the same style as
1.102.0, listing every item below.

| # | Endpoint | Change |
|---|---|---|
| A1 | `GET /api/v1/partner/application/` | Add `employer` (an `EmployerProfile` object or `null`) and `offered_document_kinds`. `required_document_kinds` now depends on the application (4.2). |
| A2 | **New** `PATCH /api/v1/partner/application/employer/` | Body: `expected_version` (required) + any `EmployerProfile` field, plus `display_name` and `household_declared: true`. Returns `PartnerApplication`. |
| A3 | **New** `POST /api/v1/partner/application/employer/logo/` | Multipart `file`: JPEG/PNG/WebP, ≤ 2 MB, checked by its first bytes (copy `_check_stay_image` in `apps/stay/services.py`). Returns `PartnerApplication`. `DELETE` on the same path removes the logo. |
| A4 | `GET /api/v1/operations/partner-applications/{id}/` | Add `employer`, `employer_hints` and `employer_checks` (every required code with `label`, `result` or `null`, `note`, `checked_by_name`, `checked_at`). **Only for Operations:** the applicant's own read (`APPLICANT_AUDIENCE` in `PartnerApplicationSerializer.to_representation`) must not include hints or checks. |
| A5 | **New** `PUT /api/v1/operations/partner-applications/{id}/employer-checks/{code}/` | Body `{result: "PASS" \| "FAIL", note}`. Returns the updated `employer_checks`. |
| A6 | `POST /api/v1/operations/partner-applications/{id}/transition/` | New 409 `employer_checks_incomplete` (4.3). |
| A7 | Listing and application reads (customer + partner) | Add `employer` (4.4.1); `poster_name` and `employer_name` now return the public name. |
| A8 | `POST /api/v1/partner/jobs` and job update / publish | New error codes from 4.4.3, 4.4.5 and 4.4.6. |

### Rules for A2 (`PATCH .../employer/`)

- 409 `employer_track_required` unless the application track is `EMPLOYER`.
- 409 (existing error) unless the application is editable (`DRAFT` or `CHANGES_REQUIRED`).
- Creates the `EmployerProfile` on first call.
- **Changing `hiring_as` clears every field that belongs only to the other type**
  (household fields ↔ business fields, including the logo file). Documents of kinds no longer
  offered stay in the database but are not shown or required (both screens filter by
  `offered_document_kinds`).
- Validation (400, with the field name):

  | Field | Rule | Code |
  |---|---|---|
  | `gstin` | 4.1; also `has_gst` must be `true` | `gstin_*` / `gstin_needs_has_gst` |
  | `pin_code` | `^[1-9][0-9]{5}$` | `pin_code_invalid` |
  | `household_needs` | known codes, 1–9 items, no duplicates | `household_needs_invalid` |
  | `business_proof_type` | must fit `has_gst` (4.3) | `business_proof_mismatch` |
  | `latitude` / `longitude` | both or neither, in range | existing pin errors |
  | `website_url` | valid http(s) URL | DRF default |
  | business fields when `hiring_as=INDIVIDUAL` (and vice versa) | not allowed | `employer_field_not_for_type` |

- Every change raises `application.version` by 1, like the existing PATCH.

### Rules for A5 (checks)

- The reviewer must have claimed the application (status `UNDER_REVIEW`, assigned to them):
  reuse the ownership check in `transition_partner_application`.
- `code` must be required for this employer (3.1 table) → otherwise 400 `employer_check_not_applicable`.
- `FAIL` needs a `note` → otherwise 400 `employer_check_note_required`.
- Upsert by `(application, code)`, with `method=MANUAL`, `checked_by=request.user`.

---

## 6. Work plan: phases and tasks

Estimates assume full days. Finish each phase's "Done when" before starting the next.

### Phase 0: Set up and read (½ day)

- [ ] 0.1 `git checkout main && git pull`, then `git checkout -b employer-onboarding/v1`.
- [ ] 0.2 Run the backend (`backend\scripts\server.cmd`), the partner web and admin apps, and
      `seed_jobs_demo`. Log in as the demo employer and post a job, so you know today's flow.
- [ ] 0.3 Read every file in section 2.

**Done when:** you can describe today's EMPLOYER flow end to end, and you've written down
anything in this plan that doesn't match the code (ask the owner about it).

### Phase 1: Backend models and GSTIN module (1½ days)

- [ ] 1.1 `backend/apps/partners/models/employer.py`: both models exactly as in 3.1, exported.
- [ ] 1.2 Add the three `PartnerDocument.Kind` values (3.2).
- [ ] 1.3 Migration `0029_employer_profile` (3.3); then `makemigrations --check` is clean.
- [ ] 1.4 `backend/apps/partners/gstin.py` (4.1) with `GstinFacts`, `GstinInvalidError`, the
      state table and the PAN letter table.
- [ ] 1.5 Register both models in `backend/apps/partners/admin.py` (read-only list is enough).

**Tests to write:** `backend/tests/partners/test_gstin.py`: both public samples pass; one wrong
check character fails with `gstin_checksum`; wrong length, bad state `00`, bad PAN part, and
lower-case input normalised. `backend/tests/partners/test_employer_models.py`: each DB
constraint refuses a bad row (use `pytest.raises(IntegrityError)`).

**Done when:** `backend\scripts\quality-static.cmd` passes.

### Phase 2: Backend applicant side (2 days)

- [ ] 2.1 `required_document_kinds` / `offered_document_kinds` (4.2), and replace the four reads.
- [ ] 2.2 `SELFIE` only accepts images (3.2).
- [ ] 2.3 `backend/apps/partners/services/employer.py`: `update_employer_profile(...)` (A2 rules)
      and `employer_profile_missing_fields(...)` (4.3).
- [ ] 2.4 Serializers in `backend/apps/partners/serializers/onboarding.py`:
      `EmployerProfileSerializer` (read; `logo_url` absolute), `EmployerProfileUpdateSerializer`
      (write), and the `employer` + `offered_document_kinds` fields on `PartnerApplicationSerializer`.
- [ ] 2.5 Views + URLs: `PartnerEmployerProfileView` (PATCH) and `PartnerEmployerLogoView`
      (POST/DELETE) in `backend/apps/partners/views/partner_application.py`, registered in
      `backend/apps/partners/urls.py` next to `partner/application/`. Add `@extend_schema`
      with every error code listed in section 5.
- [ ] 2.6 Submit + completeness changes (4.3), including clearing checks on resubmit.
- [ ] 2.7 Remove what the EMPLOYER track no longer uses: it must not depend on `biography`.

**Tests to write:** `backend/tests/partners/test_employer_onboarding.py`:
- the PATCH is refused for a non-EMPLOYER track and for a submitted application
- switching `hiring_as` clears the other type's fields
- each validation code in the A2 table
- submit is refused while anything in 4.3 is missing (one test per type), and works when complete
- required documents per type, including the authorization letter only for non-owners
- the logo upload rejects a renamed PDF
- the applicant's read never contains `employer_hints` / `employer_checks`
- `test_stay_host_track.py` still passes **unchanged** (proves the other tracks didn't move)

**Done when:** `quality-static.cmd` passes and the focused modules are written.

### Phase 3: Backend Operations review (1½ days)

- [ ] 3.1 `employer_hints(profile)` (4.3).
- [ ] 3.2 `set_employer_check(...)` service + `OperationsEmployerCheckView` (A5) in
      `backend/apps/partners/views/operations.py` and `urls.py`.
- [ ] 3.3 Ops detail read (A4): add `employer`, `employer_hints`, `employer_checks`.
- [ ] 3.4 Approval guard in `transition_partner_application` (4.3, A6).

**Tests to write:** `backend/tests/partners/test_employer_review_checks.py`:
- approve is blocked with `employer_checks_incomplete` until every required check passes, for
  both types and for a business with and without GST
- a non-claiming reviewer can't set checks
- `FAIL` without a note is refused
- a check code for the other type is refused
- checks are deleted on resubmit
- hints: state mismatch, PAN type mismatch, duplicate GSTIN (including one held by a
  `PartnerBusinessProfile`), Udyam

### Phase 4: Backend job rules (1½ days)

- [ ] 4.1 `employer_public_identity` + serializer changes (4.4.1–2).
- [ ] 4.2 Individual limits (4.4.3).
- [ ] 4.3 Money-ask phrase block (4.4.5).
- [ ] 4.4 Household templates migration (4.4.4).
- [ ] 4.5 Make sure `GET jobs/options` returns the new category (it reads `JobRoleTemplate`;
      check it).
- [ ] 4.6 Drafts before approval (4.4.6).

**Tests to write:** `backend/tests/listings/test_employer_public_identity.py` (business name,
"Priya S.", no query explosion: use `django_assert_max_num_queries` on the public list);
`test_individual_job_limits.py` (each rule; a business employer is not limited);
`test_job_text_money_block.py` (blocked phrases, and "cash deposit" allowed);
`test_employer_drafts_before_approval.py`. Update `backend/tests/listings/jobs_helpers.py` so
helper employers get an `EmployerProfile` (business by default).

### Phase 5: Publish the contract (½ day)

From `backend`:

```powershell
.\.venv\Scripts\python.exe manage.py spectacular --file ..\contracts\openapi\v1.yaml --validate
```

From `frontend`:

```powershell
pnpm contract:generate
pnpm contract:check
```

- [ ] 5.1 Version bump + CHANGELOG entry (section 5).
- [ ] 5.2 Commit the regenerated `v1.yaml` and `schema.d.ts` together with the CHANGELOG.

**Done when:** `quality-static.cmd` (it includes the contract drift check) and
`pnpm contract:check` both pass.

### Phase 6: Partner web onboarding screens (3 days)

All under `frontend/apps/partner/`.

- [ ] 6.1 **Steps** (`features/application/model/steps.ts`): `applicationSteps(track, hiringAs)`.
      For EMPLOYER: `/apply`, `/apply/hiring-as`, then
      individual → `/apply/employer/about`;
      business → `/apply/employer/business`, `/apply/employer/contact`;
      then `/apply/documents`, `/apply/review`. Before a choice is made, only
      `/apply` and `/apply/hiring-as` show. Update `trackPreview` so the overview card shows
      "Who is hiring → Your details → Documents → Review". Pass `hiringAs` everywhere
      `applicationSteps` / `nextStep` / `stepIndexOf` / `previousStep` are called.
- [ ] 6.2 **Guard** `features/application/view/employer-step-guard.tsx`, modelled on
      `listing-step-guard.tsx`: non-EMPLOYER on an employer page → `/apply`; an individual on a
      business page → `/apply/employer/about`, and the reverse; EMPLOYER on `/apply/about` →
      `/apply/hiring-as`.
- [ ] 6.3 **Who is hiring?** `app/apply/hiring-as/page.tsx` + `features/application/view/hiring-as-step.tsx`.
      Two large cards (copy in section 7). Selecting one PATCHes `hiring_as`. If they switch after
      filling details, show a confirmation first: "Switching clears the details you entered for
      a business."
- [ ] 6.4 **Individual "About you"** `app/apply/employer/about/page.tsx` +
      `view/employer-about-step.tsx`: full name (pre-filled from sign-up, like `about-step.tsx`
      does today), email, pin code, area, city, help needed (multi-select chips), ID type (select),
      and the declaration checkbox. "Continue" stays disabled until the required fields are valid.
- [ ] 6.5 **Business details** `app/apply/employer/business/page.tsx` +
      `view/employer-business-step.tsx`:
      - business name, legal name, legal structure, industry, size (chips)
      - "Do you have GST?" (Yes/No). Yes shows a GSTIN input with live validation from a client
        copy of 4.1 in `features/application/model/gstin.ts`, with a tiny note: "We'll check this
        on the GST portal."
      - which business proof (Yes → fixed to "GST certificate"; No → a select of the other seven)
      - address line, area, city, state, pin code, and the map pin via `FindOnMap`
      - logo upload (optional, image preview + remove) and website (optional)
- [ ] 6.6 **You & your role** `app/apply/employer/contact/page.tsx` +
      `view/employer-contact-step.tsx`: your name (`display_name`), your role, email, ID type.
      When the role isn't Owner, show: "You'll upload a letter from the owner on business
      letterhead that names you."
- [ ] 6.7 **Documents** (`view/documents-step.tsx`, `model/readiness.ts`): build the slots from
      `offered_document_kinds` / `required_document_kinds` (delete the hard-coded
      `OFFERED_DOCUMENTS` list). Labels and "why we ask" hints for each kind (section 7).
      The `SELFIE` slot uses `accept="image/jpeg,image/png"` and `capture="user"` (opens the front
      camera on phones; a file picker on desktop, which is fine). Show the chosen ID type /
      proof type above its slot. For Aadhaar, link to the masked-Aadhaar help text.
- [ ] 6.8 **Readiness** (`model/readiness.ts`): employer requirements = hiring choice, details
      complete (mirror 4.3 so the summary is honest; the server still decides), documents,
      consents. Keep today's rules for the other tracks exactly.
- [ ] 6.9 **Review** (`view/review-step.tsx`): an employer summary card (type, names, location,
      GST yes/no) with "Edit" links to each step.
- [ ] 6.10 **Queries** (`features/application/queries.ts`): `useUpdateEmployerProfile`,
      `useUploadEmployerLogo`, `useRemoveEmployerLogo`; they invalidate the application query.
- [ ] 6.11 **Clean up:** remove the EMPLOYER branch from `about-step.tsx` and the
      `apply.about.bio.placeholder.employer` keys (all three languages).
- [ ] 6.12 **Copy:** add all new keys to `i18n/catalogs/apply.ts` in en, te and hi.

**Tests to write:** update `features/application/model/steps.test.ts` (both types, and no
choice yet); new `model/gstin.test.ts` using **the same samples** as the backend test;
`readiness` tests for both types; one component test per new step (required fields block
Continue; switching type asks first).

**Done when:** `pnpm lint`, `pnpm typecheck` and `pnpm build` pass in `frontend`.

### Phase 7: Operations console (1½ days)

All under `frontend/apps/admin/features/partner-review/`.

- [ ] 7.1 `view/employer-review-panel.tsx`, shown in `review-detail.tsx` when
      `application.track === "EMPLOYER"`:
      - **Who:** type badge (Individual / Business), names, role, ID type, location, a
        "View on map" link (`https://www.google.com/maps?q=<lat>,<lng>`), logo, website
      - **GST:** the GSTIN with a copy button and an "Open GST portal search" link
        (`https://services.gst.gov.in/services/searchtp`); the portal needs a CAPTCHA, so the
        reviewer pastes the number in by hand
      - **Hints:** OK / WARN list (A4)
      - **Checklist:** one row per required check with Pass / Fail buttons and a note box (note
        required for Fail); shows who checked it and when
- [ ] 7.2 `queries.ts`: `useSetEmployerCheck` (A5); invalidate the detail query.
- [ ] 7.3 Approve button: disabled with "Finish the checklist first" until every required check
      passes. The server enforces it too; show its 409 message if it ever comes back.
- [ ] 7.4 Update `TRACK_CONFIG.EMPLOYER` wording in `review-detail.tsx` to describe the new flow.

**Tests to write:** `view/employer-review-panel.test.tsx`: renders both types; approve is
disabled until all checks pass; Fail needs a note.

### Phase 8: Partner web job form + customer web job cards (1 day)

- [ ] 8.1 `frontend/apps/partner/features/listings/view/post-job-wizard.tsx`: when the employer is
      an individual (read `employer.hiring_as` from `usePartnerApplication()`):
      only the "Home & Personal" category, no "Work from home" chip, vacancies stepper max 5.
      Show server error messages (section 4.4) in the wizard's existing error area.
- [ ] 8.2 Drafts before approval: let a pending employer open the job form and save a draft.
      "Publish" is disabled with "You can publish once your account is approved." Check how
      `features/session/partner-shell.tsx` and `features/workspace/registry.ts` route pending
      partners, and ask the owner if this needs a shell change bigger than one route.
- [ ] 8.3 Customer web (`frontend/apps/customer/features/listings/view/listing-row.tsx`,
      `listing-opportunity-card.tsx`, `role-header.tsx`, `app/(flow)/listings/[slug]/page.tsx`):
      show the logo (or the first letter in a circle), `employer.name`,
      "✓ Verified business" / "✓ Verified individual", industry · size (business only), and the
      locality. Never show an individual's full name or address.

**Tests to write:** wizard test for the individual restrictions; a render test for the employer
block on a job card (both types).

### Phase 9: Mobile apps (3 days)

Read `frontend/mobile/AGENTS.md` and `frontend/mobile/README.md` first, and tell the mobile
developer you're starting.

- [ ] 9.1 Partner app, `frontend/mobile/apps/partner/`: the same steps as Phase 6.
      New routes `app/(app)/apply/hiring-as.tsx`, `app/(app)/apply/employer/about.tsx`,
      `.../employer/business.tsx`, `.../employer/contact.tsx`.
      Update `src/features/application/model/steps.ts`, `readiness.ts`,
      `view/documents-step.tsx` (selfie with the front camera, the same picker
      `view/document-upload.tsx` already uses) and `view/review-step.tsx`.
      For the map pin, reuse the pickup-pin approach in `src/features/rentals/view/rental-ad-sheet.tsx`.
      Copy the GSTIN client check (same algorithm, same test samples).
- [ ] 9.2 Partner app job form: the same individual restrictions as 8.1.
- [ ] 9.3 Customer app, `frontend/mobile/apps/customer/src/features/listings/`: the employer
      block as in 8.3.
- [ ] 9.4 Update `steps.test.ts` / `readiness.test.ts` in the partner app for both types.

**Done when:** the mobile typecheck and lint commands from `frontend/mobile/README.md` pass.
**Do not start an EAS build or an `eas update`.** The owner does releases.

### Phase 10: Demo data, manual test, hand-over (1 day)

- [ ] 10.1 `seed_jobs_demo.py`: give both existing demo employers a complete **business**
      `EmployerProfile` with `has_gst=False` and `business_proof_type=SHOP_ESTABLISHMENT`.
      **Don't invent GSTINs**: a made-up number could belong to a real business. Add a third
      demo employer, an **individual** ("Priya Sharma", Kondapur, Hyderabad) with one live
      "House Help / Maid" job.
- [ ] 10.2 `seed_listing_catalog.py`: give its demo employer a business profile the same way.
- [ ] 10.3 Walk through section 8 yourself in the browser and fix what breaks.
- [ ] 10.4 Open the PR (section 9 checklist). Put screenshots of every new screen (desktop +
      phone width) in the PR description.

Total: about **16–17 working days**.

---

## 7. Screen copy (English; add te + hi)

**Who is hiring?** Title: "Who is hiring?"

| Card | Title | Line under it |
|---|---|---|
| Individual | "For my home or myself" | "A maid, cook, driver, caretaker, nanny or tutor for your home." |
| Business | "For a business" | "A shop, clinic, restaurant, school, office or company." |

Under the cards: "Hiring for another company as an agency? We don't support agencies yet."

**Help needed (individual) chips:** House help · Cook · Driver · Caretaker · Nanny ·
Patient attendant · Tutor · Gardener · Other.

**Household declaration:** "I'm hiring for my home or personal needs, not for a business."

**Document labels and "why we ask":**

| Kind | Label | Why we ask |
|---|---|---|
| `GOVERNMENT_ID` | "Your ID" | "So candidates know a real person is hiring." |
| `SELFIE` | "A selfie" | "We match it with your ID photo. Face the camera in good light." |
| `BUSINESS_PROOF` | "Business proof: <type>" | "So candidates know the business is real. The name must match the legal name you gave." |
| `AUTHORIZATION_LETTER` | "Letter from the owner" | "On business letterhead, signed by the owner, naming you as the person hiring." |

**Masked Aadhaar help:** "Upload a masked Aadhaar: only the last 4 digits are visible. You can
download it from the UIDAI website. Don't upload a full Aadhaar number."

**Pending employer on the job form:** "You can write jobs now. You can publish once your account
is approved."

---

## 8. Manual test script (do this before opening the PR; the owner repeats it)

Use a fresh phone number for each employer.

**Individual**
1. Log in on the partner site → choose "I want to hire staff" → "For my home or myself".
2. Leave the declaration unticked → Continue stays disabled.
3. Fill everything, upload an ID and a selfie → Review → send. Status shows "Submitted".
4. Open the job form → only "Home & Personal" roles are offered; set 6 vacancies → refused.
   Save a draft → works. Publish → disabled.
5. Operations console → claim → approve without checks → refused ("Finish the checklist first").
6. Approve both documents, pass the 3 checks → approve.
7. Partner: publish the draft. Customer site: the card shows "Priya S. · ✓ Verified individual ·
   Kondapur, Hyderabad". No full name, no address.
8. Publish a 4th job after 3 are live → refused.

**Business with GST**
1. "For a business" → type GSTIN `27AAPFU0939F1ZW` (wrong last character) → "This GSTIN isn't
   valid." Fix it to `27AAPFU0939F1ZV` → accepted.
2. Set state Telangana → in Operations, the hint shows a state mismatch (27 = Maharashtra).
3. Pick structure "Company" → PAN type hint shows a mismatch (letter `F` = firm).
4. Role "HR / Recruiter" → the documents step asks for the authorization letter.
5. Operations: the GST portal link opens; the checklist has 4 rows; approve after all pass.
6. Customer site: the business name and logo show, with "✓ Verified business".
7. Write "Registration fee ₹500" in the description → publish refused with the money message.

**Business without GST**
1. "Do you have GST?" No → proof type can't be "GST certificate" → pick Udyam.
2. Operations: `NO_GST` and `UDYAM_PROOF` hints show; the checklist has 3 rows (no GST row).

**Regression**
1. A "Offer services" applicant still walks the full steps unchanged.
2. A "List my property" applicant still sees only About → Documents → Review.

---

## 9. PR checklist (definition of done)

- [ ] Everything in sections 3–5 is built, or listed in the PR as "not done" with the reason.
- [ ] `backend\scripts\quality-static.cmd` passes (ruff, strict mypy, migrations check,
      OpenAPI validation, contract drift).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm contract:check` pass in `frontend`.
- [ ] Mobile typecheck + lint pass (commands from `frontend/mobile/README.md`).
- [ ] Every test file named in this plan exists. The PR lists them with the exact commands to
      run them, e.g.
      `.\.venv\Scripts\python.exe -m pytest tests/partners/test_employer_onboarding.py -q`.
      If you were allowed to run them, paste the real output; never write "tests pass" for a
      run that didn't happen.
- [ ] All new copy exists in en, te and hi.
- [ ] Screenshots of every new screen (desktop + phone width) and of the Operations panel.
- [ ] Contract CHANGELOG entry written; version is the next free minor.
- [ ] Rebased on the latest `main`; migration numbers don't clash.
- [ ] Only explicit paths were staged; no `.env`, databases, media or `node_modules`.

---

## 10. Not in V1 (don't build)

GST API auto-fill · DigiLocker / Aadhaar e-KYC · automatic PAN check · selfie face match ·
company-email OTP · auto-approval · monthly GST re-check · recruitment agencies ·
pin-code-to-city check. The `EmployerReviewCheck.method` field and the hints list exist so V2 can
add these without changing the screens.

---

## 11. Questions to ask the owner (don't guess these)

1. Can you run the focused backend and frontend test modules yourself, as the Rides intern was
   allowed to? (Section 0.)
2. Task 8.2: if letting a pending employer reach the job form needs more than a small change to
   the partner shell's routing, should drafts-before-approval move to V2?
3. Should the Operations queue (`review-queue.tsx`) get a filter for "Employers only"? It's not
   in this plan.
4. Anything in section 2 that doesn't match what you find in the code.

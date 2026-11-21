# Employer onboarding V1: "Who is hiring?"

**Execution plan for the intern** · updated 20 November 2026 · branch `employer-onboarding/v1`

This replaces the "I want to hire staff" (EMPLOYER track) onboarding, including the
"Business details" step Ambady built (now on `main`). Read the whole document once before
writing any code. Every file path is relative to the repository root.

---

## 0. Ground rules

| Rule | What it means for you |
|---|---|
| Branch | The branch already exists and is up to date with `main`: run `git fetch` then `git checkout employer-onboarding/v1`. If you downloaded it before 20 November, run `git reset --hard origin/employer-onboarding/v1` (its history changed). Never commit to `main`. Open one PR to `main` at the end; the owner merges it. |
| Staging files | Stage explicit paths only. **Never `git add -A` or `git add .`.** Other people's work lives in the same tree. |
| Commits | One commit per phase is fine. Message format: `feat(employer): <what>`. |
| Backend rules | Read `AGENTS.md` (root) first. Views stay thin, business rules go in services, the database enforces invariants too. |
| Contract | Frontends only talk to Django through the generated client. Never hand-edit `contracts/openapi/v1.yaml` or `frontend/packages/api-client/src/generated/schema.d.ts`; regenerate them (commands in Phase 5). |
| Mobile apps | `frontend/mobile/**` has its own rules: read `frontend/mobile/AGENTS.md` and `frontend/mobile/README.md` before Phase 9. |
| Tests | **The owner has allowed you to run tests.** Write a test for every rule in this plan. Run the focused test files after each phase; run the full backend and frontend suites and the Playwright suite **once**, before the PR. Paste the real output in the PR. Never write "tests pass" for a run that didn't happen. Static checks (lint, typecheck, build, `quality-static`) you always run. |
| Fake data | No placeholder or mock data in the product. An empty state says it's empty. Seeds (demo data) are the only exception. |
| Languages | Every new partner-app text needs English, Telugu and Hindi (the `apply.ts` catalogue has all three). If you can't translate, put the English text in all three and list the keys in the PR. |
| When unsure | Ask the owner. Don't guess a business rule. If anything in this plan doesn't match the code, ask before building it. |

---

## 1. What we are building

### Decisions made by the owner (don't reopen them)

1. After choosing **"I want to hire staff"**, the employer picks **who is hiring**:
   **For myself or my home** (individual) or **For my business**.
2. **No agencies in V1.** Hiring for another company is not offered.
3. **No limits on what anyone can post.** Individuals can post any job category, work from
   home is allowed, and there is no cap on vacancies or live jobs. What protects candidates is the
   honest label on the job card ("Priya S. · ✓ Verified individual" versus a business name).
4. **V1 is manual only.** No GST API, no DigiLocker, no PAN check, no face match, no email OTP.
   The employer types everything; Operations checks it by hand. (Integrations come in V2.)
5. **No auto-approval.** Every employer application is reviewed by Operations.
6. **Jobs can't ask candidates for money.** Job text with phrases like "registration fee" or
   "security deposit" is refused, for every employer.
7. **Jobs are written after approval**, as today. Drafting jobs before approval is V2.
8. **The Operations review queue gets a type filter** (Technicians / Property hosts / Rental
   owners / Employers).
9. **Build on Ambady's work.** His business details live on `PartnerBusinessProfile`; we extend
   that table instead of creating a second home for the same facts.

### The flow

```
Login (OTP) → /apply → "I want to hire staff"
                          │
                          ▼
                 /apply/hiring-as  "Who is hiring?"
        ┌─────────────────┴──────────────────┐
        ▼                                    ▼
 🏠 For myself or my home              🏢 For my business
 /apply/employer/about                 /apply/employer/business
 (name, email, pin code, area,         (business name, legal name, structure,
  city, ID type)                        industry, size, GST?, address + map pin,
        │                               logo, website)
        │                                    ▼
        │                              /apply/employer/contact
        │                              (your name, role, email, ID type)
        ▼                                    ▼
 /apply/documents                      /apply/documents
 (ID + selfie)                         (ID + business proof
                                        [+ owner's letter if not the owner])
        ▼                                    ▼
 /apply/review  ───────────────┬──────  /apply/review
                               ▼
              Operations review (manual checklist)
                               ▼
   Approved → writes and publishes jobs → job cards show "✓ Verified …"
```

Until approval, the employer stays on the application screens, exactly as today.

### What each type gives and gets

| | 🏠 Individual | 🏢 Business |
|---|---|---|
| Details | Full name, email (optional), pin code, area, city, ID type | Business name, legal name, legal structure, industry, size, GST yes/no + GSTIN, address + area + city + state + pin code + map pin, logo (optional), website (optional) |
| You and your role | (not asked) | Your name, your role, email (optional), ID type |
| Documents | ID + selfie | ID + business proof, plus a letter from the owner when the person isn't the owner |
| Operations checklist | Name matches ID · selfie matches ID | GST Active on the portal (only with GST) · proof matches the business · poster's ID matches · authority confirmed |
| Job card | "Priya S. · ✓ Verified individual · Kondapur, Hyderabad" | Logo, business name, "✓ Verified business", industry · size, "Kondapur, Hyderabad" |

Job cards **never** show an individual's full name or any street address. Operations still sees
everything.

---

## 2. What exists today (read these files first)

| Area | File | What's there |
|---|---|---|
| Track enum | `backend/apps/partners/models/onboarding.py` | `PartnerApplication.Track.EMPLOYER = "Hire staff"`, `PartnerProfile`, `PartnerDocument` (+ `Kind`) |
| Business table | `backend/apps/partners/models/capabilities.py` | `PartnerBusinessProfile`: `legal_name`, `gst_registered`, `gstin`, `gstin_verified_at`, `registered_state_code`, and Ambady's `business_category`, `city`, `address`. One row per partner (`related_name="business_profile"`) |
| Ambady's employer rule | `backend/apps/partners/selectors.py` | `employer_business_complete()`: name + category + city, required from **every** employer (this blocks individuals; you replace it) |
| Ambady's employer API | `backend/apps/partners/views/m2_registration.py`, `capabilities/registration.py` | `PUT /api/v1/partner/business-profile/` (M2's endpoint, a full replace) with `IsPartnerOrApplicant` |
| Applicant API | `backend/apps/partners/views/partner_application.py` | `GET/PATCH /api/v1/partner/application/`, document upload + finalize, submit |
| Applicant services | `backend/apps/partners/services/application.py` | `update_partner_application`, `submit_partner_application` |
| Shared rules | `backend/apps/partners/services/base.py` | `_base_application_is_complete`, `_latest_required_documents_are_approved` |
| Ops review | `backend/apps/partners/services/review.py` | `transition_partner_application` (approve / changes / decline) |
| Ops queue | `backend/apps/partners/selectors.py` `operations_partner_application_queue`, `serializers/onboarding.py` `OperationsApplicationQueueQuerySerializer` + `OperationsApplicationQueueItemSerializer`, `views/operations.py` | Filters by status and assignment only |
| Serializers | `backend/apps/partners/serializers/onboarding.py` | `PartnerApplicationSerializer` (`required_document_kinds` from settings, Ambady's `business_details_complete`) |
| Required docs | `backend/config/settings/base.py` | `PARTNER_REQUIRED_DOCUMENT_KINDS = ("GOVERNMENT_ID",)` |
| Posting permission | `backend/apps/partners/capabilities/eligibility.py` | `is_approved_employer()` |
| Jobs | `backend/apps/listings/services.py` (`post_job`, `update_job`, `publish_job_now`, `ListingStateError`), `jobs.py`, `serializers.py`, `views.py` | |
| Job card name | `backend/apps/listings/selectors.py` | Ambady's `employer_name(poster)`: business `legal_name`, else the person's name |
| Job templates | `backend/apps/listings/migrations/0012_seed_job_templates.py` | 12 categories; **no household category** |
| Account deletion | `backend/apps/identity/account_deletion.py` `_erase_partner` | Erases partner personal data; blanks `legal_name` on the business profile |
| Partner web onboarding | `frontend/apps/partner/app/apply/**`, `frontend/apps/partner/features/application/**` | `model/steps.ts` (Ambady's `EMPLOYER_STEPS`: About → Business details), `model/readiness.ts`, `view/about-step.tsx`, `view/employer-step.tsx` (Ambady), `view/documents-step.tsx`, `view/review-step.tsx`, `view/profile-preview.tsx`, `view/listing-step-guard.tsx` |
| Map pin (web) | `frontend/apps/partner/features/location/view/find-on-map.tsx` | `FindOnMap` |
| Partner web job form | `frontend/apps/partner/features/listings/view/post-job-wizard.tsx` | 4-step job wizard |
| Ops console | `frontend/apps/admin/features/partner-review/view/review-detail.tsx`, `view/review-queue.tsx`, `queries.ts` | Review screen (`TRACK_CONFIG.EMPLOYER`), queue tabs |
| Customer web jobs | `frontend/apps/customer/features/listings/view/listing-row.tsx`, `features/listings/listing-opportunity-card.tsx`, `view/role-header.tsx`, `app/(flow)/listings/[slug]/page.tsx` | Show `poster_name` |
| Partner mobile | `frontend/mobile/apps/partner/app/(app)/apply/**` (incl. Ambady's `employer.tsx`, `_layout.tsx`), `src/features/application/**` (incl. Ambady's `view/employer-step.tsx`) | Same onboarding on the phone |
| Customer mobile | `frontend/mobile/apps/customer/src/features/listings/view/job-card.tsx`, `listing-detail-screen.tsx`, `desktop-listing-detail.tsx`, `desktop-listings-browse.tsx` | Show `poster_name` |
| Demo data | `backend/apps/listings/management/commands/seed_jobs_demo.py`, `backend/apps/catalog/management/commands/seed_listing_catalog.py` | Create approved EMPLOYER partners |
| Tests to copy from | `backend/tests/partners/test_stay_host_track.py`, `test_employer_business_endpoint.py` (Ambady), `backend/tests/listings/test_jobs_quick_post.py`, `test_hiring_outcome.py` (Ambady), `jobs_helpers.py`, `backend/tests/identity/test_account_deletion.py` | Patterns |

**Keep working:** Ambady's hire flow (Hired status, close a job as filled) is not part of this
work. Don't change it; its tests must still pass.

---

## 3. Data model (backend)

### 3.1 Extend `PartnerBusinessProfile` (`backend/apps/partners/models/capabilities.py`)

Only a **business** employer gets a row. An individual has none. For employers,
`business_type` stays `EMPLOYER` (don't add new business types: that enum drives the M2 vendor
tax rules).

Already there, keep: `legal_name`, `gst_registered`, `gstin`, `address`, `city`,
`business_category`, `gstin_verified_at` and `registered_state_code` (V1 leaves the last two
empty; V2's GST check fills them).

Add:

| Field | Type | Notes |
|---|---|---|
| `trade_name` | Char(120), blank | The public name on job cards. Blank → `legal_name` is shown |
| `legal_structure` | Char(24), choices `LegalStructure`: `PROPRIETORSHIP`, `PARTNERSHIP_LLP`, `COMPANY`, `TRUST_SOCIETY_NGO`, `GOVERNMENT`; blank | |
| `company_size` | Char(12), choices `CompanySize`: `SIZE_1_10` "1–10", `SIZE_11_50` "11–50", `SIZE_51_200` "51–200", `SIZE_200_PLUS` "200+"; blank | |
| `area` | Char(120), blank | Shown publicly ("Kondapur") |
| `state` | Char(40), default `"Telangana"` | |
| `pin_code` | Char(6), blank | Exactly 6 digits, first digit 1–9 |
| `latitude`, `longitude` | Decimal(9,6), null | Use `pin_constraints(...)` from `apps/locations/pins.py` (both or neither) |
| `logo` | ImageField/FileField, blank, `upload_to=employer_logo_upload_to` | **Public** file, same storage as stay photos. Add `employer_logo_upload_to` next to `stay_ad_upload_to` in `apps/foundation/storage_paths.py` |
| `website_url` | URLField(300), blank | Website or Google Maps link |
| `business_proof_type` | Char(24), choices `BusinessProofType`: `GST_CERTIFICATE`, `INCORPORATION_CERTIFICATE`, `COMPANY_PAN`, `SHOP_ESTABLISHMENT`, `TRADE_LICENCE`, `FSSAI`, `CLINIC_REGISTRATION`, `UDYAM`; blank | Which proof they upload |

Widen `business_category` (keep Ambady's codes so saved rows stay valid; max length 16):

| Code | Label |
|---|---|
| `SHOP` | Shop / retail |
| `RESTAURANT` | Restaurant / food |
| `CLINIC` | Clinic / hospital |
| `OFFICE` | Office / IT |
| `SCHOOL` | School / coaching |
| `FACTORY` | Factory / workshop |
| `CONSTRUCTION` | Construction |
| `FACILITY` | Security / facility services |
| `LOGISTICS` | Delivery / logistics |
| `HOTEL` | Hotel |
| `SALON` | Salon / beauty |
| `OTHER` | Other |

New database constraints:

- `partners_business_proof_fits_gst`: `Q(business_proof_type="")`
  `| Q(gst_registered=True, business_proof_type="GST_CERTIFICATE")`
  `| (Q(gst_registered=False) & ~Q(business_proof_type="GST_CERTIFICATE"))`
- `partners_business_pin_code_format`: `Q(pin_code="") | Q(pin_code__regex=r"^[1-9][0-9]{5}$")`
- the two pin constraints from `pin_constraints(...)`

### 3.2 New `EmployerProfile` (new file `backend/apps/partners/models/employer.py`)

The person who is hiring. One per employer partner. Export it (and 3.3) from
`backend/apps/partners/models/__init__.py`.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID pk | |
| `partner` | OneToOne → `PartnerProfile`, `PROTECT`, `related_name="employer_profile"` | |
| `hiring_as` | Char(12), choices `HiringAs`: `INDIVIDUAL` "For myself or my home", `BUSINESS` "For my business"; blank | `""` = not chosen yet |
| `poster_role` | Char(12), choices `PosterRole`: `OWNER` "Owner / Partner / Director", `HR` "HR / Recruiter", `MANAGER` "Manager", `OTHER` "Other"; blank | **Business only** |
| `id_document_type` | Char(20), choices `IdDocumentType`: `AADHAAR_MASKED`, `PAN`, `DRIVING_LICENCE`, `VOTER_ID`, `PASSPORT`; blank | Which ID they upload |
| `email` | EmailField, blank | Optional for both |
| `area` | Char(120), blank | **Individual only.** Shown publicly |
| `city` | Char(80), blank | **Individual only.** Shown publicly |
| `pin_code` | Char(6), blank | **Individual only.** Never shown publicly |
| `created_at`, `updated_at` | auto | |

Database constraints:

- `partners_employer_individual_no_role`: `~Q(hiring_as="INDIVIDUAL") | Q(poster_role="")`
- `partners_employer_business_no_home_location`: `~Q(hiring_as="BUSINESS") | Q(area="", city="", pin_code="")`
- `partners_employer_pin_code_format`: `Q(pin_code="") | Q(pin_code__regex=r"^[1-9][0-9]{5}$")`

### 3.3 New `EmployerReviewCheck` (same file)

One row per manual check that Operations ticks. V2 will write automatic results into the same
table, which is why `method` exists now.

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

| Code | Label shown to Operations | Required for |
|---|---|---|
| `NAME_MATCHES_ID` | The name on the ID matches the name they gave | Individual |
| `SELFIE_MATCHES_ID` | The selfie is the same person as the ID photo | Individual |
| `GST_ACTIVE_ON_PORTAL` | GSTIN is **Active** on the GST portal and the legal name matches | Business **with** GST |
| `PROOF_MATCHES_BUSINESS` | The business proof shows the same legal name and isn't edited | Business |
| `POSTER_ID_MATCHES` | The poster's ID matches the name they gave | Business |
| `AUTHORITY_CONFIRMED` | Owner: ID name matches the business owner. Others: the owner's letter is valid | Business |

### 3.4 `PartnerDocument.Kind` (`backend/apps/partners/models/onboarding.py`)

Add `SELFIE` "Selfie", `BUSINESS_PROOF` "Business proof", `AUTHORIZATION_LETTER`
"Authorization letter". `PartnerDocumentUpload.kind` uses the same choices, so the migration
alters both fields.

`SELFIE` accepts **JPEG/PNG only** (no PDF): enforce it in
`backend/apps/partners/services/documents.py` `issue_partner_document_upload`, error code
`document_selfie_image_only`.

### 3.5 Migrations

- `backend/apps/partners/migrations/0030_employer_profile.py`: everything in 3.1–3.4. Generate it
  with `makemigrations partners`, then rename it.
- `backend/apps/listings/migrations/0019_home_personal_templates.py`: data migration that adds
  the household job templates (4.6). Copy the style of `0012_seed_job_templates.py`.
- Before opening the PR, rebase on `main`; if `main` already has these numbers, regenerate with
  the next ones.

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

PAN 4th letter → holder type, and the legal structure it is expected for:

| Letter | Holder | Expected for |
|---|---|---|
| `P` | Individual (incl. proprietor) | `PROPRIETORSHIP` |
| `F` | Firm / LLP | `PARTNERSHIP_LLP` |
| `C` | Company | `COMPANY` |
| `T` | Trust | `TRUST_SOCIETY_NGO` |
| `A` | Association of persons (societies) | `TRUST_SOCIETY_NGO` |
| `G` / `L` | Government / local authority | `GOVERNMENT` |
| `H`, `B`, `J` | HUF, body of individuals, artificial juridical person | none (always a hint) |

A mismatch is **never** an error, only a hint for Operations (4.4).

### 4.2 Which documents are required: new functions in `backend/apps/partners/services/base.py`

```text
required_document_kinds(application):
    track != EMPLOYER                     → settings.PARTNER_REQUIRED_DOCUMENT_KINDS (unchanged)
    EMPLOYER, hiring_as == "" (or no EmployerProfile) → (GOVERNMENT_ID,)
    EMPLOYER, INDIVIDUAL                  → (GOVERNMENT_ID, SELFIE)
    EMPLOYER, BUSINESS                    → (GOVERNMENT_ID, BUSINESS_PROOF)
                                            + AUTHORIZATION_LETTER if poster_role != OWNER

offered_document_kinds(application):
    track != EMPLOYER                     → (GOVERNMENT_ID, ADDRESS_PROOF)   ← today's web list
    EMPLOYER                              → exactly required_document_kinds(application)
```

Replace **every** direct read of `settings.PARTNER_REQUIRED_DOCUMENT_KINDS` for an application
with this function:

- `backend/apps/partners/services/application.py` (submit, around line 440)
- `backend/apps/partners/services/base.py` `_latest_required_documents_are_approved` (around line 119)
- `backend/apps/partners/serializers/onboarding.py` `get_required_document_kinds` (around line 522)
- `backend/apps/partners/capabilities/eligibility.py` (around lines 61 and 84): read
  `partner.application` and call the function

Leave the seed commands that loop over the setting alone; they seed non-employer partners.

### 4.3 Completeness and submit

New file `backend/apps/partners/services/employer.py` with
`employer_missing_fields(partner) -> list[str]` (field codes, in screen order):

| Individual needs | Business needs |
|---|---|
| `hiring_as` | `hiring_as` |
| `PartnerProfile.display_name` (≥ 2 chars) | `PartnerProfile.display_name` (the poster's name, ≥ 2 chars) |
| `area`, `city`, `pin_code` (on `EmployerProfile`) | `legal_name`, `legal_structure`, `business_category`, `company_size` |
| `id_document_type` | `business_proof_type` set (it must fit the GST answer, which the DB already enforces); if `gst_registered`, a `gstin` that passes 4.1 |
| | `address`, `area`, `city`, `state`, `pin_code`, `latitude` + `longitude` |
| | `poster_role`, `id_document_type` |

`trade_name`, `email`, `logo` and `website_url` are optional.

- **Delete Ambady's `employer_business_complete`** (`backend/apps/partners/selectors.py`) and
  update every caller: `submit_partner_application` (`services/application.py`),
  `_base_application_is_complete` (`services/base.py`) and
  `get_business_details_complete` (`serializers/onboarding.py`). For EMPLOYER, "complete" now means
  `display_name`, required consents **and** an empty `employer_missing_fields`.
- **Keep the `business_details_complete` field** in the API (released phone apps may read it). It
  now means "employer details complete": `not employer_missing_fields(partner)` for EMPLOYER,
  `true` for other tracks.
- **Submit:** when incomplete, raise `PartnerApplicationIncompleteError` with a message naming the
  first missing thing ("Add your business address and pin code before sending."). Required
  documents come from 4.2.
- **Resubmit:** when an EMPLOYER application goes `CHANGES_REQUIRED → SUBMITTED`, delete its
  `EmployerReviewCheck` rows. Old ticks may be about details that changed.
- The EMPLOYER track must not depend on `biography` any more.

### 4.4 Operations: approval, checks and hints

**Approve** (`transition_partner_application` in `services/review.py`, `APPROVED` branch): for
EMPLOYER, every required check code (3.3 table) must exist with `result=PASS`. Otherwise raise a
new `EmployerChecksIncompleteError` → HTTP 409 `employer_checks_incomplete` listing the missing
codes. The existing "required documents approved" rule still applies on top.

**Hints** (`employer_hints(partner) -> list[Hint]` in `services/employer.py`). Each hint is
`{code, level: "OK" | "WARN", message}`. They are read-only and never block anything.

| Code | When `WARN` |
|---|---|
| `GSTIN_STATE_MISMATCH` | GSTIN state ≠ the `state` they typed |
| `PAN_TYPE_MISMATCH` | PAN 4th letter isn't expected for their `legal_structure` (4.1) |
| `DUPLICATE_GSTIN` | Another partner's `PartnerBusinessProfile` has the same GSTIN (name them) |
| `NO_GST` | Business without GST: "Check the business proof carefully." |
| `UDYAM_PROOF` | Proof type is Udyam: "Udyam is self-declared. Look for other signs the business is real." |

When nothing is wrong, return one `OK` hint per check that ran.

**Queue filter by type.** Add an optional `track` to `OperationsApplicationQueueQuerySerializer`
(a `ChoiceField` over `PartnerApplication.Track`; an unknown value is a 400) and to
`operations_partner_application_queue(...)` in `selectors.py`. It combines with the existing
status and assignment filters. Add `track` to `OperationsApplicationQueueItemSerializer` so each
row can show its type.

### 4.5 Saving employer details (the service behind the new PATCH)

`update_employer_details(application, data, expected_version)` in `services/employer.py` is the
**only** write path for the employer screens. In one transaction it:

- refuses with 409 `employer_track_required` unless the track is `EMPLOYER`, and with the existing
  409 unless the application is editable (`DRAFT` or `CHANGES_REQUIRED`);
- creates the `EmployerProfile` on first call;
- writes `display_name` to `PartnerProfile`, the person fields to `EmployerProfile`, and the
  business fields to `PartnerBusinessProfile` (creating it with `business_type=EMPLOYER` when
  `hiring_as` is `BUSINESS`);
- **switching `hiring_as` to `INDIVIDUAL`** deletes the partner's `PartnerBusinessProfile` row (only
  when its `business_type` is `EMPLOYER`) and its logo file, and clears `poster_role`;
  **switching to `BUSINESS`** clears the individual's `area`, `city` and `pin_code`. Documents of
  kinds no longer offered stay in the database but are not shown or required (both screens
  filter by `offered_document_kinds`);
- raises `application.version` by 1, like the existing PATCH.

Ambady's `PUT /partner/business-profile/` stays for M2 vendors. Employer screens stop calling it.

### 4.6 Job rules (`backend/apps/listings/`)

1. **Public employer identity.** Turn Ambady's `employer_name(poster)` in
   `backend/apps/listings/selectors.py` into `employer_public_identity(poster) -> dict` and keep
   `employer_name(poster)` as `employer_public_identity(poster)["name"]` so its callers still work.

   | Case | `name` | `kind` | `locality` |
   |---|---|---|---|
   | `hiring_as=BUSINESS` | `trade_name`, else `legal_name` | `BUSINESS` | business `area`, `city` |
   | `hiring_as=INDIVIDUAL` | first name + last initial, e.g. "Priya S." (from `display_name`; one word → as is) | `INDIVIDUAL` | employer `area`, `city` |
   | No `EmployerProfile` but a business profile with a `legal_name` (approved under Ambady's form) | `legal_name` | `BUSINESS` | business `city` |
   | Neither (old test fixtures) | `display_name` | `""` | `""` |

   Plus `is_verified` (application `APPROVED`), `logo_url` (absolute URL or `""`),
   `industry_label` and `size_label` (business only, `""` otherwise).
2. **Serializers** (`backend/apps/listings/serializers.py`): add an `employer` object (the dict
   above) to `ListingSummarySerializer`; `poster_name` and `ApplicationSerializer.employer_name`
   keep returning `employer.name`. Add `poster__employer_profile` and `poster__application` to
   the `select_related` wherever listings are listed (Ambady already selects
   `poster__business_profile`), so this adds no extra queries.
   **Leave the Operations / cases serializers alone** (`apps/cases/serializers.py`); Operations
   still sees the person.
3. **No limits.** Don't add any category, work-mode, vacancy or live-job rule for any employer.
4. **No asking candidates for money** (all employers). In `jobs.py`:
   `MONEY_ASK_PHRASES = ("registration fee", "registration charge", "joining fee", "training fee",
   "security deposit", "refundable deposit", "processing fee", "pay to apply", "advance payment",
   "pay first")`. Check `title`, `description`, `responsibilities`, `benefits`, `required_skills`
   and `preferred_skills` (join list items with spaces), lower-cased, with repeated whitespace
   collapsed. Run it in `post_job`, `update_job` and `publish_job_now`. On a match, raise code
   `job_text_asks_for_money` with the message
   "Jobs on V Solve Hub can't ask candidates to pay. Remove “<phrase>”."
   Don't block plain "deposit": a cashier job legitimately says "cash deposit". Follow the
   existing `ListingStateError` → API error pattern in `apps/listings/views.py`, and make the
   `code` reach the client.
5. **Household job templates** (migration `0019_home_personal_templates.py`), category
   `"Home & Personal"`, available to **every** employer. Same tuple shape as `0012` (category,
   role, skills, duties, job type, shift, work mode, min ₹, max ₹):

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

### 4.7 Account deletion (`backend/apps/identity/account_deletion.py` `_erase_partner`)

New personal data must be erased like the rest:

- `EmployerProfile`: blank `email`, `area`, `city`, `pin_code`.
- `PartnerBusinessProfile` rows with `business_type=EMPLOYER`: also blank `trade_name`,
  `address`, `area`, `pin_code`, `website_url`, `latitude`/`longitude` (null), `gstin`, set
  `gst_registered=False` and `business_proof_type=""` (a proprietor's GSTIN contains their PAN),
  and delete the logo file the same way the function deletes the partner's other files.

---

## 5. API contract

Bump `SPECTACULAR_SETTINGS["VERSION"]` in `backend/config/settings/base.py` from `1.104.0` to
the **next free minor** (`1.105.0` today; check `contracts/openapi/CHANGELOG.md` on `main` and the
open PRs when you open yours). Add a CHANGELOG entry in the same style as 1.104.0, listing every
item below.

| # | Endpoint | Change |
|---|---|---|
| A1 | `GET /api/v1/partner/application/` | Add `employer` (`null` for other tracks; otherwise the `EmployerProfile` fields, the business fields from `PartnerBusinessProfile` with `logo_url` absolute, and `missing_fields` from 4.3) and `offered_document_kinds`. `required_document_kinds` now depends on the application (4.2). `business_details_complete` keeps its name with the meaning in 4.3. |
| A2 | **New** `PATCH /api/v1/partner/application/employer/` | Body: `expected_version` (required) + any field from A1's `employer` that the employer can edit, plus `display_name`. Returns `PartnerApplication`. Rules in 4.5 and below. |
| A3 | **New** `POST /api/v1/partner/application/employer/logo/` | Multipart `file`: JPEG/PNG/WebP, ≤ 2 MB, checked by its first bytes (copy `_check_stay_image` in `apps/stay/services.py`). Business only. Returns `PartnerApplication`. `DELETE` on the same path removes the logo. |
| A4 | `GET /api/v1/operations/partner-applications/{id}/` | Add `employer`, `employer_hints` and `employer_checks` (every required code with `label`, `result` or `null`, `note`, `checked_by_name`, `checked_at`). **Only for Operations:** the applicant's own read (`APPLICANT_AUDIENCE` in `PartnerApplicationSerializer.to_representation`) must not include hints or checks. |
| A5 | **New** `PUT /api/v1/operations/partner-applications/{id}/employer-checks/{code}/` | Body `{result: "PASS" \| "FAIL", note}`. Returns the updated `employer_checks`. |
| A6 | `POST /api/v1/operations/partner-applications/{id}/transition/` | New 409 `employer_checks_incomplete` (4.4). |
| A7 | Listing and application reads (customer + partner) | Add `employer` (4.6.1); `poster_name` and `employer_name` return the public name. |
| A8 | `POST /api/v1/partner/jobs` and job update / publish | New 400 `job_text_asks_for_money` (4.6.4). |
| A9 | `GET /api/v1/operations/partner-applications/` | New optional `track` filter; each row includes `track` (4.4). |

### Validation for A2 (400, with the field name)

| Field | Rule | Code |
|---|---|---|
| `gstin` | 4.1; also `gst_registered` must be `true` | `gstin_*` / `gstin_needs_gst_registered` |
| `pin_code` | `^[1-9][0-9]{5}$` | `pin_code_invalid` |
| `business_proof_type` | must fit `gst_registered` (3.1) | `business_proof_mismatch` |
| `latitude` / `longitude` | both or neither, in range | existing pin errors |
| `website_url` | valid http(s) URL | DRF default |
| business fields or `poster_role` when `hiring_as=INDIVIDUAL`; individual `area`/`city`/`pin_code` when `BUSINESS` | not allowed | `employer_field_not_for_type` |

### Rules for A5 (checks)

- The reviewer must have claimed the application (status `UNDER_REVIEW`, assigned to them):
  reuse the ownership check in `transition_partner_application`.
- `code` must be required for this employer (3.3 table) → otherwise 400 `employer_check_not_applicable`.
- `FAIL` needs a `note` → otherwise 400 `employer_check_note_required`.
- Upsert by `(application, code)`, with `method=MANUAL`, `checked_by=request.user`.

---

## 6. Work plan: phases and tasks

Finish each phase's "Done when" before starting the next.

**How to run tests** (you may run them):

```powershell
# backend, from backend\ — one file
.\.venv\Scripts\python.exe -m pytest tests/partners/test_employer_onboarding.py -q
# frontend web, from frontend\ — one file
pnpm vitest run apps/partner/features/application/model/steps.test.ts
# phone apps, from frontend\
pnpm --filter partner-mobile test
pnpm --filter customer-mobile test
```

### Phase 0: Set up and read

- [ ] 0.1 Check out the branch (section 0).
- [ ] 0.2 Run the backend (`backend\scripts\server.cmd`), the partner web and admin apps, and
      `seed_jobs_demo`. Sign up as a new employer and walk **Ambady's current flow** (About you →
      Business details → Documents → Review), on the website and in the partner phone app. Then
      log in as the demo employer and post a job.
- [ ] 0.3 Read every file in section 2.

**Done when:** you can describe today's EMPLOYER flow end to end, and you've written down
anything in this plan that doesn't match the code (ask the owner about it).

### Phase 1: Backend models and GSTIN module

- [ ] 1.1 Extend `PartnerBusinessProfile` (3.1), including the wider `business_category`.
- [ ] 1.2 `backend/apps/partners/models/employer.py`: `EmployerProfile` and
      `EmployerReviewCheck` (3.2, 3.3), exported.
- [ ] 1.3 The three new `PartnerDocument.Kind` values (3.4).
- [ ] 1.4 Migration `0030_employer_profile` (3.5); then `makemigrations --check` is clean.
- [ ] 1.5 `backend/apps/partners/gstin.py` (4.1) with `GstinFacts`, `GstinInvalidError`, the
      state table and the PAN letter table.
- [ ] 1.6 Register both new models in `backend/apps/partners/admin.py` (read-only list is enough).

**Tests:** `backend/tests/partners/test_gstin.py`: both public samples pass; one wrong check
character fails with `gstin_checksum`; wrong length, bad state `00`, bad PAN part, and lower-case
input normalised. `backend/tests/partners/test_employer_models.py`: each new DB constraint
refuses a bad row (`pytest.raises(IntegrityError)`), and a row saved with Ambady's old
`business_category` codes still loads.

**Done when:** `backend\scripts\quality-static.cmd` passes and the two test files pass.

### Phase 2: Backend applicant side

- [ ] 2.1 `required_document_kinds` / `offered_document_kinds` (4.2), and replace the four reads.
- [ ] 2.2 `SELFIE` only accepts images (3.4).
- [ ] 2.3 `backend/apps/partners/services/employer.py`: `update_employer_details(...)` (4.5, A2
      rules) and `employer_missing_fields(...)` (4.3).
- [ ] 2.4 Delete `employer_business_complete` and update its callers (4.3).
- [ ] 2.5 Serializers in `backend/apps/partners/serializers/onboarding.py`: the `employer` read
      object (with `missing_fields`), the A2 write serializer, and `offered_document_kinds` on
      `PartnerApplicationSerializer`.
- [ ] 2.6 Views + URLs: `PartnerEmployerDetailsView` (PATCH) and `PartnerEmployerLogoView`
      (POST/DELETE) in `backend/apps/partners/views/partner_application.py`, registered in
      `backend/apps/partners/urls.py` next to `partner/application/`. Add `@extend_schema` with
      every error code listed in section 5.
- [ ] 2.7 Submit + completeness changes (4.3), including clearing checks on resubmit.
- [ ] 2.8 Account deletion (4.7).

**Tests:** `backend/tests/partners/test_employer_onboarding.py`:
- the PATCH is refused for a non-EMPLOYER track and for a submitted application
- switching `hiring_as` both ways clears the other type's fields (business profile row and logo
  gone when switching to individual)
- each validation code in the A2 table
- submit is refused while anything in 4.3 is missing (one test per type), and works when complete
- an individual can submit **without** any business details (the bug in Ambady's rule)
- required documents per type, including the owner's letter only for non-owners
- the logo upload rejects a renamed PDF
- the applicant's read never contains `employer_hints` / `employer_checks`

Update Ambady's `backend/tests/partners/test_employer_business_endpoint.py` where it asserts the
old name/type/city rule. Add the employer cases to `backend/tests/identity/test_account_deletion.py`.
`test_stay_host_track.py` must still pass **unchanged** (proves the other tracks didn't move).

**Done when:** `quality-static.cmd` passes and these test files pass.

### Phase 3: Backend Operations review

- [ ] 3.1 `employer_hints(partner)` (4.4).
- [ ] 3.2 `set_employer_check(...)` service + `OperationsEmployerCheckView` (A5) in
      `backend/apps/partners/views/operations.py` and `urls.py`.
- [ ] 3.3 Ops detail read (A4): add `employer`, `employer_hints`, `employer_checks`.
- [ ] 3.4 Approval guard in `transition_partner_application` (4.4, A6).
- [ ] 3.5 Queue `track` filter and `track` on each row (4.4, A9).

**Tests:** `backend/tests/partners/test_employer_review_checks.py`:
- approve is blocked with `employer_checks_incomplete` until every required check passes, for
  an individual, a business with GST and a business without GST
- a non-claiming reviewer can't set checks
- `FAIL` without a note is refused
- a check code for the other type is refused
- checks are deleted on resubmit
- hints: state mismatch, PAN type mismatch, duplicate GSTIN, no GST, Udyam

`backend/tests/partners/test_review_queue_track_filter.py`: each track filters correctly, it
combines with `status` and `assigned_to_me`, and an unknown track is a 400.

**Done when:** `quality-static.cmd` passes and these test files pass.

### Phase 4: Backend job rules

- [ ] 4.1 `employer_public_identity` + serializer changes (4.6.1–2).
- [ ] 4.2 Money-ask phrase block (4.6.4).
- [ ] 4.3 Household templates migration (4.6.5).
- [ ] 4.4 Make sure `GET jobs/options` returns the new category (it reads `JobRoleTemplate`;
      check it).

**Tests:** `backend/tests/listings/test_employer_public_identity.py` (business trade name,
legal-name fallback, Ambady-era employer without `EmployerProfile`, "Priya S.", and no extra
queries: `django_assert_max_num_queries` on the public list);
`backend/tests/listings/test_job_text_money_block.py` (each blocked phrase in each field, on post,
update and publish; "cash deposit" allowed). Update `backend/tests/listings/jobs_helpers.py` so
helper employers get an `EmployerProfile` (business by default). Ambady's
`test_hiring_outcome.py` must still pass.

**Done when:** `quality-static.cmd` passes and these test files pass.

### Phase 5: Publish the contract

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

### Phase 6: Partner web onboarding screens

All under `frontend/apps/partner/`.

- [ ] 6.1 **Steps** (`features/application/model/steps.ts`): replace Ambady's `EMPLOYER_STEPS`
      with `applicationSteps(track, hiringAs)`. For EMPLOYER: `/apply`, `/apply/hiring-as`, then
      individual → `/apply/employer/about`; business → `/apply/employer/business`,
      `/apply/employer/contact`; then `/apply/documents`, `/apply/review`. Before a choice is
      made, only `/apply` and `/apply/hiring-as` show. Update `trackPreview` so the overview card
      shows "Who is hiring → Your details → Documents → Review". Pass `hiringAs` everywhere
      `applicationSteps` / `nextStep` / `stepIndexOf` / `previousStep` are called.
- [ ] 6.2 **Guard** `features/application/view/employer-step-guard.tsx`, modelled on
      `listing-step-guard.tsx`: non-EMPLOYER on an employer page → `/apply`; an individual on a
      business page → `/apply/employer/about`, and the reverse; EMPLOYER on `/apply/about` or the
      old `/apply/employer` → `/apply/hiring-as`.
- [ ] 6.3 **Who is hiring?** `app/apply/hiring-as/page.tsx` + `features/application/view/hiring-as-step.tsx`.
      Two large cards (copy in section 7). Selecting one PATCHes `hiring_as`. If they switch after
      filling details, confirm first (copy in section 7).
- [ ] 6.4 **Individual "About you"** `app/apply/employer/about/page.tsx` +
      `view/employer-about-step.tsx`: full name (pre-filled from sign-up, like `about-step.tsx`
      does today), email, pin code, area, city, ID type (select). "Continue" stays disabled until
      the required fields are valid.
- [ ] 6.5 **Business details** `app/apply/employer/business/page.tsx` +
      `view/employer-business-step.tsx`:
      - business name (`trade_name`), legal name, legal structure, industry, size (chips)
      - "Do you have GST?" (Yes/No). Nothing is pre-selected for a new business: show Yes when
        `gst_registered` is true, No when it is false **and** a proof type is saved, otherwise
        neither. Yes shows a GSTIN input with live validation from a client copy of 4.1 in
        `features/application/model/gstin.ts`, with a small note: "We'll check this on the GST
        portal."
      - which business proof (Yes → fixed to "GST certificate"; No → a select of the other seven)
      - address line, area, city, state, pin code, and the map pin via `FindOnMap`
      - logo upload (optional, image preview + remove) and website (optional)
- [ ] 6.6 **You & your role** `app/apply/employer/contact/page.tsx` +
      `view/employer-contact-step.tsx`: your name (`display_name`), your role, email, ID type.
      When the role isn't Owner, show the owner's-letter note (section 7).
- [ ] 6.7 **Documents** (`view/documents-step.tsx`): build the slots from
      `offered_document_kinds` / `required_document_kinds` (delete the hard-coded
      `OFFERED_DOCUMENTS` list). Labels and "why we ask" text for each kind (section 7).
      The `SELFIE` slot uses `accept="image/jpeg,image/png"` and `capture="user"` (opens the front
      camera on phones; a file picker on desktop, which is fine). Show the chosen ID type /
      proof type above its slot. For Aadhaar, show the masked-Aadhaar help text.
- [ ] 6.8 **Readiness** (`model/readiness.ts`): employer requirements = hiring choice, details
      complete (read `employer.missing_fields` from the server; **don't copy the rules into the
      client**), documents, consents. Keep today's rules for the other tracks exactly.
- [ ] 6.9 **Review** (`view/review-step.tsx`) and `view/profile-preview.tsx` (Ambady added a
      business block there): an employer summary (type, names, location, GST yes/no) read from
      `application.employer`, with "Edit" links to each step.
- [ ] 6.10 **Queries** (`features/application/queries.ts`): `useUpdateEmployerDetails`,
      `useUploadEmployerLogo`, `useRemoveEmployerLogo`; they invalidate the application query.
- [ ] 6.11 **Clean up Ambady's step:** delete `app/apply/employer/page.tsx` and
      `features/application/view/employer-step.tsx`, the employer branch in `about-step.tsx`
      (`apply.about.bio.placeholder.employer`), and the `apply.employer.*` / `apply.steps.employer`
      keys nothing uses any more. Search for `business_details_complete`, `employer-step` and the
      `EMPLOYER` entries Ambady added under `features/capability/adapters/`; remove whatever only
      his step used.
- [ ] 6.12 **Copy:** add all new keys to `i18n/catalogs/apply.ts` in en, te and hi, and update the
      overview card's employer description (section 7).

**Tests:** update `features/application/model/steps.test.ts` (both types, and no choice yet) and
`readiness.test.ts` (both types); new `model/gstin.test.ts` using **the same samples** as the
backend test; one component test per new step (required fields block Continue; switching type
asks first); update `profile-preview.test.tsx`.

**Done when:** `pnpm lint`, `pnpm typecheck` and `pnpm build` pass in `frontend`, and these test
files pass.

### Phase 7: Operations console

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
- [ ] 7.5 **Queue type filter** (`view/review-queue.tsx`, `queries.ts`): add `track` to
      `QueueFilters` and a "Type" dropdown next to the existing tabs: All types / Technicians
      (`SERVICES`) / Property hosts (`STAY_HOST`) / Rental owners (`RENTAL_OWNER`) / Employers
      (`EMPLOYER`). It combines with the tabs. Show a small type badge on each row.

**Tests:** `view/employer-review-panel.test.tsx` (renders both types; approve is disabled until
all checks pass; Fail needs a note); a queue test that the dropdown sends `track` and keeps the
tab's filters.

### Phase 8: Partner web job form + customer web job cards

- [ ] 8.1 `frontend/apps/partner/features/listings/view/post-job-wizard.tsx`: show the
      `job_text_asks_for_money` message in the wizard's existing error area, next to the field
      if possible. For an individual employer, list "Home & Personal" first in the categories
      (only the order changes; every category stays available).
- [ ] 8.2 Customer web: `frontend/apps/customer/features/listings/view/listing-row.tsx`,
      `features/listings/listing-opportunity-card.tsx`, `view/role-header.tsx` and
      `app/(flow)/listings/[slug]/page.tsx`: show the logo (or the first letter in a circle),
      `employer.name`, "✓ Verified business" / "✓ Verified individual", industry · size
      (business only), and the locality. Never show an individual's full name or address.

**Tests:** a wizard test that the money message is shown; a render test for the employer block
on a job card (both types).

### Phase 9: Mobile apps

Read `frontend/mobile/AGENTS.md` and `frontend/mobile/README.md` first, and tell the mobile
developer you're starting.

- [ ] 9.1 Partner app, `frontend/mobile/apps/partner/`: the same steps as Phase 6.
      New routes `app/(app)/apply/hiring-as.tsx`, `app/(app)/apply/employer/about.tsx`,
      `.../employer/business.tsx`, `.../employer/contact.tsx`; update `app/(app)/apply/_layout.tsx`.
      Update `src/features/application/model/steps.ts`, `readiness.ts`,
      `view/documents-step.tsx` (selfie with the front camera, the same picker
      `view/document-upload.tsx` already uses), `view/review-step.tsx` and `view/profile-preview.tsx`.
      For the map pin, reuse the pickup-pin approach in `src/features/rentals/view/rental-ad-sheet.tsx`.
      Copy the GSTIN client check (same algorithm, same test samples).
- [ ] 9.2 Delete Ambady's `app/(app)/apply/employer.tsx` and
      `src/features/application/view/employer-step.tsx` once the new screens replace them.
- [ ] 9.3 Partner app job form: show the money message, and "Home & Personal" first for
      individuals, as in 8.1.
- [ ] 9.4 Customer app, `frontend/mobile/apps/customer/src/features/listings/view/`
      (`job-card.tsx`, `listing-detail-screen.tsx`, `desktop-listing-detail.tsx`,
      `desktop-listings-browse.tsx`): the employer block as in 8.2.
- [ ] 9.5 Update `steps.test.ts` / `readiness.test.ts` in the partner app for both types.

**Done when:** the mobile typecheck, lint and Jest commands from `frontend/mobile/README.md` pass.
**Do not start an EAS build or an `eas update`.** The owner does releases.

### Phase 10: Demo data, full test run, hand-over

- [ ] 10.1 `seed_jobs_demo.py`: give both existing demo employers an `EmployerProfile`
      (`BUSINESS`, role `OWNER`) and a complete business profile with `gst_registered=False` and
      `business_proof_type=SHOP_ESTABLISHMENT`. **Don't invent GSTINs**: a made-up number could
      belong to a real business. Add a third demo employer, an **individual** ("Priya Sharma",
      Kondapur, Hyderabad) with one live "House Help / Maid" job.
- [ ] 10.2 `seed_listing_catalog.py`: give its demo employer a business profile the same way.
- [ ] 10.3 Walk through section 8 yourself in the browser and fix what breaks.
- [ ] 10.4 Run the full suites once: `backend\scripts\quality.cmd`, `pnpm test`, `pnpm e2e` (in
      `frontend`), and the two mobile Jest suites. Fix failures and rerun only what failed.
- [ ] 10.5 Open the PR (section 9 checklist). Put screenshots of every new screen (desktop +
      phone width) in the PR description.

---

## 7. Screen copy (English; add te + hi)

**Overview card ("I want to hire staff") description:** "For your home or your business: find
people to work for you."

**Who is hiring?** Title: "Who is hiring?"

| Card | Title | Line under it |
|---|---|---|
| Individual | "For myself or my home" | "Hiring in your own name: a maid, cook, driver, assistant, tutor or anyone else." |
| Business | "For my business" | "A shop, clinic, restaurant, school, office or company." |

Under the cards: "Hiring for another company as an agency? We don't support agencies yet."

**Switching type (confirmation):** "Switch to <new type>? The details you entered for <old type>
will be cleared." Buttons: "Switch" / "Cancel".

**Owner's letter note (role isn't Owner):** "You'll upload a letter from the owner, on business
letterhead, that names you as the person hiring."

**Document labels and "why we ask":**

| Kind | Label | Why we ask |
|---|---|---|
| `GOVERNMENT_ID` | "Your ID" | "So candidates know a real person is hiring." |
| `SELFIE` | "A selfie" | "We match it with your ID photo. Face the camera in good light." |
| `BUSINESS_PROOF` | "Business proof: <type>" | "So candidates know the business is real. The name must match the legal name you gave." |
| `AUTHORIZATION_LETTER` | "Letter from the owner" | "On business letterhead, signed by the owner, naming you as the person hiring." |

**Masked Aadhaar help:** "Upload a masked Aadhaar: only the last 4 digits are visible. You can
download it from the UIDAI website. Don't upload a full Aadhaar number."

**Money block (job form):** "Jobs on V Solve Hub can't ask candidates to pay. Remove “<phrase>”."

**Operations, approve disabled:** "Finish the checklist first."

---

## 8. Manual test script (do this before opening the PR; the owner repeats it)

Use a fresh phone number for each employer.

**Individual**
1. Log in on the partner site → "I want to hire staff" → "For myself or my home".
2. Leave the pin code empty → Continue stays disabled.
3. Fill everything, upload an ID and a selfie (try a PDF selfie → refused) → Review → send.
   Status shows "Submitted".
4. Operations console → queue → Type "Employers" → only employer applications show. Claim it.
5. Approve without checks → refused ("Finish the checklist first").
6. Approve both documents, pass the 2 checks → approve.
7. Partner: post an "Office Assistant" job, work from home, 10 vacancies → works (no limits).
8. Customer site: the card shows "Priya S. · ✓ Verified individual · Kondapur, Hyderabad".
   No full name, no address.

**Business with GST**
1. "For my business" → GSTIN `27AAPFU0939F1ZW` (wrong last character) → "This GSTIN isn't
   valid." Fix it to `27AAPFU0939F1ZV` → accepted.
2. State Telangana → in Operations, the hint shows a state mismatch (27 = Maharashtra).
3. Structure "Company" → the PAN type hint shows a mismatch (letter `F` = firm).
4. Role "HR / Recruiter" → the documents step asks for the owner's letter.
5. Operations: the GST portal link opens; the checklist has 4 rows; approve after all pass.
6. Customer site: the business name and logo show, with "✓ Verified business".
7. Write "Registration fee ₹500" in a job description → refused with the money message.
   "Cash deposit at the bank" in a cashier job → allowed.

**Business without GST**
1. "Do you have GST?" No → "GST certificate" can't be chosen → pick Udyam.
2. Operations: `NO_GST` and `UDYAM_PROOF` hints show; the checklist has 3 rows (no GST row).

**Switching**
1. Fill the business details, go back, choose "For myself or my home" → the confirmation shows →
   Switch → the business details and logo are gone; the documents step now asks for a selfie.

**Regression**
1. An "Offer services" applicant still walks the full steps unchanged.
2. A "List my property" applicant still sees only About → Documents → Review.
3. Ambady's hire flow still works: mark an applicant Hired, then close the job as filled.

---

## 9. PR checklist (definition of done)

- [ ] Everything in sections 3–5 is built, or listed in the PR as "not done" with the reason.
- [ ] `backend\scripts\quality.cmd` passes (ruff, strict mypy, pytest, migrations check, OpenAPI
      validation, contract drift). Paste the real output.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm contract:check`, `pnpm test` and
      `pnpm e2e` pass in `frontend`. Paste the real output.
- [ ] Mobile typecheck, lint and Jest pass (commands from `frontend/mobile/README.md`).
- [ ] Every test file named in this plan exists, and the PR lists them.
- [ ] Ambady's employer step is deleted on web and mobile; nothing still calls
      `PUT /partner/business-profile/` from an employer screen.
- [ ] All new copy exists in en, te and hi.
- [ ] Screenshots of every new screen (desktop + phone width) and of the Operations panel and
      queue filter.
- [ ] Contract CHANGELOG entry written; version is the next free minor.
- [ ] Rebased on the latest `main`; migration numbers don't clash.
- [ ] Only explicit paths were staged; no `.env`, databases, media or `node_modules`.

---

## 10. Not in V1 (don't build)

Agencies · writing draft jobs before approval · GST API auto-fill · DigiLocker / Aadhaar e-KYC ·
automatic PAN check · selfie face match · company-email OTP · auto-approval · monthly GST
re-check · pin-code-to-city check. The `EmployerReviewCheck.method` field and the hints list
exist so V2 can add these without changing the screens.

---

## 11. Questions

The owner has answered every known question. If you find something in the code that doesn't
match this plan, stop and ask the owner before building around it.

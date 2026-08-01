# Proposal 0005 — Partner onboarding gaps found while building `/apply/*`

**Author:** Claude (frontend)
**Date:** 1 August 2026
**Contract version reviewed:** 1.2.0
**Status:** Accepted with changes — backend implementation pending
**Raised by:** FE-CLAUDE-03 (mobile-first Partner `/apply/*` routes)
**Related board items:** D6 (documents), G10 (upload transport)

The `/apply/*` tree is built and reachable: login, application read, profile, trades and services,
schedule, submit and review status all run against published endpoints. Four gaps stop it short of
a working onboarding for a *new* applicant, and the first two are hard blockers — not polish.

Ordered by how much they block.

## Backend decision — 2 August 2026

- Publish bounded applicant-visible service areas and canonical Partner skills.
- Publish required consent purpose, title, current document version and approved legal URL/content.
- Make `PATCH /partner/application/` genuinely partial. Every write still carries
  `expected_version`, applies only supplied fields, validates the resulting whole application and
  returns the complete new representation.
- Keep whole-schedule replacement as `PUT`; schedule overlap is a set invariant and should not be
  patched rule-by-rule.
- Do not expose internal capacity, ranking or database identifiers beyond the stable public ids the
  applicant must submit.

---

## 1. Nothing publishes the service areas whose ids the application requires

**Severity: blocking. A new applicant cannot save anything at all.**

### Problem

`PatchedPartnerApplicationUpdateRequest.service_area_ids` takes area UUIDs, and Django's serializer
declares it `required` with `allow_empty=False`. `PartnerAvailabilityRuleInputRequest.service_area_id`
needs one too, so the schedule depends on it as well.

No endpoint lists service areas. There is no `GET /api/v1/service-areas/`, nothing on
`/api/v1/partner/me/`, and nothing in the public catalog. The ids exist only in the database and in
`seed` fixtures.

The frontend cannot render an area picker, and the only alternative — sending a guessed or
hardcoded UUID — would attach a Partner to an area nobody chose. `/apply/areas` therefore ships as
an explicit "not open yet" state.

Because the update is a full replace (see §3), the missing area ids block **every** step: an
applicant cannot save their name at `/apply/about` either.

### Requested change

A bounded, public-or-authenticated list of areas an applicant may select:

```http
GET /api/v1/service-areas/
```

```json
[
  {
    "id": "9f5a...",
    "name": "Hyderabad — Gachibowli",
    "city": "Hyderabad",
    "state": "Telangana",
    "is_accepting_partners": true
  }
]
```

`is_accepting_partners` matters: an area at capacity should stop appearing without a frontend
change, the same way a deactivated service already does.

### User-visible behavior once published

An applicant picks the areas they will travel to, and the schedule editor — which is per area and
currently refuses to render — becomes usable.

---

## 2. The required consent purposes and their document versions are not published

**Severity: blocking for submission.**

### Problem

`PartnerConsentInputRequest` takes `{purpose, document_version}`, both free-form strings, and
`submit_partner_application` refuses unless the Partner holds active consents for every purpose in
`settings.PARTNER_REQUIRED_CONSENT_PURPOSES` — currently `("partner_terms", "privacy_notice")`.

That setting is not in the contract, and neither is the current version string of either document.
So the frontend cannot render the agreements to accept, and a checkbox that posted a made-up
`document_version` would produce a consent receipt for a document nobody can identify — the exact
record that has to hold up if the agreement is ever disputed.

`/apply/review` therefore lists consents already on file and says plainly that there is nothing to
agree to yet.

### Requested change

Publish the agreements an applicant must accept, with the text or a URL to it:

```http
GET /api/v1/partner/required-consents/
```

```json
[
  {
    "purpose": "partner_terms",
    "title": "Partner terms",
    "document_version": "2026-07-01",
    "document_url": "https://vsolvehub.com/legal/partner-terms/2026-07-01",
    "is_required_for_submission": true
  }
]
```

A version bump then re-prompts every Partner automatically, which is the behaviour consent
management needs and cannot get from a hardcoded string.

---

## 3. `PATCH /api/v1/partner/application/` is a full replace generated as a partial update

**Severity: high. The generated types say the opposite of what Django does.**

### Problem

The operation generates as `PatchedPartnerApplicationUpdateRequest`, with every field optional.
`PartnerApplicationUpdateSerializer` disagrees: `display_name`, `skill_codes`,
`service_variant_ids`, `service_area_ids` and `consents` are all **required**, and the three lists
are `allow_empty=False`. The view then reads them with `data[...]`, not `data.get(...)`.

So a step that sends only the field it edits type-checks, and returns `400`. There is no request
shape that saves one step of a multi-step form.

The frontend has handled it: `apps/partner/features/application/model/draft.ts` holds the whole
record, every step merges into it, and every save sends all of it. But that behaviour is invisible
in the generated types, so the next person to add a step will write the partial call the types
invite.

### Requested change

Either:

- **(a)** make the operation genuinely partial — `required=False` on each field, applying only what
  is present — and keep the `Patched…` schema name; or
- **(b)** declare it a replace: `PUT`, a non-`Patched` request schema, and required fields, which is
  what the code already means.

**(a)** is much better for onboarding. A form that cannot save until every unrelated section is
complete is the reason applicants abandon at step one — today an applicant literally cannot record
their name before choosing service areas they cannot see.

---

## 4. Partner skills have no endpoint and are inferred from the catalog

**Severity: medium. Works, but by derivation rather than by contract.**

### Problem

`skill_codes` takes slugs and nothing publishes the valid set.
`ServiceVariantConfiguration.required_skill_code` is the only published source, so
`apps/partner/features/catalog/queries.ts` walks categories → services → configuration and collects
the distinct codes.

Two consequences. It costs one request per category plus one per service to render the trade list.
And a skill has no name of its own, so the label is derived from the slug — `electrical` becomes
"Electrical". That is fine for `electrical` and poor for anything hyphenated or abbreviated.

### Requested change

```http
GET /api/v1/partner/skills/
```

```json
[
  { "code": "electrical", "name": "Electrical", "description": "Wiring, fittings, fans and lights" }
]
```

### Related

`/api/v1/partner/me/` currently returns the application serializer, so there is no separate Partner
profile projection. That is fine for M1, but worth confirming it is deliberate before F5 depends on
it.

---

## What ships in the meantime

| Route | State |
| --- | --- |
| `/apply` | Working — status, readiness checklist, transition history |
| `/apply/about` | Working UI; save blocked by §1 for a new applicant |
| `/apply/work` | Working UI, options derived per §4; save blocked by §1 |
| `/apply/areas` | Explicit "not open yet" — blocked by §1 |
| `/apply/documents` | Read-only status and rejection reasons; upload blocked by D6/G10 |
| `/apply/schedule` | Working against real endpoints; empty until §1 gives an applicant areas |
| `/apply/review` | Working submit and status; consents blocked by §2 |

No route fabricates an area id, a consent version, an object key or an approval state.

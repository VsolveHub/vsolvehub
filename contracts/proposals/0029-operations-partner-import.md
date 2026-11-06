# 0029 — Operations partner import (CSV)

Status: **Published** at contract 1.98.0. Built end to end by Claude on the owner's direction
(`AGENTS.md`, "Operations console and partner import"). Row and summary problem fields are named
`problems`, not `errors`: a serializer field named `errors` shadows DRF's own `Serializer.errors`.

## Why

Operations already has `POST /api/v1/operations/partners/import/` and an Import partners screen,
but neither is fit for production:

- It creates a user and a bare `PartnerProfile` with **no `PartnerApplication`**, so an imported
  partner never appears in review, cannot submit, and cannot go online.
- The screen asks for a `city` column the server ignores.
- The logic lives in the view, there is no request or response schema (the screen casts the
  result), no row or size limit, no idempotency, and failures return 500 with raw exception text.

## The idea in one line

An import **pre-fills a partner's application**. It never approves anyone. Each row becomes a
DRAFT application; the partner signs in with their phone (OTP), accepts the agreements, uploads
identity documents and submits. Review then runs exactly as it does today.

Operations cannot accept agreements or upload KYC on a partner's behalf, so those stay with the
partner. That keeps import simple and keeps one route to approval.

## The file

UTF-8 CSV (a BOM is accepted), at most **1 MB** and **500 rows**. Header names are trimmed and
case-insensitive. A missing required column or an unknown column rejects the whole file and names
the column.

| Column | Required | Rule |
| --- | --- | --- |
| `phone` | Always | Indian mobile, normalised to `+91XXXXXXXXXX` by `normalize_phone_number` |
| `full_name` | Always | 2–120 characters after trimming; becomes the user's name and `display_name` |
| `track` | Always | `SERVICES`, `STAY_HOST`, `RENTAL_OWNER` or `EMPLOYER` |
| `service_area` | When `track` is `SERVICES` | A `ServiceArea.slug` that is active and accepting partners |
| `skills` | When `track` is `SERVICES` | One or more active `Skill.code`s separated by `\|`, e.g. `plumbing\|electrical` |
| `experience_years` | No | Whole number 0–60; empty means 0 |

For the other tracks, `service_area` and `skills` must be empty. A value there is a row error,
not silently dropped: those tracks never use them.

Services (catalogue variants) are not a column. The partner picks them in the app, where the
existing check that a service is enabled in their area already runs.

## Row outcomes

| Outcome | When | Blocks the import? |
| --- | --- | --- |
| `ready` / `created` | All rules pass | — |
| `skipped` | The phone already belongs to any user (partner or customer) | No |
| `error` | Any rule fails, or the phone repeats an earlier row in the same file | **Yes** |

A skipped phone is never modified. An existing customer who wants to be a partner applies from the
Partner app as they can today.

## Endpoint

`POST /api/v1/operations/partners/import/` — `multipart/form-data`, Operations users only
(`IsOperationsUser`, unchanged).

| Field | Notes |
| --- | --- |
| `file` | The CSV |
| `mode` | `check` or `import`. Replaces the string `dry_run` flag |

`mode=import` requires an `Idempotency-Key` header (the frontend sends the file's SHA-256) and runs
through `execute_idempotent`, so a double click or retry replays the first result instead of
importing twice.

**Import is all-or-nothing.** The server re-validates the file. If any row has an `error`, it
creates nothing and returns 422. Skipped rows do not block. Successful rows are written in one
transaction.

### Response `200`

```json
{
  "mode": "check",
  "file_sha256": "9f2c…",
  "summary": { "total": 3, "ready": 1, "skipped": 1, "problems": 1 },
  "rows": [
    { "row": 2, "status": "ready", "phone": "+919876543210", "full_name": "Ravi Kumar",
      "track": "SERVICES", "problems": [] },
    { "row": 3, "status": "skipped", "phone": "+919812345678", "full_name": "Asha",
      "track": "STAY_HOST", "problems": [], "message": "This phone is already registered." },
    { "row": 4, "status": "error", "phone": "98123", "full_name": "",
      "track": "SERVICES",
      "problems": [
        { "column": "phone", "message": "Enter a 10-digit Indian mobile number." },
        { "column": "full_name", "message": "Name is required." },
        { "column": "skills", "message": "Unknown skill: carpentery." }
      ] }
  ]
}
```

With `mode=import`, `ready` becomes `created`, `summary.ready` becomes `summary.created`, and each
created row adds `partner_id`. Every row is returned; the list is short because the file is capped
at 500 rows.

### Errors (`ApiErrorSerializer`)

| Status | `code` | User-visible message |
| --- | --- | --- |
| 400 | `import_file_missing` | Choose a CSV file to upload. |
| 400 | `import_file_invalid` | This file is not a readable UTF-8 CSV. |
| 400 | `import_columns_invalid` | Missing column: skills. / Unknown column: city. |
| 400 | `import_too_many_rows` | This file has 812 rows. Import at most 500 at a time. |
| 413 | `import_file_too_large` | This file is over 1 MB. |
| 422 | `import_has_row_errors` | Fix the 3 rows with problems, then import again. Nothing was created. |
| 403 | (standard) | — |

An unexpected failure is a normal 500 with the standard error body. Exception text is never
returned.

## What one created row writes

All in the import transaction, through a domain service (`import_partners(...)` in
`apps/partners/services/`), with the view kept thin:

1. `User` (phone, full name) and the `partner` role.
2. `PartnerProfile` (`display_name`, `experience_years`).
3. `PartnerApplication`: `DRAFT`, the given `track`.
4. For `SERVICES`: one `PartnerServiceArea` and one `PartnerSkill` per skill.
5. A `PartnerApplicationTransition` with `reason_code="operations_import"` and the Operations user
   as `actor`, which is the audit trail: who imported whom, and when.

Not written: consents, documents, services, approval, payout details.

## Screen (Operations → Partners → Import)

1. **What the file needs.** The table above, plus **Download template**: a CSV with the headers and
   one example row, built in the browser.
2. **Choose file**, then **Check file** (`mode=check`).
3. **Results.** Counts for ready, skipped and errors, and a table of every row with a problem
   (row, column, message). The Import button stays disabled while any row has an error.
4. **Import N partners** (`mode=import`) is enabled only after a clean check of the same file. A
   confirm dialog says: "This creates N partner accounts with draft applications. Each partner
   signs in with their phone to finish and submit."
5. **Done.** A created count, and a link to the partner directory.

The dry-run checkbox goes away; check-then-import replaces it.

## Out of scope for v1

- An SMS invite to each imported partner. Operations shares the Partner app link for now; an
  invite needs a registered notification template and consent rules of its own.
- Updating existing partners from a file.
- Importing services, documents or schedules.

## Tests to add

Backend: each required-column rule; track-specific columns; a phone repeated in one file; an
existing phone is skipped and left unchanged; import with any error creates nothing; the
idempotent replay; row and size limits; a non-Operations user gets 403; and the created
application is `DRAFT` with the transition row.

Frontend: the template download, Import disabled until a clean check, the problem table, the
confirm dialog, and that choosing a new file clears the results.

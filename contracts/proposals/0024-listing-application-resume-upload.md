# Proposal 0024 — Listing application resume upload

**Status:** Implemented with the listings app.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/v1/listings/{listing_id}/resume-uploads` | Customer | Store a PDF, DOC, or DOCX resume up to 5 MB and return `resume_url` for apply |

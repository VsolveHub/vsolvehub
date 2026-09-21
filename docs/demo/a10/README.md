# V Solve Hub — Careers (A10) End-to-End Walkthrough

**Captured:** 20 Sep 2026 · **Branch:** `feature/m3-a10-listings` @ `4209d16`
**Source:** every screenshot below is from a **live local run** against the real Django API and PostgreSQL — no mocks, no hand-edited images.

---

## 1. What this feature is

**Careers / Jobs is a listing engine, not a booking flow.**

- An **applicant** browses published roles and applies. **The applicant never pays.**
- An **employer** posts roles, submits them for moderation, manages applicants, and reveals contact details for candidates it wants to interview.
- **Operations** moderates every posting with a recorded reason, and can remove or reinstate.
- The only money in this category is the **employer's own subscription or a featured placement**.

Two rules the implementation enforces and this walkthrough demonstrates:

1. **Nothing is public until Operations approves it *and* the employer publishes it.**
2. **One active application per applicant per listing** — the page tells you up front rather than refusing you after you have filled in a form.

---

## 2. Environment used

| Component | Detail |
|---|---|
| Backend | Django + DRF, the only database authority |
| Database | PostgreSQL 17 (Docker, `127.0.0.1:15432`) |
| Cache / coordination | Redis 7.4 (Docker, `127.0.0.1:56379`) |
| Frontends | Next.js App Router — Customer `:3000`, Partner `:3001`, Operations `:3002` |

```bash
docker compose --env-file infra/.env.example -f infra/compose.yaml up -d --wait
cd backend && .venv/bin/python manage.py migrate && .venv/bin/python manage.py seed_listing_catalog \
  && .venv/bin/python manage.py runserver 0.0.0.0:8000
cd frontend && pnpm dev:customer   # :3000
cd frontend && pnpm dev:partner    # :3001
cd frontend && pnpm dev:admin      # :3002
```

| Role | Login phone | Opens at |
|---|---|---|
| Applicant | `9900000077` | http://localhost:3000/listings |
| Employer (Apex Staffing Solutions) | `9900000088` | http://localhost:3001/listings |
| Operations | `8019013032` | http://localhost:3002/operations/listings |

> Local builds show the OTP on screen (development delivery). Production uses SMS via MSG91 and never exposes the code.

---

## 3. The flow, screen by screen

### Step 1 — Public browse

![Public job board](01-public-browse.png)

Only **published and approved** roles appear. Search, city filter and role-family filters are above the results; each card shows the employer, location, posted date, applicant count and featured badge.

**Why it matters:** drafts, pending and removed postings never leak to the public board.

### Step 2 — An applicant who already applied

![Already applied](02-already-applied-card.png)

Opening a role this applicant already applied to shows a **status card instead of the application form**: *"You have already applied — your application for this role is Shortlisted."* with a direct link to My Applications.

**Why it matters:** the server refuses a second active application (one application per listing, with a 24-hour cooldown after withdrawal). Rather than letting someone fill in a whole form and then rejecting them, the page states the position immediately and points at the tracking page.

### Step 3 — The application form

![Apply form](03-apply-form.png)

Name and phone are pre-filled from the signed-in session. Email, experience, a résumé link and a cover note are optional.

### Step 4 — Field validation before anything is sent

![Validation errors](04-validation-errors.png)

Submitting with an invalid name, phone, email and link produces **inline messages under each field** and no request is made. The same rules are enforced independently on the server, which remains the authority.

### Step 5 — Employer workspace

![Employer workspace](05-partner-workspace.png)

The employer's own workspace: plan and quota, live listings, pending-review count, and applicant leads. **Careers lives in its own workspace — it never falls back to the visit/booking shell.**

### Step 6 — Creating a role, with validation

![Create validation](06-partner-create-validation.png)

A new role is created as a **draft**. Missing or too-short values are caught in the form with inline messages before any request is made.

### Step 7 — Draft created

![Draft created](07-partner-draft-created.png)

The role is saved as a **Draft** — visible only to the employer.

### Step 8 — Submitted for moderation

![Submitted](08-partner-submitted.png)

The employer submits it; the posting moves to **In Review** and enters the Operations moderation queue.

### Step 9 — Operations moderation queue

![Ops queue](09-ops-moderation-queue.png)

Every pending posting is auditable: listing info, role and compensation, contact details, status, applicant count, created date, and moderation actions.

### Step 10 — The moderation decision

![Ops decision](10-ops-decision.png)

Operations approves or rejects **with a recorded reason**. The reason is stored on the posting and shown to the employer.

### Step 11 — Approved

![Approved](11-ops-approved.png)

The posting is now **approved — but it is still not public.** Approval sets the moderation status; publication is a separate employer action. This separation is deliberate.

### Step 12 — Published

![Published](12-partner-published.png)

The employer publishes it. Only now does it appear on the public board.

### Step 13 — The applicant applies

![Apply filled](13-apply-form-filled.png)

A different applicant applies to the newly published role.

![Submitted](14-application-submitted.png)

The application is accepted and the applicant sees a confirmation.

### Step 14 — Applicant tracks status

![My applications](15-customer-my-applications.png)

The applicant's own list, with live status: **Submitted → Under review → Shortlisted → Contacted**, plus rejected, withdrawn and expired.

### Step 15 — Employer works the lead

![Leads](16-partner-leads.png)

The employer sees the incoming application with the applicant's details held back.

### Step 16 — Shortlist

![Shortlisted](17-partner-shortlisted.png)

Shortlisting is recorded as an event on the application, with a timestamp.

### Step 17 — Reveal contact

![Contact revealed](18-partner-contact-revealed.png)

Only when the employer deliberately confirms does the applicant's phone number become visible — recorded as a `CONTACT_REVEALED` event, and rate-limited (25 reveals per day per employer) so contact data cannot be scraped.

---

## 4. Verified behaviour

The same flow was executed as an automated end-to-end pass: **14 of 14 checks passed**.

| # | Check | Result |
|---|---|---|
| 1 | Create role → `DRAFT` | Pass |
| 2 | Submit → pending review, still invisible publicly | Pass |
| 3 | Operations approve with reason → approved, **still not public** | Pass |
| 4 | Publish → appears in public browse | Pass |
| 5 | Apply → accepted, status `SUBMITTED` | Pass |
| 6 | Apply again → refused: *"You have already applied to this listing."* | Pass |
| 7 | Employer leads list loads the applicant | Pass |
| 8 | Shortlist → status `SHORTLISTED` | Pass |
| 9 | Reveal contact → status `CONTACTED`, phone visible | Pass |
| 10 | Invalid input rejected on every field with inline messages | Pass |
| 11 | Anonymous access to employer / operations / applicant endpoints → refused (403) | Pass |
| 12 | Phone numbers normalised to international format on save | Pass |
| 13 | Drafts and pending postings never appear in public browse | Pass |
| 14 | Contact stays masked until deliberately revealed | Pass |

**Fail-closed guarantees:** creating, submitting or publishing requires both an approved `A10_LISTING` capability for the employer **and** an active role configuration for the category. If either is missing, the action is refused rather than silently allowed.

---

## 5. Scope and limitations — please read

- **This is a demonstration on a local environment**, not the live platform. Nothing is published to the public internet.
- **Payments in this category are the employer's subscription/featured placement only**, and the capture is currently the *simulated* provider. Real Razorpay is the next week's work.
- **Login uses SMS one-time codes in production.** Locally the code is shown on screen for testing.
- The Careers feature sits on the Milestone 3 integration branch and is **not merged to the main branch** yet.
- Automated acceptance tests for this flow are **written but pending the owner's formal run**.
- Not part of Milestone 3 (delivered later): mobile apps, Rapido, AI chatbot.

---

## 6. Reproducing this yourself

1. Start the stack with the commands in §2.
2. Open the three portals in §2 and sign in with the listed numbers.
3. Walk Steps 1–17 above in order. Expected result at each step is stated in the caption.

### Reset back to the seeded starting state

```bash
cd backend && .venv/bin/python manage.py seed_listing_catalog
```

That restores the seeded roles, the employer's subscription and the Operations pending queue.

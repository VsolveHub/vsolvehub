# V SOLVE HUB — FULL CODEBASE AUDIT, OWNERSHIP & ESTIMATION PROMPT

## ROLE

Act as a senior software architect, engineering lead, and delivery estimator taking over an existing production-oriented Django + Next.js marketplace project.

I am being considered as the **sole developer responsible for Milestone 3 and Milestone 4**, with the existing developer available for support, clarification, and handover.

This is NOT a greenfield project.

Your job is to perform a deep, evidence-based audit of the existing codebase and produce a realistic takeover plan and engineering estimate.

IMPORTANT:
- Do NOT assume the project brief is accurate just because it says something is "done".
- Verify claims against actual code, migrations, APIs, frontend behavior, tests, configuration, and architecture.
- Do NOT make code changes.
- Do NOT commit, push, migrate, delete, refactor, install packages, or alter configuration.
- Do NOT expose secrets, credentials, API keys, tokens, private user data, or production infrastructure secrets in the report. Redact them if encountered.
- Do NOT estimate based only on file counts.
- Identify integration work and hidden complexity.
- Be conservative where evidence is missing.

---

# SOURCE OF TRUTH

You will have access to:
1. The V Solve Hub project repository.
2. The project brief supplied separately.

Treat the project brief as the intended scope.

Treat the repository as the source of truth for what is actually implemented.

Where they disagree, explicitly report the disagreement.

Use these classifications:

- VERIFIED COMPLETE
- VERIFIED PARTIAL
- IMPLEMENTED BUT UNVERIFIED
- NOT IMPLEMENTED / NOT FOUND
- BLOCKED
- UNCLEAR / REQUIRES HANDOVER
- OUT OF SCOPE

---

# PART 1 — REPOSITORY RECONNAISSANCE

First understand the entire project.

Document:

- repository structure
- Django apps
- Django project configuration
- DRF architecture
- models
- serializers
- views/viewsets
- services/use-case layers
- permissions/authentication
- URLs/routes
- Celery tasks
- Redis usage
- PostgreSQL usage
- database migrations
- payment integrations
- notification integrations
- wallet/V Coins/referral architecture
- admin architecture
- reporting/export architecture
- frontend applications
- shared frontend components
- API client architecture
- state management
- authentication flow
- mobile-related work if present
- environment/configuration structure
- deployment configuration
- test structure
- CI/CD
- documentation

Determine whether the project is actually following a consistent architecture or whether different sections were built differently.

Identify architectural patterns that a new developer should preserve.

---

# PART 2 — CURRENT DEVELOPMENT STATUS

Create a detailed status matrix for the entire system.

For every major feature/category determine:

| Area | Intended Scope | Evidence Found | Status | Confidence | Dependencies | Notes |

Audit all 11 business categories:

1. Technician
2. Beautician
3. Home Services
4. Pet Services
5. Construction Labour
6. Man Power & Support Staff
7. Event & Media
8. Rental Services
9. Rooms / PG / Hostel / Hotels
10. Career / Jobs
11. Vehicle / Ride / Delivery

Do not assume that because a category has models or pages it is end-to-end complete.

For each category separately inspect:

- database models
- migrations
- APIs
- business logic
- validation
- booking/request flow
- customer flow
- partner/vendor flow
- admin flow
- frontend
- payment handling
- notifications
- status transitions
- edge cases
- tests
- documentation

Classify each category as:

- End-to-end complete
- Backend only
- Frontend only
- Partially integrated
- Prototype
- Mock/hardcoded
- Broken
- Not implemented
- Requires runtime verification

---

# PART 3 — MILESTONE 3 AUDIT

Audit every requirement from Milestone 3 of the supplied project brief.

## A. New Categories

### Rental Services
Verify:

- inventory
- availability
- booking/request flow
- rental duration
- security deposit
- pricing
- vendor management
- cancellation
- validation
- frontend
- admin
- notifications
- tests

### Rooms / PG / Hostel / Hotels

Verify:

- listings
- listing management
- enquiry flow
- enquiry inbox
- availability if applicable
- customer flow
- partner/vendor flow
- admin
- frontend
- notifications
- tests

### Careers

Verify:

- job creation
- job listings
- job applications
- applicant data
- application status
- employer/vendor flow
- customer/applicant flow
- admin
- frontend
- notifications
- tests

For each feature, identify what is genuinely implemented versus merely scaffolded.

---

# PART 4 — MONEY SYSTEM AUDIT

This is HIGH PRIORITY.

Audit the complete money architecture.

Inspect:

- Razorpay integration
- payment creation
- payment verification
- webhook handling
- idempotency
- refunds
- cancellation
- payment states
- order/booking/payment relationships
- wallet
- wallet ledger
- wallet credits
- wallet debits
- V Coins
- referral rewards
- vendor subscriptions
- premium listings
- commissions
- settlements
- GST
- TDS
- vendor payouts
- bank payment exports
- reconciliation
- transaction history
- audit trails

Determine:

1. Which money features already exist.
2. Which are partially implemented.
3. Which are only integration stubs.
4. Which are missing.
5. Whether money calculations are actually server-side.
6. Whether the architecture is safe to extend.
7. Whether existing code has duplicated financial logic.
8. Whether transactions are atomic.
9. Whether idempotency exists.
10. Whether race conditions are possible.
11. Whether refunds/reversals are handled correctly.
12. Whether wallet balances are derived from a ledger or stored as mutable balances.
13. Whether there is a proper audit trail.

Pay particular attention to financial correctness.

Do not merely report "Razorpay integrated" because an SDK or API key exists.

---

# PART 5 — WALLET / V COINS / REFERRAL DEEP AUDIT

Treat these as separate systems.

For Wallet, determine:

- wallet model
- ledger model
- balance calculation
- credit/debit operations
- transaction atomicity
- concurrency handling
- negative balance protection
- refunds
- expiration if applicable
- transaction history
- admin controls
- APIs
- frontend
- tests

For V Coins determine:

- earning rules
- spending rules
- conversion/value rules
- expiry
- ledger
- fraud/abuse controls
- APIs
- frontend
- admin
- tests

For Referral determine:

- referral identity/code
- referral attribution
- eligibility
- reward calculation
- reward timing
- duplicate prevention
- self-referral prevention
- fraud/abuse handling
- wallet/V Coin integration
- APIs
- frontend
- admin
- tests

Give each a separate readiness score from 0–100, but explain exactly how the score was derived.

---

# PART 6 — VENDOR SUBSCRIPTION / PREMIUM LISTINGS

Audit:

- subscription plans
- subscription lifecycle
- payment
- expiry
- renewal
- cancellation
- premium listing rules
- ranking/visibility logic
- limits
- vendor eligibility
- admin management
- frontend
- notifications
- tests
- payment reconciliation

Determine whether this is a reusable architecture or a one-off implementation.

---

# PART 7 — ADMIN & REPORTING AUDIT

Audit all Milestone 3 admin/reporting requirements:

- customizable admin dashboard
- business dashboard
- customer dashboard
- vendor dashboard
- booking dashboard
- revenue dashboard
- analytics dashboard
- real-time reports
- Excel exports
- CSV exports
- PDF exports
- bulk import
- settlements
- GST
- TDS
- bank payment export
- custom report builder
- configurable modules

For every item state:

- existing implementation
- backend support
- frontend support
- export support
- filters
- permissions
- performance concerns
- test coverage
- missing pieces

---

# PART 8 — MILESTONE 4 AUDIT

Audit everything already present for Milestone 4.

## Mobile

Inspect:

- customer mobile app
- partner mobile app
- authentication
- API integration
- navigation
- push notifications
- booking flows
- payment flows
- wallet
- profile
- location permissions
- build configuration
- release configuration

## Vehicle / Rapido-style Product

Audit:

- ride booking
- goods transport
- delivery
- vehicle rental
- vehicle service/wash
- roadside assistance
- EV-related functionality
- KYC
- driver wallet
- driver pass
- GPS
- maps
- fare engine
- ride history
- dashboards
- ratings
- cancellation
- dispatch/matching
- status lifecycle

## AI

Audit:

- chatbot
- search
- recommendation functionality
- AI provider integration
- conversation persistence
- fallback behavior
- cost controls
- security
- prompt/configuration management

## Production Readiness

Audit:

- automated testing
- security testing
- load testing
- payment reconciliation
- observability
- logging
- error handling
- deployment
- production configuration
- database migration safety
- backup/recovery
- app-store readiness

---

# PART 9 — TESTING & QUALITY AUDIT

Inspect the actual test suite.

Do NOT equate "tests exist" with good coverage.

Determine:

- number/type of tests
- backend coverage
- frontend tests
- integration tests
- payment tests
- wallet tests
- concurrency tests
- API tests
- permission tests
- regression tests
- end-to-end tests
- CI execution
- flaky tests
- missing critical tests

Assess whether the stated 85% backend coverage requirement is actually satisfied.

If coverage cannot be verified without executing commands, state that clearly.

Identify the most dangerous untested areas.

---

# PART 10 — SECURITY AUDIT

Perform a practical engineering-level audit of:

- authentication
- authorization
- object-level permissions
- admin permissions
- API exposure
- CORS
- CSRF
- secrets management
- environment variables
- password handling
- OTP handling
- payment verification
- webhook verification
- rate limiting
- file uploads
- user input validation
- SQL injection risks
- XSS
- sensitive data exposure
- logging of secrets/payment data
- wallet manipulation risks
- referral abuse
- vendor/customer privilege escalation

DO NOT PRINT ACTUAL SECRETS.

Report only their location and severity, e.g.:

"Secret detected in `<file>` — value redacted."

---

# PART 11 — DOCUMENTATION & HANDOVER AUDIT

Search the entire repository for:

- README
- .md files
- architecture docs
- API docs
- deployment docs
- setup instructions
- developer notes
- TODO
- FIXME
- HACK
- planned
- pending
- future
- milestone
- phase
- backlog
- coming soon
- not implemented

Also inspect comments and task lists.

Produce:

| Document/File | Purpose | Current/Relevance | Useful for Takeover? |

Pay special attention to information that would only be known by the existing developer.

Identify undocumented assumptions.

---

# PART 12 — CODE QUALITY / TECHNICAL DEBT

Identify:

- duplicated logic
- inconsistent patterns
- oversized modules
- unclear abstractions
- hardcoded values
- mock data
- fallback data
- TODO implementations
- dead code
- inconsistent naming
- inconsistent API responses
- missing validation
- missing error handling
- database anti-patterns
- N+1 queries
- inefficient queries
- missing indexes
- transaction problems
- Celery reliability issues
- Redis dependency issues
- frontend duplication
- mobile duplication

Prioritize findings:

P0 = blocks development / severe correctness or security issue
P1 = high-risk / likely to cause major integration problems
P2 = meaningful technical debt
P3 = cleanup / optimization

---

# PART 13 — OWNERSHIP READINESS

Now answer the most important question:

"If one developer takes ownership of Milestone 3 and Milestone 4 from this point forward, how ready is this codebase?"

Give a score out of 100 for:

- Architecture readiness
- Documentation readiness
- Code quality
- Test readiness
- Payment readiness
- Backend readiness
- Frontend readiness
- Mobile readiness
- Deployment readiness
- Handover readiness

Then provide an overall ownership-readiness score.

Explain the score.

---

# PART 14 — WORK BREAKDOWN

Create a complete work breakdown for everything still required to meet Milestone 3 and Milestone 4.

Do NOT simply copy the project brief.

Derive the actual remaining work from the audit.

Group work into:

1. Milestone 3 — Category development
2. Milestone 3 — Money systems
3. Milestone 3 — Admin/reporting
4. Milestone 3 — Testing/hardening
5. Milestone 4 — Mobile
6. Milestone 4 — Vehicle platform
7. Milestone 4 — AI
8. Milestone 4 — Testing/security/load
9. Milestone 4 — Production release

For each work item provide:

- work item
- current status
- prerequisite
- backend work
- frontend work
- mobile work
- database work
- third-party integration
- testing required
- complexity
- integration risk
- confidence

---

# PART 15 — ENGINEERING ESTIMATION

Estimate the remaining effort for a SINGLE DEVELOPER.

This is NOT a pricing estimate.

Use engineering effort only.

For every major work item estimate:

- optimistic hours
- realistic hours
- pessimistic hours

Then calculate:

- total optimistic hours
- total realistic hours
- total pessimistic hours

Convert these into:

- 20 hrs/week
- 30 hrs/week
- 40 hrs/week

Do NOT pretend that 40 hours of calendar time equals 40 productive engineering hours.

Include reasonable allowance for:

- debugging
- code review
- integration
- regression testing
- handover questions
- staging verification
- deployment issues
- unexpected legacy-code problems

Provide estimates both:

### A. If the existing developer provides regular support
### B. If the new developer is mostly independent

Clearly identify what assumptions cause the difference.

---

# PART 16 — FEASIBILITY AGAINST DEADLINES

Compare the estimated work against the milestone dates in the project brief.

Determine whether the remaining scope is realistically achievable by one developer.

Give:

- feasible
- feasible with scope control
- high risk
- unrealistic

Do not soften the conclusion.

If the schedule is unrealistic, identify exactly what should be:

- reduced
- deferred
- parallelized
- supported by the existing developer
- treated as post-launch

---

# PART 17 — WHAT I SHOULD TAKE OWNERSHIP OF

Identify the best modules for one developer to own.

Rank them:

1. Best candidate
2. Second-best
3. Third-best
4. Avoid for now

For each candidate explain:

- why it is suitable
- existing implementation
- dependencies
- estimated effort
- integration risk
- likely number of files/components involved
- whether it can be developed independently
- whether it requires existing developer involvement
- what could unexpectedly expand the scope

Pay particular attention to:

- Wallet
- V Coins
- Referral
- Vendor subscriptions
- Premium listings
- Rental
- Rooms/PG/Hotels
- Careers
- Admin/reporting

Do not choose based solely on apparent size. Choose based on **ownership clarity, architectural fit, dependency risk, and ability to deliver safely**.

---

# PART 18 — TAKEOVER PLAN

Create a practical takeover sequence:

### Phase 0 — Handover
What must the existing developer explain?

### Phase 1 — Stabilization
What should be fixed before new development?

### Phase 2 — First module
What should the new developer build first?

### Phase 3 — Integration
What needs cross-module integration?

### Phase 4 — Milestone 3 completion
What remains?

### Phase 5 — Milestone 4
What remains?

### Phase 6 — Release
What must happen before production?

For each phase identify dependencies and exit criteria.

---

# PART 19 — QUESTIONS FOR THE EXISTING DEVELOPER

Generate a prioritized list of questions that I should ask the current developer before taking ownership.

Prioritize:

P0 — Must know before touching code
P1 — Must know before production
P2 — Useful during development

Include questions about:

- architecture decisions
- known bugs
- undocumented behavior
- database assumptions
- payment flows
- Razorpay
- OTP/MSG91
- wallet
- V Coins
- referral
- vendor subscriptions
- admin
- deployment
- production
- staging
- third-party credentials
- unfinished features
- known shortcuts
- technical debt
- planned changes

---

# PART 20 — FINAL EXECUTIVE SUMMARY

End with a concise executive summary answering:

1. What percentage of Milestone 3 appears genuinely complete?
2. What percentage of Milestone 4 appears genuinely complete?
3. What are the three biggest technical risks?
4. What are the three biggest scope risks?
5. What is the realistic remaining engineering effort?
6. Can one developer realistically own it?
7. What support is required from the existing developer?
8. What should the new developer take first?
9. What should NOT be promised until further verification?
10. What must be clarified before agreeing to ownership?

Do not manufacture percentages. If the evidence is insufficient, provide a range and explain the basis.

---

# OUTPUT REQUIREMENT

Create the final report as:

V_SOLVE_HUB_TAKEOVER_AUDIT_AND_ESTIMATE.md

The report must be detailed enough that another engineer can use it as a takeover document.

Include tables wherever useful.

Every important conclusion must include evidence in the form of:

- file path
- class/function/component/API/migration
- concise explanation

Separate clearly:

**PROJECT BRIEF SAYS**
vs.
**CODEBASE SHOWS**
vs.
**INFERENCE / ESTIMATE**

Do not make any source-code changes.

At the end of the Cursor response, provide only:

- report path
- one-paragraph summary
- top 5 findings
- top 5 questions for the existing developer

Do not paste the entire report into the chat.

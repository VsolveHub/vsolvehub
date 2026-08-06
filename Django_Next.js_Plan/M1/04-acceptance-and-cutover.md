# M1 Acceptance and Cutover

## Where acceptance stands — 2026-08-06

**None of the 44 scenarios below has been executed as a formal acceptance run.** This is S8, the
only stage of the M1 plan still open, and the distinction it turns on is worth stating plainly:

- **Covered by automated tests** — most scenarios have a backend test asserting the invariant they
  describe. Scenario 23 ("two payout batches cannot reserve/pay one ledger entry twice") is proved
  twice, once through the command path and once with real threads against PostgreSQL. That is
  strong evidence the *rule* holds.
- **Not the same as accepted** — an acceptance run drives the scenario end to end through the
  deployed surface, as the actor, against authoritative Django. A unit test proving the ledger
  cannot double-reserve does not prove an operator can complete a payout run in the console.

The **concurrency acceptance list is in good shape**: every line of it has a real-PostgreSQL test
with real threads, which is the form that list needs. The **end-to-end list is the gap**, and it
is a browser gap rather than a backend one.

### What to clear before starting S8

Running acceptance on an unverified base proves nothing. Two items, both listed in
[task.md](./task.md):

1. View-level tests for the remaining 1.17.0 paths (the kill-switch board, several case commands).
2. **Playwright on the money and safety paths.** 133 tests currently cover the Operations console
   and the responsive harness. Customer payment, Customer visit tracking, Partner jobs and the
   Partner shell have none — and scenarios 8, 9, 10, 13, 18, 19, 20 and 21 all live there.

Demo data for the Operations scenarios is available: `python manage.py seed_console_demo_data`
fills every console through real domain services, including two deliberately SLA-breached cases
and payout runs in every state.

## Required end-to-end scenarios

1. Logged-out Customer completes a multi-service Scheduled A1 Booking Group without losing cart,
   selected plan or safe scope intent through OTP.
2. Same task quantity two remains one service line in one Fulfilment Unit, Partner and OTP.
3. Client price/duration tampering is ignored and the quote remains correct.
4. No serviceability, no eligible Partner and all Partners declining prevent payment.
5. Two customers compete for the last Partner; only one tentative reservation succeeds.
6. Partner accepts accidentally and undoes within 120 seconds before payment/address disclosure, with
   no penalty.
7. Partner accepts, Customer abandons payment and the tentative reservation expires safely.
8. Duplicate payment submission/webhook creates one order/booking/capture.
9. Payment capture racing reservation expiry either confirms valid capacity or refunds.
10. Redirect/tab loss after payment recovers from server/provider truth.
11. Partner releases before start; replacement/reschedule/refund is honest and bounded.
12. Partner is late; Customer can cancel/reschedule without a fee.
13. Arrival, Customer-unavailable wait/contact/evidence and visit-fee dispute work.
14. OTP brute force is limited; messaging outage uses audited assistance, not a bypass code.
15. Scope amendment approved and paid changes authorized scope exactly once.
16. Amendment declined leaves original work or triggers explicit partial/abort when unsafe to continue.
17. Partner aborts mid-job; completed lines settle and unperformed lines refund.
18. Completion evidence persists across refresh/upload retry.
19. Customer confirms completion and Partner ledger advances correctly.
20. Customer disputes completion; payout is held and Operations resolves line settlement.
21. Customer is silent; valid evidence allows deadline finalization, missing evidence does not.
22. Refund fails and remains visibly in progress until Finance recovery.
23. Two payout batches cannot reserve/pay one ledger entry twice.
24. Redis/Celery/browser failure does not corrupt database invariants or silently stop recovery.
25. Unauthorized Customer, Partner and Operations object/action access is denied and audited.
26. Customer changes the address before commitment and gets a new serviceability/quote/search result;
    a post-commitment change requires Partner reacceptance, and an unsafe late change is rejected into
    recovery without silently changing the work location.
27. Customer initiates reschedule; replacement capacity and Partner acceptance are secured before the
    original appointment is released, while failed or abandoned reschedule preserves an honest
    original/resolution state.
28. Operations creates an assisted booking with recorded Customer consent and actor attribution; the
    ordinary quote, availability, Partner acceptance and Customer payment-link controls still apply.
29. Partner terminates work for `UNSAFE_SITE`; the Customer is not told work completed, the Partner is
    not forced to continue, payout is held and a Safety case drives evidence, refund and recovery.
30. Customer or Partner reports property damage or a safety incident; restricted evidence, access
    audit, urgent case routing, notification, payout hold and financial resolution survive retries.
31. A maker proposes a refund, Partner-ledger adjustment or payout correction and a different
    authorized checker approves it; self-approval is denied, duplicate approval is idempotent and the
    full before/after audit remains immutable.
32. Customer, Partner and Operations run credentialed browser sessions from their deployed origins:
    CSRF bootstrap and rotation work without JavaScript-readable session cookies, allowed origins
    succeed, an unapproved origin fails, session revoke prevents further mutation and no token enters
    browser storage or logs.
33. A production build contains no runtime request to a proposal-only endpoint or locally invented
    DTO; every Django request path and payload is generated from the published OpenAPI contract.
34. Partner KYC upload uses a server-owned private key and short-lived grant; size/type/checksum
    mismatch, expiry and replay fail closed, malware-pending content cannot be revealed or approved,
    only the assigned non-self reviewer gets an audited expiring reveal URL, and failed/expired
    orphan objects are deleted after the configured recovery window.
35. Two explicitly compatible services with a common eligible Partner become one sequential unit;
    the Partner receives both lines and the Customer sees one professional before confirmation.
36. Two services in the same category without a common eligible Partner never combine merely because
    their category matches.
37. Independent services become coordinated parallel units only when distinct eligible Partners and
    overlapping capacity exist; each Partner receives only their own unit.
38. A dependency, safety conflict, excessive duration or incompatible window produces separate visits
    with a server-authored reason and unit-level price/cancellation details.
39. Every cart item appears exactly once in every complete plan alternative and exactly once in the
    confirmed Booking Group.
40. Cart mutation or login merge racing plan/quote confirmation invalidates the stale plan and
    preserves readable non-actionable quote history.
41. One required unit exhausting its Partner pool releases every other tentative group reservation,
    collects no payment and returns explicit replanning choices.
42. Duplicate group confirmation, Partner acceptance, Celery coordination and payment webhook create
    one Booking Group, one unit per plan unit and one booking per unit.
43. Cancelling, disputing or partially completing one unit reconciles its allocated payment, refund,
    tax, commission and ledger without changing unaffected unit outcomes.
44. Customer, Partner and Operations projections enforce scope: Customers see the group, each Partner
    sees only their unit, and Operations receives audited cross-unit recovery context.

## Concurrency acceptance

- Offer accept versus expiry/revoke/undo.
- Reservation insertion versus another checkout.
- Cart edit/login merge versus plan or quote confirmation.
- Parallel unit reservation versus another group and versus the group hold deadline.
- Partial group hold versus compensation/replan and late Partner commit.
- Payment capture versus checkout cancellation/reservation expiry.
- Partner release versus En route/Arrived/start.
- Customer cancellation versus arrival/start.
- Amendment approval/payment versus completion/abort.
- Completion confirmation versus dispute/deadline job.
- Refund/payout webhook duplication and out-of-order delivery.
- Outbox/Celery redelivery for every financial or assignment command.

Exactly one valid transition wins. Losers receive current state and a safe recovery action.

## Production readiness

### Three-host deployment

The apps deploy to three origins: `vsolvehub.com` (Customer), `partner.vsolvehub.com` (Partner)
and `consolve.vsolvehub.com` (Operations).

- **Sessions are per-host and production refuses to start otherwise.** `SESSION_COOKIE_DOMAIN` and
  `CSRF_COOKIE_DOMAIN` stay unset, so the browser scopes each session cookie to the exact host that
  issued it. A shared `.vsolvehub.com` cookie would make a stolen Customer session a valid
  credential against the console that approves payouts. This is refused at startup rather than
  documented as a warning, because it is a one-line change somebody makes for a good reason —
  giving staff a single sign-in — and it breaks nothing visibly when they do.
  `config/settings/guards.py` holds the check so it is testable without executing a whole settings
  module.
- **`CORS_ALLOWED_ORIGINS` and `DJANGO_CSRF_TRUSTED_ORIGINS` must list all three origins.**
  Credentialed CORS is fail-closed, so an unlisted origin gets nothing at all. Production also
  refuses to start if the CORS list is not a subset of the CSRF list, or if any origin is not
  HTTPS.
- **`DJANGO_ALLOWED_HOSTS`** must name the API host.
- **No role picker.** Each app selects its own role, because the domain *is* the role. This is not
  a convenience: Django re-grants `customer` on every login and session creation takes the
  alphabetically first grant, so `customer` sorts ahead of both `operations` and `partner` and
  every staff and Partner sign-in used to land on a picker.

### Remaining readiness items

- The [frozen M1 configuration](./05-initial-configuration.md) is loaded, versioned and verified; live
  payment, SMS, payout and storage credentials/configuration are reviewed without entering secrets in
  source control.
- CA/legal and privacy gates completed for active services.
- Backup/restore, reconciliation, dead-letter and kill-switch drills pass.
- Production-like performance and density tests pass.
- Case teams, ownership and on-call contacts are named.
- No critical/high security or data-integrity finding remains.
- Customer/Partner copy has content and accessibility review.
- Generated OpenAPI and TypeScript clients are current, and real-browser authentication/mutation
  smoke tests run against Django rather than only MSW or route-boundary mocks.
- The malware scanner integration and verified-KYC legal retention/deletion schedule are approved,
  tested and monitored; no manual database update is accepted as a production scanning workflow.

## Cutover

1. Export and verify legacy development/production-reference data as applicable.
2. Deploy backward-compatible Django migrations, API, workers and frontends.
3. Seed/activate only approved M1 areas and variants.
4. Stop legacy writes for the M1 domain.
5. Enable M1 through a controlled service/area flag.
6. Execute sequential-group, parallel-group, separated-visit, refund, case and payout reconciliation
   smoke scenarios.
7. Monitor conversion, assignment, late/no-show, money ambiguity and case SLA.
8. Expand only after the pilot gate; rollback by disabling new entry while preserving recovery access.

Legacy code or schema is removed only in a later deployment after no active reader/writer depends on it.

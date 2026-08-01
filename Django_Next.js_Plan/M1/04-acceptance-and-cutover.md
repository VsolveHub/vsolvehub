# M1 Acceptance and Cutover

## Required end-to-end scenarios

1. Logged-out Customer completes a Scheduled A1 booking without losing state through OTP.
2. Same task quantity two remains one visit, Partner and OTP.
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

## Concurrency acceptance

- Offer accept versus expiry/revoke/undo.
- Reservation insertion versus another checkout.
- Payment capture versus checkout cancellation/reservation expiry.
- Partner release versus En route/Arrived/start.
- Customer cancellation versus arrival/start.
- Amendment approval/payment versus completion/abort.
- Completion confirmation versus dispute/deadline job.
- Refund/payout webhook duplication and out-of-order delivery.
- Outbox/Celery redelivery for every financial or assignment command.

Exactly one valid transition wins. Losers receive current state and a safe recovery action.

## Production readiness

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
6. Execute smoke booking, refund, case and payout reconciliation.
7. Monitor conversion, assignment, late/no-show, money ambiguity and case SLA.
8. Expand only after the pilot gate; rollback by disabling new entry while preserving recovery access.

Legacy code or schema is removed only in a later deployment after no active reader/writer depends on it.

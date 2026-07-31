# Pricing, Payments and Settlement

## Pricing principles

- The server prices every line in integer paise.
- Quote inputs, rule versions and results are immutable.
- Catalog, cart, checkout, invoice, refund and Partner earnings reconcile to the same quote/revision
  chain.
- Duration is a price input only when the archetype sells time.
- Taxes, commissions and cancellation treatment are configuration approved for the relevant legal
  entity and effective period.

## Archetype pricing

### A1 task visit

`TaskRate` defines task code, unit price, estimated marginal minutes and effective dates. Quote lines
may include task, minimum-visit top-up, platform fee, tax and rounding adjustment. The minimum payable
amount must be visible from the catalog onward; an unreachable “starts at” price is forbidden.

### A2 inspection first

The initial quote contains the inspection fee. A valid inspection outcome may generate an A1 follow-up
quote. If policy grants an inspection-fee credit, the credit is an explicit negative line and has a
clear expiry and eligibility rule.

### A3 time block

Price is purchased blocks multiplied by the effective block rate, with configured minimum/maximum.
Approved extensions create new revision and payment records.

### A4 recurring series

Pricing supports per-visit or billing-cycle plans, explicit included visits, skip/pause proration,
substitution treatment and series cancellation. A monthly price is never simulated as unrelated daily
charges.

### A5 projects

Accepted proposal lines and milestone amounts form the agreement. Change orders never overwrite the
accepted proposal. Customer funds are released according to the selected compliant provider model.

### A6-A10

- Staffing: worker/shift rate, attendance and statutory wage/deduction rules.
- Rental: rental period, deposit, delivery, extension, damage/loss and late-return lines.
- Trip: base, distance/time/toll/waiting/cancellation rules with route evidence.
- Stay: nightly rate, taxes/fees, deposit, cancellation/no-show and add-ons.
- Listing: posting/subscription/lead fees only when the listing product charges them.

## Materials and additional work

Material sourcing modes:

- `PLATFORM_CATALOG`: platform-priced item.
- `CUSTOMER_SUPPLIED`: zero-value record linking the work outcome.
- `PARTNER_PROCURED`: enabled in a later milestone with pre-approval, cap, receipt, return/refund and
  reimbursement rules.

Partner-procured materials are not reimbursed merely because a photo was uploaded. Customer approval,
receipt validation and work outcome are required. Same-day advances require a separately approved
fraud and recovery design; the default is reimbursement after valid completion.

A1/A2 additional labour uses catalog scope lines. A Partner cannot type an arbitrary labour amount.
Uncatalogued work becomes a new inspection/project flow or an Operations-assisted quote, not a hidden
free-text charge.

## Payment ordering

Scheduled/Today visit work obtains Partner acceptance before payment. The short payment window is the
cost of protecting both parties from a paid-unassigned booking and an involuntary assignment.

Instant uses authorization-before-dispatch where the provider/payment method supports it; otherwise it
uses approved capture-first recovery from document 04. Other archetypes choose an ordering appropriate
to inventory, deposit or milestone risk.

The browser redirect is never authority. Verified webhook events and reconciliation decide state.

## Payment model

Every `PaymentAttempt` has:

- purpose and business target;
- exact amount/currency and quote/revision version;
- idempotency key;
- provider order/payment references;
- monotonic domain state;
- expiry and reconciliation state.

Duplicate and out-of-order webhooks are safe. Provider success plus database ambiguity triggers
reconciliation. If the system cannot converge to a valid booking/financial target, it voids/refunds and
opens an Operations case.

Alternative collection modes—part-pay, pay-on-completion, deposit and milestone—are added only with
their actual ledger, non-payment, refund and dispute behaviour. No dormant UI toggle or unread enum is
shipped.

## Cancellation policy

Policies are effective-dated, versioned and snapshotted when shown. They operate on quote lines or fixed
fees rather than an unexplained percentage of the entire booking.

Baseline for Scheduled/Today visit work:

| Situation | Customer treatment | Partner treatment |
|---|---|---|
| No accepted Partner / Partner or platform failure | Full refund | No customer-funded penalty; platform may fund recovery |
| More than 24h before start | Full refund | None |
| 24h to 2h before start | Disclosed fixed booking fee at most | Configured share if Partner had accepted |
| Less than 2h, before verified arrival | Disclosed capped fixed fee, never full service value | Capped cancellation allowance |
| Verified arrival plus wait/contact evidence | Visit fee; remainder refunded | Capped visit allowance |
| Work started | Settle completed scope; refund incomplete scope | Earnings on accepted completed outcome |

`EN_ROUTE` alone is not evidence for retaining 100% of a task price. If the Partner is materially late,
the Customer receives fee-free cancellation/reschedule. Cancellation fees are a cost-recovery tool and
must never become a revenue target.

Rescheduling obtains new capacity before releasing old capacity. A reschedule inside a charged band
either assesses or carries forward that fee baseline so reschedule cannot reset the cancellation
ladder. Failure leaves the original booking intact.

Address change follows the same new-capacity-first rule because serviceability, price and Partner may
change.

## Refunds, disputes and chargebacks

- Refund states distinguish requested, submitted, processing, succeeded, failed and under review.
- Customer copy states the actual amount and provider timeline.
- Failed/stale refunds create owned Operations cases and retry/reconciliation jobs.
- Tax/fee line treatment and credit-note requirements are explicit.
- Chargeback never silently cancels physical work already in progress. Operations decides safety and
  settlement; Partner earnings may be funded by the platform while customer receivable/risk is handled
  separately.
- Manual/high-value adjustments require maker-checker approval.

## Commission and Partner ledger

`CommissionRule` is effective-dated and snapshotted. Partner offers display estimated gross earning,
commission/deductions and estimated net. Final ledger lines reconcile to completed scope, refunds,
compensation and statutory deductions.

Payout flow:

```text
eligible entries → transactionally reserve → idempotent provider payout
                 → webhook/reconciliation → paid or safely released
```

During early milestones, a scheduled Operations-reviewed payout batch is preferable to on-demand
withdrawal. On-demand payout is added only after account-change cooling, fraud monitoring and
reconciliation are proven.

## Financial documents

- Document numbers are allocated transactionally from legal-entity/financial-year series.
- Issued invoices and credit notes are immutable.
- Supplier of record, place of supply, GST treatment and statutory deductions require qualified Indian
  tax/legal approval before live money.
- A rounding adjustment is explicit; totals are never silently altered.


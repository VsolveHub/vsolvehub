# Feature and Edge-Case Register

This register ensures every product capability has a milestone owner and minimum failure behaviour. It
does not redefine the domain documents. A milestone may add detail but cannot weaken these outcomes.

## Shared platform

| Capability | Owner milestone | Required edge cases |
|---|---|---|
| OTP/session/roles | M1, evolved always | resend abuse, brute force, revoked/suspended session, device change, account recovery |
| Consent/privacy | M1, evolved always | notice version change, withdrawn marketing consent, access/correction/erasure, legal-retention conflict |
| Catalog/configuration | M1, extended per archetype | missing rate/policy, concurrent edit, effective-date boundary, deactivated option with active checkout |
| Address/geocoding | M1 | provider outage, low-confidence result, pin/text mismatch, outside area, access notes and address change |
| Cart/quote | M1 | login merge, duplicate add, expired/repriced quote, stale scope schema, client tampering |
| Offers/reservations | M1 | decline, expiry, delivery failure, accidental undo, overlap race, payment abandonment |
| Booking lifecycle | M1 | duplicate commands, invalid order, Partner recovery, partial/abort, dispute and timeout |
| Payment/refund | M1 | duplicate/out-of-order webhook, redirect loss, capture/DB ambiguity, failed/stale refund, chargeback |
| Ledger/payout | M1 basic, M2 automated | duplicate batch, provider ambiguity, account change, reversal, negative recoverable balance |
| Notifications | M1 | transient/permanent failure, provider acceptance without delivery, fallback and opt-out boundaries |
| Operations cases | M1 | no owner, SLA breach, escalation, conflicting actions, maker-checker rejection |
| Audit/observability | M1 | redaction, retention, correlation, replay-safe events and actionable alert ownership |

## Customer product

| Capability | Milestone | Required edge cases |
|---|---|---|
| Public discovery | M1 onward | empty category, inactive area, honest starting price, recoverable API/media error |
| Scheduled/Today booking | M1 | no window/Partner, search cancellation, reservation/payment expiry, refresh/login resume |
| Multi-service order | M2 | one item unavailable, one booking cancelled, per-booking refunds/documents, no hidden partial success |
| Instant | M4 | pool empties, no acceptance after capture/auth, refund latency, background delivery and location expiry |
| Active booking | M1 | Partner change, late/no-show, contact failure, cancellation race, server-time drift |
| Amendment | M1 | evidence upload failure, decline, payment failure, next-booking capacity risk, required work cannot continue |
| Completion/dispute | M1 | partial lines, damage, Customer silence, Partner abort, evidence processing failure |
| Review/quality | M1 basic, M2 warranty | retaliation/coercion, cancelled booking, edit deadline, callback versus new fault |
| Languages/accessibility | M1 foundations, M3 expansion | long content, currency/date format, screen reader, 200% zoom, low literacy operational steps |

## Partner product

| Capability | Milestone | Required edge cases |
|---|---|---|
| Application/KYC | M1 | upload failure, replacement version, changes required, expiry, suspension during session |
| Skills/areas/equipment | M1 onward | removed eligibility with future work, conflicting representation, missing prerequisite |
| Explicit availability | M1 | exception overlapping accepted work, timezone/DST, overnight period, Operations-assisted change |
| Offer decision | M1 | delivery failure, expiry while confirming, duplicate accept, revoke race, accidental undo |
| Work execution | M1 | offline, wrong scope, unsafe site, Customer unavailable, OTP outage, upload failure |
| Release/abort | M1 | before disclosure, en route, after arrival, after start, emergency and platform-attributed cause |
| Earnings/payout | M1 onward | estimate/final difference, dispute hold, reversal, payout ambiguity, bank-account recovery |
| Native Instant readiness | M4 | permission denied, stale location/presence, killed app, token invalid, device replacement |
| Organizations/workforce | M5 | membership removal, worker no-show, unsafe understaffing, supervisor dispute, wage correction |

## Operations product

| Capability | Milestone | Required edge cases |
|---|---|---|
| Partner review | M1 | conflicting reviewer actions, document replacement, suspension with active booking |
| Booking/dispatch support | M1 | no replacement, Partner changes after disclosure, Customer rejects delay, outage backlog |
| Assisted booking | M1 | consent, wrong Customer/address, payment-link expiry, same domain records and audit |
| Finance reconciliation | M1 | capture without booking, refund/payout stuck, chargeback during work, maker-checker conflict |
| Quality/safety | M1 | restricted media, emergency escalation, payout/refund hold, appeal and legal/insurance handoff |
| Catalog/area controls | M1 onward | invalid activation, active booking after disable, effective-date rollback |
| Moderation | M5 projects, M7 listings | unsafe content, spam, impersonation, appeal and evidence retention |

## Archetype feature ownership

| Archetype | Milestone | Must not launch without |
|---|---|---|
| A1 task visit | M1 | task scope, min visit price, estimate, partial work, amendment and settlement |
| A2 inspection | M2 | inspection outcomes, same-visit capacity decision, linked follow-up and credit expiry |
| A3 time block | M3 | purchased time, timer, extension, overtime/abort and attendance outcome |
| A4 recurring | M3 | continuity, billing cycle, materialization, skip/pause/substitute and series cancellation |
| A5 custom project | M5 | proposals, agreement, funded milestones, evidence, change orders and dispute |
| A6 staffing | M5 | organizations, named workers, shifts, attendance, replacement, wage rules and compliance |
| A7 rental | M6 | inventory, deposit, handover/return condition, extension, damage/loss and settlement |
| A8 trip | M6 | driver/vehicle, route price, pickup/start/end, emergency and tracking consent/retention |
| A9 stay | M7 | unit inventory, guest policy, check-in/out, cancellation/no-show, deposit/damage |
| A10 listing | M7 | moderation, lead/application, protected contact, spam/report/expiry; no fake Booking |

## Required failure questions for every new feature

Before a feature enters a milestone, its specification must answer:

1. Who is authorized to initiate, approve, cancel and override it?
2. What durable record proves it happened?
3. What makes retries and duplicate delivery safe?
4. Which concurrent action can race it, and how is the winner chosen?
5. What happens when every external provider times out or returns ambiguity?
6. What does each party see while state is pending, failed or under review?
7. Can either party safely withdraw, release or abort?
8. How are money, tax, commission, refund and payout reconciled?
9. Which evidence, privacy purpose and retention apply?
10. Which Operations case owns failures, with what SLA and terminal result?
11. Which metrics show harm or failure without turning the metric into an automatic punishment?
12. Which unit, integration, concurrency, browser and recovery tests prove it?


# Instant Dispatch and Decision Resolution

**Status:** Accepted planning baseline
**Date:** 30 July 2026
**Scope:** Instant fulfilment dispatch, Partner notification/location contracts, and the open decisions Q1–Q24
**Precedence:** This document resolves Q1–Q24. Where it disagrees with
[09-milestone-1-authoritative-resolution.md](./09-milestone-1-authoritative-resolution.md), this document
takes precedence until that text is corrected. Section 2 lists the required corrections explicitly.

> **⚠ The dispatch ordering in this document has been reversed. Do not implement §3, §4.1 or §12.3 as
> written.** [11-payment-first-instant-and-cancellation-policy.md](./11-payment-first-instant-and-cancellation-policy.md)
> supersedes them:
>
> | Here | Superseded by | What changed |
> |---|---|---|
> | §3 (Q1) `PAYMENT_READY` gate | doc 11 §2 | **Removed.** Real payment capture replaces a proxy for payment. A fast eligible-pool existence pre-check runs before the payment screen instead |
> | §4.1 sequence (offer → accept → pay) | doc 11 §2 | **Reversed** to pay → assign → acknowledge. §4.2 timings (ACK window is 20s, not 15s), §4.3 widening bands, §4.4 outcome codes and §5–§6 are **reused** by doc 11 §3 |
> | §4.4 `NO_PARTNER_ACCEPTED` | doc 11 §4 | Renamed `NO_PARTNER_CONFIRMED`; now a **post-payment refund** path, not a "you have not been charged" path |
> | §10.1 (Q2) `JobOffer` states and "never assigned" copy | doc 11 §3, §9 | `JobOffer` → **`JobAssignment`**. Copy is now "New job assigned — confirm you're on it". A Partner **acknowledges**; there is no Accept/Decline. The expired-card rule still holds |
> | §10.4 offer payload withholding address/contact | doc 11 §2 step 9 | Exact address and contact are released **on acknowledgement**, because payment has already succeeded |
> | §12.3 (Q10) no Partner show-up compensation | doc 11 §5.2 | **Reopened.** A Partner can now be legitimately EN_ROUTE on a paid job; a capped dispatch fee applies |
> | §9 (Q14) location capture events | — | **Unchanged.** No EN_ROUTE pings, no map, no position history (ADR-030). Doc 11 §7 covers text-only arrival estimates |
>
> **Still fully authoritative here:** the `instant-v1` ranking formula and policy versioning (Q3–Q6),
> the Redis lock contract (Q7/Q9), notification delivery and failure classification (Q8/Q15–Q17),
> concurrent-transition resolution (Q18), order composition (Q19), fail-closed degraded mode (Q20),
> the non-dispatch resolutions (Q21–Q23), and the residual-risk metrics discipline (§17).

---

## 1. Decision register

| ID | Subject | Decision | Section |
|---|---|---|---|
| Q1 | Payment verification before dispatch | Adopt as `PAYMENT_READY`; not a payment guarantee | §3 |
| Q2 | `OFFERED` vs `ASSIGNED` terminology | Adopt | §10 |
| Q3 | Bounded ranking components | Adopt; `tier` removed; add prior-customer preference | §5 |
| Q4 | Fairness and exploration | Adopt as capped additive bonus, not forced position one | §5.3 |
| Q5 | Luxe/Prime/Classic tiers | **Rejected for Milestone 1** | §5.4 |
| Q6 | Versioned ranking policy | Adopt; candidate logs are restricted personal data | §5.5 |
| Q7 | Soft-lock lifetime and release triggers | Adopt | §6 |
| Q8 | Release lock on delivery failure | Adopt only for permanently-invalid destinations | §7.2 |
| Q9 | Redis lock implementation | Adopt `SET NX PX` + compare-and-delete | §6.2 |
| Q10 | Partner show-up compensation | **Rejected for Milestone 1**; no travel before payment | §12.3 |
| Q11 | Customer abandonment cooldown | Adopt with explicit cause codes | §12 |
| Q12 | Radius expansion | Adopt via configured ETA/service-area bands | §4.3 |
| Q13 | Offer TTL | ~15s per round under a hard global deadline | §4.2 |
| Q14 | Partner location | Adopt privacy-safe capture; booking address is never position | §9 |
| Q15 | Web Push and native | Adopt channel abstraction; iOS requires Home Screen install | §8 |
| Q16 | Subscription validation | Silent verification push **rejected**; use foreground challenge | §8.3 |
| Q17 | Delivery metrics | Adopt three-stage delivery model | §10.2 |
| Q18 | Cancellation race | First committed valid transition wins | §13 |
| Q19 | Multi-item Instant | Instant is one item, one order | §14 |
| Q20 | Redis degraded mode | **Fail closed**; no stale PostgreSQL presence fallback | §15 |
| Q21 | Extension payment failure | Adopt | §16.1 |
| Q22 | Tentative holds | Adopt; offers are not calendar reservations | §16.2 |
| Q23 | Crew/organization capacity | Confirmed deferred to Wave 4 | §16.3 |
| Q24 | Booking-flow provider step | Must correct; Instant has no provider-selection stage | §2 |

---

## 2. Required corrections to document 09

### 2.1 Section 5 stage sequence (Q24)

The current shared step "choose Auto Assign or an eligible Partner" is wrong. Instant and Scheduled are
different stage sequences.

```text
SCHEDULED
  confirm address and serviceability
    -> select Scheduled
    -> scope questions
    -> duration
    -> Auto Assign OR customer-selected eligible Partner
    -> provider-specific CapacityHold
    -> review quote and policy
    -> login and resume pending action
    -> pay
    -> authoritative confirmation

INSTANT
  confirm address and serviceability
    -> select Instant
    -> scope questions
    -> duration
    -> login (required before dispatch)
    -> PAYMENT_READY gate
    -> automated offer dispatch ("Finding a professional")
    -> Partner acceptance creates the CapacityHold
    -> review quote and policy
    -> pay within the hold window
    -> authoritative confirmation
```

Instant has **no provider-selection screen**. Preferred Partners remain a ranking signal only.

### 2.2 Authentication ordering

Instant requires an authenticated customer **before** dispatch, because `PAYMENT_READY` is an
account-level fact. Document 09 §5 places login after quote review; that ordering applies to Scheduled
only.

### 2.3 Instant search precondition

Document 09 §6.1 lists eligibility as presence plus push channel. Add: `PAYMENT_READY`, fresh coarse
location, and no active Instant lock. The complete gate is §8.4.

---

## 3. The `PAYMENT_READY` gate (Q1)

`PAYMENT_READY` reduces post-acceptance abandonment. It is **not** a guarantee of payment. Saved card
tokens still decline, and UPI AutoPay is a recurring-mandate instrument, not a general-purpose
verification mechanism.

### 3.1 Milestone 1 definition

A customer is `PAYMENT_READY` when **all** are true:

- Authenticated with a verified phone number
- At least one usable payment instrument on record: a valid non-expired saved card token, or a
  recorded VPA the customer has previously paid with successfully
- No active payment-abuse or Instant cooldown restriction (§12.2)

### 3.2 What is explicitly not adopted

- A ₹1 authorize-and-void is **not** used as a verification probe in Milestone 1.
- UPI AutoPay mandates are **not** used as card-equivalent verification.
- Gateway pre-authorization before dispatch is **not** implemented in Milestone 1. It is the only
  mechanism that would reduce post-acceptance payment risk to near zero; adopting it requires an
  explicit business decision, a provider capability review and a customer-consent change.

### 3.3 Residual risk (accepted)

A Partner may accept an offer and the customer's payment may still fail. Because the Partner receives no
exact address and does not travel before payment (§12.3), the loss is bounded to blocked availability for
the hold window. This is accepted for Milestone 1 and must be measured (§17).

### 3.4 Error contract

```json
{
  "error": {
    "code": "PAYMENT_METHOD_REQUIRED",
    "message": "Add a payment method to book an instant service.",
    "fields": {},
    "retryable": true,
    "trace_id": "..."
  }
}
```

The customer may add a method and retry, or switch to Scheduled.

---

## 4. Instant dispatch algorithm

Sequential dispatch with expiring offers. Never broadcast. One Partner holds a live offer for a given
cart item at any time.

### 4.1 Sequence

```text
CUSTOMER                DJANGO                                   PARTNER
--------                ------                                   -------
select Instant
scope + duration
login
  ----------------->    PAYMENT_READY gate
                        rank eligible Partners (§5)
                        ROUND 1
                          acquire Instant lock (§6)
                          create JobOffer(status=OFFERED)
                          send via notification channel (§7)
                                          ------------------->    visible offer card
"Finding a
 professional"                                            <----   ACCEPT / DECLINE
                        conditional transition (§13)
                        on accept:
                          CapacityHold (partner-specific)
                          PartnerReservation on occupied_range
                          status TENTATIVE + expiry
  <-----------------    "Professional found"
review quote
pay within hold window
  ----------------->    revalidate hold, capture, create Booking
  <-----------------    CONFIRMED  ------------------------->     assignment + exact address
```

If a round produces no acceptance, the lock is released and the next round begins. If all rounds finish
without acceptance, the search terminates per §4.4. The customer is never charged for a failed search.

### 4.2 Timing policy (Q13)

```text
INSTANT_DISPATCH_POLICY v1
  rounds                        3
  round_ttl_seconds             15
  ack_extension_max_seconds     5     # granted only on client ACK, never beyond the global deadline
  global_deadline_seconds       50    # hard server-side ceiling
  hold_payment_window_minutes   5     # Instant only; Scheduled uses its own longer window
```

Rules:

- The global deadline is authoritative. A client acknowledgement may extend the **current round** by up
  to `ack_extension_max_seconds`, and never past the global deadline.
- A round TTL is never unlimited and never depends solely on client acknowledgement, because a client
  may never acknowledge.
- Expiry is enforced by a Celery ETA task **and** by server-side time comparison on every read. A UI
  countdown is presentation only.
- All timings are configuration, not constants in code.

### 4.3 Round widening (Q12)

Rounds widen by **configured ETA/service-area bands**, not hardcoded kilometre values.

```text
round 1   primary ETA band for the service area
round 2   extended ETA band
round 3   service-area maximum reachable band
```

Rules:

- Candidates are re-ranked at each round against the widened pool.
- Every Partner already offered this job is excluded from later rounds.
- A customer-initiated retry excludes every Partner offered in the previous search.
- Bands are versioned per service area alongside travel-buffer policy (document 09 §7).

### 4.4 Terminal outcomes

Two distinct failures with distinct customer messages. They must never be collapsed.

| Outcome code | Meaning | Customer message | Next action |
|---|---|---|---|
| `NO_PARTNER_ACCEPTED` | Eligible Partners existed; none accepted in time | "No professional accepted in time. You have not been charged." | Retry Instant, or switch to Scheduled |
| `ELIGIBLE_POOL_EXHAUSTED` | The complete eligible pool was offered and exhausted | "No professional is available near you right now. You have not been charged." | Switch to Scheduled |
| `INSTANT_UNAVAILABLE` | Instant is degraded or disabled (§15) | "Instant booking is temporarily unavailable. You have not been charged." | Scheduled only |

The exhausted message is used **only** when the pool was genuinely exhausted.

---

## 5. Ranking policy (Q3, Q4, Q5, Q6)

### 5.1 Principles

- Ranking never overrides an eligibility gate.
- Every component is normalized to `[0,1]` before weighting. No unbounded or reciprocal term.
- Every component must be justifiable as **match quality**. Ranking is never used as compensation,
  incentive settlement or a penalty channel (Q10).
- Weights are effective-dated configuration, never literals in code.

### 5.2 Components and weights

```text
RANKING_POLICY instant-v1        (weights sum to 1.0)

proximity        0.35   clamp(1 - eta_minutes / eta_ceiling_minutes, 0, 1)
rating           0.25   bayesian(rating_sum, review_count, prior=4.3, k=20) / 5.0
acceptance       0.20   bayesian(accepts, responded_offers, prior=0.75, k=20)
fairness         0.10   clamp(1 - completed_jobs_last_7d / fairness_cap, 0, 1)
preference       0.10   1.0 when this customer has a prior completed booking with
                        this Partner, else 0.0

exploration_bonus  additive, 0.00 .. 0.08
                   applied only to fully eligible Partners
                   decays linearly to 0 by 20 lifetime completed jobs
```

Milestone 1 derives `eta_minutes` from straight-line distance and a configured service-area speed
factor. Routed travel-time estimation may replace it later without changing the formula shape.

`bayesian(...)` gives a Partner with no history the pool prior rather than zero, so a new Partner is
rankable on their first day.

### 5.3 Fairness and exploration are distinct (Q4)

These are two different signals and must not be collapsed, or recent workload gets counted twice:

- **fairness** — short-window load balancing across all Partners, keyed on completed jobs in the last
  7 days.
- **exploration_bonus** — new-Partner cold-start relief, keyed on lifetime completed jobs, decaying to
  zero.

Exploration is a **capped additive bonus**, never a forced promotion to position one. The cap must be
large enough to flip a near-tie and small enough that it cannot outrank a materially better match.

### 5.4 No tiers in Milestone 1 (Q5)

Luxe/Prime/Classic tiers are not implemented, publicly or internally. They require promotion rules that
cannot be justified before real performance data exists, and they create starvation risk. Revisit only
with measured data. No `tier` component exists in `instant-v1`.

### 5.5 Versioning, logging and retention (Q6)

```python
class RankingPolicy(models.Model):
    version         = models.CharField(unique=True)      # "instant-v1"
    components      = models.JSONField()                  # weights + normalization params
    effective_from  = models.DateTimeField()
    # rows are immutable; a change creates a new version

class DispatchAttempt(models.Model):
    cart_item       = models.ForeignKey(...)
    policy_version  = models.CharField()
    round_index     = models.IntegerField()
    candidates      = models.JSONField()   # [{partner_id, rank, score, components{...}}]
    outcome         = models.CharField()
    created_at      = models.DateTimeField(auto_now_add=True)
```

Candidate logs contain Partner coordinates, workload and performance data. They are **restricted
personal data**:

- Access requires an explicit Operations permission and is audited.
- Retention: 90 days, then aggregate and purge. Registered under the `RetentionPolicy` framework in
  document 09 §13.
- They are the retained audit trail for "why was this Partner ranked first," which is why raw location
  history is not kept (§9.4).

---

## 6. Instant lock contract (Q7, Q9)

A Partner holding a live offer must be invisible to other Instant searches. The lock is ephemeral
coordination, not capacity truth, so it lives in Redis. `PartnerReservation` in PostgreSQL remains the
final capacity guard.

### 6.1 Lifetime

```text
lock_expires_at = offer_expires_at + 3s grace
```

Release triggers — all five are mandatory:

| Trigger | Action |
|---|---|
| Accept | Lock converts to `CapacityHold`; key deleted |
| Decline | Released immediately |
| Round expiry | Released immediately |
| Revocation (customer cancel) | Released immediately |
| Permanent delivery failure (§7.2) | Released immediately, round advances without waiting |

A lock is never left to expire passively when the outcome is already known.

### 6.2 Implementation

```python
LOCK_KEY = "instant:lock:{partner_id}"

# Acquire: atomic set-if-absent with expiry. Value is an unpredictable offer token
# so no other process can release a lock it does not own.
acquired = redis.set(
    LOCK_KEY.format(partner_id=partner_id),
    offer_token,                       # >=128 bits of CSPRNG randomness
    nx=True,
    px=(round_ttl_ms + 3000),
)

# Release: compare-and-delete via Lua, so release is atomic against expiry+reacquire.
RELEASE = """
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
else
  return 0
end
"""
```

Searches exclude any Partner with a live lock key.

---

## 7. Notification delivery (Q8, Q17)

### 7.1 Channel abstraction (Q15)

```python
class PartnerDevice(models.Model):
    partner              = models.ForeignKey(...)
    channel              = models.CharField(choices=["WEB_PUSH", "FCM", "APNS"])
    subscription         = models.JSONField()      # endpoint/keys or token
    permission_granted   = models.BooleanField(default=False)
    capabilities         = models.JSONField()      # background_delivery, background_location
    last_challenge_ok_at = models.DateTimeField(null=True)   # §8.3
    last_offer_ack_at    = models.DateTimeField(null=True)
    consecutive_failures = models.IntegerField(default=0)
    invalidated_at       = models.DateTimeField(null=True)
```

Instant eligibility asks whether the Partner has at least one **verified, delivery-capable channel** —
never whether a specific transport exists. Native FCM/APNs later become additional rows with no
dispatch change.

### 7.2 Failure classification (Q8)

The adapter classifies every send into exactly one of three outcomes. Generic 4xx handling is forbidden.

| Class | Provider signals | Action |
|---|---|---|
| `PERMANENT_INVALID` | Web Push `404`/`410`; FCM `UNREGISTERED`, `INVALID_ARGUMENT` on token | Mark device `invalidated_at`, release lock, advance round immediately |
| `TRANSIENT` | `429`, `5xx`, FCM `UNAVAILABLE`/`INTERNAL` | One bounded retry after ~1s. If it still fails: release lock, advance round, **keep the token**, increment `consecutive_failures` |
| `ACCEPTED_FOR_DELIVERY` | 2xx from provider | Wait for client acknowledgement or round expiry |

Payload errors (`413`, malformed) are application defects: alert, never delete the device.

A device with 3 consecutive transient failures drops out of the Instant pool until a successful
delivery or a fresh foreground challenge (§8.3).

### 7.3 Provider acceptance is not delivery (Q17)

A 2xx from FCM or a Web Push service means the message was **accepted for delivery**, not delivered to
the device. Three independent stages are recorded:

```text
provider_accepted_at    provider returned success
client_acked_at         the device confirmed a visible offer was rendered
outcome                 what the Partner actually did
```

Only `client_acked_at` establishes that the Partner had a real chance to respond.

---

## 8. Instant readiness (Q15, Q16)

### 8.1 Platform reality

- **Android Chrome** — Web Push works in a normal browser tab. This covers the majority of the expected
  Partner base. Registration alone never proves current deliverability (§7.2).
- **iOS/iPadOS Safari** — Web Push requires the web app to be **added to the Home Screen** (16.4+).
  A regular Safari tab receives nothing. Instant readiness on iPhone therefore requires installation,
  granted permission and a working subscription.

### 8.2 Onboarding requirements

The Partner application must:

- Detect iOS Safari without Home Screen installation and present install instructions as a **hard gate
  for Instant readiness**, while stating plainly that Scheduled work is unaffected.
- Request notification permission from an explicit user gesture, never on page load.
- Ship a manifest with `display: standalone` so installation produces a Home Screen web app.
- Never claim Instant readiness merely because a subscription record exists.

### 8.3 Verification without silent push (Q16)

A silent/data-only verification push is **not** used. Safari does not support invisible push and may
revoke notification permission when a received push is not displayed.

Verification instead uses:

1. **Foreground channel challenge at Go Online** — an authenticated HTTP/WebSocket round trip from the
   live client, recorded as `last_challenge_ok_at`. This proves the app is running and reachable.
2. **Acknowledgement of real visible offers** — the service worker acknowledges after rendering an
   actual offer notification, recorded as `last_offer_ack_at`.

Consequence, accepted: the **first** offer to a newly subscribed device is unverified. This is precisely
why an `UNDELIVERED` outcome never counts against the Partner (§10.2).

### 8.4 Complete Instant eligibility gate

```text
application APPROVED and not suspended
+ required skill/service enabled
+ inside service area
+ inside ServiceAreaOperatingWindow for the full occupied_range
+ presence fresh in Redis coordination (§15)
+ >=1 device: subscription present AND permission_granted AND not invalidated
+ foreground channel challenge succeeded this online session
+ coarse location fresh (§9.3)
+ occupied_range free, including travel buffer
+ no live Instant lock
+ not blocked by this customer (CustomerPartnerBlock)
+ not the customer themselves
```

Any gate that fails removes the Partner from the round. The Partner UI must state which gate is
unmet — a Partner must never believe they are earning when they are not Instant-eligible.

---

## 9. Partner location contract (Q14)

### 9.1 Capture events

Location is captured only at explicit, consented events. There is no continuous stream and no
background polling.

| Event | Purpose |
|---|---|
| Go Online | Establish the working baseline |
| App foreground / resume | Opportunistic refresh while online |
| Offer acknowledgement | Accuracy at the moment an ETA is promised |

### 9.2 Booking addresses are not Partner positions

A completed booking's address is the **customer's** address. It is not evidence of where the Partner is
afterwards — they may have left immediately. Using it as a Partner coordinate would fabricate location
data, the same defect class as the hardcoded-city fallback in
[08-partner-audit-and-rebuild.md §3](./08-partner-audit-and-rebuild.md). It is never used as position.

### 9.3 Freshness and expiry

```text
PartnerLocation (latest only, no history)
  latitude, longitude    coarse precision (~100m, 3 decimal places)
  accuracy_m
  captured_at
  purpose                INSTANT_MATCHING
  consent_version

Staleness bands (configuration; initial values)
  < 10 minutes     full weight in proximity scoring
  10 - 30 minutes  proximity score penalty and widened ETA presentation
  > 30 minutes     NOT Instant-eligible
```

A stale location expires exactly like a stale heartbeat. Presenting an ETA derived from an aged
coordinate is a false capacity claim.

### 9.4 Privacy rules

- Only the **latest** coarse coordinate is retained. No location history, no trail, no replay.
- No customer-visible tracking, map, or moving marker at any point (document 09 §8).
- Retention, purpose and consent version are registered under document 09 §13.
- Retrospective ranking questions are answered from `DispatchAttempt.candidates` component scores
  (§5.5), which is why a raw coordinate trail is unnecessary.

### 9.5 Accepted supply consequence

With no periodic background refresh, and because backgrounded web clients cannot reliably hold a
foreground challenge, a Partner whose app has been backgrounded for a long period will **age out of the
Instant pool**. This is consistent with §8 — a backgrounded web client cannot reliably receive offers
either. It materially caps Instant supply in Milestone 1 and is accepted, tracked (§17) and a primary
justification for a later native application.

Scheduled work is unaffected: Scheduled matching uses service-area membership and travel buffers
computed from known addresses, and never requires live Partner location.

---

## 10. Offer lifecycle (Q2, Q17)

### 10.1 States

```text
JobOffer.status
  OFFERED -> ACCEPTED | DECLINED | EXPIRED | REVOKED | UNDELIVERED
```

`OFFERED` is the only pre-response state. Terminology rules:

- Notification copy is **"New job offer — respond in 15s"**. Never "assigned".
- `Booking.PARTNER_ASSIGNED` is reached only after accepted capacity commitment **and** successful
  payment.
- An expired offer can never render an actionable Accept control.

### 10.2 Delivery and outcome are independent dimensions

```text
delivery:  PENDING -> PROVIDER_ACCEPTED -> CLIENT_ACKED
                   \-> FAILED_TRANSIENT | FAILED_PERMANENT

outcome:   ACCEPTED | DECLINED | EXPIRED | REVOKED | UNDELIVERED
```

### 10.3 Partner metrics

```text
response_rate   = responded / offers_client_acked          # dispatch system health
acceptance_rate = accepted / (accepted + declined + expired_after_ack)   # Partner behaviour
```

Excluded from the acceptance denominator:

- `UNDELIVERED` and any `FAILED_*` delivery
- `REVOKED` (customer cancelled)
- offers with less than 5s of round TTL remaining after `client_acked_at`

Minimum sample of 20 acknowledged offers before a rate is displayed or acted upon; a neutral prior
applies below that (§5.2).

**Consequence ladder.** A sustained low response rate removes the Partner from the Instant pool — a
capability change, not a rating penalty, and never a ranking manipulation.

### 10.4 Offer payload

The offer shows what is needed to decide, and nothing that policy withholds before payment.

```json
{
  "offer_id": "...",
  "expires_at": "2026-07-30T09:14:32Z",
  "server_now": "2026-07-30T09:14:17Z",
  "service": { "name": "Switch / Socket Repair", "scope_summary": "2 switches" },
  "approximate_area": "Kukatpally",
  "eta_minutes": 18,
  "estimated_duration_minutes": 60,
  "estimated_partner_net": { "amount_paise": 34000, "currency": "INR" }
}
```

Never present before payment: exact address, customer contact details, customer gross order total, or
any fabricated surge, demand or rating value.

---

## 11. Customer wait experience

During dispatch the customer sees a bounded, honest waiting state:

- "Finding a professional" with progress against the global deadline
- An always-available Cancel control
- Explicit "You have not been charged" messaging throughout
- On termination, the exact §4.4 outcome message and next action

The dispatch lifetime is owned by Celery, never by the browser. Closing the tab does not stop the
search, and any resulting hold expires on its own window (ADR-012).

---

## 12. Abandonment, cause codes and compensation (Q10, Q11)

### 12.1 Cause codes

Every failed or abandoned Instant attempt records exactly one cause. Attribution drives whether any
consequence applies.

| Cause code | Attribution | Penalizable |
|---|---|---|
| `CUSTOMER_ABANDONED_PAYMENT` | Customer | Yes |
| `CUSTOMER_CANCELLED_DURING_SEARCH` | Customer | Yes, on repetition |
| `CUSTOMER_PAYMENT_DECLINED` | Ambiguous | No |
| `GATEWAY_ERROR` | Platform | No |
| `NOTIFICATION_UNDELIVERED` | Platform | No |
| `PARTNER_DECLINED` | Partner | No |
| `NO_PARTNER_ACCEPTED` | Supply | No |
| `ELIGIBLE_POOL_EXHAUSTED` | Supply | No |
| `INSTANT_UNAVAILABLE` | Platform | No |

Gateway failures, notification failures, platform errors and Partner rejection are **never** attributed
to the customer.

### 12.2 Customer cooldown ladder

Applies only to repeated genuinely customer-caused abandonment:

```text
1st in 24h    no consequence
2nd in 24h    Instant cooldown 30 minutes; Scheduled remains available
3rd in 7 days Instant disabled 24 hours; Scheduled remains available
```

Cooldowns are recorded with the triggering cause codes and are visible to Operations.

### 12.3 No Partner show-up compensation (Q10)

There is no show-up fee in Milestone 1, because before payment the Partner:

- does **not** receive the exact service address,
- is **not** instructed to travel,
- has incurred no cost beyond blocked availability for the hold window.

Consequently:

- Platform-caused cancellation of a **confirmed** booking is a separate, audited
  cancellation-compensation policy under document 09 §11. It is not conflated with pre-payment
  abandonment.
- Ranking is **never** adjusted as hidden compensation. Ranking components are match-quality signals
  only (§5.1).

The residual Partner cost is bounded, accepted, and monitored (§17).

---

## 13. Concurrent transition resolution (Q18)

All competing transitions use a single conditional update inside a transaction. **The first committed
valid transition wins.** There is no actor-priority rule.

```sql
-- acceptance
UPDATE job_offer SET status = 'ACCEPTED'
 WHERE id = %s AND status = 'OFFERED';

-- revocation from customer cancellation
UPDATE job_offer SET status = 'REVOKED'
 WHERE id = %s AND status = 'OFFERED';
```

Exactly one affects a row.

| Winner | Result |
|---|---|
| Revocation | Live offers revoked, locks released, Partner notified "job no longer available", outcome `REVOKED` (excluded from metrics) |
| Acceptance | Acceptance stands and the hold is created. The customer's cancellation becomes an **accepted-hold cancellation** and releases capacity per policy. No payment occurred, so there is no customer charge and no Partner compensation (§12.3) |

Client rules:

- Cancel is never optimistic. Show a pending state and resolve from the server response.
- If acceptance won, state it honestly: "A professional just accepted. You can still cancel — you have
  not been charged."

The same pattern governs extension-versus-completion and hold-versus-expiry races.

---

## 14. Order composition (Q19)

- An Instant item is **one service item in its own checkout and order**.
- Instant and Scheduled items are never mixed in one checkout.
- Other cart items are untouched: "Book this now — your other items stay in your cart."
- Scheduled checkout may still pay for multiple independently held bookings in one order, with every
  hold valid before payment starts (document 09 §4, roadmap Phase 7).

Multi-item Instant would require sequential per-item dispatch under a shared deadline with an
all-or-nothing gate. It is **out of scope for Milestone 1**.

---

## 15. Degraded modes (Q20)

### 15.1 Redis coordination unhealthy — fail closed

Instant depends on Redis for presence freshness and dispatch locks. When Redis coordination is
unhealthy:

- **New Instant searches are refused** with `INSTANT_UNAVAILABLE`.
- The system does **not** fall back to matching from an older persisted PostgreSQL presence record.
  Doing so would recreate the false-availability defect this architecture exists to prevent.
- Scheduled booking remains fully available.
- Operations receives a critical alert.
- In-flight bookings, holds and work sessions are unaffected; capacity and booking truth remain in
  PostgreSQL.

`PartnerOnlineSession` rows are still persisted for audit and recovery. They are **never** a matching
source.

### 15.2 Operational implication

Fail-closed makes Redis availability revenue-critical for Instant. Required:

- Managed Redis with high availability and monitored failover
- Health checks that distinguish Redis from PostgreSQL (document 09 Phase 1)
- Instant unavailability duration as a tracked SLO (§17)
- Coordination with `ServiceAvailabilityOverride` (document 09 §16) so Instant can also be disabled
  deliberately

---

## 16. Non-dispatch resolutions

### 16.1 Extension payment failure (Q21)

When an extension payment fails mid-job:

- The booking remains `IN_PROGRESS` or `OVERTIME`. The paid deadline does **not** move.
- Partner UI: "Extension not paid. You are not obligated to continue beyond the original booked scope.
  Complete the original work or contact support."
- Customer UI: "Payment failed. Retry, or the professional will finish the originally booked work."
- One retry is permitted per payment policy; then Operations is notified.
- Unapproved overtime is never billed. A Partner is never instructed to work unpaid.

### 16.2 Tentative holds (Q22)

The Partner calendar distinguishes committed work from expiring commitments:

```text
10:00  Switch repair   CONFIRMED              paid and committed
14:00  Fan install     TENTATIVE  04:12       held, awaiting customer payment
```

- Both Instant accepted-but-unpaid holds and Scheduled payment holds render as `TENTATIVE` with a
  server-derived expiry.
- **Offers are offer cards, not calendar reservations.** A pending offer never appears as booked time.
- Private address and contact details stay hidden until policy permits (§10.4).

Hidden holds cause double-commitment, so tentative state is always visible.

### 16.3 Crew and organization capacity (Q23)

Confirmed deferred. Milestone 1 assigns **one human Partner per visit** and consumes one unit of
capacity. Crew, provider organizations and capacity greater than one are Wave 4, per document 09 §17
and [08-partner-audit-and-rebuild.md](./08-partner-audit-and-rebuild.md).

A numeric `capacity_units` shortcut is explicitly not added, because it hides which individual is
accountable for a visit.

---

## 17. Residual risks and required metrics

Each accepted trade-off has an owning metric. Unmeasured trade-offs become defects.

| Risk | Source | Metric | Initial alert threshold |
|---|---|---|---|
| Partner availability blocked by non-paying customers | §3.3, §12.3 | `instant.hold_wasted_minutes` per Partner per day | p95 > 15 min/day |
| Abandonment concentrated on specific customers | §12.2 | `instant.abandonment_rate` by cause code | customer-caused > 5% of searches |
| Instant supply shrunk by location/push gating | §9.5, §8 | `instant.eligible_pool_size` p50 by area and hour | p50 < 3 in an active area |
| First-offer delivery unverifiable | §8.3 | `instant.undelivered_offer_rate` | > 10% of offers |
| Dispatch failing to fill | §4.4 | `instant.rounds_per_booking`, terminal outcome mix | `NO_PARTNER_ACCEPTED` > 20% |
| Fail-closed Instant outage | §15 | `instant.unavailable_seconds` | any sustained window > 60s |
| Ranking fairness not working | §5.3 | share of Instant jobs going to Partners with < 20 lifetime jobs | < 5% of dispatches |
| Candidate log exposure | §5.5 | audited access count on `DispatchAttempt` | any non-Operations read |

---

## 18. What this unblocks

Contract proposals to be written under [contracts/proposals](../contracts/proposals/README.md):

1. Instant dispatch lifecycle — start search, poll/subscribe state, cancel search, terminal outcomes
2. Offer lifecycle — deliver, acknowledge, accept, decline, expire, revoke
3. `PartnerDevice` registration, channel capability and invalidation
4. Foreground channel challenge at Go Online
5. Partner location capture with purpose and consent
6. `PAYMENT_READY` status and the `PAYMENT_METHOD_REQUIRED` recovery path
7. Tentative hold representation on the Partner calendar
8. Partner offer payload including `estimated_partner_net`

Frontend work these unblock: B3 Instant stage sequence (§2.1), B9 offer card, presence and readiness
UI, tentative calendar and the dispatch wait state.

Codex owns the Django implementation, the generated OpenAPI and any rejected or modified proposal
behaviour. Generated contracts and clients are never hand-edited.

## 19. Open business decisions

These are not architecture blockers. Sandboxed Milestone 1 development proceeds without them.

| Decision | Owner | Needed before |
|---|---|---|
| Whether gateway pre-authorization before dispatch is permitted (§3.2) | Business + payment provider review | Removing residual post-acceptance payment risk |
| Initial values for round TTL, global deadline and hold window (§4.2) | Product | Instant load testing |
| Service-area ETA band values (§4.3) | Operations | First live service area |
| Location staleness thresholds (§9.3) | Product + Operations | Instant launch |
| `fairness_cap` and exploration decay values (§5.2) | Product | Second month of live dispatch data |

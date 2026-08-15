# M2 threat model — what an attacker would try, and what stops them

`M2-BE-801`. Written in the runbook voice: each section names a thing somebody would do, what
currently stops it, and — where the answer is "nothing yet" — says so with the task id that would
close it. **A threat model whose every row says "mitigated" is a threat model nobody read.**

Scope is M2: the A3 rate-card front door, the A3 quote fallback, the A5 visit-first path, the
engagement spine and the Operations workspace. M1 is named where an M2 path leans on it.

---

## 1. Object access — reading somebody else's request

**What they would try.** Take a requirement, engagement, proposal, stage or case id from their own
account and put it in the URL of another.

**What stops it.** Every M2 read resolves through an actor-scoped selector — `requirement_for_customer`,
`invitation_for_partner`, `_proposal_for_customer`, `_shift_stage_for_participant` — and a record
that belongs to somebody else answers **`404`, never `403`**. That choice is the mitigation, not a
politeness: a `403` confirms there is a record there to find, which is exactly what an enumerator is
asking.

Operations reads are separate functions rather than the same function with a role flag. The Customer
timeline (`selectors.requirement_timeline`) publishes a wave as a **count with no vendor
identities**; the Operations timeline (`operations._invitation_events`) names the vendor. Two
functions, so a later edit cannot leak one into the other.

**Residual.** Object-level authorization has **no regression test**, because `M2-BE-802` is a test
task and this sprint writes none. The rule is enforced at every call site and nothing proves it stays
enforced. **This is the largest single hole in the M2 security posture and it is open.**

## 2. ID enumeration

**What they would try.** Walk ids to discover how many requests, vendors or engagements exist.

**What stops it.** Every M2 primary key is a **UUID4**, so there is no sequence to walk, and lists
are cursor-paginated (`StrictCursorPagination`) with the cursor rejected rather than ignored when
malformed. A storage `object_key` is never published — `M2-FE-603` records that stage evidence
withholds it deliberately, because a storage path is an enumeration surface of its own.

Document sequences (`commerce.DocumentSequence`) *are* sequential, by design — an invoice series has
to be — but a receipt number is only ever shown to the party it belongs to.

**Residual.** None known. The uuid choice predates M2.

## 3. Upload abuse

**What they would try.** Mint signed upload URLs in a loop; upload something enormous; upload a
script as an image; upload malware and get a vendor to open it.

**What stops it, in four layers.**

1. **Allow-list per kind**, not a deny-list — `attachments.ACCEPTED_MEDIA_TYPES`. A "document" that
   is really an `image/svg+xml` is a script, and a "voice note" that is really a PDF is a bug worth
   refusing. The suffix on the object key comes from the allow-list, not from the client's filename.
2. **Size ceilings per kind** (`MAXIMUM_SIZE_BYTES`) and **twelve attachments per requirement**
   (`MAXIMUM_ATTACHMENTS_PER_REQUIREMENT`).
3. **Verification on finalize.** Bytes never pass through Django; the server names the object key,
   records what it was told to expect, then streams the object back and compares size, media type
   and SHA-256 against that record. Without the intent row, "verify the upload" degrades to
   "believe the client".
4. **`INFECTED` is not `FAILED`.** A checksum mismatch offers a retry; malware does not, and the
   file is gone with no vendor having seen it. Only `VERIFIED` is shareable, so a `PENDING`
   attachment never reaches a snapshot.

**Added in C7.** A rate: `m2_attachment_upload` at 60/hour per user, on the requirement presign and
finalize, the stage-evidence presign, and the partner KYC document routes. Twelve attachments per
requirement was a cap on *storage*; this is a cap on *minting signed URLs*, which is the different
thing a loop does.

**Residual.** The malware scan is a **seam**. `processing_status` carries `INFECTED` and every read
honours it, and nothing sets it — there is no scanner wired. Treat `VERIFIED` as "checksum and type
verified", not "scanned".

## 4. Clarification abuse

**What they would try.** Flood a Customer's or a vendor's timeline; use the free-text field as a
channel to swap phone numbers and take the job off-platform.

**What stops it.**

* **Contact-sharing detection** — `looks_like_contact_sharing` flags a question or answer for
  review. Deliberately a signal, never proof and never an automatic penalty.
* **The paywall.** A Customer cannot address a vendor before the A3 unlock or the charged A5 plan
  (`assert_customer_may_read_full_quotes`), so asking a question cannot be a channel around the fee.
* **Added in C7:** a cap of **three unanswered questions per asker per thread**
  (`MAXIMUM_OPEN_QUESTIONS_PER_THREAD`), plus `m2_clarification` at 60/hour. The cap is on the
  *unanswered* count, not the total: a long healthy back-and-forth about a complicated site is the
  conversation clarification exists for, and it is unbounded only for somebody who is not waiting
  for a reply. A rate limit cannot express that, and the cap cannot express "one script, many
  threads" — neither catches what the other does.

**Residual.** Flagged messages accumulate with **no queue that surfaces them**. The signal is
recorded and nobody is looking at it.

## 5. Payment abuse and replay

**What they would try.** Claim an unlock from a client redirect; replay a webhook; pay once and be
granted twice; be charged for nothing.

**What stops it.**

* **Only a verified provider callback grants anything.** `complete_unlock`, `complete_visit_plan`
  and `complete_booking_fee` move a purchase from `PENDING` to `ACTIVE`; a client redirect is a
  claim made by the party that benefits from it and grants nothing.
* **"Paid but nothing happened" is unreachable, not merely unlikely.** Each checkout re-checks its
  precondition under the requirement's own row lock in the transaction that creates the attempt: an
  unlock needs a live usable quote, a visit-plan charge needs a held slot, a booking fee needs an
  accepted offer holding the job.
* **Amount is checked against the attempt**, and a mismatch is a `FinancialException`, not a grant.
* **Idempotency** is platform-wide (`foundation.execute_idempotent`, `Idempotency-Key` scoped per
  actor and operation); a re-driven callback finds the row it already created.
* **Webhook signature** — `PAYMENT_WEBHOOK_SECRET`; production refuses to boot with the simulated
  capture enabled.
* **Wages are never touched.** ADR-0009: A3 wages are direct, daily and peer-to-peer. **No endpoint
  moves wage money**, so the largest sum in an A3 booking is not attackable through this platform at
  all. The settlement path records two taps and returns a UPI deep link into the Customer's own app.

**Added in C7.** `m2_money` at 30/hour per user across every checkout-creation route — a payment
loop costs provider-side orders as well as our own rows. `GET` is exempt (see
`common/throttling.py`): the poll that tells a Customer their money arrived must never be throttled.

**Residual.** Live payments and OTP are M3. Provider callbacks are **TEST** only.

## 6. Staff privilege

**What they would try.** Use an Operations account to publish a price, accept an offer for a vendor,
or read a Customer's data with no reason recorded.

**What stops it.** `IsOperationsUser` requires the role **and** an active session whose `active_role`
is operations, and it writes an `AccessAuditEvent` for every check including the denials.
`HasRecentOperationsStepUp` additionally requires fresh OTP for the outage-assisted commands.
`07-state-machines-and-permissions.md` §7's "may never" column is enforced in the domain: Operations
may not accept an offer for a vendor, and `capture_assisted_proposal` writes a quote with
`vendor_confirmed_at` **null** so a vendor's price is not publishable by staff.

**Closed in C7.** `capture_assisted_proposal`'s consent check was **decorative** — the command
refused without `consent_recorded` and the view passed `True` unconditionally, so every assisted
quote wrote an audit row asserting a consent nobody recorded. The view now passes what the client
sent, defaulting to `false`, so the refusal fires.

**Residual.** An operator with the role can read any request's timeline. That is the job; the
mitigation is the audit trail, not a further restriction.

## 7. Vendor collusion and identity

**What they would try.** Register several accounts for one agency and take every slot in a wave; put
one worker on two agencies' rosters and get paid twice.

**What stops it.** `matching.cluster_key` is a global beneficial-owner check — one invitation per
cluster per requirement, so two accounts of one agency cannot race for the same job. The A3 roster
gate counts **verified** memberships only (`verified_roster_size`), because an unverified worker is a
name, and dispatching on names is how one person is promised through two agencies. Cross-agency crew
conflict is checked per person per date.

**Added in C7.** `m2_partner_registration` at 20/hour on capability request, submit, withdraw and
crew-roster creation.

## 8. Slot squatting

**What they would try.** Hold a vendor's diary, or a Customer's crew, without ever paying.

**What stops it.** Every hold has an expiry and a sweep that returns it: `sweep_expired_visit_holds`
(2 min), `sweep_expired_offer_holds` (60 s), `sweep_expired_crew_offers` (60 s). The A5 visit-plan
payment attempt **expires with the slot it is holding**, so a payment landing after the hold has gone
cannot buy a visit the vendor is no longer free for. A3 capacity holds are soft (`CapacityHold`, not
a hard `Reservation`), so a stale hold degrades matching rather than blocking a diary.

**Added in C7.** `report_stuck_async_work` counts `m2_cascade_stalled` — a booking still in
`MATCHING` after 30 minutes on an *instant* product is not slow, it is broken.

## 9. Personal-data exposure

**What they would try.** Read a Customer's address or phone from a log, an error, a metric or a
vendor-facing payload.

**What stops it.** Contact is released only at the archetype's own moment (`contact_released_at`).
Teasers publish a price *band* and no identity. Attachment links are signed and short-lived
(`REQUIREMENT_ATTACHMENT_ACCESS_URL_TTL_SECONDS`, 300s) and **no link is minted once access has
lapsed** — revoking means not issuing, not hiding a button.

**Added in C7.** `common/observability/redaction.py` — a deny-list of key names, enforced in the
**log formatter** so it cannot be forgotten at a call site. This landed alongside a real defect:
`JsonFormatter` had been **discarding every `extra` field**, so no metric the platform ever emitted
reached a log with its name on it. Rendering them without redaction would have turned a missing
feature into a leak, since the easiest dictionary to attach to a log record is the request payload.

Metric labels carry ids, statuses, durations and archetypes — never free text. `record_touch` emits
the action and not the operator's `reason`, and `record_transition` emits the `reason_code` and not
the `reason`.

**Residual.** The deny-list is names, not values. A Customer who types their phone number into a
free-text description has typed it into a field this cannot catch.

---

## The kill switches that stop nothing

Found by C7's reader/writer sweep and recorded here because it is a security finding, not a tidiness
one. `KillSwitch` has an audited, published writer (`POST /api/v1/operations/kill-switches/`) and
`is_engaged` is read in exactly two places. Scope by scope:

| Scope | Reader | Effect when engaged |
|---|---|---|
| `NOTIFICATIONS`, `SMS`, `WHATSAPP`, `VOICE` | `notifications.services.request_notification` | Real — the intent is `SUPPRESSED`. |
| `M2_PURCHASES` | `requirements.purchase_gates` | Real, since C7 (`M2-BE-810`). |
| `PAYMENTS` | `requirements.purchase_gates` | Real **for M2 only**, since C7. **M1 checkout still does not read it.** |
| `PAYOUTS` | none | **Nothing happens.** |
| `DISPATCH` | none | **Nothing happens.** |
| `SERVICE_AREA` | none | **Nothing happens.** `seed_console_demo_data` engages this one with the reason "flooding reported in the service area", and dispatch continues into the flood. |
| `SERVICE` | none | **Nothing happens.** |

`SERVICE_AREA` is deliberately **not** wired into the M2 purchase gate, and the reason is worth
keeping: the console demo seed leaves it engaged on `hyderabad-500032`, which is the same area
`seed_m2_demo` seeds, so wiring it would refuse every M2 purchase in a developer's only seeded city
for a reason nobody could see from the refusal. "Flooding stops work here" is a dispatch-side rule
and belongs on the offer cascade, where it can also stop offers that are already out.

**Four scopes an operator can engage, with a reason and an audit row, that do nothing at all.** Each
belongs to a subsystem this wave does not own. Unbuilt, and named rather than quietly wired.

---

## What C7 did not close

* **`M2-BE-802`** — object-level authorization regression tests. Not written; test task.
* **`M2-BE-804`** — transaction/concurrency tests for slots, holds, selection, crew assignment,
  stage approval, refund and payout. Not written; test task.
* **Malware scanning.** A seam with no scanner.
* **A review queue for contact-sharing-flagged messages.** The signal is recorded; nobody looks.
* **`PAYOUTS`, `DISPATCH`, `SERVICE_AREA`, `SERVICE` kill switches**, and `PAYMENTS` on the M1 side.
* **Attachment access disclosure trail.** `M2-BE-310` revokes access by not minting links; there is
  no per-view audit row saying which vendor opened which attachment when.

import {
  attendancePhase,
  attendanceShortfall,
  canConfirmDaySettled,
  canRespondToAttendance,
  hasCustomerConfirmedSettlement,
  isSettlementUnproven,
  requiresShortfallChoice,
  settlementPhase,
  SHORTFALL_CHOICES,
  type AttendancePhase,
  type SettlementPhase,
  type ShiftCrewMember,
  type ShiftDay,
  type ShortfallChoice,
} from "@vsolve/query";
import { formatMoney } from "@vsolve/ui";

import { formatDay, formatInstant } from "@/features/engagement/adapters";

/**
 * One shift-day, turned into something a screen can render.
 *
 * Same layering as every other feature in this app, and one rule carries the
 * whole file:
 *
 * **Every money figure below is a published field, formatted.** Not one is
 * added, multiplied or subtracted here. `amountLabel` is the server's
 * `amount_paise`; `perWorkerLabel` is its `per_worker_paise`; `extrasLabel` is
 * its `extras_paise`. The three reconcile by a database check constraint
 * (`requirements_day_settlement_reconciles`), which is exactly why this file
 * does not reproduce the arithmetic — a client that computes "3 of 4" is a
 * client that can hand a worker the wrong wage, and it keeps doing so straight
 * through a change to the real formula.
 *
 * The counts are shown side by side for the same reason. "3 of 4 present, at
 * ₹900 each" is three published numbers read out; it is not this screen working
 * out what the day is worth.
 */

/* --------------------------------------------------------------------------
   The crew
   -------------------------------------------------------------------------- */

/**
 * One named worker, at the disclosure a Customer is entitled to.
 *
 * There is no id of any kind here and that is deliberate on the server's side:
 * crew identity is global — one person is one row however many agencies carry
 * them — so `membership_id` is published to the Partner only and the global
 * `crew_member_id` to nobody. What a Customer gets is a name, four digits of
 * phone and whether this platform has verified the person's documents. Nothing
 * in this app tries to reconstruct more than that.
 */
export interface ShiftCrewMemberView {
  /** Stable within one day's list. There is no crew id on the Customer's wire. */
  rowKey: string;
  displayName: string;
  /** Four digits, as the server masked them. Never a whole number. */
  phoneMasked: string | null;
  isSupervisor: boolean;
  /** Whether Vsolve has checked this person's documents. Never assumed. */
  isVerified: boolean;
  /** The server's own assignment status, carried verbatim. */
  status: string;
}

function toCrewMemberView(member: ShiftCrewMember, index: number): ShiftCrewMemberView {
  return {
    // Positional, because the Customer's projection carries no identifier at
    // all. Safe here and only here: the list is one server response, rendered
    // whole, never reordered locally and never appended to.
    rowKey: `${index}-${member.display_name}`,
    displayName: member.display_name.trim() === "" ? "A worker" : member.display_name,
    phoneMasked: member.phone_masked.trim() === "" ? null : member.phone_masked,
    isSupervisor: member.is_supervisor,
    isVerified: member.is_verified,
    status: member.status,
  };
}

/* --------------------------------------------------------------------------
   The settlement
   -------------------------------------------------------------------------- */

export interface DaySettlementView {
  phase: SettlementPhase;
  /** The exact published amount for the day. Read, never computed. */
  amountLabel: string;
  amountPaise: number;
  /** What one worker's day is worth, frozen onto the settlement at booking. */
  perWorkerLabel: string;
  workersPresent: number;
  workersExpected: number;
  /** Overtime and add-ons **both sides accepted through the amendment engine**. */
  extrasLabel: string;
  hasExtras: boolean;
  /** What the Customer chose about the missing worker-days, or null. */
  shortfallChoice: ShortfallChoice | null;
  makeGoodRequestedAt: string | null;
  supervisorConfirmedAt: string | null;
  customerConfirmedAt: string | null;
  settledAt: string | null;
  /**
   * The server's own `upi://pay` deep link, or null.
   *
   * Carried verbatim and never assembled. Null on the shift-day read is
   * currently ambiguous — no VPA published, or the read not carrying it at all
   * (§7) — so the screen states the amount and never claims the professional has
   * no UPI address.
   */
  paymentLink: string | null;
}

/* --------------------------------------------------------------------------
   The day
   -------------------------------------------------------------------------- */

export interface ShiftDayView {
  stageId: string;
  engagementId: string;
  position: number;
  /** `day_label`, not `label` — see the contract note in §7. */
  dayLabel: string;
  scheduledOn: string | null;
  stageStatus: string;

  crew: readonly ShiftCrewMemberView[];
  /** True when nobody has been named yet. An empty crew is a real state. */
  hasCrew: boolean;

  attendance: AttendancePhase;
  /** How many workers the booking was for. Published, never counted from `crew`. */
  expectedCount: number | null;
  /** How many came, or null when nobody has said yet — not zero. */
  presentCount: number | null;
  shortfallCount: number;
  arrivalConfirmedAt: string | null;
  shiftEndedAt: string | null;
  /**
   * The supervisor closed the day without a check-out time.
   *
   * **Not a problem, and the screen must not draw it as one.** A missing
   * check-out settles at the agreed shift length and is flagged for review; the
   * amount never depended on the end time, only overtime does, and that needs
   * the Customer's approval either way.
   */
  checkoutMissing: boolean;
  flaggedForReview: boolean;
  /** The server's own flag code, de-slugged. Never a copy table over a slug. */
  flagReason: string | null;
  /** What the Customer said when they disputed, if they did. */
  disputeNote: string | null;

  canRespond: boolean;
  mustChooseShortfall: boolean;

  settlement: DaySettlementView | null;
  canConfirmSettled: boolean;
  hasCustomerConfirmedSettlement: boolean;
  isSettlementUnproven: boolean;

  /** The day rate frozen on the engagement, for a day with no settlement yet. */
  perWorkerLabel: string;
  standardDayHours: number | null;
  /** Only ever charged after the Customer approves it as an amendment. */
  overtimeHourlyLabel: string | null;
}

/** `attendance_disputed` → "Attendance disputed". Never a lookup this client authored. */
function deSlug(value: string): string {
  const words = value.trim().replace(/[_-]+/g, " ").toLowerCase();
  return words === "" ? "" : words.charAt(0).toUpperCase() + words.slice(1);
}

export function toShiftDayView(day: ShiftDay): ShiftDayView {
  const attendance = day.attendance;
  const settlement = day.settlement;

  return {
    stageId: day.stage_id,
    engagementId: day.engagement_id,
    position: day.position,
    // A day stored with no label still has a position, and "Day 2" is a truthful
    // name for it. An empty heading is not.
    dayLabel: day.day_label.trim() === "" ? `Day ${day.position}` : day.day_label,
    scheduledOn: formatDay(day.scheduled_on),
    stageStatus: day.stage_status,

    crew: day.crew.map(toCrewMemberView),
    hasCrew: day.crew.length > 0,

    attendance: attendancePhase(day),
    expectedCount: attendance?.expected_count ?? null,
    presentCount: attendance?.present_count ?? null,
    shortfallCount: attendanceShortfall(day),
    arrivalConfirmedAt: formatInstant(attendance?.arrival_confirmed_at ?? null),
    shiftEndedAt: formatInstant(attendance?.shift_ended_at ?? null),
    checkoutMissing: attendance?.checkout_missing ?? false,
    flaggedForReview: attendance?.flagged_for_review ?? false,
    flagReason:
      attendance === null || attendance.flag_reason_code.trim() === ""
        ? null
        : deSlug(attendance.flag_reason_code),
    disputeNote:
      attendance === null || attendance.dispute_note.trim() === ""
        ? null
        : attendance.dispute_note,

    canRespond: canRespondToAttendance(day),
    mustChooseShortfall: requiresShortfallChoice(day),

    settlement:
      settlement === null
        ? null
        : {
            phase: settlementPhase(day),
            amountLabel: formatMoney(settlement.amount_paise),
            amountPaise: settlement.amount_paise,
            perWorkerLabel: formatMoney(settlement.per_worker_paise),
            workersPresent: settlement.workers_present,
            workersExpected: settlement.workers_expected,
            extrasLabel: formatMoney(settlement.extras_paise),
            hasExtras: settlement.extras_paise > 0,
            // The wire's "not chosen" is `""`, which is what every day nobody
            // was missing from carries — but 1.30.0 publishes the field as the
            // bare `ShortfallChoiceEnum`, so the generated type does not admit
            // it (§7). Membership-tested rather than compared, which narrows
            // without a cast and fails **closed** for a fourth choice this
            // build has never seen: a blank renders as no choice, never as one.
            shortfallChoice: SHORTFALL_CHOICES.includes(settlement.shortfall_choice)
              ? settlement.shortfall_choice
              : null,
            makeGoodRequestedAt: formatInstant(settlement.make_good_requested_at),
            supervisorConfirmedAt: formatInstant(settlement.supervisor_confirmed_at),
            customerConfirmedAt: formatInstant(settlement.customer_confirmed_at),
            settledAt: formatInstant(settlement.settled_at),
            // The server's own string, read straight off the record. Read here
            // rather than through `settlementPaymentLink` because that helper
            // is not on the barrel this wave — Session B published a twin of it
            // and the fold is the orchestrator's (§7). A field read is not the
            // part worth sharing anyway; **nothing assembles a `upi://pay`
            // string**, here or anywhere in this app.
            paymentLink: settlement.upi_payment_link,
          },
    canConfirmSettled: canConfirmDaySettled(day),
    hasCustomerConfirmedSettlement: hasCustomerConfirmedSettlement(day),
    isSettlementUnproven: isSettlementUnproven(day),

    perWorkerLabel: formatMoney(day.per_worker_paise),
    standardDayHours: day.standard_day_hours,
    overtimeHourlyLabel:
      day.overtime_hourly_paise === null ? null : formatMoney(day.overtime_hourly_paise),
  };
}

/* --------------------------------------------------------------------------
   Input the Customer types
   -------------------------------------------------------------------------- */

/**
 * A whole-rupee amount, as integer paise, or null.
 *
 * The one place this feature turns a typed string into money, and it is
 * deliberately the narrowest possible conversion: digits only, whole rupees,
 * `× 100`. No decimal point, no float arithmetic, no locale parsing.
 *
 * That is defensible only because of what this number is — the Customer's own
 * recollection of what somebody demanded in cash, optional on the wire and never
 * used to pay, charge or refund anything. **No published money figure is ever
 * produced by this function**, and nothing else in this feature converts
 * anything.
 *
 * Empty in, null out: an unfilled optional field is an absence, not a zero.
 */
export function rupeesToPaise(typed: string): number | null {
  const digits = typed.replace(/[\s,]/g, "");
  if (digits === "") return null;
  if (!/^\d{1,7}$/.test(digits)) return null;
  return Number(digits) * 100;
}

/** Whether what has been typed is either empty or a usable whole-rupee amount. */
export function isUsableRupeeInput(typed: string): boolean {
  return typed.trim() === "" || rupeesToPaise(typed) !== null;
}

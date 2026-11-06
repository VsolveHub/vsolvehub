// Ported from frontend/apps/customer/features/shift-day/adapters/index.ts
import {
  attendancePhase,
  attendanceShortfall,
  canConfirmDaySettled,
  canRespondToAttendance,
  hasCustomerConfirmedSettlement,
  isSettlementUnproven,
  requiresShortfallChoice,
  settlementPaymentLink,
  settlementPhase,
  type AttendancePhase,
  type SettlementPhase,
  type ShiftCrewMember,
  type ShiftDay,
  type ShortfallChoice,
} from "@vsolve/query/native";
import { formatMoney } from "@vsolve/mobile-ui";

import { formatDay, formatInstant } from "@/features/engagement/adapters";

export interface ShiftCrewMemberView {
  rowKey: string;
  displayName: string;
  phoneMasked: string | null;
  isSupervisor: boolean;
  isVerified: boolean;
  status: string;
}

function toCrewMemberView(member: ShiftCrewMember, index: number): ShiftCrewMemberView {
  return {
    rowKey: `${index}-${member.display_name}`,
    displayName: member.display_name.trim() === "" ? "A worker" : member.display_name,
    phoneMasked: member.phone_masked.trim() === "" ? null : member.phone_masked,
    isSupervisor: member.is_supervisor,
    isVerified: member.is_verified,
    status: member.status,
  };
}

export interface DaySettlementView {
  phase: SettlementPhase;
  amountLabel: string;
  amountPaise: number;
  perWorkerLabel: string;
  workersPresent: number;
  workersExpected: number;
  extrasLabel: string;
  hasExtras: boolean;
  shortfallChoice: ShortfallChoice | null;
  makeGoodRequestedAt: string | null;
  supervisorConfirmedAt: string | null;
  customerConfirmedAt: string | null;
  settledAt: string | null;
  paymentLink: string | null;
}

export interface ShiftDayView {
  stageId: string;
  engagementId: string;
  position: number;
  dayLabel: string;
  scheduledOn: string | null;
  stageStatus: string;

  crew: readonly ShiftCrewMemberView[];
  hasCrew: boolean;

  attendance: AttendancePhase;
  expectedCount: number | null;
  presentCount: number | null;
  shortfallCount: number;
  arrivalConfirmedAt: string | null;
  shiftEndedAt: string | null;
  checkoutMissing: boolean;
  flaggedForReview: boolean;
  flagReason: string | null;
  disputeNote: string | null;

  canRespond: boolean;
  mustChooseShortfall: boolean;

  settlement: DaySettlementView | null;
  canConfirmSettled: boolean;
  hasCustomerConfirmedSettlement: boolean;
  isSettlementUnproven: boolean;

  perWorkerLabel: string;
  standardDayHours: number | null;
  overtimeHourlyLabel: string | null;
}

function toShortfallChoice(value: ShortfallChoice | ""): ShortfallChoice | null {
  return value === "" ? null : value;
}

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
            shortfallChoice: toShortfallChoice(settlement.shortfall_choice),
            makeGoodRequestedAt: formatInstant(settlement.make_good_requested_at),
            supervisorConfirmedAt: formatInstant(settlement.supervisor_confirmed_at),
            customerConfirmedAt: formatInstant(settlement.customer_confirmed_at),
            settledAt: formatInstant(settlement.settled_at),
            paymentLink: settlementPaymentLink(day),
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

export function rupeesToPaise(typed: string): number | null {
  const digits = typed.replace(/[\s,]/g, "");
  if (digits === "") return null;
  if (!/^\d{1,7}$/.test(digits)) return null;
  return Number(digits) * 100;
}

export function isUsableRupeeInput(typed: string): boolean {
  return typed.trim() === "" || rupeesToPaise(typed) !== null;
}


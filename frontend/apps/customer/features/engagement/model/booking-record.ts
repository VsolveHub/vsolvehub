export type LeadOnlyHubPhase = "active" | "completion" | "done";

export function leadOnlyHubPhase(status: string): LeadOnlyHubPhase {
  if (status === "COMPLETING") return "completion";
  if (status === "COMPLETED" || status === "WARRANTY" || status === "CLOSED") return "done";
  return "active";
}

interface CrewPaymentRecordSource {
  crewTerms: {
    totalCustomerLabel: string;
    leadReceiptLabel: string;
  } | null;
  stages: readonly {
    stageId: string;
    label: string;
    status: string;
    shiftSummary: {
      settlementStatus: string;
      chip: { label: string };
    } | null;
  }[];
}

export interface CrewPaymentDay {
  stageId: string;
  label: string;
  confirmed: boolean;
  statusLabel: string;
}

export interface CrewPaymentRecord {
  totalLabel: string;
  directAmountLabel: string;
  allDaysConfirmed: boolean;
  statusLabel: string;
  days: readonly CrewPaymentDay[];
}

export function toCrewPaymentRecord(view: CrewPaymentRecordSource): CrewPaymentRecord | null {
  if (view.crewTerms === null) return null;

  const days = view.stages
    .filter((stage) => stage.status !== "CANCELLED" && stage.shiftSummary !== null)
    .map((stage): CrewPaymentDay => ({
      stageId: stage.stageId,
      label: stage.label,
      confirmed: stage.shiftSummary?.settlementStatus === "SETTLED",
      statusLabel: stage.shiftSummary?.chip.label ?? "Not confirmed",
    }));
  const confirmedDays = days.filter((day) => day.confirmed).length;
  const allDaysConfirmed = days.length > 0 && confirmedDays === days.length;
  const statusLabel = allDaysConfirmed
    ? "Confirmed paid"
    : confirmedDays > 0
      ? `${confirmedDays} of ${days.length} days confirmed`
      : "Awaiting day-by-day confirmation";

  return {
    totalLabel: view.crewTerms.totalCustomerLabel,
    directAmountLabel: view.crewTerms.leadReceiptLabel,
    allDaysConfirmed,
    statusLabel,
    days,
  };
}

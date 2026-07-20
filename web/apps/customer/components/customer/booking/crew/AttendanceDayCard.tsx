import { CREW_DAY_STATUS_LABELS } from "@/lib/crew/constants";
import { fmtDate } from "./primitives";
import { AttendanceList } from "./AttendanceList";
import { RescheduleControl } from "./RescheduleControl";
import type { Day } from "./types";

type Props = {
  day: Day;
  idx: number;
  tomorrowISO: string;
  rescheduleId: string | null;
  rescheduleDate: string;
  rescheduleMsg: string | null;
  onStartReschedule: (dayId: string) => void;
  onChangeDate: (val: string) => void;
  onSubmitReschedule: (dayId: string) => void;
  onCancelReschedule: () => void;
};

export function AttendanceDayCard({
  day,
  idx,
  tomorrowISO,
  rescheduleId,
  rescheduleDate,
  rescheduleMsg,
  onStartReschedule,
  onChangeDate,
  onSubmitReschedule,
  onCancelReschedule,
}: Props) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>Day {idx + 1} · {fmtDate(day.date)}</span>
        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: day.status === "DAY_DONE" || day.status === "APPROVED" ? "#059669" : "var(--color-brand)" }}>
          {CREW_DAY_STATUS_LABELS[day.status] ?? day.status}
        </span>
      </div>

      <AttendanceList attendance={day.attendance} />

      <RescheduleControl
        day={day}
        tomorrowISO={tomorrowISO}
        rescheduleId={rescheduleId}
        rescheduleDate={rescheduleDate}
        rescheduleMsg={rescheduleMsg}
        onStartReschedule={onStartReschedule}
        onChangeDate={onChangeDate}
        onSubmitReschedule={onSubmitReschedule}
        onCancelReschedule={onCancelReschedule}
      />
    </div>
  );
}

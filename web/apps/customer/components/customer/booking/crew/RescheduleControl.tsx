import { fmtDate } from "./primitives";
import type { Day } from "./types";

type Props = {
  day: Day;
  tomorrowISO: string;
  rescheduleId: string | null;
  rescheduleDate: string;
  rescheduleMsg: string | null;
  onStartReschedule: (dayId: string) => void;
  onChangeDate: (val: string) => void;
  onSubmitReschedule: (dayId: string) => void;
  onCancelReschedule: () => void;
};

export function RescheduleControl({
  day,
  tomorrowISO,
  rescheduleId,
  rescheduleDate,
  rescheduleMsg,
  onStartReschedule,
  onChangeDate,
  onSubmitReschedule,
  onCancelReschedule,
}: Props) {
  if (day.rescheduleToDate) {
    return (
      <p style={{ margin: "0.4rem 0 0 0", fontSize: "0.74rem", color: "#b45309" }}>
        Reschedule to {fmtDate(day.rescheduleToDate)} — awaiting crew confirmation
      </p>
    );
  }
  if (!day.canReschedule) return null;

  if (rescheduleId !== day.id) {
    return (
      <button type="button" onClick={() => onStartReschedule(day.id)} style={{ marginTop: "0.4rem", background: "transparent", border: "none", color: "var(--color-brand)", fontSize: "0.74rem", fontWeight: 700, cursor: "pointer", padding: 0, textAlign: "left" }}>
        Reschedule this day
      </button>
    );
  }

  return (
    <div style={{ marginTop: "0.4rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
      <div style={{ display: "flex", gap: "0.4rem" }}>
        <input
          type="date"
          min={tomorrowISO}
          value={rescheduleDate}
          onChange={(e) => onChangeDate(e.target.value)}
          style={{ flex: 1, border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.4rem", fontSize: "0.78rem" }}
        />
        <button type="button" onClick={() => onSubmitReschedule(day.id)} style={{ background: "var(--color-brand)", color: "white", border: "none", borderRadius: 8, padding: "0 0.9rem", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}>
          Move
        </button>
        <button type="button" onClick={onCancelReschedule} style={{ background: "transparent", border: "1px solid var(--color-border)", borderRadius: 8, padding: "0 0.6rem", cursor: "pointer", color: "#71717a" }}>
          ✕
        </button>
      </div>
      {rescheduleMsg ? <p style={{ margin: 0, fontSize: "0.72rem", color: "#dc2626" }}>{rescheduleMsg}</p> : null}
    </div>
  );
}

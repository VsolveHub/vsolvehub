import { crewRoleLabel, CREW_DAY_STATUS_LABELS } from "@/lib/crew/constants";
import { fmtDate, fmtTime } from "./primitives";
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
    <div className="vsh-card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>Day {idx + 1} · {fmtDate(day.date)}</span>
        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: day.status === "DAY_DONE" || day.status === "APPROVED" ? "#059669" : "var(--color-brand)" }}>
          {CREW_DAY_STATUS_LABELS[day.status] ?? day.status}
        </span>
      </div>
      {day.attendance.length === 0 ? (
        <p style={{ margin: 0, fontSize: "0.78rem", color: "#a1a1aa" }}>Not started yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          {day.attendance.map((a) => (
            <div key={a.memberId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem" }}>
              <span style={{ color: "#3f3f46" }}>{a.name} · {crewRoleLabel(a.role)}</span>
              <span style={{ color: a.clockOutAt ? "#71717a" : "#059669", fontWeight: 600 }}>
                {a.clockOutAt ? `${fmtTime(a.clockInAt)} – ${fmtTime(a.clockOutAt)}` : `In ${fmtTime(a.clockInAt)}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Reschedule control */}
      {day.rescheduleToDate ? (
        <p style={{ margin: "0.4rem 0 0 0", fontSize: "0.74rem", color: "#b45309" }}>
          Reschedule to {fmtDate(day.rescheduleToDate)} — awaiting crew confirmation
        </p>
      ) : day.canReschedule ? (
        rescheduleId === day.id ? (
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
        ) : (
          <button type="button" onClick={() => onStartReschedule(day.id)} style={{ marginTop: "0.4rem", background: "transparent", border: "none", color: "var(--color-brand)", fontSize: "0.74rem", fontWeight: 700, cursor: "pointer", padding: 0, textAlign: "left" }}>
            Reschedule this day
          </button>
        )
      ) : null}
    </div>
  );
}

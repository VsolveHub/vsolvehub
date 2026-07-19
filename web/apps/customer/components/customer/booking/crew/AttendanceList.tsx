import { crewRoleLabel } from "@/lib/crew/constants";
import { fmtTime } from "./primitives";
import type { Attendance } from "./types";

export function AttendanceList({ attendance }: { attendance: Attendance[] }) {
  if (attendance.length === 0) {
    return <p style={{ margin: 0, fontSize: "0.78rem", color: "#a1a1aa" }}>Not started yet.</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
      {attendance.map((a) => (
        <div key={a.memberId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem" }}>
          <span style={{ color: "#3f3f46" }}>{a.name} · {crewRoleLabel(a.role)}</span>
          <span style={{ color: a.clockOutAt ? "#71717a" : "#059669", fontWeight: 600 }}>
            {a.clockOutAt ? `${fmtTime(a.clockInAt)} – ${fmtTime(a.clockOutAt)}` : `In ${fmtTime(a.clockInAt)}`}
          </span>
        </div>
      ))}
    </div>
  );
}

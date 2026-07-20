import { CREW_STATUS_LABELS, CREW_STATUS_MESSAGES } from "@/lib/crew/constants";
import { AttendanceDayCard } from "./AttendanceDayCard";
import type { CrewTrackingData } from "./types";

type Props = {
  booking: CrewTrackingData;
  timeline: readonly string[];
  currentStep: number;
  tomorrowISO: string;
  rescheduleId: string | null;
  rescheduleDate: string;
  rescheduleMsg: string | null;
  onStartReschedule: (dayId: string) => void;
  onChangeDate: (val: string) => void;
  onSubmitReschedule: (dayId: string) => void;
  onCancelReschedule: () => void;
};

export function AssignedCrewSection({
  booking,
  timeline,
  currentStep,
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
    <>
      {booking.crew && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm" style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--color-brand-light)", color: "var(--color-brand)", display: "grid", placeItems: "center", fontWeight: 800, fontSize: "1.2rem" }}>
            {booking.crew.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem" }}>{booking.crew.name}</p>
            <p style={{ margin: "0.125rem 0 0 0", fontSize: "0.78rem", color: "#71717a" }}>
              ★ {booking.crew.rating.toFixed(1)} · Lead: {booking.crew.leadName ?? "—"}
            </p>
          </div>
          {booking.crew.leadPhone && (
            <a href={`tel:${booking.crew.leadPhone}`} className="inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium transition-colors disabled:opacity-60 px-4 py-2.5 text-sm border border-gray-200 bg-white text-gray-900 hover:bg-gray-50" style={{ borderRadius: 12, padding: "0.5rem 0.9rem", fontSize: "0.8rem", fontWeight: 700 }}>
              Call
            </a>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm" style={{ background: "var(--color-brand)", color: "white" }}>
        <p style={{ margin: 0, fontWeight: 800, fontSize: "1rem" }}>{CREW_STATUS_LABELS[booking.status] ?? booking.status}</p>
        <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.8rem", opacity: 0.9 }}>{CREW_STATUS_MESSAGES[booking.status] ?? booking.message}</p>
      </div>

      <div style={{ display: "flex", gap: "0.4rem" }}>
        {timeline.map((s, i) => (
          <div key={s} style={{ flex: 1, height: 5, borderRadius: 99, background: i <= currentStep ? "var(--color-brand)" : "#e4e4e7" }} />
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: "0.9rem" }}>Daily attendance</p>
        {booking.days.map((day, idx) => (
          <AttendanceDayCard
            key={day.id}
            day={day}
            idx={idx}
            tomorrowISO={tomorrowISO}
            rescheduleId={rescheduleId}
            rescheduleDate={rescheduleDate}
            rescheduleMsg={rescheduleMsg}
            onStartReschedule={onStartReschedule}
            onChangeDate={onChangeDate}
            onSubmitReschedule={onSubmitReschedule}
            onCancelReschedule={onCancelReschedule}
          />
        ))}
      </div>
    </>
  );
}

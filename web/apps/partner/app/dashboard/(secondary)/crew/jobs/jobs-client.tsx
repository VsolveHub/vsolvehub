"use client";

import { MapPin, CheckCircle2, Smartphone, CalendarClock, UserPlus, X, CalendarPlus } from "lucide-react";
import { Button } from "@vsolve/ui";
import { confirmReschedule, declineReschedule, assignMemberAction, unassignMemberAction, requestExtension } from "./actions";

export type RosterMember = { id: string; name: string; role: string; roleLabel: string };
type Attendance = { memberId: string; role: string; clockInAt: string; clockOutAt: string | null };
type Day = { id: string; date: string; status: string; rescheduleToDate: string | null; attendance: Attendance[] };
type AssignMember = { id: string; name: string; assigned: boolean; busy: boolean };
type AssignRole = { roleId: string; label: string; count: number; members: AssignMember[] };
export type JobVM = {
  id: string;
  ref: string;
  location: string;
  status: string;
  startConfirmed: boolean;
  durationDays: number;
  amountRupees: number;
  roles: { roleId: string; label: string; count: number }[];
  assignable: boolean;
  assignRoles: AssignRole[];
  extensionPending: number;
  days: Day[];
};

const STATUS_LABEL: Record<string, string> = {
  CREW_ASSIGNED: "Assigned · awaiting payment",
  CREW_EN_ROUTE: "On the way",
  CREW_WORKING: "Working",
};

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};
const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : null);

function DayBlock({ day, idx, roles, names }: { day: Day; idx: number; roles: JobVM["roles"]; names: Map<string, string> }) {
  const finished = day.status === "DAY_DONE" || day.status === "APPROVED";
  const present = new Set(day.attendance.map((a) => a.memberId)).size;
  const totalSlots = roles.reduce((s, r) => s + r.count, 0);
  return (
    <div className="rounded-2xl bg-surface-muted p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink-900">Day {idx + 1} · {fmtDate(day.date)}</p>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${finished ? "bg-green-50 text-green-700" : "bg-brand-50 text-brand-700"}`}>
          {finished ? "Day finished" : `${present}/${totalSlots} present`}
        </span>
      </div>
      {day.attendance.length === 0 ? (
        <p className="text-xs text-gray-500">No one clocked in yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {day.attendance.map((a) => {
            const done = Boolean(a.clockOutAt);
            return (
              <li key={a.memberId} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-ink-900">{names.get(a.memberId) ?? "Member"}</span>
                <span className={`inline-flex items-center gap-1 text-xs font-medium ${done ? "text-gray-500" : "text-green-700"}`}>
                  {done ? (
                    <><CheckCircle2 className="h-3.5 w-3.5" /> {fmtTime(a.clockInAt)} – {fmtTime(a.clockOutAt)}</>
                  ) : (
                    <>● in {fmtTime(a.clockInAt)}</>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {day.rescheduleToDate ? (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
            <CalendarClock className="h-3.5 w-3.5" /> Customer asked to move this day to {fmtDate(day.rescheduleToDate)}
          </p>
          <div className="mt-2 flex gap-2">
            <form action={confirmReschedule} className="flex-1">
              <input type="hidden" name="dayId" value={day.id} />
              <Button type="submit" size="sm" className="w-full">Confirm</Button>
            </form>
            <form action={declineReschedule}>
              <input type="hidden" name="dayId" value={day.id} />
              <Button type="submit" variant="outline" size="sm">Decline</Button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function JobCard({ job, names }: { job: JobVM; names: Map<string, string> }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-ink-900">#{job.ref}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
            <MapPin className="h-3.5 w-3.5" /> {job.location} · {job.durationDays} {job.durationDays === 1 ? "day" : "days"}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {job.roles.map((r) => (
              <span key={r.roleId} className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink-900">
                {r.label} × {r.count}
              </span>
            ))}
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-surface-muted px-2.5 py-1 text-[11px] font-semibold text-ink-900">
          {STATUS_LABEL[job.status] ?? job.status}
        </span>
      </div>

      {job.assignable && job.assignRoles.length > 0 ? <AssignSection job={job} /> : null}

      <div className="mb-3 flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-xs text-brand-800">
        <Smartphone className="h-4 w-4 shrink-0" />
        Your crew clocks in on their own phones using the customer's code — track it live below.
      </div>

      <div className="space-y-3">
        {job.days.map((d, i) => (
          <DayBlock key={d.id} day={d} idx={i} roles={job.roles} names={names} />
        ))}
      </div>

      {job.status === "CREW_WORKING" ? (
        <div className="mt-3 rounded-2xl border border-border bg-white p-3">
          {job.extensionPending > 0 ? (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
              <CalendarPlus className="h-3.5 w-3.5" /> Requested +{job.extensionPending}{" "}
              {job.extensionPending === 1 ? "day" : "days"} — awaiting customer approval
            </p>
          ) : (
            <form action={requestExtension} className="flex items-center gap-2">
              <input type="hidden" name="bookingId" value={job.id} />
              <span className="text-xs font-semibold text-ink-900">Need more days?</span>
              <input
                name="extraDays"
                type="number"
                min={1}
                max={7}
                defaultValue={1}
                className="h-9 w-14 rounded-lg border border-border bg-white px-2 text-center text-sm outline-none focus:border-brand-500"
              />
              <Button type="submit" variant="outline" size="sm">
                <CalendarPlus className="h-4 w-4" /> Request
              </Button>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}

function AssignSection({ job }: { job: JobVM }) {
  return (
    <div className="mb-3 rounded-2xl border border-brand-200 bg-brand-50/60 p-3">
      <p className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
        <UserPlus className="h-4 w-4 text-brand-600" /> Assign your crew
      </p>
      <p className="mb-3 mt-0.5 text-xs text-gray-600">Pick exactly who goes — only assigned members can clock in.</p>
      <div className="space-y-3">
        {job.assignRoles.map((r) => {
          const assignedCount = r.members.filter((m) => m.assigned).length;
          const full = assignedCount >= r.count;
          return (
            <div key={r.roleId}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-900">{r.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${full ? "bg-green-50 text-green-700" : "bg-surface-muted text-gray-500"}`}>
                  {assignedCount}/{r.count}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {r.members.length === 0 ? (
                  <span className="text-[11px] text-gray-400">No {r.label.toLowerCase()} in your roster yet.</span>
                ) : (
                  r.members.map((m) =>
                    m.assigned ? (
                      <form key={m.id} action={unassignMemberAction}>
                        <input type="hidden" name="bookingId" value={job.id} />
                        <input type="hidden" name="memberId" value={m.id} />
                        <button type="submit" className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white">
                          {m.name} <X className="h-3 w-3" />
                        </button>
                      </form>
                    ) : (
                      <form key={m.id} action={assignMemberAction}>
                        <input type="hidden" name="bookingId" value={job.id} />
                        <input type="hidden" name="memberId" value={m.id} />
                        <button
                          type="submit"
                          disabled={m.busy || full}
                          className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-2.5 py-1 text-[11px] font-medium text-ink-900 hover:border-brand-400 disabled:opacity-40"
                          title={m.busy ? "On another job those days" : undefined}
                        >
                          {m.name}{m.busy ? " · busy" : ""}
                        </button>
                      </form>
                    ),
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function JobsClient({ jobs, roster }: { jobs: JobVM[]; roster: RosterMember[] }) {
  const names = new Map(roster.map((m) => [m.id, m.name]));
  if (jobs.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-white px-4 py-8 text-center text-sm text-gray-500">
        No active crew jobs. When a customer books your crew, it shows up here.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} names={names} />
      ))}
    </div>
  );
}

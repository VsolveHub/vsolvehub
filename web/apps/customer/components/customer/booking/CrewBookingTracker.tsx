"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/format";
import { PaymentSheet } from "./PaymentSheet";
import {
  useCancelCrewBookingMutation,
  usePayCrewBookingMutation,
  usePostCrewActionMutation,
  useApproveCrewExtensionMutation,
  useRescheduleCrewBookingMutation,
  useRetryCrewBookingMutation,
} from "@/lib/query/hooks";
import {
  CREW_STATUS_LABELS,
  CREW_STATUS_MESSAGES,
  CREW_DAY_STATUS_LABELS,
  CREW_TIMELINE,
  CREW_AUTO_TIMELINE,
  crewRoleLabel,
} from "@/lib/crew/constants";

type Attendance = {
  memberId: string;
  name: string;
  role: string;
  clockInAt: string | null;
  clockOutAt: string | null;
};
type Day = {
  id: string;
  date: string;
  status: string;
  earnedPaise: number;
  approvedAt: string | null;
  rescheduleToDate: string | null;
  canReschedule: boolean;
  attendance: Attendance[];
};

export type CrewTrackingData = {
  bookingRef: string;
  status: string;
  message: string;
  assignmentMode: string;
  roles: { roleId: string; count: number }[];
  service: { name: string };
  crew: { id: string; name: string; rating: number; leadName: string | null; leadPhone: string | null } | null;
  days: Day[];
  durationDays: number;
  startDate: string;
  address: string;
  quotedAmount: number;
  finalAmountPaise: number;
  paymentStatus: string;
  escrowPaise: number;
  refundedPaise: number;
  needsEscrowPayment: boolean;
  canReportNoShow: boolean;
  canDispute: boolean;
  isDisputed: boolean;
  extensionDays: number;
  extensionChargePaise: number;
  started: boolean;
  startOtp: string | null;
  endOtp: string | null;
  cancellable: boolean;
  cancelPreview: { feePaise: number; finalPaise: number; free: boolean } | null;
  cancelFeePaise: number;
  cancelledAt: string | null;
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
}
function fmtTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : null;
}

function Row({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: "0.78rem", color: "#71717a" }}>{label}</span>
      <span style={{ fontSize: bold ? "1.05rem" : "0.85rem", fontWeight: bold ? 800 : 600, color: tone ?? (bold ? "var(--color-brand)" : "#3f3f46") }}>
        {value}
      </span>
    </div>
  );
}

function OtpCard({ label, code, hint }: { label: string; code: string; hint: string }) {
  return (
    <div className="vsh-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", border: "1px dashed var(--color-brand)", background: "var(--color-brand-light)" }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: "0.72rem", fontWeight: 700, color: "var(--color-brand)", textTransform: "uppercase" }}>{label}</p>
        <p style={{ margin: "0.1rem 0 0 0", fontSize: "0.72rem", color: "#71717a" }}>{hint}</p>
      </div>
      <span style={{ fontSize: "1.5rem", fontWeight: 900, letterSpacing: "0.25rem", color: "var(--color-brand)" }}>{code}</span>
    </div>
  );
}

export function CrewBookingTracker({ booking, onRefresh }: { booking: CrewTrackingData; onRefresh: () => void }) {
  const router = useRouter();
  const cancelMutation = useCancelCrewBookingMutation(booking.bookingRef);
  const payMutation = usePayCrewBookingMutation(booking.bookingRef);
  const postActionMutation = usePostCrewActionMutation(booking.bookingRef);
  const extensionMutation = useApproveCrewExtensionMutation(booking.bookingRef);
  const rescheduleMutation = useRescheduleCrewBookingMutation(booking.bookingRef);
  const retryMutation = useRetryCrewBookingMutation(booking.bookingRef);

  const cancelling = cancelMutation.isPending;
  const busyF = postActionMutation.isPending || rescheduleMutation.isPending;
  const retrying = retryMutation.isPending;

  const [showPay, setShowPay] = useState(false);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleMsg, setRescheduleMsg] = useState<string | null>(null);
  const [showExtPay, setShowExtPay] = useState(false);
  const tomorrowISO = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const isSearching = booking.status === "SEARCHING_CREW";
  const isFailed = booking.status === "NO_CREW_FOUND";
  const isCancelled = booking.status === "CANCELLED";
  const needsEscrow = booking.needsEscrowPayment;
  const escrowHeld = booking.paymentStatus === "ESCROW_HELD";
  const settled = booking.paymentStatus === "PAID";

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push("/profile/bookings");
  }

  function cancel() {
    const p = booking.cancelPreview;
    const msg = !p || p.free
      ? "Cancel this booking? No fee applies."
      : `Cancelling now has a fee of ${formatPrice(p.finalPaise)} (crew already mobilized/working). Continue?`;
    if (!window.confirm(msg)) return;
    cancelMutation.mutate(undefined, {
      onSuccess: () => {
        onRefresh();
      },
    });
  }

  async function payNow(method: string) {
    await payMutation.mutateAsync(method);
    onRefresh();
  }

  function post(path: string, body?: unknown) {
    postActionMutation.mutate({ path, body }, {
      onSuccess: () => {
        onRefresh();
      },
    });
  }

  function reportNoShow() {
    if (!window.confirm("Report that the crew didn't show up? We'll find you another crew.")) return;
    post("no-show");
  }
  function reportIssue() {
    const reason = window.prompt("Briefly describe the issue. We'll hold the payment and review it.");
    if (reason === null) return;
    post("dispute", { reason });
  }
  async function approveExtension(method: string) {
    await extensionMutation.mutateAsync(method);
    onRefresh();
  }

  function submitReschedule(dayId: string) {
    if (!rescheduleDate) return;
    setRescheduleMsg(null);
    rescheduleMutation.mutate({ dayId, newDate: rescheduleDate }, {
      onSuccess: () => {
        setRescheduleId(null);
        setRescheduleDate("");
        onRefresh();
      },
      onError: (err: any) => {
        setRescheduleMsg(err.message || "Could not reschedule");
      },
    });
  }
  const timeline: readonly string[] = booking.assignmentMode === "auto" ? CREW_AUTO_TIMELINE : CREW_TIMELINE;
  const currentStep = Math.max(0, timeline.indexOf(booking.status));
  const activeRoles = booking.roles.filter((r) => r.count > 0);

  function retry() {
    retryMutation.mutate(undefined, {
      onSuccess: () => {
        onRefresh();
      },
    });
  }

  return (
    <div className="vsh-simulator-frame">
      <div className="vsh-navbar">
        <button type="button" className="vsh-nav-back" onClick={goBack} aria-label="Back">
          ←
        </button>
        <span className="vsh-nav-title">{booking.service.name} · Team</span>
      </div>

      <div className="vsh-content" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* Requested crew */}
        <div className="vsh-card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#a1a1aa", textTransform: "uppercase" }}>
            Crew requirement · {booking.durationDays} {booking.durationDays === 1 ? "day" : "days"}
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
            {activeRoles.map((r) => (
              <span key={r.roleId} style={{ background: "var(--color-brand-light)", color: "var(--color-brand)", fontSize: "0.72rem", fontWeight: 700, padding: "0.15rem 0.55rem", borderRadius: 99 }}>
                {crewRoleLabel(r.roleId)} × {r.count}
              </span>
            ))}
          </div>
        </div>

        {/* OTP codes — the customer reads these to crew members, who enter them on their phones */}
        {booking.startOtp && (
          <OtpCard label="Start code" code={booking.startOtp} hint="Share with your crew so each member can clock in." />
        )}
        {booking.endOtp && (
          <OtpCard label="Finish code" code={booking.endOtp} hint="Share once all work is done so the crew can finish." />
        )}

        {/* Escrow: pay the estimate to confirm the crew before work can start */}
        {needsEscrow && (
          <div className="vsh-card" style={{ border: "1px solid var(--color-brand)", background: "var(--color-brand-light)" }}>
            <p style={{ margin: 0, fontWeight: 800, fontSize: "0.95rem", color: "var(--color-brand)" }}>Confirm your crew</p>
            <p style={{ margin: "0.25rem 0 0.75rem 0", fontSize: "0.8rem", color: "#52525b" }}>
              Pay {formatPrice(booking.quotedAmount)} into secure escrow to confirm. It's only released as work is done —
              no-shows are refunded automatically.
            </p>
            <button
              type="button"
              onClick={() => setShowPay(true)}
              style={{ width: "100%", background: "var(--color-brand)", color: "white", border: "none", borderRadius: 12, padding: "0.8rem", fontWeight: 800, fontSize: "0.9rem", cursor: "pointer" }}
            >
              Pay {formatPrice(booking.quotedAmount)} to confirm
            </button>
          </div>
        )}

        {/* Extension request from the crew lead */}
        {booking.extensionDays > 0 && (
          <div className="vsh-card" style={{ border: "1px solid #f59e0b", background: "#fffbeb" }}>
            <p style={{ margin: 0, fontWeight: 800, fontSize: "0.95rem", color: "#b45309" }}>
              Crew requested {booking.extensionDays} more {booking.extensionDays === 1 ? "day" : "days"}
            </p>
            <p style={{ margin: "0.25rem 0 0.75rem 0", fontSize: "0.8rem", color: "#52525b" }}>
              Approve to add the {booking.extensionDays === 1 ? "day" : "days"} at the same rates —{" "}
              {formatPrice(booking.extensionChargePaise)} more into escrow.
            </p>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="button" onClick={() => post("extension", { action: "decline" })} disabled={busyF} style={{ flex: 1, background: "transparent", border: "1px solid var(--color-border)", borderRadius: 12, padding: "0.65rem", fontWeight: 700, fontSize: "0.82rem", color: "#71717a", cursor: "pointer" }}>
                Decline
              </button>
              <button type="button" onClick={() => setShowExtPay(true)} disabled={busyF} style={{ flex: 1, background: "var(--color-brand)", color: "white", border: "none", borderRadius: 12, padding: "0.65rem", fontWeight: 800, fontSize: "0.82rem", cursor: "pointer" }}>
                Approve & pay
              </button>
            </div>
          </div>
        )}

        {/* Crew no-show */}
        {booking.canReportNoShow && (
          <div className="vsh-card" style={{ border: "1px solid #fecaca" }}>
            <p style={{ margin: 0, fontSize: "0.82rem", color: "#3f3f46" }}>Crew hasn't turned up?</p>
            <button type="button" onClick={reportNoShow} disabled={busyF} style={{ marginTop: "0.5rem", background: "transparent", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 12, padding: "0.55rem 1rem", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" }}>
              Report a no-show
            </button>
          </div>
        )}

        {/* Searching (auto) */}
        {isSearching && (
          <div className="vsh-card" style={{ textAlign: "center", padding: "1.75rem 1.25rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
            <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.5rem" }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--color-brand)", animation: `vsh-bounce 0.6s ${i * 0.15}s infinite alternate` }} />
              ))}
            </div>
            <h3 style={{ margin: 0, fontWeight: 800, fontSize: "1.05rem" }}>Finding a crew…</h3>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "#71717a" }}>{booking.message}</p>
            <style jsx>{`@keyframes vsh-bounce { to { transform: translateY(-8px); opacity: 0.4; } }`}</style>
          </div>
        )}

        {/* No crew found (auto) */}
        {isFailed && (
          <div className="vsh-card" style={{ textAlign: "center", padding: "1.5rem 1.25rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.6rem" }}>
            <span style={{ fontSize: "2rem" }}>😕</span>
            <h3 style={{ margin: 0, fontWeight: 800, fontSize: "1rem" }}>No crew accepted in time</h3>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "#71717a" }}>{booking.message}</p>
            <button
              type="button"
              onClick={retry}
              disabled={retrying}
              style={{ marginTop: "0.5rem", background: "var(--color-brand)", color: "white", border: "none", borderRadius: 12, padding: "0.65rem 1.5rem", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", opacity: retrying ? 0.6 : 1 }}
            >
              {retrying ? "Resending…" : "Retry request"}
            </button>
          </div>
        )}

        {/* Assigned crew + progress */}
        {!isSearching && !isFailed && (
          <>
            {booking.crew && (
              <div className="vsh-card" style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
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
                  <a href={`tel:${booking.crew.leadPhone}`} className="btn btn-secondary" style={{ borderRadius: 12, padding: "0.5rem 0.9rem", fontSize: "0.8rem", fontWeight: 700 }}>
                    Call
                  </a>
                )}
              </div>
            )}

            <div className="vsh-card" style={{ background: "var(--color-brand)", color: "white" }}>
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
                <div key={day.id} className="vsh-card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
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
                            onChange={(e) => setRescheduleDate(e.target.value)}
                            style={{ flex: 1, border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.4rem", fontSize: "0.78rem" }}
                          />
                          <button type="button" onClick={() => submitReschedule(day.id)} style={{ background: "var(--color-brand)", color: "white", border: "none", borderRadius: 8, padding: "0 0.9rem", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}>
                            Move
                          </button>
                          <button type="button" onClick={() => { setRescheduleId(null); setRescheduleMsg(null); }} style={{ background: "transparent", border: "1px solid var(--color-border)", borderRadius: 8, padding: "0 0.6rem", cursor: "pointer", color: "#71717a" }}>
                            ✕
                          </button>
                        </div>
                        {rescheduleMsg ? <p style={{ margin: 0, fontSize: "0.72rem", color: "#dc2626" }}>{rescheduleMsg}</p> : null}
                      </div>
                  ) : (
                      <button type="button" onClick={() => { setRescheduleId(day.id); setRescheduleDate(""); setRescheduleMsg(null); }} style={{ marginTop: "0.4rem", background: "transparent", border: "none", color: "var(--color-brand)", fontSize: "0.74rem", fontWeight: 700, cursor: "pointer", padding: 0, textAlign: "left" }}>
                        Reschedule this day
                      </button>
                    )
                  ) : null}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Amount / escrow summary */}
        <div className="vsh-card" style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {settled ? (
            <>
              <Row label={isCancelled ? "Charged (incl. fee)" : "Charged for work done"} value={formatPrice(booking.finalAmountPaise)} bold />
              {booking.refundedPaise > 0 ? (
                <Row label="Refunded to you" value={`− ${formatPrice(booking.refundedPaise)}`} tone="#16a34a" />
              ) : null}
              <div style={{ borderTop: "1px solid #f1f0f5", marginTop: "0.25rem", paddingTop: "0.4rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.78rem", color: "#71717a" }}>Paid from escrow</span>
                <span style={{ fontSize: "0.82rem", fontWeight: 800, color: "#16a34a" }}>✓ Settled</span>
              </div>
            </>
          ) : escrowHeld ? (
            <>
              <Row label={`Held in escrow · ${booking.durationDays} ${booking.durationDays === 1 ? "day" : "days"}`} value={formatPrice(booking.escrowPaise)} bold />
              <p style={{ margin: 0, fontSize: "0.72rem", color: "#16a34a" }}>
                ✓ Secured — released as work completes; unused amount is refunded.
              </p>
            </>
          ) : (
            <>
              <Row label={isSearching ? "Estimated total" : "To pay"} value={formatPrice(booking.quotedAmount)} bold />
              <p style={{ margin: 0, fontSize: "0.72rem", color: "#b45309" }}>
                {isSearching ? "Charged into escrow once a crew accepts." : "Pay into escrow to confirm your crew."}
              </p>
            </>
          )}
        </div>

        {/* Dispute (after completion) */}
        {booking.isDisputed && (
          <div className="vsh-card" style={{ border: "1px solid #f59e0b", background: "#fffbeb", fontSize: "0.82rem", color: "#b45309" }}>
            ⚠ Issue reported — the payment is on hold while our team reviews it.
          </div>
        )}
        {booking.canDispute && !booking.isDisputed && (
          <button
            type="button"
            onClick={reportIssue}
            disabled={busyF}
            style={{ background: "transparent", border: "1px solid var(--color-border)", color: "#71717a", borderRadius: 12, padding: "0.6rem", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" }}
          >
            Report an issue with this job
          </button>
        )}

        {/* Cancel */}
        {booking.cancellable && (
          <button
            type="button"
            onClick={cancel}
            disabled={cancelling}
            style={{ background: "transparent", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 12, padding: "0.6rem", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer", opacity: cancelling ? 0.6 : 1 }}
          >
            {cancelling
              ? "Cancelling…"
              : booking.cancelPreview && !booking.cancelPreview.free
                ? `Cancel booking · fee ${formatPrice(booking.cancelPreview.finalPaise)}`
                : "Cancel booking"}
          </button>
        )}
      </div>

      {showPay && (
        <PaymentSheet amountPaise={booking.quotedAmount} onClose={() => setShowPay(false)} onConfirm={payNow} />
      )}
      {showExtPay && (
        <PaymentSheet amountPaise={booking.extensionChargePaise} onClose={() => setShowExtPay(false)} onConfirm={approveExtension} />
      )}
    </div>
  );
}

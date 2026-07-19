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
import { CREW_TIMELINE, CREW_AUTO_TIMELINE, crewRoleLabel } from "@/lib/crew/constants";
import { OtpCard } from "./crew/primitives";
import { AssignedCrewSection } from "./crew/AssignedCrewSection";
import { EscrowSummaryCard } from "./crew/EscrowSummaryCard";
import {
  SearchingCard,
  NoCrewFoundCard,
  EscrowPaymentCard,
  ExtensionRequestCard,
  NoShowCard,
  DisputeSection,
  CancelButton,
} from "./crew/StatusCards";
import type { CrewTrackingData } from "./crew/types";

export type { CrewTrackingData };

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
    cancelMutation.mutate(undefined, { onSuccess: () => onRefresh() });
  }

  async function payNow(method: string) {
    await payMutation.mutateAsync(method);
    onRefresh();
  }

  function post(path: string, body?: unknown) {
    postActionMutation.mutate({ path, body }, { onSuccess: () => onRefresh() });
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
    retryMutation.mutate(undefined, { onSuccess: () => onRefresh() });
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
        {needsEscrow && <EscrowPaymentCard amountPaise={booking.quotedAmount} onPay={() => setShowPay(true)} />}

        {/* Extension request from the crew lead */}
        {booking.extensionDays > 0 && (
          <ExtensionRequestCard
            extensionDays={booking.extensionDays}
            extensionChargePaise={booking.extensionChargePaise}
            busy={busyF}
            onDecline={() => post("extension", { action: "decline" })}
            onApprove={() => setShowExtPay(true)}
          />
        )}

        {/* Crew no-show */}
        {booking.canReportNoShow && <NoShowCard busy={busyF} onReport={reportNoShow} />}

        {/* Searching (auto) */}
        {isSearching && <SearchingCard message={booking.message} />}

        {/* No crew found (auto) */}
        {isFailed && <NoCrewFoundCard message={booking.message} retrying={retrying} onRetry={retry} />}

        {/* Assigned crew + progress */}
        {!isSearching && !isFailed && (
          <AssignedCrewSection
            booking={booking}
            timeline={timeline}
            currentStep={currentStep}
            tomorrowISO={tomorrowISO}
            rescheduleId={rescheduleId}
            rescheduleDate={rescheduleDate}
            rescheduleMsg={rescheduleMsg}
            onStartReschedule={(dayId) => { setRescheduleId(dayId); setRescheduleDate(""); setRescheduleMsg(null); }}
            onChangeDate={setRescheduleDate}
            onSubmitReschedule={submitReschedule}
            onCancelReschedule={() => { setRescheduleId(null); setRescheduleMsg(null); }}
          />
        )}

        {/* Amount / escrow summary */}
        <EscrowSummaryCard booking={booking} isSearching={isSearching} isCancelled={isCancelled} escrowHeld={escrowHeld} settled={settled} />

        {/* Dispute (after completion) */}
        <DisputeSection isDisputed={booking.isDisputed} canDispute={booking.canDispute} busy={busyF} onReportIssue={reportIssue} />

        {/* Cancel */}
        <CancelButton cancellable={booking.cancellable} cancelling={cancelling} cancelPreview={booking.cancelPreview} onCancel={cancel} />
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

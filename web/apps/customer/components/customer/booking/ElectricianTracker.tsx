"use client";

import Link from "next/link";
import { useBookingLifecycle } from "@/lib/booking/useBookingLifecycle";
import type { Booking } from "@/lib/booking/types";
import { DesktopPanel } from "./electrician/DesktopPanel";
import { ActiveJobPanel } from "./electrician/ActiveJobPanel";
import { CompletedJobPanel } from "./electrician/CompletedJobPanel";
import { TeamTrackerView } from "./electrician/TeamTrackerView";
import { CompletedJobModal } from "./electrician/CompletedJobModal";
import { RevisedQuoteModal } from "./electrician/RevisedQuoteModal";
import { DetailsModal } from "./electrician/DetailsModal";
import { soloStepDetails, teamStepDetails } from "./electrician/steps";
import { useState } from "react";

type Props = {
  booking: Booking;
  onRefresh: () => void;
};

export function ElectricianTracker({ booking, onRefresh }: Props) {
  const {
    view: { status, currentStatusIndex, professional, isCompleted, isTeam },
    rating,
    setRating,
    review,
    setReview,
    reviewSubmitted,
    showDetailsModal,
    setShowDetailsModal,
    error,
    loading,
    cancelBooking,
    reviseAction,
    submitReview,
  } = useBookingLifecycle(booking, onRefresh);

  const [showCompletedModal, setShowCompletedModal] = useState(isCompleted);

  const getStepDetails = (stepKey: string, idx: number) =>
    soloStepDetails(stepKey, idx, currentStatusIndex, booking);
  const getTeamStepDetails = (stepKey: string, idx: number) =>
    teamStepDetails(stepKey, idx, currentStatusIndex);

  if (isTeam) {
    return (
      <TeamTrackerView
        booking={booking}
        professional={professional}
        isCompleted={isCompleted}
        currentStatusIndex={currentStatusIndex}
        getStepDetails={getTeamStepDetails}
        rating={rating}
        setRating={setRating}
        review={review}
        setReview={setReview}
        cancelBooking={cancelBooking}
        loading={loading}
      />
    );
  }

  const badge = isCompleted ? 12 : 11;
  const title = isCompleted ? "Job Completed" : "Live Tracking";

  return (
    <div className="flex w-full h-[100dvh] md:h-auto md:min-h-screen bg-gray-100 overflow-hidden text-gray-900">
      {/* Desktop view */}
      <div className="hidden md:flex w-full max-w-6xl mx-auto h-full p-6">
        <DesktopPanel
          booking={booking}
          professional={professional}
          status={status}
          currentStatusIndex={currentStatusIndex}
          getStepDetails={getStepDetails}
          onShowDetails={() => setShowDetailsModal(true)}
          loading={loading}
          reviseAction={reviseAction}
          rating={rating}
          setRating={setRating}
          review={review}
          setReview={setReview}
          reviewSubmitted={reviewSubmitted}
          error={error}
          submitReview={submitReview}
        />
      </div>

      {/* Mobile view wrapped */}
      <div className="flex md:hidden flex-col w-full h-full bg-white relative">
        {/* Header Bar */}
        <div className="flex items-center gap-3 px-4 py-3 bg-[var(--color-brand)] text-white shadow-sm select-none z-10">
          <Link href="/" className="text-xl leading-none text-white/80 hover:text-white cursor-pointer no-underline">
            ←
          </Link>
          <span className="font-black text-sm truncate uppercase tracking-widest">Booking Status</span>
        </div>

        {/* Numbered Step Progress Header */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-[var(--color-brand-light)] border-b border-[var(--color-brand)]/20 select-none z-10">
          <span className="w-5 h-5 flex items-center justify-center bg-[var(--color-brand)] text-white font-black rounded-full text-[10px] shadow-sm">
            {badge}
          </span>
          <span className="font-bold text-xs text-[var(--color-brand)] uppercase tracking-wider">{title}</span>
        </div>

        {/* Scrollable Tracker Content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 pb-24 bg-gray-50">
          {!isCompleted ? (
            <ActiveJobPanel
              booking={booking}
              professional={professional}
              status={status}
              currentStatusIndex={currentStatusIndex}
              getStepDetails={getStepDetails}
              loading={loading}
              reviseAction={reviseAction}
            />
          ) : (
            <CompletedJobPanel
              booking={booking}
              rating={rating}
              setRating={setRating}
              review={review}
              setReview={setReview}
              reviewSubmitted={reviewSubmitted}
              error={error}
              loading={loading}
              submitReview={submitReview}
              onShowDetails={() => setShowDetailsModal(true)}
            />
          )}
        </div>

        {/* Component Footer Bar */}
        {!isCompleted && (
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-150 flex gap-3 z-40 select-none shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
            <button type="button" onClick={cancelBooking} disabled={loading} className="flex-1 py-3 border border-gray-200 hover:bg-gray-50 text-gray-600 text-xs font-bold rounded-xl text-center cursor-pointer transition-colors disabled:opacity-50">
              Cancel Booking
            </button>
            <button type="button" className="flex-1 py-3 bg-[var(--color-brand)] hover:opacity-90 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-opacity shadow-md">
              💬 Chat with {professional?.name.split(" ")[0] || "Partner"}
            </button>
          </div>
        )}
      </div>

      {/* Celebratory Completion Modal Pop-up */}
      {isCompleted && showCompletedModal && (
        <CompletedJobModal
          booking={booking}
          professional={professional}
          rating={rating}
          setRating={setRating}
          review={review}
          setReview={setReview}
          reviewSubmitted={reviewSubmitted}
          error={error}
          loading={loading}
          submitReview={submitReview}
          onClose={() => setShowCompletedModal(false)}
        />
      )}

      {/* Technician Extra Parts Request Pop-up Modal */}
      {Boolean(booking.revisedAmountPaise) && (
        <RevisedQuoteModal
          booking={booking}
          professional={professional}
          loading={loading}
          onApprove={() => reviseAction("approve")}
          onDecline={() => reviseAction("decline")}
        />
      )}

      {/* Booking Details Modal Popup */}
      {showDetailsModal && (
        <DetailsModal booking={booking} professional={professional} onClose={() => setShowDetailsModal(false)} />
      )}
    </div>
  );
}

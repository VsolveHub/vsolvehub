"use client";

import Link from "next/link";
import { useBookingLifecycle } from "@/lib/booking/useBookingLifecycle";
import type { Booking } from "@/lib/booking/types";
import { DesktopPanel } from "./electrician/DesktopPanel";
import { ActiveJobPanel } from "./electrician/ActiveJobPanel";
import { CompletedJobPanel } from "./electrician/CompletedJobPanel";
import { TeamTrackerView } from "./electrician/TeamTrackerView";
import { DetailsModal } from "./electrician/DetailsModal";
import { soloStepDetails, teamStepDetails } from "./electrician/steps";

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
    <div className="flow-page-shell tracker-page-shell-v3">
      {/* Desktop view */}
      <DesktopPanel
        booking={booking}
        professional={professional}
        status={status}
        currentStatusIndex={currentStatusIndex}
        getStepDetails={getStepDetails}
        onShowDetails={() => setShowDetailsModal(true)}
      />

      {/* Mobile view wrapped */}
      <div className="tracker-mobile-view-v3 flex flex-col h-full">
        {/* Header Bar */}
        <div className="flex items-center gap-3 px-4 py-3 bg-blue-900 text-white shadow-sm select-none">
          <Link href="/" className="text-xl leading-none text-blue-200 hover:text-white cursor-pointer no-underline">
            ←
          </Link>
          <span className="font-semibold text-sm truncate">Booking Status</span>
        </div>

        {/* Numbered Step Progress Header */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 border-b border-blue-100/60 select-none">
          <span className="w-5 h-5 flex items-center justify-center bg-blue-600 text-white font-bold rounded-full text-[10px] shadow-sm">
            {badge}
          </span>
          <span className="font-bold text-xs text-blue-900">{title}</span>
        </div>

        {/* Scrollable Tracker Content */}
        <div className="flex-grow overflow-y-auto p-4 flex flex-col gap-4 pb-20">
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

        {/* Component Footer Bar (inside simulator frame, only when not completed) */}
        {!isCompleted && (
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 flex gap-3 z-40 select-none">
            <button type="button" onClick={cancelBooking} disabled={loading} className="flex-1 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-full text-center cursor-pointer transition-all disabled:opacity-50">
              Cancel Booking
            </button>
            <button type="button" className="flex-1 py-2.5 bg-purple-900 hover:bg-purple-950 text-white text-xs font-bold rounded-full flex items-center justify-center gap-1.5 cursor-pointer transition-all">
              💬 Chat with {professional?.name.split(" ")[0] || "Partner"}
            </button>
          </div>
        )}
      </div>

      {/* Booking Details Modal Popup */}
      {showDetailsModal && (
        <DetailsModal booking={booking} professional={professional} onClose={() => setShowDetailsModal(false)} />
      )}
    </div>
  );
}

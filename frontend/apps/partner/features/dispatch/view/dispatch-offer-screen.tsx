"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Zap,
  Clock,
  MapPin,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Building,
} from "lucide-react";
import { Spinner } from "@vsolve/ui";

interface DispatchBooking {
  id: string;
  status: string;
  booking_mode: string;
  scheduled_start: string | null;
  estimated_duration_minutes: number;
  service_title: string;
  service_category: string;
  location_area: string;
  customer_notes: string;
}

interface DispatchOfferData {
  id: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CANCELLED";
  offered_at: string;
  expires_at: string;
  responded_at: string | null;
  remaining_seconds: number;
  server_now: string;
  booking: DispatchBooking;
}

export function DispatchOfferScreen({ offerId }: { offerId: string }) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [offer, setOffer] = useState<DispatchOfferData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [actionInProgress, setActionInProgress] = useState<"accepting" | "declining" | null>(null);
  const [actionResult, setActionResult] = useState<{
    type: "success" | "declined" | "expired" | "error";
    message: string;
  } | null>(null);

  // Fetch offer
  const fetchOffer = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/v1/partner/dispatch-offers/${offerId}/`, {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        if (res.status === 404) {
          setError("Offer not found.");
        } else if (res.status === 403) {
          setError("This offer belongs to another partner or access is denied.");
        } else {
          setError(`Unable to load offer (${res.status}).`);
        }
        return;
      }

      const data: DispatchOfferData = await res.json();
      setOffer(data);
      setSecondsRemaining(data.remaining_seconds);

      if (data.status === "EXPIRED" || data.remaining_seconds <= 0) {
        setActionResult({
          type: "expired",
          message: "This offer has expired.",
        });
      } else if (data.status === "ACCEPTED") {
        setActionResult({
          type: "success",
          message: "You have already accepted this booking.",
        });
      } else if (data.status === "DECLINED") {
        setActionResult({
          type: "declined",
          message: "You declined this offer. Looking for another professional...",
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load offer");
    } finally {
      setLoading(false);
    }
  }, [offerId]);

  useEffect(() => {
    fetchOffer();
  }, [fetchOffer]);

  // Tick countdown timer
  useEffect(() => {
    if (!offer || offer.status !== "PENDING" || secondsRemaining <= 0) return;

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setActionResult({
            type: "expired",
            message: "This offer has expired.",
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [offer, secondsRemaining]);

  const handleAccept = async () => {
    if (!offer || actionInProgress) return;
    setActionInProgress("accepting");

    try {
      const res = await fetch(`/api/v1/partner/dispatch-offers/${offerId}/accept/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      if (!res.ok) {
        setActionResult({
          type: "error",
          message: data.error || "Failed to accept offer.",
        });
        return;
      }

      setOffer(data);
      setActionResult({
        type: "success",
        message: "Offer accepted! Booking confirmed.",
      });

      // Navigate to active job screen
      const bookingId = data.booking?.id || offer.booking?.id;
      setTimeout(() => {
        if (bookingId) {
          router.push(`/work/jobs/${bookingId}`);
        } else {
          router.push("/work/jobs");
        }
      }, 1500);
    } catch (err) {
      setActionResult({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to accept offer.",
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDecline = async () => {
    if (!offer || actionInProgress) return;
    setActionInProgress("declining");

    try {
      const res = await fetch(`/api/v1/partner/dispatch-offers/${offerId}/decline/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      if (!res.ok) {
        setActionResult({
          type: "error",
          message: data.error || "Failed to decline offer.",
        });
        return;
      }

      setOffer(data);
      setActionResult({
        type: "declined",
        message: "You declined this offer. Reassigning to another partner...",
      });
    } catch (err) {
      setActionResult({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to decline offer.",
      });
    } finally {
      setActionInProgress(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6">
        <Spinner size="lg" />
        <p className="text-sm font-medium text-text-secondary">Loading job offer details...</p>
      </div>
    );
  }

  if (error || !offer) {
    return (
      <div className="mx-auto max-w-lg p-6 my-12 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 mb-4">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold text-text mb-2">Unable to load dispatch offer</h1>
        <p className="text-sm text-text-secondary mb-6">{error || "Offer not found or unavailable."}</p>
        <button
          type="button"
          onClick={() => router.push("/home")}
          className="inline-flex items-center gap-2 rounded-xl bg-navy-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-900 transition"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  const isPending = offer.status === "PENDING" && secondsRemaining > 0 && !actionResult;
  const isUrgent = secondsRemaining > 0 && secondsRemaining <= 15;

  return (
    <div className="mx-auto max-w-xl p-4 sm:p-6 space-y-6">
      {/* Top Banner / Mode Badge */}
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 px-3.5 py-1 text-xs font-black tracking-wide text-amber-600 uppercase">
          <Zap className="h-4 w-4 fill-amber-500 text-amber-500" />
          Instant / ASAP Booking
        </div>
        <div className="text-xs font-mono font-semibold text-text-secondary">
          Offer #{offer.id.slice(0, 8)}
        </div>
      </div>

      {/* Expiry Countdown Card */}
      <div
        className={`relative overflow-hidden rounded-3xl border p-6 text-center transition-all ${
          isUrgent
            ? "border-rose-500/50 bg-rose-500/5 shadow-lg shadow-rose-500/10 animate-pulse"
            : "border-primary/20 bg-linear-to-b from-primary/10 via-surface to-surface shadow-md"
        }`}
      >
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-primary" /> Offer Expiry Countdown
          </span>
          <div className="mt-2 text-5xl font-black font-mono tracking-tight text-text">
            {secondsRemaining > 0 ? (
              <span className={isUrgent ? "text-rose-600" : "text-primary"}>
                00:{String(secondsRemaining).padStart(2, "0")}
              </span>
            ) : (
              <span className="text-text-muted">00:00</span>
            )}
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            {secondsRemaining > 0
              ? isUrgent
                ? "Expiring very soon! Accept now to take this booking."
                : "Respond before the timer expires to secure this job."
              : "This offer time window has closed."}
          </p>
        </div>
      </div>

      {/* Action / Result Feedback Alert */}
      {actionResult && (
        <div
          role="alert"
          className={`flex items-start gap-3 rounded-2xl border p-4 text-sm font-semibold ${
            actionResult.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
              : actionResult.type === "declined"
              ? "border-text-secondary/30 bg-surface-muted text-text-secondary"
              : "border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300"
          }`}
        >
          {actionResult.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          ) : actionResult.type === "declined" ? (
            <XCircle className="h-5 w-5 shrink-0 text-text-secondary" />
          ) : (
            <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" />
          )}
          <div className="flex-1">
            <p>{actionResult.message}</p>
            {actionResult.type === "success" && (
              <p className="mt-1 text-xs font-normal opacity-90">Redirecting you to the active job screen...</p>
            )}
          </div>
        </div>
      )}

      {/* Service Details Card */}
      <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm space-y-5">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            {offer.booking.service_category || "Service Category"}
          </span>
          <h2 className="text-xl font-extrabold text-text mt-0.5">
            {offer.booking.service_title || "Instant Service Request"}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-line/60 pt-4 text-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-hover text-primary">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <span className="text-xs font-semibold text-text-secondary block">Estimated Duration</span>
              <span className="font-bold text-text">
                {offer.booking.estimated_duration_minutes} Minutes
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-hover text-primary">
              <MapPin className="h-4 w-4" />
            </div>
            <div>
              <span className="text-xs font-semibold text-text-secondary block">Service Area</span>
              <span className="font-bold text-text">
                {offer.booking.location_area || "Hyderabad Central"}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-surface-muted p-4 border border-line/40 flex items-start gap-3 text-xs text-text-secondary">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
          <p>
            Customer details and full service address are released immediately upon accepting this dispatch offer.
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        {isPending ? (
          <>
            <button
              type="button"
              onClick={handleDecline}
              disabled={actionInProgress !== null}
              className="order-2 sm:order-1 flex-1 rounded-2xl border border-line bg-surface py-3.5 px-6 text-sm font-bold text-text hover:bg-surface-hover transition disabled:opacity-50 cursor-pointer text-center"
            >
              {actionInProgress === "declining" ? "Declining..." : "Decline"}
            </button>
            <button
              type="button"
              onClick={handleAccept}
              disabled={actionInProgress !== null}
              className="order-1 sm:order-2 flex-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 px-6 text-sm font-extrabold text-white shadow-md hover:bg-primary/95 transition disabled:opacity-50 cursor-pointer text-center"
            >
              {actionInProgress === "accepting" ? (
                <>
                  <Spinner size="sm" /> Accepting Job...
                </>
              ) : (
                <>
                  Accept Job Offer <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => router.push("/work/jobs")}
            className="w-full rounded-2xl bg-navy-950 py-3.5 px-6 text-sm font-bold text-white hover:bg-navy-900 transition text-center"
          >
            View Active Jobs
          </button>
        )}
      </div>
    </div>
  );
}

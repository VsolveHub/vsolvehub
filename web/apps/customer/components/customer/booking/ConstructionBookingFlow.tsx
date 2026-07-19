"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { BookingServiceInfo, PaymentMethodType } from "@/lib/bookings/types";
import {
  type Step,
  type WorkerRow,
  type CrewQuoteVM,
  CUSTOM_ROLE_RATE,
  makeDefaultTeam,
  tomorrowISO,
  computeActiveWorkers,
  computeQuoteOptions,
  getStepInfo,
  getBackStep,
} from "./constructionBookingFlow/model";
import { BookingTypeStep } from "./constructionBookingFlow/BookingTypeStep";
import { WorkforceStep } from "./constructionBookingFlow/WorkforceStep";
import { ProjectDetailsStep } from "./constructionBookingFlow/ProjectDetailsStep";
import { BudgetPreferenceStep } from "./constructionBookingFlow/BudgetPreferenceStep";
import { SearchingStep } from "./constructionBookingFlow/SearchingStep";
import { QuotesStep } from "./constructionBookingFlow/QuotesStep";
import { SummaryStep } from "./constructionBookingFlow/SummaryStep";
import { PaymentStep } from "./constructionBookingFlow/PaymentStep";
import { FooterBtn } from "./constructionBookingFlow/shared";

type Address = {
  id: string;
  label: string;
  fullAddress: string;
  isDefault: boolean;
};

type Props = {
  service: BookingServiceInfo;
  addresses: Address[];
  onAddressSaved: (addr: Address) => void;
};

export function ConstructionBookingFlow({ service, addresses: initialAddresses }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("bookingType");
  const [addresses] = useState<Address[]>(initialAddresses);

  const [bookingType, setBookingType] = useState<"individual" | "team">("team");

  // Team: dynamic list of worker rows (add / remove supported)
  const [teamWorkers, setTeamWorkers] = useState<WorkerRow[]>(makeDefaultTeam);
  const [showAddRole, setShowAddRole] = useState(false);
  const [newRoleLabel, setNewRoleLabel] = useState("");

  // Individual: a single worker role (no crew counts)
  const [individualRoleId, setIndividualRoleId] = useState<string>("mason");

  const [startDate, setStartDate] = useState(tomorrowISO());
  const [duration, setDuration] = useState(2); // days

  // Project details
  const [projectDescription, setProjectDescription] = useState(
    "Need workers for house slab work. Reinforcement, shuttering and concreting."
  );
  const [photos, setPhotos] = useState<string[]>([]);
  const [siteLocation, setSiteLocation] = useState("Kondapur, Hyderabad, Telangana 500084");

  // Budget & preferences
  const [budget, setBudget] = useState("");
  const [workPriority, setWorkPriority] = useState<"urgent" | "sameday" | "scheduled">("scheduled");
  const [proceedChoice, setProceedChoice] = useState<"auto" | "quotes">("quotes");

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Real crew quotes fetched from the marketplace (team mode).
  const [crewQuotes, setCrewQuotes] = useState<CrewQuoteVM[]>([]);

  // Resolved active workers (single source of truth for pricing / summary / search)
  const activeWorkers = useMemo(
    () => computeActiveWorkers(bookingType, individualRoleId, teamWorkers),
    [bookingType, individualRoleId, teamWorkers]
  );

  const baseDailyRate = useMemo(
    () => activeWorkers.reduce((sum, w) => sum + w.count * w.rate, 0),
    [activeWorkers]
  );

  // Quote / candidate options differ by booking type
  const quoteOptions = useMemo(
    () => computeQuoteOptions(bookingType, individualRoleId, activeWorkers, crewQuotes),
    [bookingType, individualRoleId, activeWorkers, crewQuotes]
  );

  const [selectedQuoteId, setSelectedQuoteId] = useState("");
  // Default to the first option whenever the option set changes.
  useEffect(() => {
    if (quoteOptions.length && !quoteOptions.some((q) => q.id === selectedQuoteId)) {
      setSelectedQuoteId(quoteOptions[0].id);
    }
  }, [quoteOptions, selectedQuoteId]);

  const selectedQuote = quoteOptions.find((q) => q.id === selectedQuoteId);

  // When auto-assigning we use the base rate; otherwise the chosen quote.
  const dailyRate = proceedChoice === "auto" ? baseDailyRate : selectedQuote?.dailyRate ?? baseDailyRate;
  const totalAmount = dailyRate * duration;

  // Searching: animate the per-role progress and, for team mode, fetch real
  // crew quotes from the marketplace in parallel.
  const [foundRows, setFoundRows] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (step !== "searching") return;
    setFoundRows({});
    let cancelled = false;
    const timers = activeWorkers.map((w, i) =>
      setTimeout(() => setFoundRows((p) => ({ ...p, [w.rowId]: true })), 700 * (i + 1))
    );

    if (bookingType === "team") {
      (async () => {
        try {
          const res = await fetch("/api/crew/quotes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tradeSlug: "construction",
              startDate,
              roles: activeWorkers.map((w) => ({ roleId: w.roleId, count: w.count })),
              durationDays: duration,
            }),
          });
          const data = await res.json();
          if (!cancelled && res.ok) setCrewQuotes(data.quotes ?? []);
        } catch {
          /* network error — quotes step will show the empty state */
        }
      })();
    }

    const done = setTimeout(() => {
      if (!cancelled) setStep(proceedChoice === "quotes" ? "quotes" : "summary");
    }, 700 * (activeWorkers.length + 1) + 300);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      clearTimeout(done);
    };
  }, [step, proceedChoice, activeWorkers, bookingType, duration]);

  // ---- Team worker row helpers ----
  function setRowCount(rowId: string, count: number) {
    setTeamWorkers((rows) => rows.map((r) => (r.rowId === rowId ? { ...r, count: Math.max(0, count) } : r)));
  }
  function removeRow(rowId: string) {
    setTeamWorkers((rows) => rows.filter((r) => r.rowId !== rowId));
  }
  function addCustomRole() {
    const label = newRoleLabel.trim();
    if (!label) return;
    setTeamWorkers((rows) => [
      ...rows,
      { rowId: `custom-${Date.now()}`, roleId: "custom", label, icon: "🛠️", count: 1, rate: CUSTOM_ROLE_RATE },
    ]);
    setNewRoleLabel("");
    setShowAddRole(false);
  }

  function teamCount(roleId: string) {
    if (bookingType === "individual") return individualRoleId === roleId ? 1 : 0;
    return teamWorkers.filter((w) => w.roleId === roleId).reduce((s, w) => s + w.count, 0);
  }

  // Team mode books a real crew via the marketplace crew endpoint.
  // "auto" broadcasts to all crews; "quotes" assigns the chosen crew.
  async function submitTeamBooking(addressId: string) {
    const assignmentMode = proceedChoice === "auto" ? "auto" : "quotes";
    const crewId = assignmentMode === "quotes" ? selectedQuoteId : undefined;
    if (assignmentMode === "quotes" && !crewId) {
      setLoading(false);
      setError("Please select a crew to continue.");
      return;
    }
    const res = await fetch("/api/crew/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId: service.id,
        addressId,
        assignmentMode,
        crewId,
        tradeSlug: "construction",
        startDate,
        durationDays: duration,
        roles: activeWorkers.map((w) => ({ roleId: w.roleId, count: w.count })),
        issueDescription: projectDescription,
        mediaUrls: photos,
        siteLocation,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Booking creation failed");
      return;
    }
    router.push(`/booking/track/${data.bookingRef}`);
  }

  async function submitIndividualBooking(addressId: string) {
    // Backward-compatible crew object for the tracker, plus the full worker list.
    const crew = {
      masons: teamCount("mason"),
      helpers: teamCount("helper"),
      barBenders: teamCount("bar-bender"),
      shutteringCarpenters: teamCount("carpenter"),
    };

    const archetypeDetails = {
      bookingType,
      workers: activeWorkers.map((w) => ({ roleId: w.roleId, label: w.label, count: w.count, rate: w.rate, icon: w.icon })),
      crew,
      durationDays: duration,
      startDate,
      budget: budget || null,
      workPriority,
      proceedChoice,
      siteLocation,
      selectedTeam: selectedQuote ? { id: selectedQuote.id, name: selectedQuote.name, rating: selectedQuote.rating } : null,
      baseDailyRate,
      dailyRate,
      totalAmount,
    };

    const slotISO = (() => {
      const d = new Date(startDate);
      return Number.isNaN(d.getTime()) ? new Date(Date.now() + 86400000).toISOString() : d.toISOString();
    })();

    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId: service.id,
        addressId,
        slot: slotISO,
        issueDescription: projectDescription,
        mediaUrls: photos,
        scheduleType: "scheduled",
        paymentMethod,
        vendorAssignmentMode: proceedChoice === "auto" ? "auto" : "manual",
        vendorId: undefined,
        archetypeDetails,
      }),
    });

    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Booking creation failed");
      return;
    }
    router.push(`/booking/confirm?ref=${data.bookingRef}`);
  }

  async function handleSubmit() {
    if (!paymentMethod) {
      setError("Please select a payment method");
      return;
    }
    setLoading(true);
    setError("");

    const address = addresses[0] ?? { id: "seed-addr-home" };
    if (bookingType === "team") {
      await submitTeamBooking(address.id);
    } else {
      await submitIndividualBooking(address.id);
    }
  }

  // ---- Navigation ----
  function goNext() {
    setError("");
    if (step === "bookingType") setStep("workforce");
    else if (step === "workforce") {
      if (bookingType === "team" && activeWorkers.length === 0) {
        setError("Add at least one worker to your crew.");
        return;
      }
      setStep("projectDetails");
    } else if (step === "projectDetails") setStep("budgetPreference");
    else if (step === "budgetPreference") setStep("searching");
    else if (step === "quotes") setStep("summary");
    else if (step === "summary") setStep("payment");
  }

  function handleBack() {
    const prev = getBackStep(step, proceedChoice);
    if (prev) setStep(prev);
    else router.push(`/services/${service.category.slug}`);
  }

  const { badge, title } = getStepInfo(step, bookingType);

  return (
    <div className="vsh-simulator-frame">
      <div className="vsh-status-bar">
        <span>9:41</span>
        <div className="vsh-status-bar-icons">
          <span>📶</span>
          <span>📶</span>
          <span>🔋 100%</span>
        </div>
      </div>

      <div className="vsh-navbar">
        <button type="button" className="vsh-nav-back" onClick={handleBack}>
          ←
        </button>
        <span className="vsh-nav-title">{service.name}</span>
      </div>

      <div className="vsh-step-header">
        <span className="vsh-step-badge">{badge}</span>
        <span className="vsh-step-title">{title}</span>
      </div>

      <div className="vsh-content">
        {step === "bookingType" && <BookingTypeStep bookingType={bookingType} setBookingType={setBookingType} />}

        {step === "workforce" && (
          <WorkforceStep
            bookingType={bookingType}
            individualRoleId={individualRoleId}
            setIndividualRoleId={setIndividualRoleId}
            teamWorkers={teamWorkers}
            setRowCount={setRowCount}
            removeRow={removeRow}
            showAddRole={showAddRole}
            setShowAddRole={setShowAddRole}
            newRoleLabel={newRoleLabel}
            setNewRoleLabel={setNewRoleLabel}
            addCustomRole={addCustomRole}
            startDate={startDate}
            setStartDate={setStartDate}
            duration={duration}
            setDuration={setDuration}
          />
        )}

        {step === "projectDetails" && (
          <ProjectDetailsStep
            projectDescription={projectDescription}
            setProjectDescription={setProjectDescription}
            photos={photos}
            setPhotos={setPhotos}
            siteLocation={siteLocation}
            setSiteLocation={setSiteLocation}
          />
        )}

        {step === "budgetPreference" && (
          <BudgetPreferenceStep
            budget={budget}
            setBudget={setBudget}
            baseDailyRate={baseDailyRate}
            workPriority={workPriority}
            setWorkPriority={setWorkPriority}
            bookingType={bookingType}
            proceedChoice={proceedChoice}
            setProceedChoice={setProceedChoice}
          />
        )}

        {step === "searching" && (
          <SearchingStep bookingType={bookingType} activeWorkers={activeWorkers} foundRows={foundRows} />
        )}

        {step === "quotes" && (
          <QuotesStep
            bookingType={bookingType}
            quoteOptions={quoteOptions}
            selectedQuoteId={selectedQuoteId}
            setSelectedQuoteId={setSelectedQuoteId}
            duration={duration}
          />
        )}

        {step === "summary" && (
          <SummaryStep
            bookingType={bookingType}
            activeWorkers={activeWorkers}
            startDate={startDate}
            duration={duration}
            siteLocation={siteLocation}
            proceedChoice={proceedChoice}
            selectedQuote={selectedQuote}
            dailyRate={dailyRate}
            totalAmount={totalAmount}
          />
        )}

        {step === "payment" && (
          <PaymentStep totalAmount={totalAmount} paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} error={error} />
        )}

        {error && step !== "payment" && <div className="alert alert-error" style={{ marginTop: "0.75rem" }}>{error}</div>}
      </div>

      <div className="vsh-footer-actions">
        {step === "bookingType" && <FooterBtn onClick={goNext}>Next</FooterBtn>}
        {step === "workforce" && <FooterBtn onClick={goNext}>Next</FooterBtn>}
        {step === "projectDetails" && <FooterBtn onClick={goNext}>Next</FooterBtn>}
        {step === "budgetPreference" && <FooterBtn onClick={goNext}>{bookingType === "individual" ? "Find Worker" : "Find Workers"}</FooterBtn>}
        {step === "quotes" && <FooterBtn onClick={goNext}>Continue</FooterBtn>}
        {step === "summary" && <FooterBtn onClick={goNext}>Proceed to Payment</FooterBtn>}
        {step === "payment" && (
          <Button onClick={handleSubmit} style={{ borderRadius: "14px", height: "46px", fontWeight: 700 }} loading={loading} disabled={!paymentMethod} block>
            Pay ₹{totalAmount}
          </Button>
        )}
      </div>
    </div>
  );
}

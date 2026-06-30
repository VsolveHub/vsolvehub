"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import type { BookingServiceInfo, PaymentMethodType } from "@/lib/bookings/types";

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

type Step =
  | "bookingType"
  | "workforce"
  | "projectDetails"
  | "budgetPreference"
  | "searching"
  | "quotes"
  | "summary"
  | "payment";

type WorkerRole = {
  id: string;
  label: string; // plural label e.g. "Masons"
  singular: string; // "Mason"
  icon: string;
  rate: number; // ₹ per worker per day
};

type WorkerRow = {
  rowId: string;
  roleId: string;
  label: string;
  icon: string;
  count: number;
  rate: number;
};

type CrewQuoteVM = {
  crewId: string;
  name: string;
  rating: number;
  reviewCount: number;
  city: string;
  equipment: string[];
  memberCount: number;
  covers: boolean;
  dailyRatePaise: number;
  totalPaise: number;
};

// Preset construction roles with indicative per-worker daily rates (₹).
const WORKER_ROLES: WorkerRole[] = [
  { id: "mason", label: "Masons", singular: "Mason", icon: "🧱", rate: 1200 },
  { id: "helper", label: "Helpers / Labour", singular: "Helper", icon: "👷", rate: 800 },
  { id: "bar-bender", label: "Bar Benders", singular: "Bar Bender", icon: "🦾", rate: 1100 },
  { id: "carpenter", label: "Shuttering Carpenters", singular: "Shuttering Carpenter", icon: "🪵", rate: 1300 },
];

const CUSTOM_ROLE_RATE = 1000;

function makeDefaultTeam(): WorkerRow[] {
  const defaults: Record<string, number> = { mason: 2, helper: 4, "bar-bender": 2, carpenter: 1 };
  return WORKER_ROLES.map((r) => ({
    rowId: r.id,
    roleId: r.id,
    label: r.label,
    icon: r.icon,
    count: defaults[r.id] ?? 1,
    rate: r.rate,
  }));
}

function tomorrowISO() {
  const d = new Date(Date.now() + 86400000);
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

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
  const activeWorkers = useMemo<WorkerRow[]>(() => {
    if (bookingType === "individual") {
      const role = WORKER_ROLES.find((r) => r.id === individualRoleId) ?? WORKER_ROLES[0];
      return [{ rowId: role.id, roleId: role.id, label: role.singular, icon: role.icon, count: 1, rate: role.rate }];
    }
    return teamWorkers.filter((w) => w.count > 0);
  }, [bookingType, individualRoleId, teamWorkers]);

  const baseDailyRate = useMemo(
    () => activeWorkers.reduce((sum, w) => sum + w.count * w.rate, 0),
    [activeWorkers]
  );

  // Quote / candidate options differ by booking type
  const quoteOptions = useMemo(() => {
    if (bookingType === "individual") {
      const role = WORKER_ROLES.find((r) => r.id === individualRoleId) ?? WORKER_ROLES[0];
      return [
        { id: "cand-1", name: `${role.singular} · Ramesh K.`, rating: 4.8, reviews: 64, dailyRate: role.rate, breakdown: "8+ yrs experience", covers: true },
        { id: "cand-2", name: `${role.singular} · Suresh M.`, rating: 4.6, reviews: 41, dailyRate: Math.max(role.rate - 100, 500), breakdown: "5 yrs experience", covers: true },
        { id: "cand-3", name: `${role.singular} · Anil R.`, rating: 4.9, reviews: 88, dailyRate: role.rate + 150, breakdown: "12 yrs · supervisor", covers: true },
      ];
    }
    return crewQuotes.map((c) => ({
      id: c.crewId,
      name: c.name,
      rating: c.rating,
      reviews: c.reviewCount,
      dailyRate: Math.round(c.dailyRatePaise / 100),
      breakdown: c.equipment.length ? c.equipment.join("  ·  ") : `${c.memberCount} members · ${crewSummary(activeWorkers)}`,
      covers: c.covers,
    }));
  }, [bookingType, individualRoleId, baseDailyRate, activeWorkers, crewQuotes]);

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

  async function handleSubmit() {
    if (!paymentMethod) {
      setError("Please select a payment method");
      return;
    }
    setLoading(true);
    setError("");

    const address = addresses[0] ?? { id: "seed-addr-home" };

    // Team mode books a real crew via the marketplace crew endpoint.
    // "auto" broadcasts to all crews; "quotes" assigns the chosen crew.
    if (bookingType === "team") {
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
          addressId: address.id,
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
      return;
    }

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
        addressId: address.id,
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

  function teamCount(roleId: string) {
    if (bookingType === "individual") return individualRoleId === roleId ? 1 : 0;
    return teamWorkers.filter((w) => w.roleId === roleId).reduce((s, w) => s + w.count, 0);
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
    if (step === "bookingType") router.push(`/services/${service.category.slug}`);
    else if (step === "workforce") setStep("bookingType");
    else if (step === "projectDetails") setStep("workforce");
    else if (step === "budgetPreference") setStep("projectDetails");
    else if (step === "searching") setStep("budgetPreference");
    else if (step === "quotes") setStep("budgetPreference");
    else if (step === "summary") setStep(proceedChoice === "quotes" ? "quotes" : "budgetPreference");
    else if (step === "payment") setStep("summary");
  }

  function getStepInfo(): { badge: number; title: string } {
    switch (step) {
      case "bookingType":
        return { badge: 2, title: "Choose Booking Type" };
      case "workforce":
        return { badge: 3, title: bookingType === "individual" ? "Choose Worker" : "Workforce Requirement" };
      case "projectDetails":
        return { badge: 4, title: "Project Details" };
      case "budgetPreference":
        return { badge: 5, title: "Budget & Preference" };
      case "searching":
        return { badge: 6, title: bookingType === "individual" ? "Finding Worker" : "Finding Teams" };
      case "quotes":
        return { badge: 7, title: bookingType === "individual" ? "Choose Worker" : "Choose Team" };
      case "summary":
        return { badge: 8, title: "Booking Summary" };
      case "payment":
        return { badge: 8, title: "Payment" };
    }
  }

  const { badge, title } = getStepInfo();

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
        {/* STEP 2 — Booking type */}
        {step === "bookingType" && (
          <div className="stack" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <p style={{ color: "#666", fontSize: "0.85rem", margin: 0 }}>How do you want to hire?</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <button
                type="button"
                className={`card address-card ${bookingType === "individual" ? "selected" : ""}`}
                style={hireCardStyle}
                onClick={() => setBookingType("individual")}
              >
                <input type="radio" checked={bookingType === "individual"} readOnly />
                <div>
                  <p style={{ fontWeight: 700, margin: 0, fontSize: "0.95rem" }}>Individual Worker</p>
                  <p style={hireSubStyle}>Hire one worker — a single mason, helper or carpenter for small tasks</p>
                </div>
              </button>

              <button
                type="button"
                className={`card address-card ${bookingType === "team" ? "selected" : ""}`}
                style={hireCardStyle}
                onClick={() => setBookingType("team")}
              >
                <input type="radio" checked={bookingType === "team"} readOnly />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p style={{ fontWeight: 700, margin: 0, fontSize: "0.95rem" }}>Team Requirement</p>
                    <span style={recommendedPillStyle}>Recommended</span>
                  </div>
                  <p style={hireSubStyle}>Hire an entire crew for large slab / wall projects</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 — Workforce */}
        {step === "workforce" && bookingType === "individual" && (
          <div className="vsh-card stack" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <p style={{ fontWeight: 700, fontSize: "0.9rem", margin: 0 }}>What kind of worker do you need?</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {WORKER_ROLES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`card address-card ${individualRoleId === r.id ? "selected" : ""}`}
                  style={{ ...hireCardStyle, padding: "0.85rem 1rem" }}
                  onClick={() => setIndividualRoleId(r.id)}
                >
                  <input type="radio" checked={individualRoleId === r.id} readOnly />
                  <span style={{ fontSize: "1.2rem" }}>{r.icon}</span>
                  <div style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{r.singular}</span>
                    <span style={{ fontSize: "0.78rem", color: "#71717a" }}>₹{r.rate}/day</span>
                  </div>
                </button>
              ))}
            </div>

            <ScheduleFields
              startDate={startDate}
              setStartDate={setStartDate}
              duration={duration}
              setDuration={setDuration}
            />
          </div>
        )}

        {step === "workforce" && bookingType === "team" && (
          <div className="vsh-card stack" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <p style={{ fontWeight: 700, fontSize: "0.9rem", margin: 0 }}>Select number of workers</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {teamWorkers.map((w) => (
                <StepperRow
                  key={w.rowId}
                  label={w.label}
                  value={w.count}
                  icon={w.icon}
                  onChange={(v) => setRowCount(w.rowId, v)}
                  onRemove={() => removeRow(w.rowId)}
                />
              ))}
              {teamWorkers.length === 0 && (
                <p style={{ fontSize: "0.8rem", color: "#a1a1aa", margin: 0 }}>No worker types yet — add one below.</p>
              )}
            </div>

            {showAddRole ? (
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <Input
                    label="Other worker type"
                    placeholder="e.g. Painter, Plumber"
                    value={newRoleLabel}
                    onChange={(e) => setNewRoleLabel(e.target.value)}
                  />
                </div>
                <Button onClick={addCustomRole} disabled={!newRoleLabel.trim()} style={{ height: "42px" }}>
                  Add
                </Button>
                <Button variant="secondary" onClick={() => { setShowAddRole(false); setNewRoleLabel(""); }} style={{ height: "42px" }}>
                  ✕
                </Button>
              </div>
            ) : (
              <button type="button" className="vsh-add-role-btn" onClick={() => setShowAddRole(true)}>
                + Add worker type
              </button>
            )}

            <ScheduleFields
              startDate={startDate}
              setStartDate={setStartDate}
              duration={duration}
              setDuration={setDuration}
            />
          </div>
        )}

        {/* STEP 4 — Project details */}
        {step === "projectDetails" && (
          <div className="vsh-card stack" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <Textarea
              label="Describe your project work"
              placeholder="Need workers for house slab work. Reinforcement, shuttering and concreting."
              value={projectDescription}
              onChange={(e: any) => setProjectDescription(e.target.value)}
            />
            <div>
              <p style={{ fontWeight: 700, fontSize: "0.85rem", color: "#4b5563", margin: "0 0 0.5rem 0" }}>Upload Photos (Optional)</p>
              <div className="booking-media-grid" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: "72px", height: "72px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", borderRadius: "12px", border: "1px dashed #d4d4d8" }}
                  onClick={() => setPhotos([...photos, "https://images.unsplash.com/photo-1590069261209-f8e9b8642343?w=150"])}
                >
                  +
                </button>
                {photos.map((p, idx) => (
                  <img key={idx} src={p} alt="project" className="booking-media-thumb" style={{ width: "72px", height: "72px", borderRadius: "12px", objectFit: "cover" }} />
                ))}
              </div>
            </div>
            <Input label="Site Location" value={siteLocation} onChange={(e) => setSiteLocation(e.target.value)} placeholder="Kondapur, Hyderabad" />
          </div>
        )}

        {/* STEP 5 — Budget & preference */}
        {step === "budgetPreference" && (
          <div className="stack" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="vsh-card stack" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <Input label="Budget per day (Optional ₹)" value={budget} onChange={(e) => setBudget(e.target.value.replace(/\D/g, ""))} placeholder={`Suggested ₹${baseDailyRate}`} inputMode="numeric" />
              <div>
                <p style={{ fontWeight: 700, fontSize: "0.8rem", color: "#4b5563", margin: "0 0 0.375rem 0" }}>Work Priority</p>
                <div className="booking-mode-tabs" style={{ display: "flex", gap: "0.5rem" }}>
                  {(["urgent", "sameday", "scheduled"] as const).map((p) => {
                    const label = p === "urgent" ? "Urgent" : p === "sameday" ? "Same Day" : "Scheduled";
                    return (
                      <button key={p} type="button" className={`booking-mode-tab ${workPriority === p ? "active" : ""}`} style={{ flex: 1, borderRadius: "10px", fontSize: "0.75rem" }} onClick={() => setWorkPriority(p)}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <p style={{ fontWeight: 700, fontSize: "0.9rem", color: "#3f3f46", margin: "0 0 0.125rem 0" }}>How do you want to proceed?</p>
              <button type="button" className={`card address-card ${proceedChoice === "auto" ? "selected" : ""}`} style={{ ...hireCardStyle, padding: "1rem" }} onClick={() => setProceedChoice("auto")}>
                <input type="radio" checked={proceedChoice === "auto"} readOnly />
                <div>
                  <p style={{ fontWeight: 700, margin: 0, fontSize: "0.9rem" }}>Auto Assign {bookingType === "individual" ? "Worker" : "Team"} (Faster)</p>
                  <p style={hireSubStyle}>Instantly assign our top-rated {bookingType === "individual" ? "worker" : "contractor team"}</p>
                </div>
              </button>
              <button type="button" className={`card address-card ${proceedChoice === "quotes" ? "selected" : ""}`} style={{ ...hireCardStyle, padding: "1rem" }} onClick={() => setProceedChoice("quotes")}>
                <input type="radio" checked={proceedChoice === "quotes"} readOnly />
                <div>
                  <p style={{ fontWeight: 700, margin: 0, fontSize: "0.9rem" }}>Receive Quotes (Compare & Select)</p>
                  <p style={hireSubStyle}>Compare bids from local {bookingType === "individual" ? "workers" : "contractor teams"}</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* STEP 6 — Searching */}
        {step === "searching" && (
          <div className="vsh-card stack text-center" style={{ padding: "2.5rem 1.5rem", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div className="search-workers-animation" style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
              <div style={{ width: "12px", height: "12px", background: "var(--color-brand)", borderRadius: "50%", animation: "bounce 0.6s infinite alternate" }} />
              <div style={{ width: "12px", height: "12px", background: "var(--color-brand)", borderRadius: "50%", animation: "bounce 0.6s infinite 0.15s alternate" }} />
              <div style={{ width: "12px", height: "12px", background: "var(--color-brand)", borderRadius: "50%", animation: "bounce 0.6s infinite 0.3s alternate" }} />
            </div>
            <h3 style={{ fontWeight: 800, margin: 0, fontSize: "1.1rem" }}>
              {bookingType === "individual" ? "Finding your worker…" : "Searching nearby teams…"}
            </h3>
            <p style={{ color: "#666", fontSize: "0.8rem", margin: "0.375rem 0 1.5rem 0" }}>Verifying availability for your requirement</p>
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "0.75rem", textAlign: "left", borderTop: "1px solid #f3f4f6", paddingTop: "1rem" }}>
              {activeWorkers.map((w) => (
                <ProgressRow key={w.rowId} label={w.label} count={w.count} active={!!foundRows[w.rowId]} />
              ))}
            </div>
            <style jsx>{`
              @keyframes bounce { to { transform: translateY(-8px); opacity: 0.4; } }
            `}</style>
          </div>
        )}

        {/* STEP 7 — Quotes / candidates */}
        {step === "quotes" && (
          <div className="stack" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <p style={{ color: "#666", fontSize: "0.8rem", margin: 0 }}>
              {bookingType === "individual" ? "Choose the best worker for your task:" : "Choose the best team for your work:"}
            </p>
            {bookingType === "team" && quoteOptions.length === 0 && (
              <div className="vsh-card" style={{ textAlign: "center", padding: "1.5rem", color: "#71717a", fontSize: "0.85rem" }}>
                No verified teams are available for this requirement right now. Try adjusting your crew or pick
                “Auto Assign”.
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {quoteOptions.map((q) => (
                <div key={q.id} className={`vsh-quote-card ${selectedQuoteId === q.id ? "selected" : ""}`} onClick={() => setSelectedQuoteId(q.id)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <h4 style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem", color: "#18181b" }}>
                        {q.name}
                        {!q.covers ? <span style={{ marginLeft: 6, fontSize: "0.65rem", color: "#b45309" }}>partial match</span> : null}
                      </h4>
                      <p style={{ margin: "0.125rem 0 0 0", fontSize: "0.75rem", color: "#71717a" }}>★ {q.rating.toFixed(1)} ({q.reviews} reviews)</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ margin: 0, fontWeight: 800, fontSize: "1.05rem", color: "var(--color-brand)" }}>₹{q.dailyRate}/day</p>
                      <p style={{ margin: 0, fontSize: "0.7rem", color: "#71717a" }}>Total: ₹{q.dailyRate * duration}</p>
                    </div>
                  </div>
                  <div style={{ background: "rgba(0,0,0,0.02)", borderRadius: "8px", padding: "0.375rem 0.5rem", fontSize: "0.7rem", color: "#52525b", marginTop: "0.5rem" }}>
                    {q.breakdown}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 8 — Summary */}
        {step === "summary" && (
          <div className="vsh-card stack" style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            <SummaryRow label="Project Type" value={bookingType === "individual" ? "Individual Worker" : "Construction Crew"} />
            <div style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: "0.625rem" }}>
              <p style={{ fontSize: "0.8rem", color: "#71717a", margin: 0 }}>{bookingType === "individual" ? "Worker" : "Crew"}</p>
              <p style={{ margin: "0.125rem 0 0 0", fontSize: "0.85rem", color: "#18181b", lineHeight: 1.5 }}>
                {activeWorkers.map((w) => `${w.icon} ${w.label}${bookingType === "team" ? ` (${w.count})` : ""}`).join("  ·  ")}
              </p>
            </div>
            <SummaryRow label="Start Date" value={formatDateLabel(startDate)} />
            <SummaryRow label="Duration" value={`${duration} Days`} />
            <SummaryRow label="Location" value={siteLocation} />
            {proceedChoice === "quotes" && selectedQuote && <SummaryRow label={bookingType === "individual" ? "Selected Worker" : "Selected Team"} value={selectedQuote.name} last />}

            <div style={{ borderTop: "1px dashed #e4e4e7", paddingTop: "0.875rem", marginTop: "0.375rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#71717a" }}>
                <span>Daily wage × {duration} days</span>
                <span>₹{dailyRate}/day</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.1rem", fontWeight: 800, color: "var(--color-brand)", marginTop: "0.75rem", borderTop: "1px solid #e4e4e7", paddingTop: "0.75rem" }}>
                <span>Total Amount</span>
                <span>₹{totalAmount}</span>
              </div>
            </div>
          </div>
        )}

        {/* STEP 8b — Payment */}
        {step === "payment" && (
          <div className="stack" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="vsh-card" style={{ background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)", color: "white", padding: "1.25rem", borderRadius: "18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ fontSize: "0.8rem", opacity: 0.85, margin: 0 }}>Total Amount to Pay</p>
                <p style={{ fontSize: "1.4rem", fontWeight: 800, margin: 0, marginTop: "0.125rem" }}>₹{totalAmount}</p>
              </div>
              <span style={{ fontSize: "2rem" }}>🏗️</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {(["upi", "card", "wallet", "cod"] as const).map((methodType) => {
                const label = methodType === "upi" ? "UPI (Paytm, GPay, PhonePe)" : methodType === "card" ? "Credit / Debit Card" : methodType === "wallet" ? "Wallets" : "Cash on Service";
                const detail = methodType === "upi" ? "Pay using any UPI app" : methodType === "card" ? "Visa, MasterCard, Rupay" : methodType === "wallet" ? "Pay from wallet" : "Pay after service completion";
                return (
                  <button key={methodType} type="button" className={`card address-card ${paymentMethod === methodType ? "selected" : ""}`} style={{ ...hireCardStyle, padding: "1rem" }} onClick={() => setPaymentMethod(methodType)}>
                    <input type="radio" checked={paymentMethod === methodType} readOnly />
                    <div>
                      <p style={{ fontWeight: 700, margin: 0, fontSize: "0.9rem" }}>{label}</p>
                      <p style={hireSubStyle}>{detail}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            {error && <div className="alert alert-error">{error}</div>}
          </div>
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

const hireCardStyle: React.CSSProperties = {
  width: "100%",
  padding: "1.1rem",
  textAlign: "left",
  display: "flex",
  gap: "0.75rem",
  alignItems: "center",
  borderRadius: "14px",
  border: "1px solid #f1f0f5",
};
const hireSubStyle: React.CSSProperties = { fontSize: "0.78rem", color: "#666", margin: "0.125rem 0 0 0" };
const recommendedPillStyle: React.CSSProperties = { fontSize: "0.65rem", fontWeight: 700, color: "#7c3aed", background: "#f5f3ff", padding: "0.15rem 0.4rem", borderRadius: "4px" };

function crewSummary(workers: WorkerRow[]) {
  return workers.map((w) => `${w.icon} ${w.label}: ${w.count}`).join("  ·  ");
}

function FooterBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Button onClick={onClick} block style={{ borderRadius: "14px", height: "46px", fontWeight: 700 }}>
      {children}
    </Button>
  );
}

function SummaryRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={last ? undefined : { borderBottom: "1px solid #f3f4f6", paddingBottom: "0.625rem" }}>
      <p style={{ fontSize: "0.8rem", color: "#71717a", margin: 0 }}>{label}</p>
      <p style={{ fontWeight: 600, margin: "0.125rem 0 0 0", fontSize: "0.9rem", lineHeight: 1.35 }}>{value}</p>
    </div>
  );
}

function ScheduleFields({
  startDate,
  setStartDate,
  duration,
  setDuration,
}: {
  startDate: string;
  setStartDate: (v: string) => void;
  duration: number;
  setDuration: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 700, fontSize: "0.8rem", color: "#4b5563", margin: "0 0 0.375rem 0" }}>Start Date</p>
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 700, fontSize: "0.8rem", color: "#4b5563", margin: "0 0 0.375rem 0" }}>Duration (Days)</p>
        <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", height: "42px", justifyContent: "space-between", padding: "0 0.5rem", background: "#ffffff" }}>
          <button type="button" onClick={() => setDuration(Math.max(1, duration - 1))} style={{ border: "none", background: "none", fontSize: "1.2rem", fontWeight: 700, cursor: "pointer" }}>-</button>
          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{duration} Days</span>
          <button type="button" onClick={() => setDuration(duration + 1)} style={{ border: "none", background: "none", fontSize: "1.2rem", fontWeight: 700, cursor: "pointer" }}>+</button>
        </div>
      </div>
    </div>
  );
}

function StepperRow({
  label,
  value,
  onChange,
  icon,
  onRemove,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  icon: string;
  onRemove?: () => void;
}) {
  return (
    <div className="vsh-stepper-row">
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1 }}>
        <span style={{ fontSize: "1.2rem" }}>{icon}</span>
        <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "#18181b" }}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <button type="button" className="vsh-btn-stepper" onClick={() => onChange(Math.max(0, value - 1))}>-</button>
        <span style={{ minWidth: "1.25rem", textAlign: "center", fontWeight: 700, fontSize: "0.9rem" }}>{value}</span>
        <button type="button" className="vsh-btn-stepper" onClick={() => onChange(value + 1)}>+</button>
        {onRemove && (
          <button type="button" className="vsh-row-remove" aria-label={`Remove ${label}`} onClick={onRemove}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

function ProgressRow({ label, count, active }: { label: string; count: number; active: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem" }}>
      <span style={{ color: "#3f3f46", fontWeight: 500 }}>{label} ({count})</span>
      {active ? (
        <span style={{ color: "#059669", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.25rem" }}>✓ Found</span>
      ) : (
        <span style={{ color: "#a1a1aa", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
          <span className="dot-spinner" style={{ width: "6px", height: "6px", background: "var(--color-brand)", borderRadius: "50%", display: "inline-block", animation: "flash 0.8s infinite alternate" }} /> Searching
        </span>
      )}
      <style jsx>{`
        @keyframes flash { to { opacity: 0.3; } }
      `}</style>
    </div>
  );
}

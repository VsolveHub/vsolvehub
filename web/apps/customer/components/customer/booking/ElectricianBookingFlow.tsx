"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/format";
import { roleRatePaise } from "@/lib/crew/constants";
import type { BookingServiceInfo } from "@/lib/bookings/types";

type Address = {
  id: string;
  label: string;
  fullAddress: string;
  isDefault: boolean;
};

type CrewQuoteVM = {
  crewId: string;
  name: string;
  rating: number;
  reviewCount: number;
  equipment: string[];
  memberCount: number;
  covers: boolean;
  dailyRatePaise: number;
  totalPaise: number;
};

type Props = {
  initialStep?: Step;
  service?: BookingServiceInfo; // Pre-selected service if entering from a direct book link
  services?: any[]; // List of services if entering from the subcategory list
  categorySlug?: string;
  categoryName?: string;
  subCategoryName?: string;
  addresses?: Address[];
  onAddressSaved?: (addr: Address) => void;
};

type Step = "select-service" | "booking-type" | "details" | "address" | "schedule" | "summary" | "team-crew" | "team-details" | "team-budget" | "team-searching" | "team-choose";

export function ElectricianBookingFlow({
  initialStep,
  service: propService,
  services: propServices = [],
  categorySlug: propCategorySlug,
  categoryName = "Home Services",
  subCategoryName = "Electrician",
  addresses: initialAddresses,
  onAddressSaved,
}: Props) {
  const router = useRouter();
  
  // Resolve services list
  const servicesList = propServices.length > 0 ? propServices : propService ? [propService] : [];
  
  const isElectrician = subCategoryName.toLowerCase().includes("electrician");
  const categorySlug = propCategorySlug ?? propService?.category.slug ?? "";
  const isBeauty = categorySlug === "beauty-wellness";
  const serviceIcon = categorySlug === "beauty-wellness" ? "✨" : categorySlug === "pet-care" ? "🐾" : categorySlug === "home-services" ? "🏠" : isElectrician ? "🔌" : "🛠️";
  const installIcon = isElectrician ? "🛠️" : serviceIcon;
  const primaryGroupLabel = isElectrician ? "Repairs" : "Services";
  const secondaryGroupLabel = isElectrician ? "Installations" : "More Services";
  const guaranteeCopy = `Verified professionals with background checks for every ${categoryName.toLowerCase()} booking.`;
  const detailsLabel = isElectrician ? "Describe the problem" : "Service notes";
  const detailsPlaceholder = isElectrician
    ? "Type here to describe what needs repair (e.g. 2 faulty switches in the master bedroom)..."
    : isBeauty
      ? "Add any skin concerns, product preferences, or setup notes for your at-home service..."
      : "Add any preferences, access notes, or special instructions for the partner...";
  const issueSummary = isElectrician ? "Need to repair 2 switches..." : "No special instructions added";

  const option1Title = isElectrician ? "Individual Electrician" : "Professional Partner";
  const option1Desc = isElectrician 
    ? "One verified electrician for repairs & small jobs" 
    : "Vetted, highly trained expert with standard rates.";
    
  const option2Title = isElectrician ? "Team / Multiple Electricians" : "Local Helper";
  const option2Desc = isElectrician 
    ? "A crew for wiring, renovation or big installations" 
    : "Budget-friendly handyman for quick checks and basic jobs.";
  
  const [step, setStep] = useState<Step>(initialStep ?? (propService ? "booking-type" : "select-service"));
  const [selectedServiceId, setSelectedServiceId] = useState<string>(propService?.id ?? (servicesList[0]?.id || ""));
  
  const [addresses, setAddresses] = useState<Address[]>(initialAddresses ?? []);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Form states
  const [bookingType, setBookingType] = useState<"professional" | "helper" | "team">("professional");
  const [electricianCount, setElectricianCount] = useState(2);
  const [wiremanCount, setWiremanCount] = useState(2);
  const [helperCount, setHelperCount] = useState(3);
  const [supervisorCount, setSupervisorCount] = useState(1);
  const [teamStartDate, setTeamStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [teamDuration, setTeamDuration] = useState(3);
  const [teamBudget, setTeamBudget] = useState("Suggested ₹6,200");
  const [teamPriority, setTeamPriority] = useState<string>("Scheduled");
  const [teamProceedMode, setTeamProceedMode] = useState<"Auto" | "Quotes">("Quotes");
  // Real crews fetched from the marketplace (team mode).
  const [crewQuotes, setCrewQuotes] = useState<CrewQuoteVM[]>([]);
  const [selectedCrewId, setSelectedCrewId] = useState<string>("");

  const [issue, setIssue] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [urgency, setUrgency] = useState<"normal" | "urgent">("normal");
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [selectedDate, setSelectedDate] = useState("Today, 20 May");
  const [selectedTimeSlot, setSelectedTimeSlot] = useState("12 PM - 2 PM");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Address add form states
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newLabel, setNewLabel] = useState("Home");
  const [newAddressText, setNewAddressText] = useState("");

  // Resolve current active service details
  const activeService = servicesList.find((s) => s.id === selectedServiceId) || propService;
  const selectedAddress = addresses.find((a) => a.id === selectedAddressId);

  // Check login session
  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => {
        if (res.ok) return res.json();
      })
      .then((data) => {
        if (data && data.user) {
          setIsLoggedIn(true);
        }
      })
      .catch((err) => console.error("Session check failed:", err));
  }, []);

  // Load addresses when logged in
  useEffect(() => {
    if (isLoggedIn && (!initialAddresses || initialAddresses.length === 0)) {
      fetch("/api/profile/addresses")
        .then((res) => res.json())
        .then((data) => {
          if (data && data.addresses) {
            setAddresses(data.addresses);
            const def = data.addresses.find((a: any) => a.isDefault) || data.addresses[0];
            if (def) setSelectedAddressId(def.id);
          }
        })
        .catch((err) => console.error("Failed to load addresses:", err));
    }
  }, [isLoggedIn, initialAddresses]);

  // Sync addresses when initialAddresses prop updates (e.g. from geolocation auto-save)
  useEffect(() => {
    if (initialAddresses && initialAddresses.length > 0) {
      setAddresses(initialAddresses);
      if (!selectedAddressId) {
        setSelectedAddressId(initialAddresses.find((a) => a.isDefault)?.id ?? initialAddresses[0]?.id ?? "");
      }
    }
  }, [initialAddresses, selectedAddressId]);

  // Team searching: fetch real crews matched to this trade, then advance.
  useEffect(() => {
    if (step !== "team-searching") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/crew/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // The team path is electrician-only (gated by isElectrician), so we
            // always source an electrical crew here.
            tradeSlug: "electrician",
            startDate: teamStartDate,
            roles: [
              { roleId: "electrician", count: electricianCount },
              { roleId: "wireman", count: wiremanCount },
              { roleId: "helper", count: helperCount },
              { roleId: "supervisor", count: supervisorCount },
            ],
            durationDays: teamDuration,
          }),
        });
        const data = await res.json();
        if (!cancelled && res.ok) {
          const quotes: CrewQuoteVM[] = data.quotes ?? [];
          setCrewQuotes(quotes);
          if (quotes[0]) setSelectedCrewId(quotes[0].crewId);
        }
      } catch {
        /* quotes step shows the empty state */
      }
    })();
    const timer = setTimeout(() => {
      if (!cancelled) setStep("team-choose");
    }, 3500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [step, activeService, electricianCount, wiremanCount, helperCount, supervisorCount, teamDuration]);

  // Group services for select-service step
  const repairs = servicesList.filter((s) => !s.name.toLowerCase().includes("install"));
  const installations = servicesList.filter((s) => s.name.toLowerCase().includes("install"));

  const isTeam = bookingType === "team";
  const isAutoTeam = isTeam && teamProceedMode === "Auto";
  const selectedCrew = crewQuotes.find((c) => c.crewId === selectedCrewId) ?? crewQuotes[0];

  // Requested crew composition (single source for summary + payloads).
  const teamRoles = [
    { roleId: "electrician", label: "Electricians", count: electricianCount },
    { roleId: "wireman", label: "Wiremen", count: wiremanCount },
    { roleId: "helper", label: "Helpers", count: helperCount },
    { roleId: "supervisor", label: "Supervisor", count: supervisorCount },
  ].filter((r) => r.count > 0);

  // Auto mode has no chosen crew yet → show a platform-rate estimate.
  const teamEstimateRupees =
    teamRoles.reduce((s, r) => s + r.count * Math.round(roleRatePaise(r.roleId) / 100), 0) * teamDuration;
  const teamTotalRupees = isAutoTeam ? teamEstimateRupees : selectedCrew ? Math.round(selectedCrew.totalPaise / 100) : teamEstimateRupees;

  // Calculate pricing
  const serviceCharge = isTeam ? teamTotalRupees : Math.round((activeService?.pricePaise ?? 0) / 100);
  const platformFee = isTeam ? 0 : 20;
  const gst = isTeam ? 0 : Math.round(serviceCharge * 0.18);
  const totalAmount = serviceCharge + platformFee + gst;

  async function handleAddAddress() {
    if (!newAddressText || newAddressText.length < 10) {
      setError("Please enter a valid full address");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/profile/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newLabel,
          fullAddress: newAddressText,
          isDefault: addresses.length === 0,
        }),
      });
      setLoading(false);
      if (res.ok) {
        const { address } = await res.json();
        setAddresses((prev) => [...prev, address]);
        setSelectedAddressId(address.id);
        setShowAddAddress(false);
        setNewAddressText("");
      } else {
        setError("Failed to save address");
      }
    } catch (err) {
      setError("An error occurred");
      setLoading(false);
    }
  }

  async function handleSubmit() {
    setLoading(true);
    setError("");

    try {
      // Team flow: no upfront payment (pay after the work is done). Two modes —
      // "Quotes" assigns the chosen crew; "Auto" broadcasts to all crews.
      if (isTeam) {
        const assignmentMode = teamProceedMode === "Auto" ? "auto" : "quotes";
        const crewId = assignmentMode === "quotes" ? selectedCrew?.crewId : undefined;
        if (assignmentMode === "quotes" && !crewId) {
          setLoading(false);
          setError("Please select a team to continue.");
          return;
        }
        const res = await fetch("/api/crew/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serviceId: selectedServiceId,
            addressId: selectedAddressId,
            assignmentMode,
            crewId,
            tradeSlug: "electrician",
            startDate: teamStartDate,
            durationDays: teamDuration,
            roles: teamRoles.map((r) => ({ roleId: r.roleId, count: r.count })),
            issueDescription: issue || "Team requirement",
            mediaUrls: photos,
            siteLocation: selectedAddress?.fullAddress,
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

      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: selectedServiceId,
          addressId: selectedAddressId,
          slot: new Date(Date.now() + 86400000).toISOString(),
          issueDescription: issue || "No description provided",
          mediaUrls: photos,
          scheduleType: "scheduled",
          vendorAssignmentMode: "auto",
          bookingType: bookingType,
        }),
      });

      const data = await res.json();
      setLoading(false);

      if (!res.ok) {
        setError(data.error ?? "Booking creation failed");
        return;
      }

      router.push(`/booking/track/${data.bookingRef}`);
    } catch (err) {
      setError("Failed to create booking");
      setLoading(false);
    }
  }

  // Handle back button clicks
  function handleBack() {
    if (step === "select-service") {
      router.push(`/services`);
    } else if (step === "booking-type") {
      if (propService) {
        router.push(`/services/${propService.category.slug}`);
      } else {
        setStep("select-service");
      }
    } else if (step === "details") {
      setStep("booking-type");
    } else if (step === "address") {
      setStep("details");
    } else if (step === "schedule") {
      setStep("address");
    } else if (step === "summary") {
      if (bookingType === "team") {
        setStep("team-choose");
      } else {
        setStep("schedule");
      }
    } else if (step === "team-crew") {
      setStep("booking-type");
    } else if (step === "team-details") {
      setStep("team-crew");
    } else if (step === "team-budget") {
      setStep("team-details");
    } else if (step === "team-searching") {
      setStep("team-budget");
    } else if (step === "team-choose") {
      setStep("team-budget");
    }
  }

  // Handle "Next" click (with login check when going to address step)
  function handleNext() {
    if (step === "select-service") {
      setStep("booking-type");
    } else if (step === "booking-type") {
      if (bookingType === "team") {
        setStep("team-crew");
      } else {
        setStep("details");
      }
    } else if (step === "details") {
      if (!isLoggedIn) {
        const targetRedirect = window.location.pathname + window.location.search;
        router.push(`/booking/otp?redirect=${encodeURIComponent(targetRedirect)}`);
      } else {
        setStep("address");
      }
    } else if (step === "address") {
      setStep("schedule");
    } else if (step === "schedule") {
      setStep("summary");
    } else if (step === "summary") {
      // Single-provider bookings collect payment after a partner accepts.
      handleSubmit();
    } else if (step === "team-crew") {
      setStep("team-details");
    } else if (step === "team-details") {
      if (!isLoggedIn) {
        const targetRedirect = window.location.pathname + window.location.search;
        router.push(`/booking/otp?redirect=${encodeURIComponent(targetRedirect)}`);
      } else {
        setStep("team-budget");
      }
    } else if (step === "team-budget") {
      // Auto Assign broadcasts immediately; Receive Quotes compares crews first.
      if (teamProceedMode === "Auto") {
        handleSubmit();
      } else {
        setStep("team-searching");
      }
    } else if (step === "team-choose") {
      setStep("summary");
    }
  }

  // Resolve step badges & titles
  function getStepInfo(): { badge: number; title: string } {
    switch (step) {
      case "select-service":
        return { badge: 3, title: "Select Specific Service" };
      case "booking-type":
        return { badge: 4, title: "Choose booking type" };
      case "details":
        return { badge: 5, title: "Describe the Issue" };
      case "address":
        return { badge: 6, title: "Select Address" };
      case "schedule":
        return { badge: 7, title: "Select Date & Time" };
      case "summary":
        return { badge: 8, title: "Booking Summary" };
      case "team-crew":
        return { badge: 3, title: "Crew Requirement" };
      case "team-details":
        return { badge: 4, title: "Project Details" };
      case "team-budget":
        return { badge: 5, title: "Budget & Preference" };
      case "team-searching":
        return { badge: 6, title: "Searching nearby teams..." };
      case "team-choose":
        return { badge: 7, title: "Choose your team" };
    }
  }

  const { badge, title } = getStepInfo();

  return (
    <div className="w-full md:max-w-md md:mx-auto min-h-screen bg-gray-50 flex flex-col relative pb-24 md:shadow-lg md:border md:border-gray-100 md:rounded-3xl overflow-hidden">
      {/* Header Bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 text-purple-900 shadow-sm select-none">
        <button type="button" className="text-xl leading-none text-purple-800 hover:text-purple-950 cursor-pointer focus:outline-none" onClick={handleBack}>
          ←
        </button>
        <span className="font-extrabold text-sm tracking-tight">{subCategoryName}</span>
      </div>

      {/* Numbered Step Progress Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-purple-50/60 border-b border-purple-100/50">
        <span className="w-5 h-5 flex items-center justify-center bg-purple-700 text-white font-bold rounded-full text-[10px] shadow-sm">
          {badge}
        </span>
        <span className="font-bold text-xs text-purple-950">{title}</span>
      </div>

      {/* Scrollable Simulator Content */}
      <div className="flex-grow overflow-y-auto p-4 flex flex-col gap-4">
        {step === "select-service" && (
          <div className="flex flex-col gap-4 select-none pb-4">
            {/* Primary services section */}
            {repairs.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">{primaryGroupLabel}</p>
                <div className="flex flex-col gap-2">
                  {repairs.map((s) => {
                    const isSelected = selectedServiceId === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedServiceId(s.id)}
                        className={`w-full p-3.5 bg-white border rounded-2xl text-left flex items-center justify-between cursor-pointer transition-all duration-200 ${
                          isSelected ? "border-purple-600 bg-purple-50/15 shadow-sm" : "border-gray-100 hover:border-purple-200"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{serviceIcon}</span>
                          <div>
                            <p className="font-bold text-xs text-gray-800">{s.name}</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">Starting from ₹{Math.round(s.pricePaise / 100)}</p>
                          </div>
                        </div>
                        <span className={`text-base ${isSelected ? "text-purple-700 font-bold" : "text-gray-300"}`}>
                          {isSelected ? "●" : "○"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Secondary services section */}
            {installations.length > 0 && (
              <div className="flex flex-col gap-2 mt-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">{secondaryGroupLabel}</p>
                <div className="flex flex-col gap-2">
                  {installations.map((s) => {
                    const isSelected = selectedServiceId === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedServiceId(s.id)}
                        className={`w-full p-3.5 bg-white border rounded-2xl text-left flex items-center justify-between cursor-pointer transition-all duration-200 ${
                          isSelected ? "border-purple-600 bg-purple-50/15 shadow-sm" : "border-gray-100 hover:border-purple-200"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{installIcon}</span>
                          <div>
                            <p className="font-bold text-xs text-gray-800">{s.name}</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">Starting from ₹{Math.round(s.pricePaise / 100)}</p>
                          </div>
                        </div>
                        <span className={`text-base ${isSelected ? "text-purple-700 font-bold" : "text-gray-300"}`}>
                          {isSelected ? "●" : "○"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Safety First Guarantee Banner */}
            <div className="bg-purple-900 text-white rounded-2xl p-4 flex justify-between items-center mt-3 shadow-md relative overflow-hidden">
              <div className="z-10">
                <p className="font-bold text-xs m-0">Safety First Guarantee</p>
                <p className="text-[10px] text-purple-100/90 mt-1 leading-relaxed max-w-[240px] m-0">
                  {guaranteeCopy}
                </p>
              </div>
              <span className="text-4xl opacity-15 absolute -right-2 top-2 select-none z-0">🛡️</span>
            </div>
          </div>
        )}

        {step === "booking-type" && (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">How do you want to book?</p>
            
            {/* Option 1 Card */}
            <button
              type="button"
              className={`flex flex-col gap-3 p-4 rounded-2xl border text-left cursor-pointer transition-all duration-200 bg-white ${
                bookingType === "professional" ? "border-purple-600 bg-purple-50/20 shadow-sm" : "border-gray-250 hover:border-purple-300"
              }`}
              onClick={() => setBookingType("professional")}
            >
              <div className="flex justify-between items-start w-full">
                <div className="flex items-center gap-2">
                  {!isElectrician && <span className="text-xl">🎖️</span>}
                  <p className="font-extrabold text-sm text-purple-950 m-0">{option1Title}</p>
                </div>
                <span className={`text-base ${bookingType === "professional" ? "text-purple-700 font-bold" : "text-gray-300"}`}>
                  {bookingType === "professional" ? "●" : "○"}
                </span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed m-0">{option1Desc}</p>
              
              {isElectrician && (
                <div className="flex items-center gap-3 pt-1">
                  <img
                    src="https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=200"
                    alt="individual"
                    className="w-14 h-14 rounded-xl object-cover border border-purple-100"
                  />
                  <span className="text-[10px] text-gray-500 font-bold">Best for fan, switch, or AC repairs</span>
                </div>
              )}
            </button>

            {/* Option 2 Card */}
            <button
              type="button"
              className={`flex flex-col gap-3 p-4 rounded-2xl border text-left cursor-pointer transition-all duration-200 bg-white ${
                (bookingType === "helper" || bookingType === "team") ? "border-purple-600 bg-purple-50/20 shadow-sm" : "border-gray-250 hover:border-purple-300"
              }`}
              onClick={() => setBookingType(isElectrician ? "team" : "helper")}
            >
              <div className="flex justify-between items-start w-full">
                <div className="flex items-center gap-2">
                  {!isElectrician && <span className="text-xl">🛠️</span>}
                  <p className="font-extrabold text-sm text-purple-950 m-0">{option2Title}</p>
                  {isElectrician && (
                    <span className="bg-amber-200 text-amber-955 text-[8px] font-black px-2 py-0.5 rounded-full select-none">
                      FOR BIG JOBS
                    </span>
                  )}
                </div>
                <span className={`text-base ${(bookingType === "helper" || bookingType === "team") ? "text-purple-700 font-bold" : "text-gray-300"}`}>
                  {(bookingType === "helper" || bookingType === "team") ? "●" : "○"}
                </span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed m-0">{option2Desc}</p>
              
              {isElectrician && (
                <div className="flex items-center gap-3 pt-1">
                  <img
                    src="https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=200"
                    alt="team"
                    className="w-14 h-14 rounded-xl object-cover border border-purple-100"
                  />
                  <span className="text-[10px] text-gray-500 font-bold">Best for full-house wiring projects</span>
                </div>
              )}
            </button>
          </div>
        )}

        {step === "team-crew" && (
          <div className="flex flex-col gap-4">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">How do you want to book?</p>
            
            {/* Crew counters */}
            <div className="flex flex-col gap-2.5">
              {[
                { label: "Electricians", count: electricianCount, setter: setElectricianCount, icon: "⚡" },
                { label: "Wiremen", count: wiremanCount, setter: setWiremanCount, icon: "⚡" },
                { label: "Helpers", count: helperCount, setter: setHelperCount, icon: "🔧" },
                { label: "Supervisor", count: supervisorCount, setter: setSupervisorCount, icon: "📋" }
              ].map((row) => (
                <div key={row.label} className="bg-white border border-gray-150 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-xl text-purple-700">{row.icon}</span>
                    <span className="font-extrabold text-sm text-purple-950">{row.label}</span>
                  </div>
                  <div className="flex items-center gap-3 bg-purple-50/50 rounded-full px-2.5 py-1 border border-purple-100/50">
                    <button
                      type="button"
                      onClick={() => row.setter(Math.max(0, row.count - 1))}
                      className="w-6 h-6 rounded-full bg-white text-purple-955 font-bold border border-gray-250 flex items-center justify-center cursor-pointer hover:bg-gray-50 focus:outline-none"
                    >
                      -
                    </button>
                    <span className="font-extrabold text-sm text-purple-955 w-4 text-center">{row.count}</span>
                    <button
                      type="button"
                      onClick={() => row.setter(row.count + 1)}
                      className="w-6 h-6 rounded-full bg-white text-purple-955 font-bold border border-gray-250 flex items-center justify-center cursor-pointer hover:bg-gray-50 focus:outline-none"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add worker type placeholder */}
            <div className="border border-dashed border-gray-300 rounded-2xl p-3.5 text-center bg-white/50 cursor-pointer select-none">
              <span className="text-xs font-bold text-gray-500 flex items-center justify-center gap-1.5">
                ➕ Add worker type
              </span>
            </div>

            {/* Date & Duration Row */}
            <div className="grid grid-cols-2 gap-4 mt-1">
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider px-1">Start Date</label>
                <input
                  type="date"
                  value={teamStartDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setTeamStartDate(e.target.value)}
                  className="bg-white border border-gray-250 rounded-xl p-3 text-xs font-bold text-gray-700 shadow-sm outline-none focus:border-purple-500"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider px-1">Duration (Days)</label>
                <div className="bg-white border border-gray-250 rounded-xl p-2.5 flex items-center justify-between shadow-sm">
                  <button
                    type="button"
                    onClick={() => setTeamDuration(Math.max(1, teamDuration - 1))}
                    className="w-6 h-6 rounded-full bg-gray-100 text-gray-700 font-bold flex items-center justify-center cursor-pointer focus:outline-none"
                  >
                    -
                  </button>
                  <span className="font-extrabold text-xs text-gray-800">{teamDuration}</span>
                  <button
                    type="button"
                    onClick={() => setTeamDuration(teamDuration + 1)}
                    className="w-6 h-6 rounded-full bg-gray-100 text-gray-700 font-bold flex items-center justify-center cursor-pointer focus:outline-none"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Optimization Info Card */}
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3 mt-1.5">
              <span className="text-lg text-amber-700">ℹ️</span>
              <p className="text-xs text-amber-905 leading-relaxed m-0 font-medium">
                Optimal crew size for a 2000 sq.ft project. Adjust based on your site requirements.
              </p>
            </div>
          </div>
        )}

        {step === "team-details" && (
          <div className="flex flex-col gap-4">
            {/* Describe work */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center px-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Describe your project work</label>
                <span className="text-[10px] text-gray-400 font-semibold uppercase">Mandatory</span>
              </div>
              <textarea
                value={issue}
                onChange={(e) => setIssue(e.target.value)}
                placeholder="Full house wiring for a 2BHK — new points, DB board, and earthing."
                className="w-full min-h-[100px] p-3 text-xs border border-gray-250 rounded-2xl focus:outline-none focus:border-purple-600 text-gray-800 bg-white"
              />
            </div>

            {/* Photos */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">Upload Photos (Optional)</label>
              <div className="flex gap-3 overflow-x-auto pb-1 select-none">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-200 border border-gray-100 shadow-inner flex-shrink-0">
                  <img src="https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=200" alt="fusebox" className="w-full h-full object-cover" />
                </div>
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-200 border border-gray-100 shadow-inner flex-shrink-0">
                  <img src="https://images.unsplash.com/photo-1558223180-113b869c647c?w=200" alt="wiring" className="w-full h-full object-cover" />
                </div>
                <button
                  type="button"
                  onClick={() => setPhotos([...photos, "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=200"])}
                  className="w-16 h-16 rounded-xl border border-dashed border-purple-300 bg-purple-50/20 text-purple-700 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-purple-500 hover:bg-purple-50/30 flex-shrink-0 focus:outline-none"
                >
                  <span className="text-lg">📷</span>
                  <span className="text-[9px] font-bold">Add</span>
                </button>
              </div>
            </div>

            {/* Location */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">Site Location</label>
              <div className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center gap-2.5 shadow-sm">
                <span className="text-gray-400">📍</span>
                <input
                  type="text"
                  defaultValue="Kondapur, Hyderabad - 500084"
                  className="w-full border-none focus:outline-none text-xs font-bold text-gray-700 p-0 m-0"
                />
              </div>
              <button type="button" className="text-xs text-purple-800 font-extrabold flex items-center gap-1 self-start mt-0.5 focus:outline-none hover:text-purple-950 cursor-pointer">
                🎯 Use current location
              </button>
            </div>

            {/* Map Frame */}
            <div className="relative w-full h-40 bg-slate-50 border border-gray-150 rounded-2xl overflow-hidden shadow-inner">
              <svg className="absolute inset-0 w-full h-full text-slate-200" xmlns="http://www.w3.org/2000/svg">
                <line x1="0" y1="50" x2="500" y2="50" stroke="currentColor" strokeWidth="6" />
                <line x1="0" y1="120" x2="500" y2="120" stroke="currentColor" strokeWidth="6" />
                <line x1="140" y1="0" x2="140" y2="250" stroke="currentColor" strokeWidth="6" />
                <line x1="300" y1="0" x2="300" y2="250" stroke="currentColor" strokeWidth="6" />
              </svg>
              {/* Map pin */}
              <div className="absolute top-[68px] left-[125px] w-8 h-8 rounded-full bg-purple-900 border border-white flex items-center justify-center shadow-lg text-white text-xs select-none">
                📍
              </div>
            </div>

            {/* Info Helper */}
            <div className="bg-purple-100/30 border border-purple-200/40 rounded-2xl p-4 flex gap-3 mt-0.5">
              <span className="text-lg text-purple-700">ℹ️</span>
              <p className="text-xs text-purple-955 leading-relaxed m-0 font-medium">
                Adding clear photos helps our team estimate the scope and tools required more accurately.
              </p>
            </div>
          </div>
        )}

        {step === "team-budget" && (
          <div className="flex flex-col gap-4">
            {/* Suggested budget */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">Budget per day (Optional ₹)</label>
              <div className="bg-white border border-gray-250 rounded-2xl p-4 flex items-center gap-2 shadow-sm">
                <span className="text-gray-500 font-extrabold">₹</span>
                <input
                  type="text"
                  value={teamBudget}
                  onChange={(e) => setTeamBudget(e.target.value)}
                  placeholder="Suggested ₹6,200"
                  className="w-full border-none focus:outline-none text-xs font-bold text-gray-800 p-0 m-0"
                />
              </div>
              <span className="text-[10px] text-gray-400 px-1 leading-snug">
                Flexible budgets usually get faster responses from elite crews.
              </span>
            </div>

            {/* Work Priority */}
            <div className="flex flex-col gap-2 mt-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">Work Priority</label>
              <div className="flex gap-2">
                {[
                  { id: "Urgent", label: "Urgent" },
                  { id: "Same Day", label: "Same Day" },
                  { id: "Scheduled", label: "Scheduled" }
                ].map((p) => {
                  const isSelected = teamPriority === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setTeamPriority(p.id)}
                      className={`px-4 py-2 text-xs font-bold rounded-full border cursor-pointer transition-all duration-150 ${
                        isSelected
                          ? "bg-purple-100/50 border-purple-700 text-purple-900"
                          : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {isSelected && <span className="mr-1">✓</span>}
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* How do you want to proceed */}
            <div className="flex flex-col gap-3 mt-1.5">
              <p className="text-xs font-black text-gray-900 m-0">How do you want to proceed?</p>
              
              <button
                type="button"
                onClick={() => setTeamProceedMode("Auto")}
                className={`flex items-start gap-4 p-4 rounded-2xl border text-left cursor-pointer transition-all bg-white ${
                  teamProceedMode === "Auto" ? "border-purple-600 bg-purple-50/20 shadow-sm" : "border-gray-200"
                }`}
              >
                <span className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 flex-shrink-0 ${teamProceedMode === "Auto" ? "border-purple-700 bg-purple-700 text-white" : "border-gray-300 bg-white"}`}>
                  {teamProceedMode === "Auto" && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-extrabold text-sm text-purple-950 m-0">Auto Assign Team (Faster)</p>
                    <span className="bg-amber-400 text-purple-950 text-[7px] font-black px-1.5 py-0.5 rounded uppercase">
                      Flash
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed mt-0.5 m-0">
                    Instantly assign our top-rated crew available in your area.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTeamProceedMode("Quotes")}
                className={`flex items-start gap-4 p-4 rounded-2xl border text-left cursor-pointer transition-all bg-white ${
                  teamProceedMode === "Quotes" ? "border-purple-600 bg-purple-50/20 shadow-sm" : "border-gray-200"
                }`}
              >
                <span className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 flex-shrink-0 ${teamProceedMode === "Quotes" ? "border-purple-700 bg-purple-700 text-white" : "border-gray-300 bg-white"}`}>
                  {teamProceedMode === "Quotes" && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                </span>
                <div>
                  <p className="font-extrabold text-sm text-purple-950 m-0">Receive Quotes (Compare & Select)</p>
                  <p className="text-xs text-gray-500 leading-relaxed mt-0.5 m-0">
                    Compare bids and profile details from multiple local crews.
                  </p>
                </div>
              </button>
            </div>

            {/* Quality Cards Grid */}
            <div className="grid grid-cols-2 gap-3.5 mt-1.5">
              <div className="relative aspect-[16/11] rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                <img src="https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=250" alt="crew" className="w-full h-full object-cover filter brightness-[0.7]" />
                <span className="absolute bottom-3 left-3 text-[10px] font-black text-white drop-shadow">
                  5-Star Teams Only
                </span>
              </div>
              <div className="bg-purple-100/30 border border-purple-200/30 rounded-2xl p-4 flex flex-col justify-center items-start gap-1">
                <span className="text-xl">🛡️</span>
                <p className="font-extrabold text-xs text-purple-955 m-0">Background Verified Professionals</p>
              </div>
            </div>
          </div>
        )}

        {step === "team-searching" && (
          <div className="flex flex-col gap-5 py-4">
            {/* Center Animation box */}
            <div className="flex flex-col items-center gap-4 mt-4">
              <div className="w-28 h-28 bg-purple-50 rounded-full border border-purple-100/80 shadow-md flex items-center justify-center relative animate-pulse select-none">
                <span className="text-4xl">🔍</span>
                {/* Rotating search ring */}
                <div className="absolute inset-0 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
              </div>
              
              {/* Spinner dots */}
              <div className="flex gap-1.5 justify-center mt-1">
                <span className="w-2 h-2 rounded-full bg-purple-900 animate-bounce [animation-delay:-0.3s]" />
                <span className="w-2 h-2 rounded-full bg-purple-700 animate-bounce [animation-delay:-0.15s]" />
                <span className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" />
              </div>
              
              <span className="text-[10px] font-black text-purple-955 tracking-widest uppercase mt-0.5">
                Analyzing Fleet
              </span>
            </div>

            {/* Search list indicators */}
            <div className="flex flex-col gap-2.5 mt-2 select-none">
              {[
                { label: "Electricians (2)", status: "found" },
                { label: "Wiremen (2)", status: "found" },
                { label: "Helpers (3)", status: "searching" },
                { label: "Supervisor (1)", status: "waiting" }
              ].map((row) => (
                <div key={row.label} className="bg-white border border-gray-100 rounded-2xl p-3.5 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-sm">
                      {row.status === "found" ? "⚡" : row.status === "searching" ? "⚙️" : "📋"}
                    </span>
                    <span className="font-extrabold text-xs text-gray-800">{row.label}</span>
                  </div>
                  <div>
                    {row.status === "found" ? (
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-extrabold text-[10px] flex items-center justify-center">
                        ✓
                      </span>
                    ) : row.status === "searching" ? (
                      <span className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin block" />
                    ) : (
                      <span className="text-gray-400 text-xs">🕒</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Info Card */}
            <div className="bg-purple-100/30 border border-purple-200/40 rounded-2xl p-4 flex gap-3 mt-1">
              <span className="text-lg text-purple-700">ℹ️</span>
              <p className="text-xs text-purple-955 leading-relaxed m-0 font-medium">
                Team composition is optimized for large industrial wiring projects. Estimated team arrival is 45 mins after booking.
              </p>
            </div>

            {/* Bottom mockup nav tabs */}
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-100 grid grid-cols-4 items-center text-center text-[9px] font-bold text-gray-400 z-40 select-none">
              <div className="cursor-pointer hover:text-purple-900">
                <p className="text-lg m-0">🏠</p>
                <p className="m-0 mt-0.5">Home</p>
              </div>
              <div className="cursor-pointer text-purple-900">
                <p className="text-lg m-0">📋</p>
                <p className="m-0 mt-0.5">Bookings</p>
              </div>
              <div className="cursor-pointer hover:text-purple-900">
                <p className="text-lg m-0">🛡️</p>
                <p className="m-0 mt-0.5">Safety</p>
              </div>
              <div className="cursor-pointer hover:text-purple-900">
                <p className="text-lg m-0">👤</p>
                <p className="m-0 mt-0.5">Account</p>
              </div>
            </div>
          </div>
        )}

        {step === "team-choose" && (
          <div className="flex flex-col gap-4">
            {crewQuotes.length === 0 ? (
              <div className="border border-gray-150 rounded-3xl p-6 text-center text-xs text-gray-500 bg-white">
                No verified teams are available for this requirement right now. Please adjust your crew or try
                again shortly.
              </div>
            ) : (
              <div className="flex flex-col gap-3 mt-1">
                {crewQuotes.map((crew, idx) => {
                  const selected = selectedCrewId === crew.crewId;
                  return (
                    <div
                      key={crew.crewId}
                      className={`border rounded-3xl p-4 flex flex-col gap-3 relative transition-all duration-200 ${
                        selected ? "border-purple-600 bg-purple-50/15 shadow-sm" : "border-gray-150 bg-white"
                      }`}
                    >
                      <div className="flex justify-between items-start w-full">
                        <div>
                          {idx === 0 ? (
                            <span className="text-[8px] font-black text-purple-800 uppercase tracking-wider block">
                              Recommended
                            </span>
                          ) : null}
                          <h3 className="font-extrabold text-sm text-purple-950 mt-0.5 m-0">{crew.name}</h3>
                          <p className="text-[10px] text-gray-500 mt-0.5 m-0">
                            ★ {crew.rating.toFixed(1)} ({crew.reviewCount} ratings)
                            {!crew.covers ? <span className="text-amber-600 font-bold"> · partial match</span> : null}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-purple-955 text-sm m-0">
                            ₹{Math.round(crew.dailyRatePaise / 100).toLocaleString("en-IN")}
                            <span className="text-[10px] font-semibold text-gray-500">/day</span>
                          </p>
                          <p className="text-[10px] text-purple-750 font-extrabold mt-0.5 m-0">
                            Total: ₹{Math.round(crew.totalPaise / 100).toLocaleString("en-IN")}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2.5 flex-wrap">
                        <span className="bg-purple-100/40 text-purple-955 text-[10px] font-bold px-2 py-0.5 rounded-full border border-purple-200/25">⚡ {electricianCount}</span>
                        <span className="bg-purple-100/40 text-purple-955 text-[10px] font-bold px-2 py-0.5 rounded-full border border-purple-200/25">🔌 {wiremanCount}</span>
                        <span className="bg-purple-100/40 text-purple-955 text-[10px] font-bold px-2 py-0.5 rounded-full border border-purple-200/25">🔧 {helperCount}</span>
                        <span className="bg-purple-100/40 text-purple-955 text-[10px] font-bold px-2 py-0.5 rounded-full border border-purple-200/25">👤 {supervisorCount}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedCrewId(crew.crewId)}
                        className={`w-full py-2 rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer ${
                          selected ? "bg-purple-900 hover:bg-purple-955 text-white" : "border border-purple-900 text-purple-900 bg-white"
                        }`}
                      >
                        {selected ? "Selected" : "Accept"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="bg-purple-100/30 border border-purple-200/40 rounded-2xl p-4 flex gap-3 mt-1.5">
              <span className="text-lg text-purple-700">ℹ️</span>
              <p className="text-xs text-purple-955 leading-relaxed m-0 font-medium">
                All teams are VSolve verified and carry their own high-grade industrial equipment and safety gear.
              </p>
            </div>
          </div>
        )}

        {step === "details" && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">{detailsLabel}</label>
              <textarea
                placeholder={detailsPlaceholder}
                value={issue}
                onChange={(e) => setIssue(e.target.value)}
                className="w-full min-h-[100px] p-3 text-xs border border-gray-200 rounded-xl focus:outline-none focus:border-purple-600 text-gray-800"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Upload Photos (Optional)</label>
              <div className="flex gap-2.5 overflow-x-auto pb-1">
                <button
                  type="button"
                  className="w-[72px] h-[72px] flex flex-col items-center justify-center text-gray-400 bg-gray-50 border border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-purple-600 hover:text-purple-600 transition-all"
                  onClick={() => setPhotos([...photos, "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=200"])}
                >
                  <span className="text-lg font-bold">+</span>
                  <span className="text-[9px]">Add Photo</span>
                </button>
                {photos.map((p, idx) => (
                  <div key={idx} className="relative w-[72px] h-[72px] flex-shrink-0">
                    <img src={p} alt="problem" className="w-full h-full rounded-xl object-cover border border-gray-100" />
                    <button
                      type="button"
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] flex items-center justify-center font-bold"
                      onClick={() => setPhotos(photos.filter((_, i) => i !== idx))}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-gray-100 pt-3">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Urgency</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`flex-1 p-3 rounded-xl border text-center cursor-pointer transition-all ${
                    urgency === "normal" ? "border-purple-600 bg-purple-50/20 text-purple-900" : "border-gray-200 text-gray-600 hover:border-purple-200"
                  }`}
                  onClick={() => setUrgency("normal")}
                >
                  <span className="font-bold text-xs block">Normal</span>
                  <span className="text-[9px] opacity-75">As per schedule</span>
                </button>
                <button
                  type="button"
                  className={`flex-1 p-3 rounded-xl border text-center cursor-pointer transition-all ${
                    urgency === "urgent" ? "border-amber-500 bg-amber-50/20 text-amber-900" : "border-gray-200 text-gray-600 hover:border-purple-200"
                  }`}
                  onClick={() => setUrgency("urgent")}
                >
                  <span className="font-bold text-xs block text-amber-700">⚡ Urgent</span>
                  <span className="text-[9px] opacity-75">Within 2-3 hours</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {step === "address" && (
          <div className="flex flex-col gap-3">
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col gap-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Saved Addresses</p>
              {addresses.map((addr) => (
                <button
                  key={addr.id}
                  type="button"
                  className={`w-full p-3.5 rounded-xl border text-left flex items-start gap-3 cursor-pointer transition-all duration-200 bg-white ${
                    selectedAddressId === addr.id ? "border-purple-600 bg-purple-50/20" : "border-gray-100 hover:border-purple-200"
                  }`}
                  onClick={() => setSelectedAddressId(addr.id)}
                >
                  <input type="radio" checked={selectedAddressId === addr.id} readOnly className="mt-1" />
                  <div className="flex-grow min-w-0">
                    <p className="font-semibold text-xs text-gray-800">{addr.label}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed truncate">{addr.fullAddress}</p>
                  </div>
                </button>
              ))}
              {addresses.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">No addresses saved. Please add one below.</p>
              )}
            </div>

            {!showAddAddress ? (
              <button
                type="button"
                className="w-full py-2.5 border border-dashed border-purple-600 text-purple-600 hover:bg-purple-50 text-xs font-semibold rounded-xl transition-all cursor-pointer text-center"
                onClick={() => setShowAddAddress(true)}
              >
                + Add New Address
              </button>
            ) : (
              <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col gap-3">
                <p className="font-bold text-xs text-gray-800 m-0 border-b border-gray-100 pb-2">New Address Details</p>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Label</label>
                  <input
                    type="text"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="Home, Office, Parents..."
                    className="p-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-purple-600"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Full Address</label>
                  <textarea
                    value={newAddressText}
                    onChange={(e) => setNewAddressText(e.target.value)}
                    placeholder="House/Flat No, Apartment Name, Landmark, Area, Pincode"
                    className="p-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-purple-600 min-h-[70px]"
                  />
                </div>
                {error && <div className="text-[11px] text-red-600 font-semibold bg-red-50 p-2 rounded-lg">{error}</div>}
                <div className="flex gap-2 pt-1">
                  <button type="button" className="flex-1 py-2 text-xs font-semibold border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50" onClick={() => setShowAddAddress(false)}>
                    Cancel
                  </button>
                  <button type="button" className="flex-1 py-2 text-xs font-semibold text-white bg-purple-700 hover:bg-purple-800 rounded-lg cursor-pointer" onClick={handleAddAddress} disabled={loading}>
                    {loading ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {step === "schedule" && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col gap-4">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2.5">Select Date</p>
              <div className="grid grid-cols-4 gap-2">
                {["Today, 20 May", "Tue, 21 May", "Wed, 22 May", "Thu, 23 May"].map((d) => {
                  const [day, date] = d.split(", ");
                  const isSelected = selectedDate === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      className={`p-2.5 rounded-xl border flex flex-col items-center justify-center cursor-pointer transition-all ${
                        isSelected ? "border-purple-600 bg-purple-50 text-purple-900 shadow-sm" : "border-gray-200 hover:border-purple-200"
                      }`}
                      onClick={() => setSelectedDate(d)}
                    >
                      <span className="text-[9px] opacity-75 block">{day}</span>
                      <span className="text-xs font-bold mt-0.5">{date}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2.5">Select Time Slot</p>
              <div className="grid grid-cols-2 gap-2">
                {["8 AM - 10 AM", "10 AM - 12 PM", "12 PM - 2 PM", "2 PM - 4 PM", "4 PM - 6 PM", "6 PM - 8 PM"].map((t) => {
                  const isSelected = selectedTimeSlot === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      className={`p-3 rounded-xl border text-center text-xs font-medium cursor-pointer transition-all ${
                        isSelected ? "border-purple-600 bg-purple-50 text-purple-900 shadow-sm" : "border-gray-200 hover:border-purple-200"
                      }`}
                      onClick={() => setSelectedTimeSlot(t)}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {step === "summary" && (
          <div className="flex flex-col gap-4 pb-2">
            {/* Summary card wrapper */}
            <div className="bg-white rounded-2xl border border-gray-150 shadow-sm p-4 relative overflow-hidden flex flex-col gap-4 pb-6">
              {/* Card Header */}
              <div className="flex justify-between items-center border-b border-dashed border-gray-100 pb-3.5">
                <div>
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Service Type</span>
                  <p className="font-extrabold text-sm text-purple-950 mt-0.5">{activeService?.name || "Switch Repair"}</p>
                </div>
                <div className="bg-purple-100 text-purple-900 font-black text-[10px] px-2 py-0.5 rounded-lg flex items-center gap-0.5">
                  AUTO
                </div>
              </div>

              {/* Card List Body */}
              <div className="flex flex-col gap-3.5">
                {/* Problem Description */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center text-purple-700 text-sm flex-shrink-0">
                    📄
                  </div>
                  <div className="min-w-0 flex-grow">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">{isElectrician ? "Problem Description" : "Service Notes"}</span>
                    <p className="text-xs font-medium text-gray-700 mt-0.5 truncate">{issue || issueSummary}</p>
                  </div>
                </div>

                {/* Service Address */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center text-purple-700 text-sm flex-shrink-0">
                    📍
                  </div>
                  <div className="min-w-0 flex-grow">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Service Address</span>
                    <p className="text-xs font-medium text-gray-700 mt-0.5 truncate">
                      {selectedAddress?.fullAddress || "2-3-45, Kukatpally - 500072"}
                    </p>
                  </div>
                </div>

                {/* Schedule Slot */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center text-purple-700 text-sm flex-shrink-0">
                    📅
                  </div>
                  <div className="min-w-0 flex-grow">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">{isTeam ? "Start & Duration" : "Schedule Slot"}</span>
                    <p className="text-xs font-medium text-gray-700 mt-0.5">
                      {isTeam
                        ? `${new Date(teamStartDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} · ${teamDuration} ${teamDuration === 1 ? "day" : "days"}`
                        : `${selectedDate}, ${selectedTimeSlot}`}
                    </p>
                  </div>
                </div>

                {/* Crew requirement (team only) */}
                {isTeam && (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center text-purple-700 text-sm flex-shrink-0">
                      👷
                    </div>
                    <div className="min-w-0 flex-grow">
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Crew Requirement</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {teamRoles.map((r) => (
                          <span key={r.roleId} className="bg-purple-50 text-purple-900 text-[10px] font-bold px-2 py-0.5 rounded-full border border-purple-100">
                            {r.label} × {r.count}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Assigned crew / professional */}
              <div className="flex items-center justify-between border-t border-gray-100 pt-3.5 mt-1 select-none">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-lg border border-purple-100">
                    {isAutoTeam ? "🔔" : "👷"}
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">
                      {isTeam ? "Crew" : "Partner Assignment"}
                    </span>
                    <p className="text-xs font-bold text-purple-950 mt-0.5">
                      {isTeam
                        ? isAutoTeam
                          ? "Auto-assign · first crew to accept"
                          : selectedCrew?.name ?? "Selected crew"
                        : "Auto-assign · first partner to accept"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Zigzag notches inside card bottom */}
              <div className="absolute bottom-0 left-0 right-0 flex justify-between gap-1 overflow-hidden select-none" style={{ transform: "translateY(3px)" }}>
                {Array.from({ length: 24 }).map((_, i) => (
                  <span key={i} className="w-3 h-3 rotate-45 bg-gray-50 border-t border-l border-gray-150 flex-shrink-0" />
                ))}
              </div>
            </div>

            {/* Payment Summary Header */}
            <div className="flex flex-col gap-2 mt-1">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                {isTeam ? "Estimate" : "Payment Summary"}
              </p>

              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>{isTeam ? `Crew charge · ${teamDuration} ${teamDuration === 1 ? "day" : "days"}` : "Service Charge"}</span>
                <span className="font-semibold text-gray-800">₹{serviceCharge.toLocaleString("en-IN")}</span>
              </div>
              {!isTeam && (
                <>
                  <div className="flex justify-between text-xs text-gray-600 mt-1">
                    <span>Platform Fee</span>
                    <span className="font-semibold text-gray-800">₹{platformFee}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-600 mt-1">
                    <span className="flex items-center gap-1">
                      GST (18%) <span className="text-[10px] text-gray-400 font-normal select-none cursor-pointer">ⓘ</span>
                    </span>
                    <span className="font-semibold text-gray-800">₹{gst}</span>
                  </div>
                </>
              )}

              <div className="flex justify-between items-center text-sm font-bold text-gray-850 mt-2.5 pt-2.5 border-t border-gray-200">
                <span>{isAutoTeam ? "Estimated Total" : "Total Amount"}</span>
                <span className="text-xl font-extrabold text-purple-950">₹{totalAmount.toLocaleString("en-IN")}</span>
              </div>

              {isTeam && (
                <div className="mt-1 flex items-start gap-2 rounded-xl bg-green-50 border border-green-100 p-2.5">
                  <span className="text-green-600 text-sm">✓</span>
                  <p className="text-[11px] text-green-800 leading-relaxed m-0">
                    No advance payment. You pay <span className="font-bold">after the work is completed</span>
                    {isAutoTeam ? " — the final amount is confirmed once a crew accepts." : "."}
                  </p>
                </div>
              )}
            </div>

            {/* Apply Coupon Card */}
            <button
              type="button"
              className="w-full bg-purple-100/35 border border-purple-200/50 rounded-2xl p-3 flex items-center justify-between mt-1 hover:bg-purple-100/50 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple-700 text-white flex items-center justify-center text-xs">
                  🏷️
                </div>
                <div className="text-left">
                  <p className="font-bold text-xs text-purple-950 m-0">Apply Coupon</p>
                  <p className="text-[10px] text-purple-700/80 mt-0.5 m-0">Save up to ₹50 on this booking</p>
                </div>
              </div>
              <span className="text-gray-400 text-sm font-bold pr-1 select-none">&gt;</span>
            </button>
          </div>
        )}

      </div>

      {/* Sticky Bottom Actions inside Simulator */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 bg-white border-t border-gray-100 shadow-lg flex gap-3 z-50">
        {step === "select-service" && (
          <button type="button" onClick={handleNext} disabled={!selectedServiceId} className="w-full py-3 bg-purple-800 hover:bg-purple-950 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all flex items-center justify-center gap-1 select-none">
            Next →
          </button>
        )}
        {step === "booking-type" && (
          <button type="button" onClick={handleNext} className="w-full py-3 bg-purple-800 hover:bg-purple-900 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all text-center">
            Next
          </button>
        )}
        {step === "details" && (
          <button type="button" onClick={handleNext} className="w-full py-3 bg-purple-800 hover:bg-purple-900 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all text-center">
            Next
          </button>
        )}
        {step === "address" && (
          <button type="button" onClick={handleNext} disabled={!selectedAddressId} className="w-full py-3 bg-purple-800 hover:bg-purple-900 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all text-center">
            Next
          </button>
        )}
        {step === "schedule" && (
          <button type="button" onClick={handleNext} className="w-full py-3 bg-purple-800 hover:bg-purple-900 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all text-center">
            Next
          </button>
        )}
        {step === "team-crew" && (
          <button type="button" onClick={handleNext} className="w-full py-3 bg-purple-900 hover:bg-purple-950 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all text-center">
            Next
          </button>
        )}
        {step === "team-details" && (
          <button type="button" onClick={handleNext} className="w-full py-3 bg-purple-900 hover:bg-purple-950 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all text-center">
            Next →
          </button>
        )}
        {step === "team-budget" && (
          <button type="button" onClick={handleNext} disabled={loading} className="w-full py-3 bg-purple-900 hover:bg-purple-950 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all text-center">
            {loading ? "Sending request…" : teamProceedMode === "Auto" ? "Send Request to Crews 🔔" : "Find Teams 🔍"}
          </button>
        )}
        {step === "team-searching" && (
          <div className="w-full text-center text-xs font-semibold text-purple-955 animate-pulse py-3">
            Analyzing crew availability...
          </div>
        )}
        {step === "team-choose" && (
          <button type="button" onClick={handleNext} className="w-full py-3 bg-purple-900 hover:bg-purple-950 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all text-center">
            Continue
          </button>
        )}
        {step === "summary" && (
          <button type="button" onClick={handleNext} disabled={loading} className="w-full py-3 bg-purple-800 hover:bg-purple-900 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all flex items-center justify-center gap-1">
            {loading ? "Sending request…" : isTeam ? "Book Now" : "Request Partner →"}
          </button>
        )}
      </div>
    </div>
  );
}

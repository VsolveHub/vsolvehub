"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ServiceBookingFlow — the single, config-driven booking flow for all four
// Phase-1 dispatch categories (Technician, Beauty, Home, Pet). Screens:
//   service → guidelines → when (instant/scheduled) → requirements → payment
//
// The customer never picks a professional. They pay, and dispatch fans the job
// out to every eligible provider in range; the first to accept is assigned. That
// keeps the customer out of a choice they cannot make well (who is actually free
// right now) and it is what makes the money flow work: the job is funded before
// any provider is asked to commit to it.
//
// After payment it redirects to /booking/track/[ref], where the tracker owns the
// searching → assigned → live tracking sequence.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatPrice } from "@/lib/format";
import { FlowPageShell } from "@/components/shared/FlowPageShell";
import { api } from "@/lib/query/api";
import { qk } from "@/lib/query/keys";
import {
  getServiceConfig,
  defaultDetailValues,
  toDetailPairs,
  type DetailField,
} from "@/lib/catalog/service-config";
import { estimatePrice, startingPricePaise, type Selections } from "@/lib/catalog/pricing";
import { RequirementSheet } from "@/components/customer/booking/RequirementSheet";
import { ServiceSketchImage } from "@/components/ui/ServiceSketchImage";
import { AddressPicker } from "@/components/customer/address/AddressPicker";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";

export type FlowService = {
  id: string;
  name: string;
  slug: string;
  description: string;
  pricePaise: number;
  duration: number;
  unit: string;
  category: { slug: string; name: string; icon: string };
  subCategory: { slug: string; name: string } | null;
};

type Address = {
  id: string;
  label: string;
  fullAddress: string;
  isDefault: boolean;
};

type Provider = {
  id: string;
  name: string;
  rating: number;
  jobsCompleted: number;
  distanceKm: number;
  etaMins: number;
};

type Step = "service" | "guidelines" | "when" | "details" | "payment";

/** Payment methods offered at checkout. See PaymentMethod in @vsolve/db. */
const PAYMENT_METHODS = [
  { id: "upi", label: "UPI", hint: "Pay instantly via any UPI app" },
  { id: "card", label: "Card", hint: "Credit or debit card" },
  { id: "cod", label: "Pay after service", hint: "Cash or UPI to the professional" },
] as const;

type PaymentMethodId = (typeof PAYMENT_METHODS)[number]["id"];

const BOOKING_RESUME_KEY = "vsolve:booking-flow-resume";

type BookingResumeState = {
  step: Step;
  selectedServiceId: string;
  scheduleType: "instant" | "scheduled";
  dateKey: string;
  timeSlot: string;
  detailValues: Selections;
  note: string;
  photos: string[];
  paymentMethod: PaymentMethodId;
  addressId: string;
  autoSubmit?: boolean;
};

type Props = {
  services: FlowService[];
  categorySlug: string;
  categoryName: string;
  initialServiceId?: string;
};

const TIME_SLOTS = ["08–10 AM", "10–12 PM", "12–02 PM", "02–04 PM", "04–06 PM", "06–08 PM"];

function nextDays(count: number) {
  const out: { key: string; day: string; date: string }[] = [];
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let i = 0; i < count; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    out.push({
      key: d.toISOString().slice(0, 10),
      day: i === 0 ? "Today" : days[d.getDay()]!,
      date: `${d.getDate()} ${d.toLocaleString("en-IN", { month: "short" })}`,
    });
  }
  return out;
}

export function ServiceBookingFlow({ services, categorySlug, categoryName, initialServiceId }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const resumedRef = useRef(false);

  const singleService = services.length === 1;
  const [selectedServiceId, setSelectedServiceId] = useState(
    initialServiceId ?? (singleService ? services[0]!.id : ""),
  );
  const [step, setStep] = useState<Step>(
    initialServiceId || singleService ? "guidelines" : "service",
  );

  const service = useMemo(
    () => services.find((s) => s.id === selectedServiceId) ?? null,
    [services, selectedServiceId],
  );
  const config = useMemo(
    () => getServiceConfig(categorySlug, service?.subCategory?.slug, service?.slug),
    [categorySlug, service],
  );

  // Session + addresses — cached and shared across every screen (instant revisit).
  const { data: sessionData } = useQuery({
    queryKey: qk.session(),
    queryFn: api.session,
    staleTime: 5 * 60_000,
  });
  const isLoggedIn = !!sessionData?.user;

  const { data: addressData } = useQuery({
    queryKey: qk.addresses(),
    queryFn: api.addresses,
    staleTime: 60_000,
  });
  const addresses = addressData?.addresses ?? [];
  const [addressId, setAddressId] = useState("");

  // Booking form state
  const [scheduleType, setScheduleType] = useState<"instant" | "scheduled">("instant");
  const [dateKey, setDateKey] = useState(() => nextDays(1)[0]!.key);
  const [timeSlot, setTimeSlot] = useState(TIME_SLOTS[2]!);
  const [detailValues, setDetailValues] = useState<Selections>({});
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>("upi");
  const [error, setError] = useState("");
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [showAddrPicker, setShowAddrPicker] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});

  // Guard the details step: an address is required, and every field flagged
  // `required` in the service config must have a non-empty value. Returns true
  // when the step is safe to advance/submit; otherwise sets inline errors.
  function validateDetails(): boolean {
    if (!addressId) {
      setError("Please select or add a service address.");
      return false;
    }
    const errs: Record<string, boolean> = {};
    for (const f of config.detailFields) {
      if (!f.required) continue;
      const v = detailValues[f.key];
      const empty = Array.isArray(v)
        ? v.length === 0
        : v === undefined || v === null || (typeof v === "string" && v.trim() === "");
      if (empty) errs[f.key] = true;
    }
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      setError("Please complete the highlighted required fields.");
      return false;
    }
    setError("");
    return true;
  }

  const days = useMemo(() => nextDays(5), []);

  // The live estimate — recomputed on every requirement tap and shown wherever a
  // price appears, so the summary, the banner, and the confirm button can never
  // disagree with each other. The server recomputes this independently at submit.
  const estimate = useMemo(
    () => estimatePrice(config.detailFields, detailValues),
    [config.detailFields, detailValues],
  );
  const startsAtPaise = useMemo(
    () => startingPricePaise(config.detailFields) || service?.pricePaise || 0,
    [config.detailFields, service],
  );

  // Seed structured-field defaults whenever the service (and thus config) changes.
  useEffect(() => {
    setDetailValues(defaultDetailValues(config.detailFields));
    if (!config.bookingTypes.includes("instant")) setScheduleType("scheduled");
  }, [config]);

  // Default-select the customer's primary address once addresses load.
  useEffect(() => {
    if (!addressId && addresses.length) {
      const def = addresses.find((a) => a.isDefault) ?? addresses[0];
      if (def) setAddressId(def.id);
    }
  }, [addresses, addressId]);

  function buildResumeState(overrides: Partial<BookingResumeState> & { step: Step }): BookingResumeState {
    return {
      selectedServiceId,
      scheduleType,
      dateKey,
      timeSlot,
      detailValues,
      note,
      photos,
      paymentMethod,
      addressId,
      ...overrides,
    };
  }

  async function requireLoginThen(next: () => void, resume: BookingResumeState) {
    const latest = await queryClient.fetchQuery({ queryKey: qk.session(), queryFn: api.session });
    if (latest?.user) return next();
    try {
      sessionStorage.setItem(BOOKING_RESUME_KEY, JSON.stringify(resume));
    } catch {
      /* private browsing */
    }
    const target = window.location.pathname + window.location.search;
    router.push(`/booking/otp?redirect=${encodeURIComponent(target)}`);
  }

  // After OTP (or a stale session cache), restore the step the customer was on.
  useEffect(() => {
    if (!isLoggedIn || resumedRef.current) return;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(BOOKING_RESUME_KEY);
      if (!raw) return;
      sessionStorage.removeItem(BOOKING_RESUME_KEY);
    } catch {
      return;
    }

    try {
      const saved = JSON.parse(raw) as BookingResumeState;
      resumedRef.current = true;
      if (saved.selectedServiceId) setSelectedServiceId(saved.selectedServiceId);
      setStep(saved.step);
      setScheduleType(saved.scheduleType);
      setDateKey(saved.dateKey);
      setTimeSlot(saved.timeSlot);
      setDetailValues(saved.detailValues);
      setNote(saved.note);
      setPhotos(saved.photos);
      if (saved.paymentMethod) setPaymentMethod(saved.paymentMethod);
      if (saved.addressId) setAddressId(saved.addressId);
      if (saved.autoSubmit) setPendingSubmit(true);
    } catch {
      /* corrupt resume payload */
    }
  }, [isLoggedIn]);

  async function handlePhotoUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const picked = Array.from(files).slice(0, 5 - photos.length);
    const tooBig = picked.find((f) => f.size > 8 * 1024 * 1024);
    if (tooBig) {
      setError(`"${tooBig.name}" is over 8 MB. Please choose a smaller image.`);
      return;
    }
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      picked.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/bookings/media", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok && Array.isArray(data.urls)) {
        setPhotos((p) => [...p, ...data.urls].slice(0, 5));
      } else {
        setError(typeof data?.error === "string" ? data.error : "Couldn't upload photos. Please try again.");
      }
    } catch {
      setError("Couldn't upload photos. Please check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  function buildSlotIso(): string {
    if (scheduleType === "instant") return new Date(Date.now() + 45 * 60 * 1000).toISOString();
    // Map the display slot to its start hour.
    const startHour = 8 + TIME_SLOTS.indexOf(timeSlot) * 2;
    const d = new Date(`${dateKey}T00:00:00`);
    d.setHours(startHour, 0, 0, 0);
    return d.toISOString();
  }

  const createBooking = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.createBooking(payload),
    onSuccess: (data) => router.push(`/booking/track/${data.bookingRef}`),
    onError: (e) => setError(e instanceof Error ? e.message : "Could not create booking"),
  });

  function submit() {
    if (!service) return;
    // Defense in depth: the details step is normally validated before we get
    // here, but the resume/auto-submit path can call submit() directly.
    if (!validateDetails()) return;
    createBooking.mutate({
      serviceId: service.id,
      addressId,
      slot: buildSlotIso(),
      // No partnerId: the job always fans out to every eligible provider and the
      // first to accept is assigned.
      paymentMethod,
      issueDescription: note || undefined,
      mediaUrls: photos,
      scheduleType,
      // The server recomputes the price from these; the estimate shown in the UI
      // is never sent as an amount.
      selections: detailValues,
      archetypeDetails: {
        bookingType: "individual",
        scheduleType,
        fieldValues: detailValues,
        details: toDetailPairs(config.detailFields, detailValues),
      },
    });
  }

  useEffect(() => {
    if (!pendingSubmit || !service || !addressId) return;
    setPendingSubmit(false);
    submit();
  }, [pendingSubmit, service, addressId]);

  // Scroll to top when step changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  function back() {
    const order: Step[] = ["service", "guidelines", "when", "details", "payment"];
    const i = order.indexOf(step);
    if (i <= 0 || (step === "guidelines" && (singleService || initialServiceId))) {
      router.back();
      return;
    }
    setStep(order[i - 1]!);
  }


  const summaryAside =
    service ? (
      <div className="flow-summary-card-v3">
        <p className="summary-title-v3">BOOKING SUMMARY</p>
        <h2 className="summary-service-name">{service.name}</h2>
        <p className="summary-price-v3">
          Starts at <strong>{formatPrice(startsAtPaise)}</strong>
        </p>
        <p className="summary-desc-v3">{config.guidelines.summary}</p>

        <div className="summary-pills-v3">
          <span className="summary-pill active">
            <FlaticonIcon name={scheduleType === "instant" ? "bolt" : "calendar"} size={11} />
            {scheduleType === "instant" ? " INSTANT" : " SCHEDULED"}
          </span>
          {service.duration > 0 && (
            <span className="summary-pill">⏱ ~{Math.max(1, Math.round(service.duration / 60))} HR</span>
          )}
        </div>

        <div className="summary-breakdown-v3">
          <div className="summary-row">
            <span>Base</span>
            <strong>{formatPrice(estimate.basePaise)}</strong>
          </div>
          {estimate.lineItems
            .filter((li) => li.kind !== "variant")
            .map((li) => (
              <div className="summary-row" key={`${li.key}-${li.value}`}>
                <span>
                  {li.value}
                  {li.qty > 1 && ` × ${li.qty}`}
                </span>
                <strong>+{formatPrice(li.totalPaise)}</strong>
              </div>
            ))}
          <div className="summary-row">
            <span>Platform fee</span>
            <strong className="text-green-600">FREE</strong>
          </div>
          <div className="summary-row total-row">
            <span>Estimated total</span>
            <strong>{formatPrice(estimate.totalPaise)}</strong>
          </div>
          <p className="summary-row text-xs" style={{ color: "#6b7280" }}>
            Final price is confirmed from your selected requirements.
          </p>
        </div>
      </div>
    ) : null;

  const customHeader = (
    <div className="flow-step-header-v3">
      <div className="flow-header-top">
        <button className="flow-back-btn" onClick={back}>←</button>
        <div className="flow-header-title-box">
          <h1>{categoryName}</h1>
          <div className="flow-breadcrumbs">
            Services <span>›</span> <strong>{categoryName}</strong>
          </div>
        </div>
      </div>
      <div className="flow-progress-bar-v3">
        <div className={`progress-step ${step === 'service' ? 'active' : 'done'}`}>
          <div className="step-circle">1</div>
          <span>Select</span>
        </div>
        <div className="step-divider">›</div>
        <div className={`progress-step ${step === 'guidelines' ? 'active' : (['when', 'details', 'payment'].includes(step) ? 'done' : '')}`}>
          <div className="step-circle">2</div>
          <span>Scope</span>
        </div>
        <div className="step-divider">›</div>
        <div className={`progress-step ${step === 'when' ? 'active' : (['details', 'payment'].includes(step) ? 'done' : '')}`}>
          <div className="step-circle">3</div>
          <span>Slot</span>
        </div>
        <div className="step-divider">›</div>
        <div className={`progress-step ${step === 'details' ? 'active' : (step === 'payment' ? 'done' : '')}`}>
          <div className="step-circle">4</div>
          <span>Details</span>
        </div>
        <div className="step-divider">›</div>
        <div className={`progress-step ${step === 'payment' ? 'active' : ''}`}>
          <div className="step-circle">5</div>
          <span>Pay</span>
        </div>
      </div>
    </div>
  );

  return (
    <FlowPageShell
      header={customHeader}
      stepper={null}
      aside={step !== 'service' ? summaryAside : null}
      footer={null}
    >
        {error && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold px-3 py-2">{error}</div>}

        {/* STEP: choose specific service */}
        {step === "service" && (
          <div className="flow-step-service-v3">
            <h2 className="flow-step-title">SELECT A SERVICE</h2>
            <div className="flow-service-list-v3">
              {services.map((s) => {
                const isRecommended = s.name.toLowerCase().includes("deep") || s.name.toLowerCase().includes("premium");
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSelectedServiceId(s.id);
                      setStep("guidelines");
                    }}
                    className={`flow-service-card-v3 ${isRecommended ? 'recommended' : ''}`}
                  >
                    {isRecommended && (
                      <div className="card-rec-badge">
                        <span>Recommended</span>
                        <div className="rec-check">✓</div>
                      </div>
                    )}
                    <div className="card-img-col">
                      <ServiceSketchImage
                        slug={s.slug}
                        subCategorySlug={s.subCategory?.slug ?? s.slug}
                        categorySlug={s.category.slug}
                        serviceName={s.name}
                        variant="card"
                        alt={s.name}
                      />
                    </div>
                    <div className="card-info-col">
                      <div className="card-info-top">
                        <h3 className="card-title">{s.name}</h3>
                        {!isRecommended && <span className="trending-badge">Trending</span>}
                      </div>
                      <p className="card-desc">{s.description}</p>
                      <div className="card-info-bottom">
                        <div className="card-price">Starts at {formatPrice(s.pricePaise)}</div>
                        {isRecommended ? (
                          <div className="card-select-btn">Select</div>
                        ) : (
                          <div className="card-arrow">›</div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            
            <div className="expertpass-banner">
              <div className="ep-content">
                <h2>Save up to 30% with ExpertPass</h2>
                <p>Get discounted rates and priority booking for all your home cleaning and maintenance needs.</p>
                <button className="ep-btn">Explore Membership</button>
              </div>
              <div className="ep-graphic">
                <div className="ep-card">
                  <div className="ep-card-top">
                    <strong>ExpertPass</strong>
                    <span className="ep-badge">✓</span>
                  </div>
                  <div className="ep-card-line"></div>
                  <div className="ep-card-bottom">Membership ID: EE-0921-2024</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP: guidelines / scope */}
        {step === "guidelines" && service && (
          <div className="flow-guidelines-v3">
            <div className="flow-guidelines-header">
              <h2 className="gl-title">{service.name}</h2>
              <p className="gl-desc">{config.guidelines.summary}</p>
              <p className="gl-price">
                Starts at {formatPrice(startsAtPaise)}
                <span className="gl-duration">· ~{Math.max(1, Math.round(service.duration / 60))} hr</span>
              </p>
            </div>

            <div className="gl-sections-wrapper">
              <div className="gl-section good">
                <p className="gl-section-title">WHAT'S INCLUDED</p>
                <ul className="gl-list">
                  {config.guidelines.included.map((it, i) => (
                    <li key={i}><span className="gl-icon good-icon">✓</span>{it}</li>
                  ))}
                </ul>
              </div>
              <div className="gl-section bad">
                <p className="gl-section-title">NOT INCLUDED</p>
                <ul className="gl-list">
                  {config.guidelines.notIncluded.map((it, i) => (
                    <li key={i}><span className="gl-icon bad-icon">✕</span>{it}</li>
                  ))}
                </ul>
              </div>
              <div className="gl-section info">
                <p className="gl-section-title">GOOD TO KNOW</p>
                <ul className="gl-list">
                  {config.guidelines.goodToKnow.map((it, i) => (
                    <li key={i}><span className="gl-icon info-icon">•</span>{it}</li>
                  ))}
                </ul>
              </div>
            </div>
            
            <button className="flow-continue-btn" onClick={() => setStep('when')}>
              Continue →
            </button>
          </div>
        )}

        {/* STEP: instant vs scheduled */}
        {step === "when" && (
          <div className="flow-when-v3">
            <h2 className="when-title">When do you need it?</h2>
            
            <div className="when-options-v3">
              {config.bookingTypes.includes("instant") && (
                <button 
                  className={`when-option-card ${scheduleType === 'instant' ? 'selected' : ''}`}
                  onClick={() => setScheduleType("instant")}
                >
                  <div className="when-icon-box"><FlaticonIcon name="bolt" size={22} /></div>
                  <div className="when-info-box">
                    <p className="when-opt-title">
                      Instant <span className="when-badge">FASTEST</span>
                    </p>
                    <p className="when-opt-desc">A professional arrives within 30–60 mins</p>
                  </div>
                  <div className={`when-radio ${scheduleType === 'instant' ? 'checked' : ''}`}></div>
                </button>
              )}
              
              <button 
                className={`when-option-card ${scheduleType === 'scheduled' ? 'selected' : ''}`}
                onClick={() => setScheduleType("scheduled")}
              >
                <div className="when-icon-box plain"><FlaticonIcon name="calendar" size={22} /></div>
                <div className="when-info-box">
                  <p className="when-opt-title">Scheduled</p>
                  <p className="when-opt-desc">Pick a date & time that suits you</p>
                </div>
                <div className={`when-radio ${scheduleType === 'scheduled' ? 'checked' : ''}`}></div>
              </button>
            </div>
            
            {scheduleType === "scheduled" && (
              <div className="scheduled-picker-v3">
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-2 px-2 snap-x">
                  {days.map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => setDateKey(d.key)}
                      className={`flex-shrink-0 w-20 rounded-2xl border-2 px-2 py-3 text-center transition-all snap-start ${
                        dateKey === d.key ? "bg-brand border-brand text-white shadow-md transform scale-105" : "border-gray-100 text-gray-700 bg-gray-50 hover:border-blue-800"
                      }`}
                    >
                      <span className="block text-[10px] font-black uppercase tracking-wider opacity-80">{d.day}</span>
                      <span className="block text-sm font-extrabold mt-1">{d.date}</span>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4">
                  {TIME_SLOTS.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setTimeSlot(slot)}
                      className={`rounded-xl border px-2 py-3 text-[11px] font-bold transition-all ${
                        timeSlot === slot ? "bg-blue-50 border-brand text-brand shadow-sm ring-1 ring-blue-800" : "border-gray-200 text-gray-600 hover:border-blue-800 hover:bg-blue-50/50"
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            <div className="when-footer-v3">
              <button 
                className="flow-continue-btn black-btn" 
                onClick={() => requireLoginThen(() => setStep("details"), buildResumeState({ step: "details" }))}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* STEP: job details */}
        {step === "details" && (
          <div>
            {/* Address */}
            <div>
              <h3 className="text-[0.8rem] font-bold text-gray-600 tracking-[0.05em] mb-4">SERVICE LOCATION</h3>
              {addresses.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setShowAddrPicker(true)}
                  className="flex items-center gap-3 w-full p-4 bg-white border border-dashed border-brand rounded-lg cursor-pointer text-left"
                >
                  <div className="w-10 h-10 shrink-0 flex items-center justify-center text-red-500">
                    <FlaticonIcon name="marker" size={18} />
                  </div>
                  <div className="grow text-left">
                    <p className="text-[0.95rem] font-bold text-gray-900">Add a service address</p>
                    <p className="text-[0.8rem] text-gray-500 mt-[0.2rem]">Use your current location or enter it manually</p>
                  </div>
                  <span aria-hidden className="ml-auto text-xl text-brand">+</span>
                </button>
              ) : (
                <div className="flex flex-col gap-3 mb-6">
                  {addresses.map((a) => {
                    const sel = addressId === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setAddressId(a.id)}
                        className={`flex items-center w-full p-4 bg-white rounded-lg cursor-pointer text-left ${
                          sel ? "border-2 border-black" : "border border-gray-900"
                        }`}
                      >
                        <div className="w-10 h-10 shrink-0 flex items-center justify-center text-red-500">
                          <FlaticonIcon name="marker" size={18} />
                        </div>
                        <div className="grow text-left">
                          <p className="text-[0.95rem] font-bold text-gray-900">{a.label}</p>
                          <p className="text-[0.8rem] text-gray-500 mt-[0.2rem]">{a.fullAddress}</p>
                        </div>
                        <div
                          className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center ${
                            sel ? "border-black" : "border-gray-300"
                          }`}
                        >
                          {sel && <span className="w-2 h-2 bg-black rounded-full" />}
                        </div>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setShowAddrPicker(true)}
                    className="flex items-center gap-3 w-full p-4 bg-white border border-dashed border-brand rounded-lg cursor-pointer text-left"
                  >
                    <div className="w-10 h-10 shrink-0 flex items-center justify-center text-[1.2rem] text-brand">+</div>
                    <div className="grow text-left">
                      <p className="text-[0.95rem] font-bold text-gray-900">Add / change address</p>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Priced requirement configurator — drives the live estimate. */}
            {config.detailFields.length > 0 && service && (
              <RequirementSheet
                serviceName={service.name}
                durationMins={service.duration}
                fields={config.detailFields}
                value={detailValues}
                onChange={setDetailValues}
                fieldErrors={fieldErrors}
                showFooter={false}
              />
            )}

            <div className="grid grid-cols-2 gap-4 mb-4">
              {/* Photos (optional) */}
              <div>
                <h3 className="text-[0.8rem] font-bold text-gray-600 tracking-[0.05em] mb-4">ADD PHOTOS (OPTIONAL)</h3>
                <div>
                  <div className="flex gap-4 mb-4">
                    {photos.map((url) => (
                      <img key={url} src={url} alt="upload" className="w-20 h-20 object-cover rounded-lg" />
                    ))}
                    {photos.length < 5 && (
                      <label
                        className="w-20 h-20 border border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer bg-gray-50"
                        aria-busy={uploading}
                      >
                        <span className="text-2xl text-gray-400">{uploading ? "…" : "+"}</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          hidden
                          disabled={uploading}
                          onChange={(e) => handlePhotoUpload(e.target.files)}
                        />
                      </label>
                    )}
                  </div>
                  <p className="text-[0.8rem] text-gray-500">Add images of rooms or specific problem areas.</p>
                </div>
              </div>

              {/* Note (optional) */}
              <div>
                <div className="flex justify-between">
                  <h3 className="text-[0.8rem] font-bold text-gray-600 tracking-[0.05em] mb-4">ADD A NOTE (OPTIONAL)</h3>
                  <span className="text-xs text-gray-400">{note.length}/250</span>
                </div>
                <textarea
                  value={note}
                  maxLength={250}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Access instructions, problem areas, or preferences..."
                  className="w-full h-[120px] p-4 border border-gray-200 rounded-lg resize-none text-[0.9rem]"
                />
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 pt-4 mt-4">
              <div className="flex items-center gap-2 text-green-800 text-[0.9rem] font-semibold">
                <FlaticonIcon name="shield" size={16} />
                <span>Safe &amp; Professional Services</span>
              </div>
              <button
                className="w-full p-4 rounded-lg text-base font-bold cursor-pointer transition-opacity bg-brand text-white hover:opacity-90"
                onClick={() => { if (validateDetails()) setStep("payment"); }}
              >
                Continue to payment ›
              </button>
            </div>
          </div>
        )}

        {/* STEP: review & pay. Dispatch auto-assigns after payment. */}
        {step === "payment" && service && (
          <div className="flow-provider-v3">
            <h2 className="provider-title">Review &amp; pay</h2>
            <div className="provider-step-counter">Final step</div>
            <div className="provider-divider-v3"></div>

            {/* Price breakdown — the same numbers the server will recompute. */}
            <p className="text-[0.8rem] font-bold text-gray-600 tracking-[0.05em] mb-4">YOUR ESTIMATE</p>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 mb-6">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-[0.95rem] font-bold text-gray-900">{service.name}</p>
                  <p className="text-[0.8rem] text-gray-500">
                    {scheduleType === "instant" ? "Within 30–60 mins" : `${dateKey} · ${timeSlot}`}
                  </p>
                </div>
                <span className="text-[0.8rem] font-semibold text-gray-500 whitespace-nowrap">
                  ~{Math.max(1, Math.round(service.duration / 60))} hr
                </span>
              </div>

              {estimate.lineItems.map((li) => (
                <div
                  key={`${li.key}-${li.value}`}
                  className="flex items-center justify-between py-1 text-[0.85rem]"
                >
                  <span className="text-gray-600">
                    {li.value}
                    {li.qty > 1 && ` × ${li.qty}`}
                  </span>
                  <span className="font-semibold text-gray-900">{formatPrice(li.totalPaise)}</span>
                </div>
              ))}

              <div className="flex items-center justify-between border-t border-gray-100 mt-3 pt-3">
                <span className="text-[0.9rem] font-bold text-gray-900">Total</span>
                <span className="text-[1.05rem] font-extrabold text-gray-900">
                  {formatPrice(estimate.totalPaise)}
                </span>
              </div>
            </div>

            {/* Payment method */}
            <p className="text-[0.8rem] font-bold text-gray-600 tracking-[0.05em] mb-4">PAYMENT METHOD</p>
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setPaymentMethod(m.id)}
                aria-pressed={paymentMethod === m.id}
                className={`provider-card-v3 ${paymentMethod === m.id ? "selected" : ""}`}
              >
                <div className="provider-icon-box">
                  <FlaticonIcon name={m.id === "cod" ? "wallet" : "card"} size={22} />
                </div>
                <div className="provider-info-box">
                  <p className="provider-opt-title">{m.label}</p>
                  <p className="provider-opt-desc">{m.hint}</p>
                </div>
                <div className={`address-radio ${paymentMethod === m.id ? "checked" : ""}`}>
                  <div className="radio-inner"></div>
                </div>
              </button>
            ))}

            <div className="provider-info-banner">
              <span className="info-icon"><FlaticonIcon name="bolt" size={16} /></span>
              <p>
                We'll notify every available professional near you — the first to accept is
                assigned. {paymentMethod === "cod"
                  ? "You pay after the service is done."
                  : "You're only charged once a professional accepts."}
              </p>
            </div>

            <div className="provider-footer-v3">
              <button
                className="flow-continue-btn blue-btn"
                onClick={() => requireLoginThen(submit, buildResumeState({ step: "payment", autoSubmit: true }))}
                disabled={createBooking.isPending}
              >
                {createBooking.isPending
                  ? "Confirming…"
                  : `${paymentMethod === "cod" ? "Confirm booking" : "Pay"} • ${formatPrice(estimate.totalPaise)}`}
              </button>
            </div>
          </div>
        )}

        <AddressPicker
          open={showAddrPicker}
          redirectAfterLogin={typeof window !== "undefined" ? window.location.pathname + window.location.search : "/"}
          onClose={() => setShowAddrPicker(false)}
          onSelected={(a) => {
            setAddressId(a.id);
            queryClient.invalidateQueries({ queryKey: qk.addresses() });
          }}
        />
    </FlowPageShell>
  );
}

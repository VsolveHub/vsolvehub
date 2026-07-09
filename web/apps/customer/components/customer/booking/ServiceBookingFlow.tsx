"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ServiceBookingFlow — the single, config-driven booking flow for all four
// Phase-1 dispatch categories (Technician, Beauty, Home, Pet). Replaces the
// per-category *BookingFlow components. Screens:
//   service → guidelines → when (instant/scheduled) → details → provider → submit
// After submit it redirects to /booking/track/[ref], where BookingTracker owns the
// searching → pay-after-accept → live tracking sequence.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatPrice } from "@/lib/format";
import { FlowPageHeader, FlowPageShell } from "@/components/shared/FlowPageShell";
import { api } from "@/lib/query/api";
import { qk } from "@/lib/query/keys";
import {
  getServiceConfig,
  defaultDetailValues,
  toDetailPairs,
  type DetailField,
} from "@/lib/catalog/service-config";
import { ServiceIcon } from "@/components/ui/ServiceIcons";
import { ServiceSketchImage } from "@/components/ui/ServiceSketchImage";
import { getServiceCardMeta } from "@/lib/catalog/service-card-meta";

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

type Step = "service" | "guidelines" | "when" | "details" | "provider";

const BOOKING_RESUME_KEY = "vsolve:booking-flow-resume";

type BookingResumeState = {
  step: Step;
  selectedServiceId: string;
  scheduleType: "instant" | "scheduled";
  dateKey: string;
  timeSlot: string;
  detailValues: Record<string, string | number>;
  note: string;
  photos: string[];
  providerChoice: string;
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

const FLOW_STEPS: { key: Step; label: string }[] = [
  { key: "service", label: "Select" },
  { key: "guidelines", label: "Scope" },
  { key: "when", label: "Slot" },
  { key: "details", label: "Address" },
  { key: "provider", label: "Confirm" },
];

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
  const [detailValues, setDetailValues] = useState<Record<string, string | number>>({});
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [providerChoice, setProviderChoice] = useState<string>("auto"); // "auto" | partnerId
  const [error, setError] = useState("");
  const [pendingSubmit, setPendingSubmit] = useState(false);

  const days = useMemo(() => nextDays(5), []);

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

  // Real online providers — only fetched once the customer reaches the provider step.
  const { data: providerData, isFetching: providersLoading } = useQuery({
    queryKey: qk.providers(service?.id ?? "", addressId),
    queryFn: () => api.providers(service!.id, addressId || undefined),
    enabled: step === "provider" && !!service,
    staleTime: 30_000,
  });
  const providers = providerData?.providers ?? [];

  function buildResumeState(overrides: Partial<BookingResumeState> & { step: Step }): BookingResumeState {
    return {
      selectedServiceId,
      scheduleType,
      dateKey,
      timeSlot,
      detailValues,
      note,
      photos,
      providerChoice,
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
      setProviderChoice(saved.providerChoice);
      if (saved.addressId) setAddressId(saved.addressId);
      if (saved.autoSubmit) setPendingSubmit(true);
    } catch {
      /* corrupt resume payload */
    }
  }, [isLoggedIn]);

  async function handlePhotoUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const fd = new FormData();
      Array.from(files)
        .slice(0, 5 - photos.length)
        .forEach((f) => fd.append("files", f));
      const res = await fetch("/api/bookings/media", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok && Array.isArray(data.urls)) setPhotos((p) => [...p, ...data.urls].slice(0, 5));
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
    if (!addressId) {
      setError("Please select a service address");
      return;
    }
    setError("");
    createBooking.mutate({
      serviceId: service.id,
      addressId,
      slot: buildSlotIso(),
      partnerId: providerChoice === "auto" ? undefined : providerChoice,
      issueDescription: note || undefined,
      mediaUrls: photos,
      scheduleType,
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
    const order: Step[] = ["service", "guidelines", "when", "details", "provider"];
    const i = order.indexOf(step);
    if (i <= 0 || (step === "guidelines" && (singleService || initialServiceId))) {
      router.back();
      return;
    }
    setStep(order[i - 1]!);
  }

  const priceRupees = Math.round((service?.pricePaise ?? 0) / 100);
  const title =
    step === "service"
      ? service?.subCategory?.name ?? categoryName
      : service?.name ?? categoryName;

  const stepper = (
    <div className="flow-page-stepper">
      {FLOW_STEPS.map((s, i) => (
        <Fragment key={s.key}>
          {i > 0 ? <span className="flow-page-stepper__sep" aria-hidden>›</span> : null}
          <div className={`flow-page-stepper__item ${step === s.key ? "is-active" : ""}`}>
            <span className="flow-page-stepper__dot">{i + 1}</span>
            <span>{s.label}</span>
          </div>
        </Fragment>
      ))}
    </div>
  );

  const taxAmount = Math.round(service ? service.pricePaise * 0.18 : 0);
  const totalPayable = service ? service.pricePaise + taxAmount : 0;
  
  const summaryAside =
    service ? (
      <div className="flow-summary-card-v3">
        <p className="summary-title-v3">BOOKING SUMMARY</p>
        <h2 className="summary-service-name">{service.name}</h2>
        <p className="summary-price-v3">
          {step === 'provider' ? 'Starting from ' : 'From '} 
          <strong>{formatPrice(service.pricePaise)}</strong>
        </p>
        <p className="summary-desc-v3">{config.guidelines.summary}</p>
        
        <div className="summary-pills-v3">
          <span className="summary-pill active">⚡ INSTANT</span>
          {service.duration > 0 && (
            <span className="summary-pill">⏱ ~{Math.max(1, Math.round(service.duration / 60))} HR</span>
          )}
        </div>
        
        <div className="summary-breakdown-v3">
          <div className="summary-row">
            <span>Service base price</span>
            <strong>{formatPrice(service.pricePaise)}</strong>
          </div>
          {step === 'details' ? (
            <>
              <div className="summary-row">
                <span>Tax & Fees</span>
                <strong>{formatPrice(taxAmount)}</strong>
              </div>
              <div className="summary-row total-row">
                <span>Total Payable</span>
                <strong>{formatPrice(totalPayable)}</strong>
              </div>
            </>
          ) : step === 'provider' ? (
            <>
              <div className="summary-row">
                <span>Platform Fee</span>
                <strong className="text-green-600">FREE</strong>
              </div>
              <div className="summary-row total-row">
                <span>Total to Pay</span>
                <strong>{formatPrice(service.pricePaise)}</strong>
              </div>
            </>
          ) : (
            <div className="summary-row text-xs">
              <span>Estimated Taxes</span>
              <strong>Calculated at checkout</strong>
            </div>
          )}
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
        <div className={`progress-step ${step === 'guidelines' ? 'active' : (['when', 'details', 'provider'].includes(step) ? 'done' : '')}`}>
          <div className="step-circle">2</div>
          <span>Scope</span>
        </div>
        <div className="step-divider">›</div>
        <div className={`progress-step ${step === 'when' ? 'active' : (['details', 'provider'].includes(step) ? 'done' : '')}`}>
          <div className="step-circle">3</div>
          <span>Slot</span>
        </div>
        <div className="step-divider">›</div>
        <div className={`progress-step ${step === 'details' ? 'active' : (step === 'provider' ? 'done' : '')}`}>
          <div className="step-circle">4</div>
          <span>Address</span>
        </div>
        <div className="step-divider">›</div>
        <div className={`progress-step ${step === 'provider' ? 'active' : ''}`}>
          <div className="step-circle">5</div>
          <span>Confirm</span>
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
                        <div className="card-price">From {formatPrice(s.pricePaise)}</div>
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
                From {formatPrice(service.pricePaise)} 
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
                  <div className="when-icon-box">⚡</div>
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
                <div className="when-icon-box plain">🗓️</div>
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
                        dateKey === d.key ? "bg-blue-900 border-blue-900 text-white shadow-md transform scale-105" : "border-gray-100 text-gray-700 bg-gray-50 hover:border-blue-800"
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
                        timeSlot === slot ? "bg-blue-50 border-blue-900 text-blue-900 shadow-sm ring-1 ring-blue-800" : "border-gray-200 text-gray-600 hover:border-blue-800 hover:bg-blue-50/50"
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
          <div className="flow-details-v3">
            {/* Address */}
            <div className="details-section-v3">
              <h3 className="details-section-title">SERVICE LOCATION</h3>
              {addresses.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                  No saved address. Add one from your profile to continue.
                </div>
              )}
              <div className="address-list-v3">
                {addresses.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAddressId(a.id)}
                    className={`address-card-v3 ${addressId === a.id ? 'selected' : ''}`}
                  >
                    <div className="address-icon-box text-red-500">📍</div>
                    <div className="address-info-box">
                      <p className="address-label">{a.label}</p>
                      <p className="address-full">{a.fullAddress}</p>
                    </div>
                    <div className={`address-radio ${addressId === a.id ? 'checked' : ''}`}>
                      <div className="radio-inner"></div>
                    </div>
                  </button>
                ))}
                
                {/* Dummy Current Location for mockups */}
                <button
                  type="button"
                  className="address-card-v3 disabled"
                >
                  <div className="address-icon-box text-gray-400">◎</div>
                  <div className="address-info-box">
                    <p className="address-label">Current Location</p>
                    <p className="address-full">Detected Location, GPS Coordinates</p>
                  </div>
                  <div className="address-radio">
                    <div className="radio-inner"></div>
                  </div>
                </button>
              </div>
            </div>

            {/* Structured fields */}
            {config.detailFields.length > 0 && (
              <div className="details-fields-v3">
                {config.detailFields.map((f) => (
                  <div key={f.key} className="details-section-v3">
                    <h3 className="details-section-title">{f.label.toUpperCase()}</h3>
                    {f.type === 'select' ? (
                      <div className="pill-group-v3">
                        {f.options.map(opt => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setDetailValues(prev => ({...prev, [f.key]: opt}))}
                            className={`pill-btn-v3 ${detailValues[f.key] === opt ? 'selected' : ''}`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <DetailFieldInput
                        field={f}
                        value={detailValues[f.key]}
                        onChange={(v) => setDetailValues((prev) => ({ ...prev, [f.key]: v }))}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="details-media-grid-v3">
              {/* Photos (optional) */}
              <div className="details-section-v3 media-col">
                <h3 className="details-section-title">ADD PHOTOS (OPTIONAL)</h3>
                <div className="photo-upload-box-v3">
                  <div className="photo-upload-btn-wrapper">
                    {photos.map((url) => (
                      <img key={url} src={url} alt="upload" className="uploaded-photo-v3" />
                    ))}
                    {photos.length < 5 && (
                      <label className="upload-placeholder-v3">
                        <span className="upload-plus">+</span>
                        <input type="file" accept="image/*" multiple hidden onChange={(e) => handlePhotoUpload(e.target.files)} />
                      </label>
                    )}
                  </div>
                  <p className="upload-hint">Add images of rooms or specific problem areas.</p>
                </div>
              </div>

              {/* Note (optional) */}
              <div className="details-section-v3 note-col">
                <div className="note-header-v3">
                  <h3 className="details-section-title">ADD A NOTE (OPTIONAL)</h3>
                  <span className="note-count">{note.length}/250</span>
                </div>
                <textarea
                  value={note}
                  maxLength={250}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Access instructions, problem areas, or preferences..."
                  className="note-textarea-v3"
                />
              </div>
            </div>

            <div className="details-footer-v3">
              <div className="safe-badge-v3">
                <span className="safe-icon">🛡️</span>
                <span>Safe & Professional Services</span>
              </div>
              <button 
                className="flow-continue-btn black-btn" 
                onClick={() => setStep("provider")}
              >
                Choose professional ›
              </button>
            </div>
          </div>
        )}

        {/* STEP: choose provider */}
        {step === "provider" && (
          <div className="flow-provider-v3">
            <h2 className="provider-title">Choose your professional</h2>
            <div className="provider-step-counter">Step 3 of 3</div>
            
            <div className="provider-divider-v3"></div>
            
            <p className="details-section-title">CHOOSE A PROFESSIONAL</p>

            <button
              type="button"
              onClick={() => setProviderChoice("auto")}
              className={`provider-card-v3 ${providerChoice === 'auto' ? 'selected' : ''}`}
            >
              <div className="provider-icon-box">⚡</div>
              <div className="provider-info-box">
                <p className="provider-opt-title">Auto Assign (Fastest)</p>
                <p className="provider-opt-desc">We'll assign the best available professional to your request instantly.</p>
              </div>
              <div className={`address-radio ${providerChoice === 'auto' ? 'checked' : ''}`}>
                <div className="radio-inner"></div>
              </div>
            </button>
            
            {!providersLoading && providers.length === 0 && (
              <p className="provider-no-online">No professionals online right now. Auto Assign will notify them.</p>
            )}

            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProviderChoice(p.id)}
                className={`provider-card-v3 ${providerChoice === p.id ? 'selected' : ''}`}
              >
                <div className="provider-icon-box avatar">{p.name.charAt(0)}</div>
                <div className="provider-info-box">
                  <p className="provider-opt-title">{p.name}</p>
                  <p className="provider-opt-desc">
                    <span className="text-amber-500">★ {p.rating.toFixed(1)}</span> · {p.jobsCompleted} jobs · {p.distanceKm} km
                  </p>
                </div>
                <div className={`address-radio ${providerChoice === p.id ? 'checked' : ''}`}>
                  <div className="radio-inner"></div>
                </div>
              </button>
            ))}

            <div className="provider-info-banner">
              <span className="info-icon">ℹ️</span>
              <p>You'll pay <strong>{formatPrice(service?.pricePaise ?? 0)}</strong> only after the professional accepts your request. No advance payment required.</p>
            </div>
            
            <div className="provider-footer-v3">
              <button 
                className="flow-continue-btn blue-btn" 
                onClick={() => requireLoginThen(submit, buildResumeState({ step: "provider", autoSubmit: true }))}
                disabled={createBooking.isPending}
              >
                {createBooking.isPending ? "Confirming..." : `Confirm & request • ${formatPrice(service?.pricePaise ?? 0)}`}
              </button>
            </div>
          </div>
        )}
    </FlowPageShell>
  );
}

// ─── Small presentational helpers ────────────────────────────────────────────

function GuidelineCard({ title, items, tone }: { title: string; items: string[]; tone: "good" | "bad" | "info" }) {
  const mark = tone === "good" ? "✓" : tone === "bad" ? "✕" : "•";
  const color = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-500" : "text-blue-900";
  const bg = tone === "good" ? "bg-emerald-50/50 border-emerald-100" : tone === "bad" ? "bg-red-50/50 border-red-100" : "bg-blue-50/50 border-blue-100";
  return (
    <div className={`border rounded-2xl p-4 shadow-sm ${bg}`}>
      <p className="text-xs font-bold text-gray-600 uppercase tracking-wider m-0 mb-3">{title}</p>
      <ul className="flex flex-col gap-2 m-0 p-0 list-none">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-3 text-sm text-gray-800">
            <span className={`${color} font-black mt-0.5`}>{mark}</span>
            <span className="leading-tight">{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OptionCard({
  selected,
  onClick,
  icon,
  title,
  desc,
  badge,
}: {
  selected: boolean;
  onClick: () => void;
  icon: string;
  title: string;
  desc: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-2xl p-4 border flex items-center gap-4 transition-all hover-lift ${
        selected ? "border-blue-900 bg-blue-50 shadow-md ring-2 ring-blue-900/20" : "border-gray-200 bg-white hover:border-blue-800 shadow-sm"
      }`}
    >
      <div className={`w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-xl text-2xl ${selected ? "bg-white shadow-sm" : "bg-gray-50"}`}>
        {icon}
      </div>
      <div className="flex-grow">
        <p className="font-bold text-base text-gray-900 m-0 flex items-center gap-2">
          {title}
          {badge && <span className="bg-amber-400 text-blue-950 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">{badge}</span>}
        </p>
        <p className="text-xs text-gray-500 mt-1 m-0">{desc}</p>
      </div>
      <Radio checked={selected} />
    </button>
  );
}

function Radio({ checked }: { checked: boolean }) {
  return (
    <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${checked ? "border-blue-900" : "border-gray-300"}`}>
      {checked && <span className="w-2 h-2 rounded-full bg-blue-900" />}
    </span>
  );
}

function DetailFieldInput({
  field,
  value,
  onChange,
}: {
  field: DetailField;
  value: string | number | undefined;
  onChange: (v: string | number) => void;
}) {
  if (field.type === "select") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 px-1">{field.label}</p>
        <div className="flex gap-2 flex-wrap">
          {field.options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`rounded-full px-4 py-2 text-xs font-bold border transition-all ${
                value === opt 
                  ? "bg-blue-900 border-blue-900 text-white shadow-md transform hover:scale-[1.02]" 
                  : "border-gray-200 text-gray-700 bg-white hover:border-blue-800 hover:bg-blue-50"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (field.type === "counter") {
    const n = typeof value === "number" ? value : Number(value ?? field.min ?? 1);
    const min = field.min ?? 1;
    const max = field.max ?? 99;
    return (
      <div className="flex items-center justify-between bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:border-blue-800 transition-all">
        <span className="text-sm font-bold text-gray-800">{field.label}</span>
        <div className="flex items-center gap-4 bg-gray-50 rounded-full p-1 border border-gray-100">
          <button type="button" onClick={() => onChange(Math.max(min, n - 1))} className="w-8 h-8 rounded-full bg-white border border-gray-200 text-gray-700 font-bold hover:border-blue-800 hover:text-blue-900 transition shadow-sm">−</button>
          <span className="text-sm font-extrabold text-blue-900 w-6 text-center">{n}</span>
          <button type="button" onClick={() => onChange(Math.min(max, n + 1))} className="w-8 h-8 rounded-full bg-white border border-gray-200 text-gray-700 font-bold hover:border-blue-800 hover:text-blue-900 transition shadow-sm">+</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 px-1">{field.label}</p>
      <input
        value={String(value ?? "")}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-4 text-sm border border-gray-200 rounded-2xl focus:outline-none focus:border-blue-900 focus:ring-4 focus:ring-blue-900/10 bg-white transition shadow-sm"
      />
    </div>
  );
}

function FooterButton({
  step,
  priceRupees,
  submitting,
  hasAddress,
  onNext,
}: {
  step: Step;
  priceRupees: number;
  submitting: boolean;
  hasAddress: boolean;
  onNext: () => void;
}) {
  if (step === "service") {
    return <p className="text-center text-[11px] text-gray-400">Select a service to continue</p>;
  }
  const label =
    step === "guidelines"
      ? "Continue"
      : step === "when"
        ? "Continue"
        : step === "details"
          ? "Choose professional"
          : "Confirm & request";
  const disabled = submitting || (step === "details" && !hasAddress) || (step === "provider" && !hasAddress);
  return (
    <button
      type="button"
      onClick={onNext}
      disabled={disabled}
      className="w-full py-3.5 bg-blue-900 hover:bg-blue-950 text-white font-bold text-sm rounded-full disabled:opacity-50 flex items-center justify-center gap-2"
    >
      {submitting ? "Requesting…" : label}
      {step === "provider" && !submitting && <span className="opacity-80">· {formatPrice(priceRupees * 100)}</span>}
    </button>
  );
}

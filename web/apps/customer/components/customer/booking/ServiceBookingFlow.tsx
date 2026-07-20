"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ServiceBookingFlow — the single, config-driven flow for all four Phase-1
// dispatch categories (Technician, Beauty, Home, Pet). Screens:
//   service → guidelines → when (instant/scheduled) → requirements
//
// The flow ends by adding a configured service to the CART (a DRAFT booking).
// The customer never picks a professional here and never pays here: payment
// happens once at the cart, and each cart item is auto-assigned to its best
// available professional at checkout. This is what lets a customer book several
// services (each with its own slot/address) under one payment.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatPrice } from "@/lib/format";
import { FlowPageShell } from "@/components/shared/FlowPageShell";
import { api } from "@/lib/query/api";
import { qk } from "@/lib/query/keys";
import {
  getServiceConfig,
  defaultDetailValues,
  toDetailPairs,
} from "@/lib/catalog/service-config";
import { estimatePrice, startingPricePaise, type Selections } from "@/lib/catalog/pricing";
import { RequirementSheet } from "@/components/customer/booking/RequirementSheet";
import { ServiceSketchImage } from "@/components/ui/ServiceSketchImage";
// AddressPicker import removed
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

type Step = "service" | "guidelines" | "details";

const BOOKING_RESUME_KEY = "vsolve:booking-flow-resume";

type BookingResumeState = {
  step: Step;
  selectedServiceId: string;
  scheduleType?: "instant" | "scheduled";
  dateKey?: string;
  timeSlot?: string;
  detailValues: Selections;
  note: string;
  photos: string[];
  addressId?: string;
  autoSubmit?: boolean;
};

type Props = {
  services: FlowService[];
  categorySlug: string;
  categoryName: string;
  initialServiceId?: string;
};

const TIME_SLOTS = ["08–10 AM", "10–12 PM", "12–02 PM", "02–04 PM", "04–06 PM", "06–08 PM"];

function isDetailValueEmpty(v: unknown): boolean {
  if (Array.isArray(v)) return v.length === 0;
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

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

  // Session — cached and shared across every screen.
  const { data: sessionData } = useQuery({
    queryKey: qk.session(),
    queryFn: api.session,
    staleTime: 5 * 60_000,
  });
  const isLoggedIn = !!sessionData?.user;

  // Booking form state
  const [detailValues, setDetailValues] = useState<Selections>({});
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});

  // Guard the details step: every field flagged
  // `required` in the service config must have a non-empty value.
  function validateDetails(): boolean {
    const errs: Record<string, boolean> = {};
    for (const f of config.detailFields) {
      if (f.required && isDetailValueEmpty(detailValues[f.key])) errs[f.key] = true;
    }
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      setError("Please complete the highlighted required fields.");
      return false;
    }
    setError("");
    return true;
  }

  const days = useMemo(() => nextDays(7), []);

  // The live estimate — recomputed on every requirement tap and shown wherever a
  // price appears, so the summary, the banner, and the confirm button can never
  // disagree with each other. The server recomputes this independently at add-time.
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
  }, [config]);

  function buildResumeState(overrides: Partial<BookingResumeState> & { step: Step }): BookingResumeState {
    return {
      selectedServiceId,
      detailValues,
      note,
      photos,
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
      setDetailValues(saved.detailValues);
      setNote(saved.note);
      setPhotos(saved.photos);
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

  // Add the configured service to the cart (a DRAFT booking). No pro pick, no
  // payment — those happen once, at the cart, for the whole order.
  const addToCart = useMutation({
    mutationFn: () =>
      api.addToCart({
        serviceId: service!.id,
        selections: detailValues,
        note: note || undefined,
        mediaUrls: photos,
        archetypeDetails: {
          bookingType: "individual",
          fieldValues: detailValues,
          details: toDetailPairs(config.detailFields, detailValues),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.cart() });
      router.push("/cart");
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not add to cart"),
  });

  function addCurrentToCart() {
    if (!service) return;
    if (!validateDetails()) return;
    requireLoginThen(() => addToCart.mutate(), buildResumeState({ step: "details", autoSubmit: true }));
  }

  useEffect(() => {
    if (!pendingSubmit || !service) return;
    setPendingSubmit(false);
    addToCart.mutate();
  }, [pendingSubmit, service]);

  // Scroll to top when step changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  function back() {
    const order: Step[] = ["service", "guidelines", "details"];
    const i = order.indexOf(step);
    const isUnskippableGuidelines = step === "guidelines" && (singleService || initialServiceId);
    if (i <= 0 || isUnskippableGuidelines) {
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
          {service.duration > 0 && (
            <span className="summary-pill active">⏱ ~{Math.max(1, Math.round(service.duration / 60))} HR</span>
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
        <div className={`progress-step ${step === 'guidelines' ? 'active' : (['details'].includes(step) ? 'done' : '')}`}>
          <div className="step-circle">2</div>
          <span>Scope</span>
        </div>
        <div className="step-divider">›</div>
        <div className={`progress-step ${step === 'details' ? 'active' : ''}`}>
          <div className="step-circle">3</div>
          <span>Requirements</span>
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

            <button className="flow-continue-btn" onClick={() => setStep('details')}>
              Continue →
            </button>
          </div>
        )}

        {/* STEP: job details → add to cart */}
        {step === "details" && (
          <div>
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
                className="w-full p-4 rounded-lg text-base font-bold cursor-pointer transition-opacity bg-brand text-white hover:opacity-90 disabled:opacity-60"
                onClick={addCurrentToCart}
                disabled={addToCart.isPending}
              >
                {addToCart.isPending ? "Adding…" : "Add to cart ›"}
              </button>
            </div>
          </div>
        )}
    </FlowPageShell>
  );
}

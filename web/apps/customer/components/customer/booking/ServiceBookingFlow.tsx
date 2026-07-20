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
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm lg:sticky lg:top-4">
        <p className="text-[11px] font-black uppercase tracking-widest text-[var(--color-brand-accent)]">
          Booking summary
        </p>
        <h2 className="mt-2 text-lg font-black text-gray-900">{service.name}</h2>
        <p className="mt-1 text-sm text-gray-500">
          Starts at <strong className="text-gray-900">{formatPrice(startsAtPaise)}</strong>
        </p>
        <p className="mt-3 text-sm leading-relaxed text-gray-500">{config.guidelines.summary}</p>

        {service.duration > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-[var(--color-brand-light)] px-3 py-1 text-xs font-bold text-[var(--color-brand)]">
              ⏱ ~{Math.max(1, Math.round(service.duration / 60))} hr
            </span>
          </div>
        )}

        <div className="mt-5 space-y-2 border-t border-gray-100 pt-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Base</span>
            <strong className="text-gray-900">{formatPrice(estimate.basePaise)}</strong>
          </div>
          {estimate.lineItems
            .filter((li) => li.kind !== "variant")
            .map((li) => (
              <div className="flex items-center justify-between" key={`${li.key}-${li.value}`}>
                <span className="text-gray-500">
                  {li.value}
                  {li.qty > 1 && ` × ${li.qty}`}
                </span>
                <strong className="text-gray-900">+{formatPrice(li.totalPaise)}</strong>
              </div>
            ))}
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Platform fee</span>
            <strong className="text-green-600">FREE</strong>
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 pt-2 text-base">
            <span className="font-bold text-gray-900">Estimated total</span>
            <strong className="text-gray-900">{formatPrice(estimate.totalPaise)}</strong>
          </div>
          <p className="text-xs text-gray-400">
            Final price is confirmed from your selected requirements.
          </p>
        </div>
      </div>
    ) : null;

  const stepOrder: Step[] = ["service", "guidelines", "details"];
  function StepPill({ target, num, label }: { target: Step; num: string; label: string }) {
    const meIdx = stepOrder.indexOf(target);
    const curIdx = stepOrder.indexOf(step);
    const state = meIdx === curIdx ? "active" : meIdx < curIdx ? "done" : "todo";
    return (
      <div className="flex items-center gap-1.5">
        <div
          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${
            state === "active"
              ? "bg-[var(--color-brand)] text-white"
              : state === "done"
                ? "bg-[var(--color-brand)]/15 text-[var(--color-brand)]"
                : "bg-gray-100 text-gray-400"
          }`}
        >
          {state === "done" ? "✓" : num}
        </div>
        <span className={`text-xs font-bold ${state === "todo" ? "text-gray-400" : "text-gray-700"}`}>
          {label}
        </span>
      </div>
    );
  }

  const customHeader = (
    <div className="border-b border-gray-100 bg-white px-4 py-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={back}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-lg text-gray-700 transition-colors hover:bg-gray-200"
        >
          ←
        </button>
        <div>
          <h1 className="text-lg font-black text-gray-900">{categoryName}</h1>
          <div className="text-xs text-gray-400">
            Services <span>›</span> <strong className="text-gray-600">{categoryName}</strong>
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 overflow-x-auto hide-scrollbar">
        <StepPill target="service" num="1" label="Select" />
        <span className="text-gray-300">›</span>
        <StepPill target="guidelines" num="2" label="Scope" />
        <span className="text-gray-300">›</span>
        <StepPill target="details" num="3" label="Requirements" />
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
          <div>
            <h2 className="mb-4 text-xs font-black uppercase tracking-widest text-gray-500">
              Select a service
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {services.map((s) => {
                const isRecommended =
                  s.name.toLowerCase().includes("deep") || s.name.toLowerCase().includes("premium");
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSelectedServiceId(s.id);
                      setStep("guidelines");
                    }}
                    className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-md ${
                      isRecommended ? "border-[var(--color-brand)]" : "border-gray-200"
                    }`}
                  >
                    {isRecommended && (
                      <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-[var(--color-brand)] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">
                        <span>Recommended</span>
                        <span>✓</span>
                      </div>
                    )}
                    <div className="aspect-[16/10] w-full overflow-hidden bg-gray-50">
                      <ServiceSketchImage
                        slug={s.slug}
                        subCategorySlug={s.subCategory?.slug ?? s.slug}
                        categorySlug={s.category.slug}
                        serviceName={s.name}
                        variant="card"
                        alt={s.name}
                      />
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-bold text-gray-900">{s.name}</h3>
                        {!isRecommended && (
                          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-700">
                            Trending
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 flex-1 text-xs leading-relaxed text-gray-500">
                        {s.description}
                      </p>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="text-sm font-black text-gray-900">
                          <span className="text-[11px] font-semibold uppercase text-gray-400">Starts at </span>
                          {formatPrice(s.pricePaise)}
                        </div>
                        <span className="rounded-lg bg-[var(--color-brand)] px-3 py-1.5 text-xs font-black text-white transition-colors group-hover:bg-blue-900">
                          Select
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex flex-col items-start justify-between gap-4 overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--color-brand-dark)] to-[var(--color-brand)] p-6 text-white sm:flex-row sm:items-center">
              <div className="max-w-md">
                <h2 className="text-lg font-black">Save up to 30% with ExpertPass</h2>
                <p className="mt-1 text-sm text-white/80">
                  Get discounted rates and priority booking for all your home cleaning and maintenance needs.
                </p>
                <button
                  type="button"
                  className="mt-4 rounded-xl bg-white px-5 py-2.5 text-sm font-black text-[var(--color-brand)] transition-transform hover:scale-105"
                >
                  Explore membership
                </button>
              </div>
              <div className="w-full max-w-[220px] rounded-2xl bg-white/10 p-4 backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <strong className="text-sm">ExpertPass</strong>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-brand-accent)] text-[10px]">✓</span>
                </div>
                <div className="my-4 h-px bg-white/20" />
                <div className="text-[11px] text-white/70">Membership ID: EE-0921-2024</div>
              </div>
            </div>
          </div>
        )}

        {/* STEP: guidelines / scope */}
        {step === "guidelines" && service && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-black text-gray-900">{service.name}</h2>
              <p className="mt-1 text-sm text-gray-500">{config.guidelines.summary}</p>
              <p className="mt-2 text-sm font-bold text-gray-900">
                Starts at {formatPrice(startsAtPaise)}
                <span className="ml-1 font-medium text-gray-400">
                  · ~{Math.max(1, Math.round(service.duration / 60))} hr
                </span>
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  title: "What's included",
                  items: config.guidelines.included,
                  icon: "✓",
                  tone: "border-green-100 bg-green-50/60",
                  iconTone: "bg-green-100 text-green-700",
                },
                {
                  title: "Not included",
                  items: config.guidelines.notIncluded,
                  icon: "✕",
                  tone: "border-red-100 bg-red-50/60",
                  iconTone: "bg-red-100 text-red-700",
                },
                {
                  title: "Good to know",
                  items: config.guidelines.goodToKnow,
                  icon: "•",
                  tone: "border-blue-100 bg-blue-50/60",
                  iconTone: "bg-blue-100 text-blue-700",
                },
              ].map((sec) => (
                <div key={sec.title} className={`rounded-2xl border p-4 ${sec.tone}`}>
                  <p className="mb-3 text-[11px] font-black uppercase tracking-widest text-gray-500">
                    {sec.title}
                  </p>
                  <ul className="space-y-2">
                    {sec.items.map((it, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span
                          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${sec.iconTone}`}
                        >
                          {sec.icon}
                        </span>
                        {it}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setStep("details")}
              className="mt-6 w-full rounded-xl bg-[var(--color-brand)] py-3.5 text-base font-bold text-white transition-colors hover:bg-blue-900 sm:w-auto sm:px-10"
            >
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

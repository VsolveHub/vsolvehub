"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ServiceBookingFlow — the single, config-driven flow for all four Phase-1
// dispatch categories (Technician, Beauty, Home, Pet). Screens:
//   service → guidelines → requirements
//
// The flow ends by adding a configured service to the CART (a DRAFT booking).
// The customer never picks a professional here and never pays here: payment
// happens once at the cart, and each cart item is auto-assigned to its best
// available professional at checkout. This is what lets a customer book several
// services (each with its own slot/address) under one payment.
//
// In-progress state is mirrored to sessionStorage so a page reload (or an OTP
// detour) resumes on the exact step the customer was on.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlowPageShell } from "@/components/shared/FlowPageShell";
import { api } from "@/lib/query/api";
import { qk } from "@/lib/query/keys";
import {
  getServiceConfig,
  defaultDetailValues,
  toDetailPairs,
} from "@/lib/catalog/service-config";
import { estimatePrice, startingPricePaise, type Selections } from "@/lib/catalog/pricing";
import { FlowHeader } from "./serviceBookingFlow/FlowHeader";
import { BookingSummary } from "./serviceBookingFlow/BookingSummary";
import { ServiceStep } from "./serviceBookingFlow/ServiceStep";
import { GuidelinesStep } from "./serviceBookingFlow/GuidelinesStep";
import { DetailsStep } from "./serviceBookingFlow/DetailsStep";
import type { Step } from "./serviceBookingFlow/types";

export type { FlowService } from "./serviceBookingFlow/types";
import type { FlowService } from "./serviceBookingFlow/types";

const BOOKING_RESUME_KEY = "vsolve:booking-flow-resume";

type BookingResumeState = {
  step: Step;
  selectedServiceId: string;
  detailValues: Selections;
  note: string;
  photos: string[];
  /** Product add-on picks: productId → qty. */
  products?: Record<string, number>;
  autoSubmit?: boolean;
};

type Props = {
  services: FlowService[];
  categorySlug: string;
  categoryName: string;
  initialServiceId?: string;
};

function isDetailValueEmpty(v: unknown): boolean {
  if (Array.isArray(v)) return v.length === 0;
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

export function ServiceBookingFlow({ services, categorySlug, categoryName, initialServiceId }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const resumedRef = useRef(false);

  // Persist the in-progress booking per flow so a page reload resumes exactly
  // where the customer was, instead of dropping them back at step 1.
  const persistKey = `vsolve:booking-flow:${categorySlug}`;
  const [hydrated, setHydrated] = useState(false);
  const seededForRef = useRef<string | null>(null);

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
  const [productSelections, setProductSelections] = useState<Record<string, number>>({});
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});

  // The live estimate — recomputed on every requirement tap and shown wherever a
  // price appears, so the summary and the confirm button never disagree. The
  // server recomputes this independently at add-time.
  const estimate = useMemo(
    () => estimatePrice(config.detailFields, detailValues),
    [config.detailFields, detailValues],
  );
  const startsAtPaise = useMemo(
    () => startingPricePaise(config.detailFields) || service?.pricePaise || 0,
    [config.detailFields, service],
  );

  // Guard the details step: every field flagged `required` in the service config
  // must have a non-empty value.
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

  // Restore any in-progress booking for this flow on first mount (survives a
  // reload — sessionStorage is per-tab and clears when the tab closes).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(persistKey);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<BookingResumeState>;
        const validService =
          !!saved.selectedServiceId && services.some((s) => s.id === saved.selectedServiceId);
        if (validService) {
          setSelectedServiceId(saved.selectedServiceId!);
          // Keep the restored requirement values — don't let the seeding effect reset them.
          seededForRef.current = saved.selectedServiceId!;
          if (saved.detailValues) setDetailValues(saved.detailValues);
          if (typeof saved.note === "string") setNote(saved.note);
          if (Array.isArray(saved.photos)) setPhotos(saved.photos);
          if (saved.products && typeof saved.products === "object") setProductSelections(saved.products);
          if (saved.step) setStep(saved.step);
        }
      }
    } catch {
      /* storage unavailable or corrupt — start fresh */
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seed structured-field defaults when the *service* changes, but never clobber
  // values we just restored from storage for that same service.
  useEffect(() => {
    if (!hydrated) return;
    if (seededForRef.current === selectedServiceId) return;
    seededForRef.current = selectedServiceId;
    setDetailValues(defaultDetailValues(config.detailFields));
  }, [hydrated, selectedServiceId, config]);

  // Mirror the live flow state into sessionStorage on every change.
  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(
        persistKey,
        JSON.stringify({ step, selectedServiceId, detailValues, note, photos, products: productSelections }),
      );
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, [hydrated, persistKey, step, selectedServiceId, detailValues, note, photos, productSelections]);

  function buildResumeState(overrides: Partial<BookingResumeState> & { step: Step }): BookingResumeState {
    return { selectedServiceId, detailValues, note, photos, products: productSelections, ...overrides };
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
      if (saved.selectedServiceId) {
        setSelectedServiceId(saved.selectedServiceId);
        seededForRef.current = saved.selectedServiceId;
      }
      setStep(saved.step);
      setDetailValues(saved.detailValues);
      setNote(saved.note);
      setPhotos(saved.photos);
      if (saved.products) setProductSelections(saved.products);
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
        products: Object.entries(productSelections).map(([productId, qty]) => ({ productId, qty })),
        archetypeDetails: {
          bookingType: "individual",
          fieldValues: detailValues,
          details: toDetailPairs(config.detailFields, detailValues),
        },
      }),
    onSuccess: () => {
      try {
        sessionStorage.removeItem(persistKey);
      } catch {
        /* ignore */
      }
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

  function pickService(id: string) {
    setSelectedServiceId(id);
    setStep("guidelines");
  }

  return (
    <FlowPageShell
      header={<FlowHeader categoryName={categoryName} step={step} onBack={back} />}
      aside={
        step !== "service" && service ? (
          <BookingSummary
            service={service}
            config={config}
            startsAtPaise={startsAtPaise}
            estimate={estimate}
          />
        ) : null
      }
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {error}
        </div>
      )}

      {step === "service" && <ServiceStep services={services} onSelect={pickService} />}

      {step === "guidelines" && service && (
        <GuidelinesStep
          service={service}
          config={config}
          startsAtPaise={startsAtPaise}
          onContinue={() => setStep("details")}
        />
      )}

      {step === "details" && (
        <DetailsStep
          service={service}
          config={config}
          detailValues={detailValues}
          onDetailChange={setDetailValues}
          fieldErrors={fieldErrors}
          note={note}
          onNoteChange={setNote}
          photos={photos}
          uploading={uploading}
          onPhotoUpload={handlePhotoUpload}
          productSelections={productSelections}
          onProductChange={setProductSelections}
          submitting={addToCart.isPending}
          onSubmit={addCurrentToCart}
        />
      )}
    </FlowPageShell>
  );
}

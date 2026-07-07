"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ServiceBookingFlow — the single, config-driven booking flow for all four
// Phase-1 dispatch categories (Technician, Beauty, Home, Pet). Replaces the
// per-category *BookingFlow components. Screens:
//   service → guidelines → when (instant/scheduled) → details → provider → submit
// After submit it redirects to /booking/track/[ref], where BookingTracker owns the
// searching → pay-after-accept → live tracking sequence.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { formatPrice } from "@/lib/format";
import { api } from "@/lib/query/api";
import { qk } from "@/lib/query/keys";
import {
  getServiceConfig,
  defaultDetailValues,
  toDetailPairs,
  type DetailField,
} from "@/lib/catalog/service-config";

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

  function requireLoginThen(next: () => void) {
    if (isLoggedIn) return next();
    const target = window.location.pathname + window.location.search;
    router.push(`/booking/otp?redirect=${encodeURIComponent(target)}`);
  }

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

  return (
    <div className="w-full md:max-w-md md:mx-auto min-h-screen bg-gray-50 flex flex-col relative pb-28 md:shadow-lg md:border md:border-gray-100 md:rounded-3xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-purple-900 text-white shadow-sm select-none sticky top-0 z-30">
        <button type="button" onClick={back} className="text-xl leading-none text-purple-200 hover:text-white">
          ←
        </button>
        <span className="font-semibold text-sm truncate">{title}</span>
      </div>

      <div className="flex-grow overflow-y-auto p-4 flex flex-col gap-4">
        {error && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold px-3 py-2">{error}</div>}

        {/* STEP: choose specific service */}
        {step === "service" && (
          <div className="flex flex-col gap-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 px-1">Select a service</p>
            {services.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSelectedServiceId(s.id);
                  setStep("guidelines");
                }}
                className="text-left bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-3 hover:border-purple-300 transition"
              >
                <div>
                  <p className="font-bold text-sm text-gray-900 m-0">{s.name}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 m-0">{s.description}</p>
                  <p className="text-xs font-bold text-purple-800 mt-1 m-0">
                    From {formatPrice(s.pricePaise)}
                  </p>
                </div>
                <span className="text-purple-300 text-lg">›</span>
              </button>
            ))}
          </div>
        )}

        {/* STEP: guidelines / scope */}
        {step === "guidelines" && service && (
          <div className="flex flex-col gap-4">
            <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4">
              <h2 className="font-extrabold text-base text-purple-950 m-0">{service.name}</h2>
              <p className="text-xs text-purple-800 mt-1 m-0">{config.guidelines.summary}</p>
              <p className="text-sm font-bold text-purple-900 mt-2 m-0">
                From {formatPrice(service.pricePaise)}
                {service.duration > 0 && (
                  <span className="text-gray-500 font-medium"> · ~{Math.max(1, Math.round(service.duration / 60))} hr</span>
                )}
              </p>
            </div>

            <GuidelineCard title="What's included" tone="good" items={config.guidelines.included} />
            <GuidelineCard title="Not included" tone="bad" items={config.guidelines.notIncluded} />
            <GuidelineCard title="Good to know" tone="info" items={config.guidelines.goodToKnow} />
          </div>
        )}

        {/* STEP: instant vs scheduled */}
        {step === "when" && (
          <div className="flex flex-col gap-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 px-1">When do you need it?</p>
            {config.bookingTypes.includes("instant") && (
              <OptionCard
                selected={scheduleType === "instant"}
                onClick={() => setScheduleType("instant")}
                icon="⚡"
                title="Instant"
                desc="A professional arrives within 30–60 mins"
                badge="Fastest"
              />
            )}
            <OptionCard
              selected={scheduleType === "scheduled"}
              onClick={() => setScheduleType("scheduled")}
              icon="🗓️"
              title="Scheduled"
              desc="Pick a date & time that suits you"
            />

            {scheduleType === "scheduled" && (
              <div className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {days.map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => setDateKey(d.key)}
                      className={`flex-shrink-0 w-16 rounded-xl border px-2 py-2 text-center ${
                        dateKey === d.key ? "bg-purple-900 border-purple-900 text-white" : "border-gray-200 text-gray-700"
                      }`}
                    >
                      <span className="block text-[10px] font-bold">{d.day}</span>
                      <span className="block text-xs font-extrabold mt-0.5">{d.date}</span>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {TIME_SLOTS.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setTimeSlot(slot)}
                      className={`rounded-xl border px-1 py-2 text-xs font-bold ${
                        timeSlot === slot ? "bg-purple-100 border-purple-400 text-purple-900" : "border-gray-200 text-gray-600"
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP: job details */}
        {step === "details" && (
          <div className="flex flex-col gap-4">
            {/* Address */}
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 px-1">Service location</p>
              {addresses.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                  No saved address. Add one from your profile to continue.
                </div>
              )}
              {addresses.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAddressId(a.id)}
                  className={`text-left bg-white border rounded-2xl p-3 flex items-start gap-3 ${
                    addressId === a.id ? "border-purple-500 ring-1 ring-purple-200" : "border-gray-100"
                  }`}
                >
                  <span className="mt-0.5">📍</span>
                  <div>
                    <p className="font-bold text-xs text-gray-900 m-0">{a.label}</p>
                    <p className="text-[11px] text-gray-500 m-0">{a.fullAddress}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Structured fields */}
            {config.detailFields.length > 0 && (
              <div className="flex flex-col gap-3">
                {config.detailFields.map((f) => (
                  <DetailFieldInput
                    key={f.key}
                    field={f}
                    value={detailValues[f.key]}
                    onChange={(v) => setDetailValues((prev) => ({ ...prev, [f.key]: v }))}
                  />
                ))}
              </div>
            )}

            {/* Photos (optional) */}
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 px-1">Add photos (optional)</p>
              <div className="flex gap-2 flex-wrap">
                {photos.map((url) => (
                  <img key={url} src={url} alt="upload" className="w-16 h-16 rounded-xl object-cover border border-gray-200" />
                ))}
                {photos.length < 5 && (
                  <label className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-2xl text-gray-400 cursor-pointer">
                    {uploading ? "…" : "+"}
                    <input type="file" accept="image/*" multiple hidden onChange={(e) => handlePhotoUpload(e.target.files)} />
                  </label>
                )}
              </div>
            </div>

            {/* Note (optional) */}
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 px-1">{config.noteLabel}</p>
              <textarea
                value={note}
                maxLength={250}
                onChange={(e) => setNote(e.target.value)}
                placeholder={config.notePlaceholder}
                className="w-full min-h-[80px] p-3 text-xs border border-gray-200 rounded-2xl focus:outline-none focus:border-purple-500 bg-white"
              />
              <span className="text-[10px] text-gray-400 self-end">{note.length}/250</span>
            </div>
          </div>
        )}

        {/* STEP: choose provider */}
        {step === "provider" && (
          <div className="flex flex-col gap-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 px-1">Choose a professional</p>

            <button
              type="button"
              onClick={() => setProviderChoice("auto")}
              className={`text-left rounded-2xl p-4 border flex items-center gap-3 ${
                providerChoice === "auto" ? "border-purple-500 bg-purple-50 ring-1 ring-purple-200" : "border-gray-100 bg-white"
              }`}
            >
              <span className="text-xl">⚡</span>
              <div className="flex-grow">
                <p className="font-bold text-sm text-purple-950 m-0">Auto Assign (Fastest)</p>
                <p className="text-[11px] text-gray-500 m-0">We'll assign the best available professional</p>
              </div>
              <Radio checked={providerChoice === "auto"} />
            </button>

            {providersLoading && <p className="text-xs text-gray-400 text-center py-4">Finding professionals near you…</p>}
            {!providersLoading && providers.length === 0 && (
              <p className="text-[11px] text-gray-400 px-1">No professionals online right now — Auto Assign will notify them as they come online.</p>
            )}

            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProviderChoice(p.id)}
                className={`text-left rounded-2xl p-3 border flex items-center gap-3 ${
                  providerChoice === p.id ? "border-purple-500 bg-purple-50 ring-1 ring-purple-200" : "border-gray-100 bg-white"
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-900 flex items-center justify-center font-bold">
                  {p.name.charAt(0)}
                </div>
                <div className="flex-grow">
                  <p className="font-bold text-xs text-gray-900 m-0">{p.name}</p>
                  <p className="text-[11px] text-gray-500 m-0">
                    ★ {p.rating.toFixed(1)} · {p.jobsCompleted} jobs · {p.distanceKm} km · {p.etaMins} min
                  </p>
                </div>
                <Radio checked={providerChoice === p.id} />
              </button>
            ))}

            <div className="bg-purple-50/60 border border-purple-100 rounded-xl p-3 text-[11px] text-purple-800 mt-1">
              You'll pay <b>{formatPrice(service?.pricePaise ?? 0)}</b> only after the professional accepts your request.
            </div>
          </div>
        )}
      </div>

      {/* Sticky footer CTA */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 z-30">
        <FooterButton
          step={step}
          priceRupees={priceRupees}
          submitting={createBooking.isPending}
          hasAddress={!!addressId}
          onNext={() => {
            if (step === "service") return; // handled by card click
            if (step === "guidelines") setStep("when");
            else if (step === "when") requireLoginThen(() => setStep("details"));
            else if (step === "details") setStep("provider");
            else if (step === "provider") requireLoginThen(submit);
          }}
        />
      </div>
    </div>
  );
}

// ─── Small presentational helpers ────────────────────────────────────────────

function GuidelineCard({ title, items, tone }: { title: string; items: string[]; tone: "good" | "bad" | "info" }) {
  const mark = tone === "good" ? "✓" : tone === "bad" ? "✕" : "•";
  const color = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-500" : "text-purple-600";
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider m-0 mb-2">{title}</p>
      <ul className="flex flex-col gap-1.5 m-0 p-0 list-none">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-2 text-xs text-gray-700">
            <span className={`${color} font-bold`}>{mark}</span>
            {it}
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
      className={`text-left rounded-2xl p-4 border flex items-center gap-3 ${
        selected ? "border-purple-500 bg-purple-50 ring-1 ring-purple-200" : "border-gray-100 bg-white"
      }`}
    >
      <span className="text-xl">{icon}</span>
      <div className="flex-grow">
        <p className="font-bold text-sm text-purple-950 m-0 flex items-center gap-2">
          {title}
          {badge && <span className="bg-amber-400 text-purple-950 text-[8px] font-black px-1.5 py-0.5 rounded uppercase">{badge}</span>}
        </p>
        <p className="text-[11px] text-gray-500 m-0">{desc}</p>
      </div>
      <Radio checked={selected} />
    </button>
  );
}

function Radio({ checked }: { checked: boolean }) {
  return (
    <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${checked ? "border-purple-600" : "border-gray-300"}`}>
      {checked && <span className="w-2 h-2 rounded-full bg-purple-600" />}
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
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 px-1">{field.label}</p>
        <div className="flex gap-2 flex-wrap">
          {field.options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold border ${
                value === opt ? "bg-purple-900 border-purple-900 text-white" : "border-gray-200 text-gray-600 bg-white"
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
      <div className="flex items-center justify-between bg-white border border-gray-100 rounded-2xl p-3">
        <span className="text-xs font-bold text-gray-700">{field.label}</span>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => onChange(Math.max(min, n - 1))} className="w-7 h-7 rounded-full border border-gray-300 text-gray-700 font-bold">−</button>
          <span className="text-sm font-extrabold text-purple-900 w-5 text-center">{n}</span>
          <button type="button" onClick={() => onChange(Math.min(max, n + 1))} className="w-7 h-7 rounded-full border border-gray-300 text-gray-700 font-bold">+</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 px-1">{field.label}</p>
      <input
        value={String(value ?? "")}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-3 text-xs border border-gray-200 rounded-2xl focus:outline-none focus:border-purple-500 bg-white"
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
      className="w-full py-3.5 bg-purple-900 hover:bg-purple-950 text-white font-bold text-sm rounded-full disabled:opacity-50 flex items-center justify-center gap-2"
    >
      {submitting ? "Requesting…" : label}
      {step === "provider" && !submitting && <span className="opacity-80">· {formatPrice(priceRupees * 100)}</span>}
    </button>
  );
}

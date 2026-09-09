"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Bath,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
  Copy,
  ExternalLink,
  Heart,
  Home,
  Info,
  MapPin,
  Navigation,
  Phone,
  ShieldCheck,
  Sparkles,
  Star,
  Tv,
  Users,
  Wifi,
  Wind,
  X,
  Zap,
} from "lucide-react";

import {
  fetchPropertyDetail,
  schedulePropertyVisit,
  type PropertyDetailResponse,
} from "@/features/stays/queries";
import {
  durationModeLabel,
  hideSoldOutStayCards,
  publishedDurationModes,
  shouldShowDurationToggle,
  type StayDurationMode,
} from "@/features/stays/stay-checkout-rules";

function formatPaise(paise: number): string {
  return "₹" + (paise / 100).toLocaleString("en-IN");
}

function formatTime(timeStr?: string): string {
  if (!timeStr) return "--";
  const parts = timeStr.split(":");
  if (parts.length >= 2) {
    let hour = parseInt(parts[0], 10);
    const minute = parts[1];
    const ampm = hour >= 12 ? "PM" : "AM";
    hour = hour % 12;
    if (hour === 0) hour = 12;
    return `${hour}:${minute} ${ampm}`;
  }
  return timeStr;
}

function formatDateDisplay(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function getAmenityIcon(amenity: string) {
  const lower = amenity.toLowerCase();
  if (lower.includes("ac") || lower.includes("air condition")) return <Wind className="h-4 w-4 text-sky-600 shrink-0" />;
  if (lower.includes("wifi") || lower.includes("wi-fi") || lower.includes("internet")) return <Wifi className="h-4 w-4 text-emerald-600 shrink-0" />;
  if (lower.includes("tv") || lower.includes("television")) return <Tv className="h-4 w-4 text-indigo-600 shrink-0" />;
  if (lower.includes("bath") || lower.includes("washroom")) return <Bath className="h-4 w-4 text-cyan-600 shrink-0" />;
  if (lower.includes("fridge") || lower.includes("refrigerator") || lower.includes("kitchen") || lower.includes("coffee")) return <Coffee className="h-4 w-4 text-amber-600 shrink-0" />;
  if (lower.includes("desk") || lower.includes("work")) return <Sparkles className="h-4 w-4 text-purple-600 shrink-0" />;
  if (lower.includes("balcony") || lower.includes("terrace")) return <Building2 className="h-4 w-4 text-teal-600 shrink-0" />;
  return <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />;
}

export default function StayPropertyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const propertyId = params?.propertyId as string;
  const today = new Date().toISOString().slice(0, 10);
  const defaultEnd = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(searchParams.get("start_date") || today);
  const [endDate, setEndDate] = useState(searchParams.get("end_date") || defaultEnd);
  const [durationMode, setDurationMode] = useState<StayDurationMode>(
    (searchParams.get("duration_mode") as StayDurationMode) || "MONTHLY",
  );

  const [property, setProperty] = useState<PropertyDetailResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeMediaIdx, setActiveMediaIdx] = useState<number>(0);
  const [copiedAddress, setCopiedAddress] = useState<boolean>(false);

  // Schedule Visit modal state (Step 10)
  const [visitModalOpen, setVisitModalOpen] = useState<boolean>(false);
  const [visitorName, setVisitorName] = useState<string>("");
  const [visitorPhone, setVisitorPhone] = useState<string>("");
  const [visitorEmail, setVisitorEmail] = useState<string>("");
  const [visitDate, setVisitDate] = useState<string>("");
  const [visitSlot, setVisitSlot] = useState<string>("11:00 AM - 12:00 PM");
  const [visitNotes, setVisitNotes] = useState<string>("");
  const [visitSubmitting, setVisitSubmitting] = useState<boolean>(false);
  const [visitError, setVisitError] = useState<string | null>(null);
  const [visitSubmitted, setVisitSubmitted] = useState<boolean>(false);

  useEffect(() => {
    if (!propertyId) return;
    setLoading(true);
    fetchPropertyDetail(propertyId, {
      start_date: startDate,
      end_date: endDate,
      duration_mode: durationMode,
    })
      .then((data) => {
        setProperty(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load property details.");
        setLoading(false);
      });
  }, [propertyId, startDate, endDate, durationMode]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FBFBFC] py-20 text-center">
        <Clock className="mx-auto h-8 w-8 animate-spin text-neutral-400" />
        <p className="mt-3 text-sm font-semibold text-neutral-500">Loading property details…</p>
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="min-h-screen bg-[#FBFBFC] px-4 py-20 text-center">
        <div className="mx-auto max-w-md rounded-2xl bg-red-50 p-6 border border-red-200">
          <AlertCircle className="mx-auto h-8 w-8 text-red-500 mb-2" />
          <h2 className="text-base font-bold text-red-800">Property Not Found</h2>
          <p className="mt-1 text-xs text-red-600">{error || "Could not retrieve property information."}</p>
          <Link
            href="/catalog/rooms-pg-hostel"
            className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-signal-700 hover:text-action"
          >
            ← Back to Properties
          </Link>
        </div>
      </div>
    );
  }

  const activeTileSlug = searchParams.get("tile") || "rooms";
  const bookableUnits = hideSoldOutStayCards(property.unit_types, Boolean(startDate && endDate));
  const publishedModes = publishedDurationModes(
    bookableUnits.map((unit) => unit.pricing.duration_mode),
    durationMode,
  );
  const fromUrl = searchParams.get("from");
  const backHref = fromUrl || `/catalog/rooms-pg-hostel?tile=${encodeURIComponent(activeTileSlug)}`;

  const primaryPhoto =
    property.media && property.media.length > 0 ? property.media[activeMediaIdx]?.url : "";

  return (
    <div className="min-h-screen bg-[#FAF9F7] pb-24 text-navy-900">
      {/* Top Navigation */}
      <div className="border-b border-neutral-200 bg-white px-4 py-3 sm:px-6 lg:px-8 sticky top-0 z-30 shadow-2xs">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-600 hover:text-neutral-900"
          >
            <ChevronLeft className="h-4 w-4" /> Back to Properties
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-6">
        {/* Step 6: Hero Gallery */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 overflow-hidden rounded-2xl bg-neutral-100 aspect-video relative shadow-sm border border-neutral-200/80">
            {primaryPhoto ? (
              <img
                src={primaryPhoto}
                alt={property.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-neutral-300">
                <Building2 className="h-16 w-16" />
              </div>
            )}
            <div className="absolute top-3 left-3 flex items-center gap-2">
              <span className="rounded-md bg-neutral-900/85 backdrop-blur-xs px-2.5 py-1 text-xs font-black uppercase text-white shadow-xs">
                {property.property_type_display}
              </span>
              {property.host.id_verified && (
                <span className="rounded-md bg-emerald-600/90 backdrop-blur-xs px-2.5 py-1 text-xs font-bold text-white shadow-xs flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" /> Verified Host Listing
                </span>
              )}
            </div>
          </div>

          {/* Thumbnail Strip */}
          <div className="flex flex-row lg:flex-col gap-3 overflow-x-auto lg:overflow-y-auto max-h-[380px]">
            {property.media.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => setActiveMediaIdx(idx)}
                className={`relative aspect-video rounded-xl overflow-hidden border-2 transition-all shrink-0 lg:shrink ${
                  activeMediaIdx === idx
                    ? "border-action shadow-md ring-2 ring-action/20"
                    : "border-transparent opacity-70 hover:opacity-100"
                }`}
              >
                <img src={item.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        {/* Title & Basic Info */}
        <div className="mt-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-200/80 pb-6">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 tracking-tight">
                {property.title}
              </h1>
              <span className="flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-bold text-amber-800">
                ★ {property.rating.toFixed(1)} ({property.reviews_count} reviews)
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-3 flex-wrap">
              <p className="text-xs text-neutral-500 flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-neutral-400" />
                {property.locality}
                {property.address?.line1 ? ` • ${property.address.line1}` : ""}
              </p>
              {((property.address?.latitude && property.address?.longitude) || property.locality) && (
                <a
                  href={
                    property.address?.latitude && property.address?.longitude
                      ? `https://www.google.com/maps/search/?api=1&query=${property.address.latitude},${property.address.longitude}`
                      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${property.title}, ${property.locality}`)}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-bold text-action hover:underline"
                >
                  <Navigation className="h-3 w-3" /> Get Directions
                </a>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setVisitModalOpen(true)}
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-bold text-neutral-800 shadow-xs hover:border-neutral-400 transition-colors"
            >
              Schedule Free Visit
            </button>
            <a
              href="#room-configurations"
              className="rounded-xl bg-action px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-signal-400 transition-colors"
            >
              Choose Room & Book
            </a>
          </div>
        </div>

        {/* Layout Grid: Details & Host */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Main Column */}
          <div className="lg:col-span-8 space-y-8">
            {/* Section 1: About & Amenities (Unified, Clean Card) */}
            <div className="rounded-3xl border border-neutral-200/90 bg-white p-6 sm:p-8 shadow-xs space-y-6">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-black text-neutral-900 tracking-tight">About this Property</h2>
                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700">
                    {property.property_type_display}
                  </span>
                </div>
                <p className="mt-3 text-sm text-neutral-600 leading-relaxed">
                  {property.description}
                </p>
              </div>

              {/* Highlights pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="rounded-2xl bg-neutral-50/80 border border-neutral-100 p-3 text-center">
                  <span className="text-[10px] uppercase font-bold text-neutral-400 block tracking-wider">Property Type</span>
                  <span className="text-xs font-bold text-neutral-800 mt-0.5 block truncate">{property.property_type_display}</span>
                </div>
                <div className="rounded-2xl bg-neutral-50/80 border border-neutral-100 p-3 text-center">
                  <span className="text-[10px] uppercase font-bold text-neutral-400 block tracking-wider">Locality</span>
                  <span className="text-xs font-bold text-neutral-800 mt-0.5 block truncate">{property.locality}</span>
                </div>
                <div className="rounded-2xl bg-neutral-50/80 border border-neutral-100 p-3 text-center">
                  <span className="text-[10px] uppercase font-bold text-neutral-400 block tracking-wider">Verification</span>
                  <span className="text-xs font-bold text-emerald-700 mt-0.5 flex items-center justify-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5" /> Verified
                  </span>
                </div>
                <div className="rounded-2xl bg-neutral-50/80 border border-neutral-100 p-3 text-center">
                  <span className="text-[10px] uppercase font-bold text-neutral-400 block tracking-wider">Visits</span>
                  <span className="text-xs font-bold text-action mt-0.5 block">Free On-site</span>
                </div>
              </div>

              <div className="border-t border-neutral-100 pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-action" /> Amenities &amp; Features
                  </h3>
                  <span className="text-xs text-neutral-500">Included in your stay</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Array.from(new Set(property.unit_types.flatMap((unit) => unit.amenities))).map((amenity) => (
                    <div
                      key={amenity}
                      className="flex items-center gap-2.5 rounded-xl border border-neutral-200/80 bg-neutral-50/60 px-3.5 py-2.5 text-xs font-semibold text-neutral-800 hover:border-neutral-300 transition-colors"
                    >
                      {getAmenityIcon(amenity)}
                      <span className="truncate">{amenity}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Section 2: Room Configurations with Integrated Availability Controls */}
            <div id="room-configurations" className="rounded-3xl border border-neutral-200/90 bg-white p-6 sm:p-8 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-5">
                <div>
                  <h2 className="text-lg font-black text-neutral-900 tracking-tight">Available Room Configurations</h2>
                  <p className="text-xs text-neutral-500 mt-0.5">Select a unit type and reserve your move-in date</p>
                </div>
                <span className="self-start sm:self-auto rounded-full bg-signal-50 border border-signal-200 px-3.5 py-1 text-xs font-bold text-signal-700 shadow-2xs">
                  {bookableUnits.length} Types Available
                </span>
              </div>

              {/* Integrated Availability & Duration Selector */}
              <div className="rounded-2xl border border-neutral-200/90 bg-neutral-50/70 p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-700">
                    <Calendar className="h-4 w-4 text-action" /> Check Live Availability &amp; Pricing
                  </div>
                  {shouldShowDurationToggle(publishedModes) ? (
                    <div className="inline-flex rounded-xl bg-neutral-200/70 p-1 text-xs font-bold self-start sm:self-auto">
                      {publishedModes.map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setDurationMode(mode)}
                          className={`rounded-lg px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
                            durationMode === mode
                              ? "bg-white text-navy-900 shadow-xs"
                              : "text-neutral-600 hover:text-neutral-900"
                          }`}
                        >
                          {durationModeLabel(mode)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-neutral-600 mb-1">
                      Move-in Date
                    </label>
                    <input
                      type="date"
                      min={today}
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                      className="w-full rounded-xl border border-neutral-300/80 bg-white px-3.5 py-2.5 text-xs font-semibold text-neutral-800 shadow-2xs focus:border-action focus:outline-none focus:ring-1 focus:ring-action"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-neutral-600 mb-1">
                      Move-out Date
                    </label>
                    <input
                      type="date"
                      min={startDate || today}
                      value={endDate}
                      onChange={(event) => setEndDate(event.target.value)}
                      className="w-full rounded-xl border border-neutral-300/80 bg-white px-3.5 py-2.5 text-xs font-semibold text-neutral-800 shadow-2xs focus:border-action focus:outline-none focus:ring-1 focus:ring-action"
                    />
                  </div>
                </div>
              </div>

              {/* Room Cards List */}
              <div className="space-y-4 pt-1">
                {bookableUnits.length === 0 ? (
                  <p className="rounded-2xl border border-line bg-neutral-50 p-5 text-sm text-neutral-600">
                    No rooms are available for these dates. Try different From–To dates.
                  </p>
                ) : null}
                {bookableUnits.map((unit) => {
                  const vacantCount = unit.units_available;
                  const isSoldOut = vacantCount <= 0;
                  const occupancyModel = property.occupancy_model;
                  const isHotelUnit = occupancyModel === "HOTEL_ROOM";
                  const isEntireUnit = occupancyModel === "ENTIRE_UNIT";
                  const roomClassLabel =
                    unit.room_class === "SINGLE"
                      ? "Single"
                      : unit.room_class === "DOUBLE"
                        ? "Double"
                        : unit.room_class === "TWIN"
                          ? "Twin"
                          : unit.room_class === "DELUXE"
                            ? "Deluxe"
                            : unit.room_class === "SUITE"
                              ? "Suite"
                              : unit.room_class === "EXECUTIVE"
                                ? "Executive"
                                : unit.room_class;
                  const unitRate =
                    durationMode === "MONTHLY"
                      ? unit.pricing.monthly_paise
                      : durationMode === "WEEKLY"
                        ? unit.pricing.duration_mode === "WEEKLY"
                          ? unit.pricing.daily_paise * 7
                          : unit.pricing.monthly_paise
                        : unit.pricing.daily_paise;
                  const rateSuffix =
                    durationMode === "MONTHLY" ? "mo" : durationMode === "WEEKLY" ? "wk" : "night";

                  return (
                    <div
                      key={unit.id}
                      className="rounded-2xl border border-neutral-200/90 bg-white p-5 hover:border-neutral-300 hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-5"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-extrabold text-base text-neutral-900">{unit.name}</h3>
                          {isEntireUnit && unit.bhk ? (
                            <span className="rounded-lg bg-neutral-100 px-2.5 py-0.5 text-xs font-bold text-neutral-700">
                              {unit.bhk}
                            </span>
                          ) : null}
                          {isHotelUnit && roomClassLabel ? (
                            <span className="rounded-lg bg-neutral-100 px-2.5 py-0.5 text-xs font-bold text-neutral-700">
                              {roomClassLabel}
                            </span>
                          ) : null}
                          {isEntireUnit || isHotelUnit
                            ? unit.occupancy_capacity
                              ? (
                                  <span className="rounded-lg bg-neutral-100 px-2.5 py-0.5 text-xs text-neutral-700">
                                    Sleeps {unit.occupancy_capacity}
                                  </span>
                                )
                              : null
                            : unit.sharing_display
                              ? (
                                  <span className="rounded-lg bg-neutral-100 px-2.5 py-0.5 text-xs text-neutral-700">
                                    {unit.sharing_display}
                                  </span>
                                )
                              : null}
                          {unit.is_ac && (
                            <span className="rounded-lg bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 text-xs font-bold flex items-center gap-1">
                              <Wind className="h-3 w-3" /> AC
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-neutral-500 flex-wrap">
                          <span className="font-medium text-neutral-700">{unit.furnishing_display}</span>
                          <span>•</span>
                          <span>{unit.bathrooms} Bathroom{unit.bathrooms > 1 ? "s" : ""}</span>
                          {unit.built_up_sqft > 0 && (
                            <>
                              <span>•</span>
                              <span>{unit.built_up_sqft} sq.ft</span>
                            </>
                          )}
                          <span>•</span>
                          {isSoldOut ? (
                            <span className="inline-flex items-center gap-1.5 font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-0.5 rounded-full text-[11px]">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Sold Out
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full text-[11px]">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> {vacantCount}{" "}
                              {isHotelUnit
                                ? `room${vacantCount > 1 ? "s" : ""} left`
                                : `vacant unit${vacantCount > 1 ? "s" : ""}`}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 self-end md:self-auto shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-neutral-100 w-full md:w-auto justify-between md:justify-end">
                        <div className="text-left md:text-right">
                          <div className="text-lg font-black text-neutral-900">
                            {formatPaise(unitRate)}
                            <span className="text-xs font-normal text-neutral-500">/{rateSuffix}</span>
                          </div>
                          <div className="text-[11px] text-neutral-500">
                            Deposit: {formatPaise(unit.pricing.deposit_paise)}
                          </div>
                        </div>

                        {isSoldOut ? (
                          <button
                            disabled
                            className="rounded-xl bg-neutral-100 px-5 py-2.5 text-xs font-bold text-neutral-400 cursor-not-allowed shadow-none"
                          >
                            Sold Out
                          </button>
                        ) : (
                          <Link
                            href={`/stays/checkout/${unit.id}?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&duration_mode=${encodeURIComponent(durationMode)}`}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-action px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-signal-400 hover:shadow-md transition-all cursor-pointer"
                          >
                            <span>Book This Unit</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section 3: Location & Directions */}
            <div className="rounded-3xl border border-neutral-200/90 bg-white p-6 sm:p-8 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-5">
                <div>
                  <h2 className="text-lg font-black text-neutral-900 tracking-tight flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-action" /> Location &amp; Directions
                  </h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {property.locality.includes("Hyderabad") ? property.locality : `${property.locality}, Hyderabad`}
                    {property.address?.line1 ? ` • ${property.address.line1}` : ""}
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => {
                      const fullAddress = `${property.title}, ${property.address?.line1 || ""}, ${property.locality}, ${property.address?.city || "Hyderabad"} ${property.address?.pincode || ""}`.trim();
                      navigator.clipboard?.writeText(fullAddress);
                      setCopiedAddress(true);
                      setTimeout(() => setCopiedAddress(false), 2000);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer"
                  >
                    {copiedAddress ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-emerald-700 font-bold">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-neutral-400" />
                        <span>Copy Address</span>
                      </>
                    )}
                  </button>

                  <a
                    href={
                      property.address?.latitude && property.address?.longitude
                        ? `https://www.google.com/maps/search/?api=1&query=${property.address.latitude},${property.address.longitude}`
                        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${property.title}, ${property.locality}`)}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-navy-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-neutral-800 transition-colors shadow-2xs cursor-pointer"
                  >
                    <Navigation className="h-3.5 w-3.5" />
                    <span>Open in Maps</span>
                    <ExternalLink className="h-3 w-3 opacity-70" />
                  </a>
                </div>
              </div>

              {/* Interactive Map Embed */}
              <div className="overflow-hidden rounded-2xl border border-neutral-200/90 bg-neutral-100 relative h-64 sm:h-76 w-full shadow-2xs">
                {property.address?.latitude && property.address?.longitude ? (
                  <iframe
                    title={`Map for ${property.title}`}
                    width="100%"
                    height="100%"
                    loading="lazy"
                    className="border-0 w-full h-full"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${property.address.longitude - 0.008}%2C${property.address.latitude - 0.005}%2C${property.address.longitude + 0.008}%2C${property.address.latitude + 0.005}&layer=mapnik&marker=${property.address.latitude}%2C${property.address.longitude}`}
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center bg-gradient-to-br from-neutral-50 to-neutral-100">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-xs text-action mb-2 border border-neutral-200">
                      <MapPin className="h-6 w-6" />
                    </div>
                    <h4 className="text-sm font-bold text-neutral-900">
                      {property.locality.includes("Hyderabad") ? property.locality : `${property.locality}, Hyderabad`}
                    </h4>
                    <p className="mt-1 text-xs text-neutral-500 max-w-sm">
                      {property.address?.line1 || `${property.title} located in prime ${property.locality}`}
                    </p>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${property.title}, ${property.locality}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-action px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-signal-400 transition-colors"
                    >
                      <Navigation className="h-3.5 w-3.5" />
                      <span>View on Google Maps</span>
                    </a>
                  </div>
                )}
              </div>

              {/* Transit & Area Highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="rounded-2xl bg-neutral-50/80 p-4 border border-neutral-100">
                  <span className="text-[11px] uppercase font-bold text-neutral-400 block tracking-wider">Neighborhood</span>
                  <span className="font-bold text-neutral-900 mt-1 block">
                    {property.locality.includes("Hyderabad") ? property.locality : `${property.locality}, Hyderabad`}
                  </span>
                  <span className="text-[11px] text-neutral-500 mt-0.5 block">Verified residential zone</span>
                </div>
                <div className="rounded-2xl bg-neutral-50/80 p-4 border border-neutral-100">
                  <span className="text-[11px] uppercase font-bold text-neutral-400 block tracking-wider">Transit</span>
                  <span className="font-bold text-neutral-900 mt-1 block">Metro &amp; IT Corridors</span>
                  <span className="text-[11px] text-neutral-500 mt-0.5 block">Walkable to key hubs</span>
                </div>
                <div className="rounded-2xl bg-neutral-50/80 p-4 border border-neutral-100">
                  <span className="text-[11px] uppercase font-bold text-neutral-400 block tracking-wider">Security &amp; Entry</span>
                  <span className="font-bold text-neutral-900 mt-1 block">Biometric &amp; CCTV</span>
                  <span className="text-[11px] text-neutral-500 mt-0.5 block">24/7 monitored premises</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar Column (4 cols) - Sticky & Aligned */}
          <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-20 self-start">
            {/* Quick Reserve Anchor Card */}
            <div className="rounded-3xl border border-neutral-200/90 bg-white p-6 shadow-xs space-y-5">
              <div className="flex items-baseline justify-between border-b border-neutral-100 pb-4">
                <div>
                  <span className="text-[11px] uppercase font-bold text-neutral-400 block tracking-wider">Starting from</span>
                  <div className="text-2xl font-black text-neutral-900 mt-0.5">
                    {formatPaise(
                      property.unit_types.length > 0
                        ? durationMode === "MONTHLY"
                          ? Math.min(...property.unit_types.map((u) => u.pricing.monthly_paise))
                          : durationMode === "WEEKLY"
                          ? Math.min(
                              ...property.unit_types.map(
                                (u) => Math.round(u.pricing.monthly_paise / 4)
                              )
                            )
                          : Math.min(...property.unit_types.map((u) => u.pricing.daily_paise))
                        : 0
                    )}
                    <span className="text-xs font-normal text-neutral-500">
                      /{durationMode === "MONTHLY" ? "month" : durationMode === "WEEKLY" ? "week" : "night"}
                    </span>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs font-bold text-amber-800">
                  <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                  <span>{property.rating.toFixed(1)}</span>
                </span>
              </div>

              {/* Stay Dates Summary */}
              <div className="rounded-2xl bg-neutral-50 p-3.5 border border-neutral-100 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-500">Check-in:</span>
                  <span className="font-bold text-neutral-800">{formatDateDisplay(startDate) || startDate}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-500">Check-out:</span>
                  <span className="font-bold text-neutral-800">{formatDateDisplay(endDate) || endDate}</span>
                </div>
              </div>

              {/* CTA */}
              <div>
                <a
                  href="#room-configurations"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-action py-3 text-xs font-bold text-white shadow-xs hover:bg-signal-400 hover:shadow-md transition-all cursor-pointer"
                >
                  <span>Select Room &amp; Reserve</span>
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>

              {/* Trust badges list */}
              <div className="pt-2 border-t border-neutral-100 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-neutral-600">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>100% Verified Property &amp; Pricing</span>
                </div>
                <div className="flex items-center gap-2 text-neutral-600">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Zero Brokerage &amp; Instant Digital Agreement</span>
                </div>
                <div className="flex items-center gap-2 text-neutral-600">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Free in-person visit before booking</span>
                </div>
              </div>
            </div>

            {/* Host Card */}
            <div className="rounded-3xl border border-neutral-200/90 bg-white p-6 shadow-xs space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Host Information</h3>
              <div className="flex items-center gap-3.5">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-navy-800 to-navy-950 text-white font-black text-lg shadow-2xs">
                  {property.host.name.charAt(0)}
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-neutral-900">{property.host.name}</h4>
                  <p className="text-xs text-neutral-500 flex items-center gap-1 mt-0.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                    <span>{property.host.id_verified ? "Identity Verified Host" : "Verification Pending"}</span>
                  </p>
                  <p className="text-[11px] text-neutral-400 mt-0.5">Hosting on Vsolve since {property.host.member_since}</p>
                </div>
              </div>

              <div className="rounded-xl bg-emerald-50/70 border border-emerald-100 p-2.5 text-xs text-emerald-800 flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>Usually responds within 1 hour</span>
              </div>

              <button
                type="button"
                onClick={() => setVisitModalOpen(true)}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50/80 py-2.5 text-xs font-bold text-neutral-800 hover:bg-neutral-100 transition-colors cursor-pointer"
              >
                Request Property Visit
              </button>
            </div>

            {/* Stay Policies Card */}
            {property.policy && (
              <div className="rounded-3xl border border-neutral-200/90 bg-white p-6 shadow-xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Stay Policies &amp; Rules</h3>

                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5">
                    <span className="text-neutral-500 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-neutral-400" /> Standard Check-In
                    </span>
                    <span className="font-bold text-neutral-900">{formatTime(property.policy.check_in_time)}</span>
                  </div>

                  <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5">
                    <span className="text-neutral-500 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-neutral-400" /> Standard Check-Out
                    </span>
                    <span className="font-bold text-neutral-900">{formatTime(property.policy.check_out_time)}</span>
                  </div>

                  <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5">
                    <span className="text-neutral-500 flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-neutral-400" /> Move-Out Notice
                    </span>
                    <span className="font-bold text-neutral-900">{property.policy.notice_period_days} Days</span>
                  </div>

                  <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5">
                    <span className="text-neutral-500 flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-neutral-400" /> Max Guests / Unit
                    </span>
                    <span className="font-bold text-neutral-900">{property.policy.max_guests_per_unit} Persons</span>
                  </div>

                  {property.policy.house_rules && property.policy.house_rules.length > 0 && (
                    <div className="pt-1">
                      <span className="font-bold text-neutral-800 block mb-2">House Rules</span>
                      <ul className="space-y-1.5 text-neutral-600 text-[11px]">
                        {property.policy.house_rules.map((rule, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 mt-1.5 shrink-0" />
                            <span>{rule}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Step 10: Schedule Visit Modal (Inquiry / Slot Preview) */}
      {visitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-neutral-100">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
              <div>
                <h3 className="text-base font-black text-neutral-900">Schedule a Property Visit</h3>
                <p className="text-xs text-neutral-500">
                  {property.title} ({property.locality})
                </p>
              </div>
              <button
                onClick={() => {
                  setVisitModalOpen(false);
                  setVisitSubmitted(false);
                }}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {visitSubmitted ? (
              <div className="py-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-3">
                  <Check className="h-6 w-6" />
                </div>
                <h4 className="text-base font-bold text-neutral-900">Visit Request Sent to Host</h4>
                <p className="mt-1 text-xs text-neutral-500 max-w-xs mx-auto">
                  Host {property.host.name} has received your scheduled visit for {visitDate} ({visitSlot}). You will receive an SMS reminder.
                </p>
                <button
                  onClick={() => {
                    setVisitModalOpen(false);
                    setVisitSubmitted(false);
                  }}
                  className="mt-5 rounded-xl bg-neutral-900 px-5 py-2 text-xs font-bold text-white"
                >
                  Close
                </button>
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!visitDate || !visitorName.trim() || !visitorPhone.trim()) return;
                  setVisitSubmitting(true);
                  setVisitError(null);
                  try {
                    await schedulePropertyVisit(propertyId, {
                      visitor_name: visitorName.trim(),
                      visitor_phone: visitorPhone.trim(),
                      visitor_email: visitorEmail.trim() || undefined,
                      preferred_date: visitDate,
                      time_slot: visitSlot,
                      notes: visitNotes.trim() || undefined,
                    });
                    setVisitSubmitted(true);
                  } catch (err: any) {
                    setVisitError(err.message || "Failed to schedule visit. Please try again.");
                  } finally {
                    setVisitSubmitting(false);
                  }
                }}
                className="mt-4 space-y-4"
              >
                {visitError && (
                  <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{visitError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-neutral-700">Your Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Kumar"
                    value={visitorName}
                    onChange={(e) => setVisitorName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-200 p-2.5 text-xs text-neutral-900 focus:border-action focus:ring-1 focus:ring-action focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-neutral-700">Phone Number *</label>
                    <input
                      type="tel"
                      required
                      placeholder="+91 9876543210"
                      value={visitorPhone}
                      onChange={(e) => setVisitorPhone(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-neutral-200 p-2.5 text-xs text-neutral-900 focus:border-action focus:ring-1 focus:ring-action focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-neutral-700">Email Address (Optional)</label>
                    <input
                      type="email"
                      placeholder="you@example.com"
                      value={visitorEmail}
                      onChange={(e) => setVisitorEmail(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-neutral-200 p-2.5 text-xs text-neutral-900 focus:border-action focus:ring-1 focus:ring-action focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-neutral-700">Preferred Visit Date *</label>
                    <input
                      type="date"
                      required
                      min={new Date().toISOString().slice(0, 10)}
                      value={visitDate}
                      onChange={(e) => setVisitDate(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-neutral-200 p-2.5 text-xs text-neutral-900 focus:border-action focus:ring-1 focus:ring-action focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700">Time Window *</label>
                    <select
                      value={visitSlot}
                      onChange={(e) => setVisitSlot(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-neutral-200 p-2.5 text-xs font-semibold text-neutral-800 focus:border-action focus:ring-1 focus:ring-action focus:outline-none"
                    >
                      <option value="10:00 AM - 11:00 AM">Morning: 10:00 AM - 11:00 AM</option>
                      <option value="11:00 AM - 12:00 PM">Morning: 11:00 AM - 12:00 PM</option>
                      <option value="02:00 PM - 03:00 PM">Afternoon: 02:00 PM - 03:00 PM</option>
                      <option value="04:00 PM - 05:00 PM">Evening: 04:00 PM - 05:00 PM</option>
                      <option value="06:00 PM - 07:00 PM">Evening: 06:00 PM - 07:00 PM</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700">Special Notes or Questions (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Inquiring about single occupancy availability"
                    value={visitNotes}
                    onChange={(e) => setVisitNotes(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-200 p-2.5 text-xs text-neutral-900 focus:border-action focus:ring-1 focus:ring-action focus:outline-none"
                  />
                </div>

                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 flex items-start gap-2">
                  <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    Visits are free of charge. The host or resident manager will meet you at the property at your chosen time slot.
                  </span>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setVisitModalOpen(false)}
                    className="rounded-xl border border-neutral-200 px-4 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={visitSubmitting}
                    className="rounded-xl bg-action px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-signal-400 disabled:opacity-50"
                  >
                    {visitSubmitting ? "Sending Request..." : "Confirm Visit Request"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

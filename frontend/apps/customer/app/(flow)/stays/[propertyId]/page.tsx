"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building,
  CheckCircle2,
  Coffee,
  MapPin,
  ShieldCheck,
  Sparkles,
  Users,
  Wind,
  Wifi,
  Zap,
} from "lucide-react";
import { Badge, EmptyState, ErrorState, Skeleton } from "@vsolve/ui";

import { formatPaise, stayFields } from "@/features/stays/model";
import { fetchStayProperty } from "@/features/stays/queries";
import { StayQuotePanel } from "@/features/stays/view";

export default function StayDetailPage() {
  const params = useParams<{ propertyId: string }>();
  const propertyId = params.propertyId;

  const {
    data: property,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["stay-property", propertyId],
    queryFn: () => fetchStayProperty(propertyId),
    enabled: Boolean(propertyId),
  });

  if (isLoading) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
        <Skeleton className="h-6 w-32" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </main>
    );
  }

  if (error || !property) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-16">
        <ErrorState
          title="Property not available"
          message={error ? (error as Error).message : "This property does not exist or has been removed."}
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      </main>
    );
  }

  const fields = stayFields(property.structured_fields);
  const isAc = Boolean(fields.ac);
  const hasFood = Boolean(fields.food);
  const hasWifi = Boolean(fields.wifi ?? true);
  const hasPower = Boolean(fields.power_backup ?? true);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      {/* Top back navigation */}
      <nav aria-label="Breadcrumb">
        <Link
          href="/stays"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-text-secondary hover:text-text transition"
        >
          <ArrowLeft className="size-3.5" />
          Back to Stays & PG
        </Link>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Property Details & Amenities */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand" className="inline-flex items-center gap-1.5 text-xs font-bold">
                <Building className="size-3" />
                Verified Stay
              </Badge>
              <Badge tone="success" className="inline-flex items-center gap-1 text-xs font-bold">
                <ShieldCheck className="size-3.5" />
                Verified Host
              </Badge>
            </div>

            <h1 className="mt-3 text-2xl font-extrabold text-text sm:text-3xl">
              {property.title}
            </h1>

            <p className="mt-1 text-xs text-text-secondary font-medium">
              Hosted by <strong className="text-text font-bold">{property.host_name}</strong>
            </p>

            {property.location_text && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-text-secondary">
                <MapPin className="size-3.5 shrink-0 text-action" />
                <span>{property.location_text}</span>
              </div>
            )}

            <div className="mt-6 border-t border-line/70 pt-5">
              <h2 className="text-sm font-bold text-text">About This Stay</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary whitespace-pre-line">
                {property.description || "Clean, verified accommodation designed for comfort and accessibility."}
              </p>
            </div>

            {/* Room Units */}
            <div className="mt-6 border-t border-line/70 pt-5">
              <h2 className="text-sm font-bold text-text">Available Room Configurations</h2>
              <div className="mt-3 grid gap-3">
                {property.units.map((unit) => (
                  <div
                    key={unit.id}
                    className="flex items-center justify-between rounded-control border border-line bg-surface-sunken p-3.5"
                  >
                    <div>
                      <div className="text-sm font-bold text-text">{unit.name}</div>
                      <div className="text-xs text-text-secondary">
                        {unit.sharing_count === 1
                          ? "Single occupancy / Private"
                          : `${unit.sharing_count} Persons Sharing`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-extrabold text-action">
                        {formatPaise(unit.nightly_rate_paise)}
                      </div>
                      <div className="text-[10px] text-text-secondary">per night</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Amenities Grid */}
            <div className="mt-6 border-t border-line/70 pt-5">
              <h2 className="text-sm font-bold text-text">Property Amenities</h2>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-text">
                {hasWifi && (
                  <div className="flex items-center gap-2 rounded-control bg-surface-sunken p-2.5 border border-line/60">
                    <Wifi className="size-4 text-action" />
                    <span>High-Speed WiFi</span>
                  </div>
                )}
                {isAc && (
                  <div className="flex items-center gap-2 rounded-control bg-surface-sunken p-2.5 border border-line/60">
                    <Wind className="size-4 text-action" />
                    <span>Air Conditioning</span>
                  </div>
                )}
                {hasFood && (
                  <div className="flex items-center gap-2 rounded-control bg-surface-sunken p-2.5 border border-line/60">
                    <Coffee className="size-4 text-action" />
                    <span>Home-Style Meals</span>
                  </div>
                )}
                {hasPower && (
                  <div className="flex items-center gap-2 rounded-control bg-surface-sunken p-2.5 border border-line/60">
                    <Zap className="size-4 text-action" />
                    <span>24/7 Power Backup</span>
                  </div>
                )}
                <div className="flex items-center gap-2 rounded-control bg-surface-sunken p-2.5 border border-line/60">
                  <ShieldCheck className="size-4 text-emerald-600" />
                  <span>CCTV & Security</span>
                </div>
                <div className="flex items-center gap-2 rounded-control bg-surface-sunken p-2.5 border border-line/60">
                  <Sparkles className="size-4 text-action" />
                  <span>Daily Housekeeping</span>
                </div>
              </div>
            </div>
          </div>

          {/* Enquiry Policy Card */}
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-text flex items-center gap-2">
              <ShieldCheck className="size-4 text-emerald-600" />
              Direct Host Communication Guarantee
            </h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              When you send an enquiry with your check-in dates, the host receives your dates directly.
              Once the host confirms availability and pricing quote, you will receive a notification to finalize check-in.
            </p>
          </div>
        </div>

        {/* Right Column: Interactive Quote and Enquiry Panel */}
        <div className="lg:col-span-5 sticky top-24">
          <StayQuotePanel property={property} />
        </div>
      </div>
    </main>
  );
}

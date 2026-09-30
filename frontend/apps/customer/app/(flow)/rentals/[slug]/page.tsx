"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  MapPin,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { Badge, ErrorState, Skeleton } from "@vsolve/ui";

import { formatPaise } from "@/features/rentals/model";
import { fetchRentalAsset } from "@/features/rentals/queries";
import { RentalBookPanel } from "@/features/rentals/view";
import { RENTALS_HREF } from "@/lib/routes";
import { useCanonicalSlug } from "@/lib/use-canonical-slug";

export default function RentalDetailPage() {
  // The page slug; links shared before slugs carry the asset id, which still resolves.
  const params = useParams<{ slug: string }>();
  const pageKey = params.slug;
  const queryClient = useQueryClient();

  const {
    data: asset,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["rental-asset", pageKey],
    queryFn: () => fetchRentalAsset(pageKey),
    enabled: Boolean(pageKey),
  });
  useCanonicalSlug(RENTALS_HREF, pageKey, asset?.slug, () =>
    queryClient.setQueryData(["rental-asset", asset?.slug], asset),
  );

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

  if (error || !asset) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-16">
        <ErrorState
          title="Rental asset not found"
          message={error ? (error as Error).message : "This rental listing does not exist or has been retired."}
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      {/* Top back navigation */}
      <nav aria-label="Breadcrumb">
        <Link
          href="/rentals"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-text-secondary hover:text-text transition"
        >
          <ArrowLeft className="size-3.5" />
          Back to Equipment Rentals
        </Link>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Asset Details & Trust Protocol */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand" className="inline-flex items-center gap-1.5 text-xs font-bold">
                <Wrench className="size-3" />
                Verified Tool
              </Badge>
              <Badge tone="success" className="inline-flex items-center gap-1 text-xs font-bold">
                <ShieldCheck className="size-3.5" />
                Deposit Protected
              </Badge>
            </div>

            <h1 className="mt-3 text-2xl font-extrabold text-text sm:text-3xl">
              {asset.title}
            </h1>

            <p className="mt-1 text-xs text-text-secondary font-medium">
              Offered by <strong className="text-text font-bold">{asset.partner_name}</strong>
            </p>

            {asset.location_text && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-text-secondary">
                <MapPin className="size-3.5 shrink-0 text-action" />
                <span>Pickup available at {asset.location_text}</span>
              </div>
            )}

            <div className="mt-6 border-t border-line/70 pt-5">
              <h2 className="text-sm font-bold text-text">About This Equipment</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary whitespace-pre-line">
                {asset.description || "Certified commercial-grade equipment maintained in high operating condition."}
              </p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 rounded-control bg-surface-sunken p-4 border border-line/60 sm:grid-cols-3">
              <div>
                <span className="text-xs text-text-secondary font-medium">Daily Rental Rate</span>
                <div className="text-xl font-extrabold text-text">
                  {formatPaise(asset.daily_rate_paise)}
                  <span className="text-xs font-medium text-text-secondary"> / day</span>
                </div>
              </div>
              <div>
                <span className="text-xs text-text-secondary font-medium">Security Deposit</span>
                <div className="text-xl font-extrabold text-text">
                  {formatPaise(asset.deposit_paise)}
                </div>
                <span className="text-[10px] font-semibold text-emerald-700">100% Refundable</span>
              </div>
              <div>
                <span className="text-xs text-text-secondary font-medium">Quantity available</span>
                <div className="text-xl font-extrabold text-text">
                  {asset.quantity_available ?? 1}
                </div>
                <span className="text-[10px] font-semibold text-text-secondary">
                  Identical units for rent
                </span>
              </div>
            </div>
          </div>

          {/* Trust and Safety Protocol Banner */}
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-text flex items-center gap-2">
              <ShieldCheck className="size-4 text-emerald-600" />
              V Solve Hub Rental Guarantee
            </h3>

            <div className="grid gap-3 text-xs text-text-secondary">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600 mt-0.5" />
                <span>
                  <strong>Identity & Equipment Verification:</strong> Both customer and partner identities are verified before handover.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600 mt-0.5" />
                <span>
                  <strong>Full Security Deposit Release:</strong> When you return the tool in good condition, your security deposit is released back immediately.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600 mt-0.5" />
                <span>
                  <strong>Condition Checked:</strong> Inspect tool operation with the partner before signing off handover.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Booking Panel */}
        <div className="lg:col-span-5 sticky top-24">
          <RentalBookPanel asset={asset} />
        </div>
      </div>
    </main>
  );
}

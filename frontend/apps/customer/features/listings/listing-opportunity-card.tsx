"use client";

import Link from "next/link";
import { Building, MapPin } from "lucide-react";

import { SaveHeart, useSavedItems } from "@/features/part-a";
import { listingHref } from "@/lib/routes";
import { formatMoneyText } from "@vsolve/ui";
import { listingFields, type Listing } from "./queries";

export function ListingOpportunityCard({ listing }: { listing: Listing }) {
  const saved = useSavedItems("listing");
  const fields = listingFields(listing.structured_fields);
  const rawPay = fields.pay_range || fields.salary_range || fields.compensation;
  const pay = rawPay ? formatMoneyText(String(rawPay)) : "Pay on request";
  const experience = fields.experience_years || fields.experience || "Experience on request";
  const roleType = fields.role_type || fields.employment_type || "Full-time";
  const mode = fields.shift || fields.work_mode || "On-site";

  return (
    <article className="relative rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="absolute top-4 right-4">
        <SaveHeart saved={saved.isSaved(listing.id)} onToggle={() => saved.toggle(listing.id)} />
      </div>
      <Link href={listingHref(listing.slug)} className="block pr-12">
        <div className="flex items-start gap-3">
          <span className="grid size-10 place-items-center rounded-control bg-surface-sunken text-navy-900">
            <Building className="size-4" />
          </span>
          <div>
            <h2 className="text-base font-bold text-navy-900">{listing.title}</h2>
            <p className="text-xs text-text-secondary">
              {listing.poster_name || "Verified employer"} · Verified employer
            </p>
          </div>
        </div>
        <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-secondary">
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" />
            {listing.location_text || "Hyderabad"}
          </span>
          <span>{String(pay)}</span>
          <span>{String(experience)}</span>
          <span>{String(roleType)}</span>
          <span>{String(mode)}</span>
        </p>
      </Link>
      <div className="mt-3 flex justify-end">
        <Link
          href={`${listingHref(listing.slug)}#apply-panel`}
          className="rounded-control bg-action px-4 py-2 text-xs font-bold text-action-text"
        >
          Apply
        </Link>
      </div>
    </article>
  );
}

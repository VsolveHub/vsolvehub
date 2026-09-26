import {
  BriefcaseBusiness,
  CheckCircle2,
  Clock,
  Crown,
  Eye,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { formatMoney } from "@vsolve/ui";

import { listingFields, type AdminListing } from "../queries";

export interface ListingsTableProps {
  listings: AdminListing[];
  loading: boolean;
  onView: (listing: AdminListing) => void;
  onModerate: (listing: AdminListing) => void;
  onRemove: (listing: AdminListing) => void;
  onReinstate: (listing: AdminListing) => void;
}

export function ListingsTable({
  listings,
  loading,
  onView,
  onModerate,
  onRemove,
  onReinstate,
}: ListingsTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3.5">Listing Info</th>
              <th className="px-4 py-3.5">Role & Compensation</th>
              <th className="px-4 py-3.5">Contact Details</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5">Applications</th>
              <th className="px-4 py-3.5">Created</th>
              <th className="px-4 py-3.5 text-right">Moderation Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && listings.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                  <RefreshCw className="mx-auto mb-2 size-6 animate-spin text-orange-600" />
                  Loading listings from operations catalog...
                </td>
              </tr>
            ) : listings.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                  <BriefcaseBusiness className="mx-auto mb-2 size-8 text-slate-300" />
                  No listings found matching the current filter.
                </td>
              </tr>
            ) : (
              listings.map((listing) => {
                const isPending =
                  listing.moderation_status === "PENDING" || listing.public_state === "PENDING_REVIEW";
                const isRemoved =
                  listing.status === "REMOVED" || listing.moderation_status === "REMOVED";
                const isPublished = listing.status === "PUBLISHED";
                const fields = listingFields(listing.structured_fields);

                return (
                  <tr key={listing.id} className="hover:bg-slate-50/75">
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                          {listing.is_premium && (
                            <span title="Featured / Premium Listing">
                              <Crown className="size-4 text-amber-500 fill-amber-400" />
                            </span>
                          )}
                          <span>{listing.title}</span>
                        </div>
                        {listing.location_text && (
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <MapPin className="size-3 text-slate-400" />
                            <span>{listing.location_text}</span>
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-1 text-xs">
                        {listing.salary_min_paise && listing.salary_min_paise > 0 ? (
                          <span className="font-semibold text-slate-800">
                            {formatMoney(listing.salary_min_paise)}
                            {listing.salary_max_paise && listing.salary_max_paise > listing.salary_min_paise
                              ? ` - ${formatMoney(listing.salary_max_paise)}`
                              : ""}
                            {listing.salary_period ? ` / ${listing.salary_period.toLowerCase()}` : ""}
                          </span>
                        ) : listing.salary_display || fields.salary_range || fields.pay_range ? (
                          <span className="font-semibold text-slate-800">
                            {String(listing.salary_display || fields.salary_range || fields.pay_range)}
                          </span>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-1">
                          {fields.role_type && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                              {String(fields.role_type)}
                            </span>
                          )}
                          {(fields.shift || fields.work_mode) && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                              {String((fields.shift || fields.work_mode))}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-0.5 text-xs text-slate-600">
                        {listing.contact_phone ? (
                          <div className="flex items-center gap-1">
                            <Phone className="size-3 text-slate-400" />
                            <span>{listing.contact_phone}</span>
                          </div>
                        ) : (
                          <span className="italic text-slate-400">No phone</span>
                        )}
                        {listing.contact_email && (
                          <div className="flex items-center gap-1 text-slate-500">
                            <Mail className="size-3 text-slate-400" />
                            <span className="truncate max-w-[140px]">{listing.contact_email}</span>
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-1">
                        {isPending && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
                            <Clock className="size-3" />
                            Needs Review
                          </span>
                        )}
                        {isPublished && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="size-3" />
                            Published
                          </span>
                        )}
                        {isRemoved && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200">
                            <ShieldAlert className="size-3" />
                            Removed
                          </span>
                        )}
                        {!isPending && !isPublished && !isRemoved && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                            {listing.status}
                          </span>
                        )}
                        {listing.moderation_reason && (
                          <span
                            className="text-[11px] text-slate-500 line-clamp-1"
                            title={listing.moderation_reason}
                          >
                            Note: {listing.moderation_reason}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="font-semibold text-slate-900">
                        {listing.application_count}
                      </span>
                      <span className="text-xs text-slate-500 ml-1">candidates</span>
                    </td>

                    <td className="px-4 py-3.5 text-xs text-slate-500">
                      {new Date(listing.created_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onView(listing)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          title="View full listing details"
                        >
                          <Eye className="size-4" />
                        </button>

                        {isPending && (
                          <button
                            type="button"
                            onClick={() => onModerate(listing)}
                            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                          >
                            Review & Decide
                          </button>
                        )}

                        {isPublished && (
                          <button
                            type="button"
                            onClick={() => onRemove(listing)}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            Takedown
                          </button>
                        )}

                        {isRemoved && (
                          <button
                            type="button"
                            onClick={() => onReinstate(listing)}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Reinstate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

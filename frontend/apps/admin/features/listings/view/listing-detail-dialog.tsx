import { BriefcaseBusiness, X } from "lucide-react";
import { formatMoney } from "@vsolve/ui";

import { listingFields, type AdminListing } from "../queries";

export interface ListingDetailDialogProps {
  listing: AdminListing | null;
  onClose: () => void;
}

export function ListingDetailDialog({ listing, onClose }: ListingDetailDialogProps) {
  if (!listing) return null;

  const fields = listingFields(listing.structured_fields);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <BriefcaseBusiness className="size-5 text-orange-600" />
            <h3 className="font-bold text-slate-900">Listing Details</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-sm">
          <div>
            <div className="text-xs font-semibold uppercase text-slate-400">Job Title</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">{listing.title}</div>
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4">
            <div>
              <span className="text-xs text-slate-500">Status</span>
              <div className="font-semibold text-slate-800 mt-0.5">{listing.status}</div>
            </div>
            <div>
              <span className="text-xs text-slate-500">Moderation Status</span>
              <div className="font-semibold text-slate-800 mt-0.5">{listing.moderation_status}</div>
            </div>
            <div>
              <span className="text-xs text-slate-500">Location</span>
              <div className="font-semibold text-slate-800 mt-0.5">
                {listing.location_text || "Remote / Unspecified"}
              </div>
            </div>
            <div>
              <span className="text-xs text-slate-500">Applications</span>
              <div className="font-semibold text-slate-800 mt-0.5">
                {listing.application_count} applicants
              </div>
            </div>
            <div className="col-span-2">
              <span className="text-xs text-slate-500">Pay (server paise)</span>
              <div className="font-semibold text-slate-800 mt-0.5">
                {listing.salary_min_paise && listing.salary_min_paise > 0
                  ? `${formatMoney(listing.salary_min_paise)}${
                      listing.salary_max_paise && listing.salary_max_paise > listing.salary_min_paise
                        ? ` - ${formatMoney(listing.salary_max_paise)}`
                        : ""
                    }${listing.salary_period ? ` / ${listing.salary_period.toLowerCase()}` : ""}`
                  : listing.salary_display || fields.salary_range || fields.pay_range
                    ? String(listing.salary_display || fields.salary_range || fields.pay_range)
                    : "Not set"}
              </div>
            </div>
          </div>

          {Object.keys(fields).length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase text-slate-400 mb-2">Structured Fields</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(fields).map(([k, v]) => (
                  <div key={k} className="rounded border border-slate-200 px-2.5 py-1.5">
                    <span className="font-medium text-slate-500 capitalize">
                      {k.replace("_", " ")}:{" "}
                    </span>
                    <span className="font-semibold text-slate-800">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-xs font-semibold uppercase text-slate-400 mb-1">Description</div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 whitespace-pre-wrap text-slate-700 text-xs leading-relaxed">
              {listing.description}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 space-y-2">
            <div className="text-xs font-semibold uppercase text-slate-400">
              Poster Contact Details
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div>
                Phone: <span className="font-semibold text-slate-800">{listing.contact_phone || "None"}</span>
              </div>
              <div>
                Email: <span className="font-semibold text-slate-800">{listing.contact_email || "None"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

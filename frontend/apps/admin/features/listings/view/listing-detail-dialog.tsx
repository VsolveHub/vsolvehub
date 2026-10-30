import { Button, Dialog, formatMoney, formatMoneyText } from "@vsolve/ui";

import { listingFields, type AdminListing } from "../queries";

export interface ListingDetailDialogProps {
  listing: AdminListing | null;
  onClose: () => void;
}

export function ListingDetailDialog({ listing, onClose }: ListingDetailDialogProps) {
  if (!listing) return null;

  const fields = listingFields(listing.structured_fields);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Listing details"
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
        <div className="space-y-4 text-sm">
          <div>
            <div className="text-xs font-semibold uppercase text-text-muted">Job Title</div>
            <div className="text-lg font-bold text-text mt-0.5">{listing.title}</div>
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-xl bg-surface-muted p-4">
            <div>
              <span className="text-xs text-text-muted">Status</span>
              <div className="font-semibold text-text mt-0.5">{listing.status}</div>
            </div>
            <div>
              <span className="text-xs text-text-muted">Moderation Status</span>
              <div className="font-semibold text-text mt-0.5">{listing.moderation_status}</div>
            </div>
            <div>
              <span className="text-xs text-text-muted">Location</span>
              <div className="font-semibold text-text mt-0.5">
                {listing.location_text || "Remote / Unspecified"}
              </div>
            </div>
            <div>
              <span className="text-xs text-text-muted">Applications</span>
              <div className="font-semibold text-text mt-0.5">
                {listing.application_count} applicants
              </div>
            </div>
            <div className="col-span-2">
              <span className="text-xs text-text-muted">Pay (server paise)</span>
              <div className="font-semibold text-text mt-0.5">
                {listing.salary_min_paise && listing.salary_min_paise > 0
                  ? `${formatMoney(listing.salary_min_paise)}${
                      listing.salary_max_paise && listing.salary_max_paise > listing.salary_min_paise
                        ? ` - ${formatMoney(listing.salary_max_paise)}`
                        : ""
                    }${listing.salary_period ? ` / ${listing.salary_period.toLowerCase()}` : ""}`
                  : listing.salary_display || fields.salary_range || fields.pay_range
                    ? formatMoneyText(String(listing.salary_display || fields.salary_range || fields.pay_range))
                    : "Not set"}
              </div>
            </div>
          </div>

          {Object.keys(fields).length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase text-text-muted mb-2">Structured Fields</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(fields).map(([k, v]) => (
                  <div key={k} className="rounded border border-line px-2.5 py-1.5">
                    <span className="font-medium text-text-muted capitalize">
                      {k.replace("_", " ")}:{" "}
                    </span>
                    <span className="font-semibold text-text">
                      {/salary|pay_range|compensation/i.test(k) ? formatMoneyText(String(v)) : String(v)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-xs font-semibold uppercase text-text-muted mb-1">Description</div>
            <div className="rounded-xl border border-line bg-surface-muted p-4 whitespace-pre-wrap text-text-secondary text-xs leading-relaxed">
              {listing.description}
            </div>
          </div>

          <div className="rounded-xl border border-line p-4 space-y-2">
            <div className="text-xs font-semibold uppercase text-text-muted">
              Poster Contact Details
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <div>
                Phone: <span className="font-semibold text-text">{listing.contact_phone || "None"}</span>
              </div>
              <div>
                Email: <span className="font-semibold text-text">{listing.contact_email || "None"}</span>
              </div>
            </div>
          </div>
        </div>

    </Dialog>
  );
}

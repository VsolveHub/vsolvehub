import type { Schemas } from "@vsolve/api-client";
import { Card } from "@vsolve/ui";
import { LockKeyhole, MapPin } from "lucide-react";

export interface SiteAddressProps {
  readonly address: Schemas["PartnerSiteAddress"] | null;
  readonly approximateArea: string;
}

/** Progressive location disclosure for a Partner's booked project visit. */
export function SiteAddress({ address, approximateArea }: SiteAddressProps) {
  if (address === null) {
    return (
      <Card className="flex items-start gap-3 p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-sunken text-action-secondary">
          <LockKeyhole size={19} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-text">Visit location</h2>
          {approximateArea.trim() === "" ? null : (
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-text-secondary">
              <MapPin size={15} aria-hidden className="shrink-0" />
              <span className="truncate">Near {approximateArea}</span>
            </p>
          )}
          <p className="mt-1 text-xs leading-5 text-text-muted">
            Exact address appears after customer payment confirms the visit. Do not travel while
            this visit is on hold.
          </p>
        </div>
      </Card>
    );
  }

  const localityLine = [address.locality, address.city, address.postal_code]
    .filter((part) => part.trim() !== "")
    .join(", ");

  return (
    <Card className="flex items-start gap-3 border-success-line p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-success-surface text-success-text">
        <MapPin size={20} aria-hidden />
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-bold text-text">Site address</h2>
        <address className="mt-1 not-italic text-sm leading-6 text-text">
          <span className="block font-semibold">{address.line1}</span>
          {address.line2.trim() === "" ? null : <span className="block">{address.line2}</span>}
          {address.landmark.trim() === "" ? null : (
            <span className="block">Near {address.landmark}</span>
          )}
          {localityLine === "" ? null : <span className="block">{localityLine}</span>}
          {address.state.trim() === "" ? null : <span className="block">{address.state}</span>}
        </address>
        <p className="mt-2 text-xs leading-5 text-text-muted">
          Use this address only to complete this Vsolve visit. Customer contact details remain
          private.
        </p>
      </div>
    </Card>
  );
}

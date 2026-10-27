import type { Schemas } from "@vsolve/api-client";
import { Card, buttonStyles, useT } from "@vsolve/ui";
import { LockKeyhole, MapPin, Navigation } from "lucide-react";

export interface SiteAddressProps {
  readonly address: Schemas["PartnerSiteAddress"] | null;
  readonly approximateArea: string;
}

/**
 * Progressive location disclosure for a Partner's booked project visit.
 *
 * ## The privacy rule is not repeated here
 *
 * This card used to close with "Use this address only to complete this Vsolve
 * visit. Customer contact details remain private." — which the enquiry brief
 * said again two cards further down. Saying a rule twice on one screen does not
 * make it twice as binding; it makes both copies furniture. It is stated once,
 * in `RequirementSummary`, where it governs the whole enquiry rather than
 * appearing to be a footnote on the map link.
 */
export function SiteAddress({ address, approximateArea }: SiteAddressProps) {
  const t = useT();
  if (address === null) {
    return (
      <Card className="flex items-start gap-3 p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-sunken text-action-secondary">
          <LockKeyhole size={19} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-text">{t("visit.siteAddress.locationTitle")}</h2>
          {approximateArea.trim() === "" ? null : (
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-text-secondary">
              <MapPin size={15} aria-hidden className="shrink-0" />
              <span className="truncate">
                {t("visit.siteAddress.near", { place: approximateArea })}
              </span>
            </p>
          )}
          <p className="mt-1 text-xs leading-5 text-text-muted">
            {t("visit.siteAddress.lockedNote")}
          </p>
        </div>
      </Card>
    );
  }

  const localityLine = [address.locality, address.city, address.postal_code]
    .filter((part) => part.trim() !== "")
    .join(", ");

  // The server builds the route to the Customer's pin, under the same gate as
  // the address text: on a phone it opens the installed maps app, on desktop
  // the maps site. The pin is never sent as bare coordinates. Typed text is the
  // destination only when the server had no pin to route to.
  const destination = [
    address.line1,
    address.line2,
    address.landmark,
    address.locality,
    address.city,
    address.postal_code,
  ]
    .filter((part) => part.trim() !== "")
    .join(", ");
  const mapsHref =
    address.directions_url ||
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;

  return (
    <Card className="flex items-start gap-3 border-success-line p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-success-surface text-success-text">
        <MapPin size={20} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-bold text-text">{t("visit.siteAddress.title")}</h2>
        <address className="mt-1 not-italic text-sm leading-6 text-text">
          <span className="block font-semibold">{address.line1}</span>
          {address.line2.trim() === "" ? null : <span className="block">{address.line2}</span>}
          {address.landmark.trim() === "" ? null : (
            <span className="block">
              {t("visit.siteAddress.near", { place: address.landmark })}
            </span>
          )}
          {localityLine === "" ? null : <span className="block">{localityLine}</span>}
          {address.state.trim() === "" ? null : <span className="block">{address.state}</span>}
        </address>
        <a
          href={mapsHref}
          target="_blank"
          rel="noreferrer"
          className={buttonStyles({ variant: "outline", className: "mt-3 w-full gap-2" })}
        >
          <Navigation size={16} aria-hidden />
          {t("visit.siteAddress.openRoute")}
        </a>
      </div>
    </Card>
  );
}

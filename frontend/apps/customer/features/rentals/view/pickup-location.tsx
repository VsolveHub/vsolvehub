import { Clock, MapPin } from "lucide-react";
import { cn } from "@vsolve/ui";
import { MapEmbed } from "@vsolve/ui/map-embed";

import { GOOGLE_MAPS_KEY } from "@/lib/google-maps";

import { dayHoursLabel, weekdayOf, type PickupAddress, type PickupHours } from "../pickup";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Where to collect a Self Pickup rental, and when the owner is there.
 *
 * "View Location" opens Google Maps at the owner's pin, or searching for the address they typed
 * when the ad predates pins. The server builds that link. `showMap` adds a small map of the pin,
 * for the item's own page rather than for a list of bookings.
 */
export function PickupLocation({
  address,
  hours,
  className,
  showMap = false,
}: {
  address: PickupAddress | null | undefined;
  hours?: PickupHours | null;
  className?: string;
  showMap?: boolean;
}) {
  const place = address ? [address.area, address.city].filter((p) => p.trim()).join(", ") : "";
  const today = weekdayOf(todayIso());
  return (
    <div
      className={cn("rounded-control border border-line bg-surface-sunken p-3 text-xs", className)}
      data-testid="pickup-location"
    >
      <p className="flex items-center gap-1.5 font-bold text-text">
        <MapPin className="size-3.5 shrink-0 text-action" aria-hidden />
        Pickup Location
      </p>
      {address && (address.line || place) ? (
        <address className="mt-1.5 not-italic leading-relaxed text-text-secondary">
          {address.partner_name ? (
            <span className="block font-semibold text-text">{address.partner_name}</span>
          ) : null}
          {address.line ? <span className="block">{address.line}</span> : null}
          {place ? (
            <span className="block">
              {place}
              {address.pincode ? ` ${address.pincode}` : ""}
            </span>
          ) : address.pincode ? (
            <span className="block">{address.pincode}</span>
          ) : null}
        </address>
      ) : (
        <p className="mt-1.5 text-text-secondary">The owner hasn&rsquo;t added the pickup address yet.</p>
      )}
      {showMap && address?.latitude && address.longitude ? (
        <MapEmbed
          apiKey={GOOGLE_MAPS_KEY}
          latitude={address.latitude}
          longitude={address.longitude}
          mode="place"
          title="Map of the pickup location"
          className="mt-2 h-40"
        />
      ) : null}
      {address?.maps_url ? (
        <a
          href={address.maps_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 rounded-control border border-action/40 bg-surface px-2.5 py-1.5 font-bold text-action hover:bg-action-surface"
        >
          <MapPin className="size-3.5" aria-hidden />
          View Location
        </a>
      ) : null}

      {hours ? (
        <div className="mt-3 border-t border-line/70 pt-2.5">
          <p className="flex items-center gap-1.5 font-bold text-text">
            <Clock className="size-3.5 shrink-0 text-action" aria-hidden />
            Pickup hours
          </p>
          {hours.is_set ? (
            <>
              <p className="mt-1 text-[11px] text-text-secondary">
                Come any time in these hours on your pickup and return days.
              </p>
              <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
                {hours.days.map((day) => (
                  <div key={day.weekday} className="contents">
                    <dt
                      className={cn(
                        "text-text-secondary",
                        day.weekday === today && "font-bold text-text",
                      )}
                    >
                      {day.day_name}
                      {day.weekday === today ? " (today)" : ""}
                    </dt>
                    <dd
                      className={cn(
                        day.is_open ? "text-text" : "text-text-muted",
                        day.weekday === today && "font-bold",
                      )}
                    >
                      {dayHoursLabel(day)}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <p className="mt-1 text-text-secondary">
              The owner hasn&rsquo;t set pickup hours yet.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

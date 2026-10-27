"use client";

import { cn , formatDate} from "@vsolve/ui";
import { createElement, type ReactNode } from "react";

import { RemoteImage } from "@/components/remote-image";

import { useCatalogServiceIndex } from "../client-queries";
import { iconForService } from "../icon-catalogue/service-icon";
import { isServiceCoverUrl, type CatalogServiceHint } from "../service-cover";

/**
 * The service listing's cover, sized for a booking / activity row.
 *
 * Resolves against `useCatalogServiceIndex` — the same `ServiceCard.cover` the
 * category pages render — so this is not a second image source. While the
 * catalogue is loading, or when a booking cannot be matched, the reserved box
 * still paints so the card does not jump, and the fallback is the existing
 * V Solve Hub icon on cream rather than a stock photograph.
 */

const THUMB_BOX =
  "relative block h-20 w-[7.5rem] shrink-0 grow-0 overflow-hidden rounded-[12px] border border-line bg-[#F4F1EC] sm:h-[5.5rem] sm:w-[8.5rem]";

export function CatalogServiceThumb({
  hint,
  className,
}: {
  hint: CatalogServiceHint;
  className?: string;
}) {
  const catalog = useCatalogServiceIndex();
  const service = catalog.find(hint);
  const imageUrl = service?.cover?.url ?? "";
  const iconKey = service?.icon_key ?? "service";
  const boxClass = className ? `${THUMB_BOX} ${className}` : THUMB_BOX;

  if (imageUrl !== "") {
    const contain = isServiceCoverUrl(imageUrl);
    return (
      <span className={boxClass}>
        <RemoteImage
          src={imageUrl}
          alt=""
          fill
          sizes="136px"
          className={
            contain
              ? "size-full object-contain object-center p-2"
              : "size-full object-cover object-center"
          }
        />
      </span>
    );
  }

  return (
    <span aria-hidden className={`${boxClass} grid place-items-center text-navy-800`}>
      {createElement(iconForService(iconKey), {
        className: "size-8",
        strokeWidth: 1.6,
      })}
    </span>
  );
}

/** Image on the left of the copy, on every width. */
export function CatalogServiceThumbRow({
  hint,
  children,
}: {
  hint: CatalogServiceHint;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-row items-center gap-3.5 sm:gap-4">
      <CatalogServiceThumb hint={hint} />
      <div className="flex min-w-0 flex-1 flex-col justify-center">{children}</div>
    </div>
  );
}

/**
 * The four things a bookings row is allowed: name, badge, one line of when or
 * what to do, and a price when there is one. Essays, fee lines and "last
 * update" belong on the detail, not here.
 */
export function BookingListBody({
  title,
  badge,
  detail,
  detailAction = false,
  price,
}: {
  title: string;
  badge: ReactNode;
  detail?: ReactNode;
  /** True when `detail` is something the customer still has to do. */
  detailAction?: boolean;
  price?: ReactNode;
}) {
  const hasFooter = detail != null || price != null;

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 text-pretty text-base font-semibold leading-snug text-navy-900">
          {title}
        </h2>
        <div className="shrink-0">{badge}</div>
      </div>
      {hasFooter ? (
        <div className="mt-1 flex items-end justify-between gap-3">
          {detail != null ? (
            <p
              className={cn(
                "min-w-0 text-sm leading-5",
                detailAction ? "font-medium text-signal-700" : "text-text-secondary",
              )}
            >
              {detail}
            </p>
          ) : (
            <span />
          )}
          {price}
        </div>
      ) : null}
    </>
  );
}

/** Weekday, day, month and time — "Fri, 4 Sept, 8:00 am". */
export function formatBookingWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Date-only fields such as `service_by`. */
export function formatBookingDay(isoDate: string): string {
  const value = isoDate.includes("T") ? isoDate : `${isoDate}T12:00:00`;
  return formatDate(value);
}

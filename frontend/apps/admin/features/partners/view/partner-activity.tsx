"use client";

import { request, type Schemas } from "@vsolve/api-client";
import { Badge, Spinner, formatMoney } from "@vsolve/ui";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { BOOKING_KIND_LABEL, bookingHref } from "@/features/customers/queries";
import { getApiClient } from "@/lib/api/browser";

type Activity = Schemas["OperationsPartnerActivity"];

const WHEN = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

export function usePartnerActivity(partnerId: string) {
  return useQuery({
    queryKey: ["ops-partner-activity", partnerId],
    queryFn: (): Promise<Activity> =>
      request(() =>
        getApiClient().GET("/api/v1/operations/partners/{partner_id}/activity/", {
          params: { path: { partner_id: partnerId } },
        }),
      ),
  });
}

/**
 * What the partner is owed and their recent work, on their record. Both used to need separate
 * trips: Payouts for the money, and each service's list for their bookings.
 */
export function PartnerActivity({ partnerId }: { partnerId: string }) {
  const activity = usePartnerActivity(partnerId);

  if (activity.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-text-secondary">
        <Spinner size="sm" /> Loading money and work…
      </p>
    );
  }
  if (activity.isError || !activity.data) {
    return <p className="text-sm text-danger-text">Their money and bookings could not be loaded.</p>;
  }

  const { balance, bookings } = activity.data;
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-text-secondary">Payable now</dt>
          <dd className="font-bold text-text" data-numeric>
            {formatMoney(balance.available_paise)}
          </dd>
        </div>
        <div>
          <dt className="text-text-secondary">Clearing</dt>
          <dd className="font-bold text-text" data-numeric>
            {formatMoney(balance.clearing_paise)}
          </dd>
        </div>
        <div>
          <dt className="text-text-secondary">On hold</dt>
          <dd className="font-bold text-text" data-numeric>
            {formatMoney(balance.held_paise)}
          </dd>
        </div>
        <div>
          <dt className="text-text-secondary">Paid out</dt>
          <dd className="font-bold text-text" data-numeric>
            {formatMoney(balance.paid_paise)}
          </dd>
        </div>
      </dl>

      {bookings.length === 0 ? (
        <p className="text-sm text-text-secondary">No bookings yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {bookings.map((booking) => (
            <li key={`${booking.kind}-${booking.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text">{booking.title}</p>
                <p className="text-xs text-text-secondary">
                  {BOOKING_KIND_LABEL[booking.kind]} · {WHEN.format(new Date(booking.when))}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone="neutral">{booking.status_label}</Badge>
                <Link
                  href={bookingHref(booking)}
                  className="inline-flex items-center text-sm font-semibold text-text-link hover:underline"
                >
                  Open <ChevronRight aria-hidden className="size-4" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

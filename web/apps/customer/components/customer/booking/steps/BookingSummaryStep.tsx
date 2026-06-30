"use client";

import { Button } from "@/components/ui/Button";
import { formatPrice, formatDate } from "@/lib/format";
import type { BookingDraft, BookingServiceInfo, VendorOption } from "@/lib/bookings/types";

type Address = { id: string; fullAddress: string; label: string };

type Props = {
  service: BookingServiceInfo;
  draft: BookingDraft;
  address: Address | null;
  vendor: VendorOption | null;
  onNext: () => void;
};

export function BookingSummaryStep({ service, draft, address, vendor, onNext }: Props) {
  const total = service.pricePaise;

  return (
    <div className="stack-lg">
      <div className="card stack">
        <h2 className="section-title">Booking summary</h2>

        <SummaryRow label="Service" value={service.name} />
        {draft.issueDescription && (
          <SummaryRow label="Description" value={draft.issueDescription} />
        )}
        {draft.mediaUrls.length > 0 && (
          <div>
            <p className="text-sm text-muted">Uploaded media</p>
            <div className="booking-media-grid">
              {draft.mediaUrls.map((url) => (
                <img key={url} src={url} alt="Booking media" className="booking-media-thumb" />
              ))}
            </div>
          </div>
        )}
        <SummaryRow label="Address" value={address?.fullAddress ?? "—"} />
        <SummaryRow
          label="Schedule"
          value={
            draft.scheduleType === "instant"
              ? "Instant — as soon as possible"
              : `${formatDate(draft.slot)} · ${new Date(draft.slot).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
          }
        />
        <SummaryRow
          label="Professional"
          value={vendor ? `${vendor.name} (★ ${vendor.rating.toFixed(1)})` : "—"}
        />
      </div>

      <div className="card stack">
        <div className="flex-between">
          <span className="card-title">Estimated total</span>
          <span className="detail-price" style={{ margin: 0 }}>
            {formatPrice(total)}
          </span>
        </div>
      </div>

      <Button onClick={onNext} block>
        Proceed to payment
      </Button>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted">{label}</p>
      <p>{value}</p>
    </div>
  );
}

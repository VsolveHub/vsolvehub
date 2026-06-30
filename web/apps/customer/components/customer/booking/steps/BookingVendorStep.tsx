"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { pickBestVendor } from "@/lib/bookings/vendor-pick";
import type { VendorAssignmentMode, VendorOption } from "@/lib/bookings/types";

type Props = {
  serviceId: string;
  addressId: string | null;
  vendorId: string | null;
  vendorAssignmentMode: VendorAssignmentMode;
  onChange: (patch: {
    vendorId?: string | null;
    vendorAssignmentMode?: VendorAssignmentMode;
  }) => void;
  onNext: () => void;
};

export function BookingVendorStep({
  serviceId,
  addressId,
  vendorId,
  vendorAssignmentMode,
  onChange,
  onNext,
}: Props) {
  const [nearby, setNearby] = useState<VendorOption[]>([]);
  const [previous, setPrevious] = useState<VendorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      if (!addressId) return;
      setLoading(true);
      const params = new URLSearchParams({ serviceId, addressId });
      const res = await fetch(`/api/vendors/nearby?${params}`);
      const data = await res.json();
      if (res.ok) {
        setNearby(data.nearby);
        setPrevious(data.previous);
      }
      setLoading(false);
    }
    load();
  }, [serviceId, addressId]);

  function autoAssign() {
    const best = pickBestVendor(nearby);
    if (best) selectVendor(best, "auto");
  }

  function selectVendor(vendor: VendorOption, mode: VendorAssignmentMode) {
    onChange({
      vendorId: vendor.id,
      vendorAssignmentMode: mode,
    });
  }

  function handleNext() {
    if (!vendorId) {
      setError("Please select a professional");
      return;
    }
    onNext();
  }

  if (loading) {
    return <LoadingState label="Finding nearby professionals…" variant="inline" />;
  }

  return (
    <div className="stack-lg">
      <div className="card">
        <div className="flex-between">
          <h2 className="section-title" style={{ margin: 0 }}>
            Auto assign best match
          </h2>
          <Button
            size="sm"
            variant={vendorAssignmentMode === "auto" ? "primary" : "secondary"}
            onClick={autoAssign}
          >
            Use best
          </Button>
        </div>
        <p className="text-sm text-muted">We pick the highest-rated professional closest to you.</p>
      </div>

      {previous.length > 0 && (
        <div className="stack">
          <h2 className="section-title">Previously booked</h2>
          {previous.map((vendor) => (
            <VendorCard
              key={`prev-${vendor.id}`}
              vendor={vendor}
              selected={vendorId === vendor.id}
              onSelect={() => selectVendor(vendor, "manual")}
            />
          ))}
        </div>
      )}

      <div className="stack">
        <h2 className="section-title">Nearby professionals</h2>
        {nearby.length === 0 ? (
          <p className="text-muted">No professionals available right now. Try another slot.</p>
        ) : (
          nearby.map((vendor) => (
            <VendorCard
              key={vendor.id}
              vendor={vendor}
              selected={vendorId === vendor.id}
              onSelect={() => selectVendor(vendor, "manual")}
            />
          ))
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <Button onClick={handleNext} block disabled={!vendorId}>
        Next
      </Button>
    </div>
  );
}

function VendorCard({
  vendor,
  selected,
  onSelect,
}: {
  vendor: VendorOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" className={`card vendor-card ${selected ? "selected" : ""}`} onClick={onSelect}>
      <p className="card-title">{vendor.name}</p>
      <p className="text-sm text-muted">
        ★ {vendor.rating.toFixed(1)} · {vendor.distanceKm} km away
        {vendor.isPrevious && " · Booked before"}
      </p>
    </button>
  );
}

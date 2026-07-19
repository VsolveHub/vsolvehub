import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatPrice } from "@/lib/format";
import { VEHICLE_STATUS_LABELS } from "@/lib/vehicle/constants";
import type { TrackingData } from "./types";

type Props = {
  data: TrackingData;
  canCancel: boolean;
  cancelling: boolean;
  loading: boolean;
  onCancel: () => void;
  onSimulateNext: () => void;
  onReset: () => void;
};

export function GenericVehicleTracker({ data, canCancel, cancelling, loading, onCancel, onSimulateNext, onReset }: Props) {
  const assignee = data.driver ?? data.vendor;

  return (
    <div className="stack-lg">
      <div className="card">
        <div className="flex-between">
          <div>
            <p className="text-sm text-muted">Booking reference</p>
            <p className="card-title">{data.bookingRef}</p>
          </div>
          <Badge status={data.status}>
            {VEHICLE_STATUS_LABELS[data.status] ?? data.status}
          </Badge>
        </div>
        <p className="alert alert-info mt-2">{data.message}</p>
      </div>

      <div className="card">
        <h2 className="section-title">Status timeline</h2>
        <div className="stack">
          {data.statusLogs.map((log: any, i: number) => (
            <div key={i} className="flex-between text-sm">
              <span>{VEHICLE_STATUS_LABELS[log.status] ?? log.status}</span>
              {log.status === data.status && <span className="text-muted">Current</span>}
            </div>
          ))}
        </div>
      </div>

      {data.rentalAsset && (
        <div className="card">
          <h2 className="section-title">Vehicle</h2>
          <p className="card-title">{data.rentalAsset.name}</p>
          <p className="text-sm text-muted">
            {data.rentalAsset.brand} {data.rentalAsset.model}
          </p>
        </div>
      )}

      {assignee && (
        <div className="card">
          <h2 className="section-title">{data.driver ? "Driver" : "Mechanic"}</h2>
          <p className="card-title">{assignee.name}</p>
          <p className="text-sm text-muted">
            ★ {assignee.rating.toFixed(1)}
            {data.driver ? ` · ${data.driver.vehicleNumber}` : ""}
          </p>
          {assignee.phone ? (
            <a href={`tel:${assignee.phone}`} className="btn btn-secondary btn-sm mt-2">
              Call
            </a>
          ) : null}
        </div>
      )}

      <div className="card">
        <div className="flex-between">
          <span>Amount</span>
          <span className="card-title">{formatPrice(data.quotedAmount)}</span>
        </div>
        {data.depositPaise > 0 && (
          <p className="text-sm text-muted mt-1">
            Includes {formatPrice(data.depositPaise)} security deposit
          </p>
        )}
      </div>

      <div className="booking-action-row">
        {canCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={cancelling}>
            {cancelling ? "Cancelling…" : "Cancel booking"}
          </Button>
        )}
        <Link href="/services?category=vehicle-services" className="btn btn-primary">
          Book another
        </Link>
      </div>

      {/* Floating Demo Simulation Controls for Rentals/Repair/Transport */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 bg-white border-t border-gray-100 shadow-lg flex gap-3 z-50">
        {data.status !== "COMPLETED" ? (
          <button
            type="button"
            onClick={onSimulateNext}
            disabled={loading}
            className="w-full py-3 bg-purple-900 hover:bg-purple-955 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all text-center animate-pulse"
          >
            {loading ? "Simulating..." : "Simulate Next Step (Demo)"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onReset}
            disabled={loading}
            className="w-full py-3 bg-purple-800 hover:bg-purple-900 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all text-center"
          >
            Reset Simulation (Demo)
          </button>
        )}
      </div>
    </div>
  );
}

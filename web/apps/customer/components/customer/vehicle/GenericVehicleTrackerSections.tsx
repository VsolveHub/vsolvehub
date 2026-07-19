import { Badge } from "@/components/ui/Badge";
import { formatPrice } from "@/lib/format";
import { VEHICLE_STATUS_LABELS } from "@/lib/vehicle/constants";
import type { TrackingData } from "./types";

export function StatusCard({ data }: { data: TrackingData }) {
  return (
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
  );
}

export function StatusTimelineCard({ data }: { data: TrackingData }) {
  return (
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
  );
}

export function VehicleAssetCard({ asset }: { asset: NonNullable<TrackingData["rentalAsset"]> }) {
  return (
    <div className="card">
      <h2 className="section-title">Vehicle</h2>
      <p className="card-title">{asset.name}</p>
      <p className="text-sm text-muted">
        {asset.brand} {asset.model}
      </p>
    </div>
  );
}

export function AssigneeCard({ name, rating, phone, vehicleNumber }: { name: string; rating: number; phone: string; vehicleNumber?: string }) {
  return (
    <div className="card">
      <h2 className="section-title">{vehicleNumber ? "Driver" : "Mechanic"}</h2>
      <p className="card-title">{name}</p>
      <p className="text-sm text-muted">
        ★ {rating.toFixed(1)}
        {vehicleNumber ? ` · ${vehicleNumber}` : ""}
      </p>
      {phone ? (
        <a href={`tel:${phone}`} className="btn btn-secondary btn-sm mt-2">
          Call
        </a>
      ) : null}
    </div>
  );
}

export function AmountCard({ data }: { data: TrackingData }) {
  return (
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
  );
}

export function SimulationFooter({ isCompleted, loading, onSimulateNext, onReset }: { isCompleted: boolean; loading: boolean; onSimulateNext: () => void; onReset: () => void }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 bg-white border-t border-gray-100 shadow-lg flex gap-3 z-50">
      {!isCompleted ? (
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
  );
}

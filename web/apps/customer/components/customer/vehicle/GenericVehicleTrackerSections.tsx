import { Badge } from "@/components/ui/Badge";
import { formatPrice } from "@/lib/format";
import { VEHICLE_STATUS_LABELS } from "@/lib/vehicle/constants";
import type { TrackingData } from "./types";

export function StatusCard({ data }: { data: TrackingData }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm text-gray-500">Booking reference</p>
          <p className="mb-1 text-[15px] font-semibold text-gray-900">{data.bookingRef}</p>
        </div>
        <Badge status={data.status}>
          {VEHICLE_STATUS_LABELS[data.status] ?? data.status}
        </Badge>
      </div>
      <p className="rounded-xl px-4 py-3 text-sm bg-[var(--color-brand-light)] text-[var(--color-brand-dark)] mt-2">{data.message}</p>
    </div>
  );
}

export function StatusTimelineCard({ data }: { data: TrackingData }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Status timeline</h2>
      <div className="flex flex-col gap-4">
        {data.statusLogs.map((log: any, i: number) => (
          <div key={i} className="flex items-center justify-between gap-2 text-sm">
            <span>{VEHICLE_STATUS_LABELS[log.status] ?? log.status}</span>
            {log.status === data.status && <span className="text-gray-500">Current</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function VehicleAssetCard({ asset }: { asset: NonNullable<TrackingData["rentalAsset"]> }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Vehicle</h2>
      <p className="mb-1 text-[15px] font-semibold text-gray-900">{asset.name}</p>
      <p className="text-sm text-gray-500">
        {asset.brand} {asset.model}
      </p>
    </div>
  );
}

export function AssigneeCard({ name, rating, phone, vehicleNumber }: { name: string; rating: number; phone: string; vehicleNumber?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">{vehicleNumber ? "Driver" : "Mechanic"}</h2>
      <p className="mb-1 text-[15px] font-semibold text-gray-900">{name}</p>
      <p className="text-sm text-gray-500">
        ★ {rating.toFixed(1)}
        {vehicleNumber ? ` · ${vehicleNumber}` : ""}
      </p>
      {phone ? (
        <a href={`tel:${phone}`} className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium transition-colors disabled:opacity-60 px-3 py-1.5 text-[13px] border border-gray-200 bg-white text-gray-900 hover:bg-gray-50">
          Call
        </a>
      ) : null}
    </div>
  );
}

export function AmountCard({ data }: { data: TrackingData }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span>Amount</span>
        <span className="mb-1 text-[15px] font-semibold text-gray-900">{formatPrice(data.quotedAmount)}</span>
      </div>
      {data.depositPaise > 0 && (
        <p className="text-sm text-gray-500 mt-1">
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

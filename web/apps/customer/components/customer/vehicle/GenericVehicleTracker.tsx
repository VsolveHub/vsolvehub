import Link from "next/link";
import { Button } from "@/components/ui/Button";
import type { TrackingData } from "./types";
import { StatusCard, StatusTimelineCard, VehicleAssetCard, AssigneeCard, AmountCard, SimulationFooter } from "./GenericVehicleTrackerSections";

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
      <StatusCard data={data} />
      <StatusTimelineCard data={data} />

      {data.rentalAsset && <VehicleAssetCard asset={data.rentalAsset} />}

      {assignee && (
        <AssigneeCard
          name={assignee.name}
          rating={assignee.rating}
          phone={assignee.phone}
          vehicleNumber={data.driver?.vehicleNumber}
        />
      )}

      <AmountCard data={data} />

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
      <SimulationFooter isCompleted={data.status === "COMPLETED"} loading={loading} onSimulateNext={onSimulateNext} onReset={onReset} />
    </div>
  );
}

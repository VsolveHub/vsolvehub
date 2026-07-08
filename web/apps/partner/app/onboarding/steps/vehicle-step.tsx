"use client";

import { Field, SelectField, FileDrop, StepActions, UploadForm } from "@/components/forms";
import { saveVehicle } from "../actions";

export function VehicleStep({
  vehicle,
}: {
  vehicle: { type: string; make: string | null; model: string | null; regNumber: string } | null;
}) {
  return (
    <UploadForm action={saveVehicle} className="space-y-5">
      <SelectField
        label="Vehicle type"
        name="vehicleType"
        required
        defaultValue={vehicle?.type ?? ""}
        options={[
          { value: "BIKE", label: "Bike / Scooter" },
          { value: "AUTO", label: "Auto rickshaw" },
          { value: "CAR", label: "Car" },
          { value: "MINI_TRUCK", label: "Mini truck" },
        ]}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Make" name="make" defaultValue={vehicle?.make ?? ""} placeholder="e.g. Honda" />
        <Field label="Model" name="model" defaultValue={vehicle?.model ?? ""} placeholder="e.g. Activa" />
      </div>
      <Field
        label="Registration number"
        name="regNumber"
        required
        defaultValue={vehicle?.regNumber ?? ""}
        placeholder="TS09 AB 1234"
      />
      <FileDrop
        name="rc"
        docType="RC"
        label="Registration Certificate (RC)"
        required
        hint="Vehicle RC — JPG, PNG or PDF up to 5MB."
      />

      <StepActions />
    </UploadForm>
  );
}

"use client";

import { useActionState } from "react";
import { Field, SelectField, FileDrop, StepActions } from "@/components/forms";
import { saveVehicle, type StepState } from "../actions";

export function VehicleStep({
  vehicle,
}: {
  vehicle: { type: string; make: string | null; model: string | null; regNumber: string } | null;
}) {
  const [state, action] = useActionState<StepState, FormData>(saveVehicle, {});

  return (
    <form action={action} className="space-y-5">
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
      <FileDrop name="rc" label="Registration Certificate (RC)" />

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      <StepActions />
    </form>
  );
}

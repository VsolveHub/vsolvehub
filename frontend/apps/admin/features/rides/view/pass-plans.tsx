"use client";

import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button, Dialog, EmptyState, ErrorState, Field, Input, Select, Spinner, formatMoney } from "@vsolve/ui";
import { useState } from "react";

import { VEHICLE_TYPES, durationText, fromInput, toInput } from "../model";
import { usePassPlans, useSavePassPlan, type PassPlan, type PassPlanWrite } from "../queries";
import { Stacked, Table, Td, Th, Toolbar } from "./layout";

function PlanDialog({ plan, onClose }: { plan: PassPlan | null; onClose: () => void }) {
  const save = useSavePassPlan();
  const [code, setCode] = useState(plan?.code ?? "");
  const [name, setName] = useState(plan?.name ?? "");
  const [price, setPrice] = useState(plan ? toInput(plan.price_paise, "rupees") : "");
  const [hours, setHours] = useState(plan ? String(plan.duration_hours) : "24");
  const [vehicle, setVehicle] = useState(plan?.vehicle_type ?? "");
  const [trips, setTrips] = useState(plan?.max_trips ? String(plan.max_trips) : "");
  const [active, setActive] = useState(plan?.is_active ?? true);
  // Each message shows under its own box, and goes as soon as that box changes.
  const [problems, setProblems] = useState<Partial<Record<"code" | "name" | "price" | "hours" | "trips", string>>>(
    {},
  );

  function clear(key: keyof typeof problems) {
    setProblems((old) => (old[key] ? { ...old, [key]: undefined } : old));
  }

  function submit() {
    const pricePaise = fromInput(price, "rupees");
    const duration = fromInput(hours, "minutes");
    // Empty means no trip limit.
    const maxTrips = trips.trim() ? fromInput(trips, "minutes") : null;
    const found: typeof problems = {};
    if (!plan && !code.trim()) found.code = "Give the plan a code, for example DAILY_BIKE.";
    if (!name.trim()) found.name = "Give the plan a name captains will see.";
    if (pricePaise === null) found.price = "Enter the price in rupees.";
    if (duration === null || duration < 1) found.hours = "A pass lasts at least 1 whole hour.";
    if (trips.trim() && (maxTrips === null || maxTrips < 1)) {
      found.trips = "Enter a whole number of trips, at least 1, or leave it empty.";
    }
    setProblems(found);
    if (pricePaise === null || duration === null || Object.keys(found).length > 0) return;
    const body = {
      name: name.trim(),
      price_paise: pricePaise,
      duration_hours: duration,
      vehicle_type: (vehicle || null) as PassPlanWrite["vehicle_type"],
      max_trips: maxTrips,
      is_active: active,
    };
    if (plan) save.mutate({ planId: plan.id, body }, { onSuccess: onClose });
    else save.mutate({ body: { ...body, code: code.trim().toUpperCase() } }, { onSuccess: onClose });
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !save.isPending) onClose();
      }}
      title={plan ? `Edit ${plan.name}` : "Add a pass plan"}
      description={
        plan
          ? "Passes already bought keep their price and dates. Only new purchases change."
          : "Captains can buy it as soon as it is saved and active."
      }
      footer={
        <>
          <Button variant="outline" disabled={save.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} loadingLabel="Saving" onClick={submit}>
            {plan ? "Save" : "Add plan"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Code"
            required
            description={plan ? "Fixed once created." : "Capital letters, for example DAILY_BIKE."}
            error={problems.code}
          >
            <Input
              value={code}
              disabled={plan !== null}
              maxLength={32}
              onChange={(e) => {
                setCode(e.target.value);
                clear("code");
              }}
            />
          </Field>
          <Field label="Name" required description="What captains see." error={problems.name}>
            <Input
              value={name}
              maxLength={80}
              onChange={(e) => {
                setName(e.target.value);
                clear("name");
              }}
            />
          </Field>
          <Field label="Price (₹)" required error={problems.price}>
            <Input
              inputMode="decimal"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                clear("price");
              }}
            />
          </Field>
          <Field label="Lasts (hours)" required error={problems.hours}>
            <Input
              inputMode="numeric"
              value={hours}
              onChange={(e) => {
                setHours(e.target.value);
                clear("hours");
              }}
            />
          </Field>
          <Field label="Vehicle" description="Only captains with this vehicle can buy it.">
            <Select value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
              <option value="">All vehicles</option>
              {VEHICLE_TYPES.map((type) => (
                <option key={type.code} value={type.code}>
                  {type.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Max trips" description="Leave empty for no limit." error={problems.trips}>
            <Input
              inputMode="numeric"
              value={trips}
              onChange={(e) => {
                setTrips(e.target.value);
                clear("trips");
              }}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 border-t border-line pt-4 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Captains can buy this plan
        </label>
        {save.error ? (
          <p role="alert" className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger-text">
            {friendlyErrorMessage(save.error)}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

/** The Daily Pass plans captains buy to go on duty. */
export function PassPlans() {
  const plans = usePassPlans();
  const [editing, setEditing] = useState<{ plan: PassPlan | null } | null>(null);

  if (plans.isPending) return <Spinner />;
  if (plans.isError) {
    return (
      <ErrorState
        title="We couldn't load pass plans"
        message={friendlyErrorMessage(plans.error)}
        actionLabel="Try again"
        onAction={() => void plans.refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Toolbar
        action={
          <Button size="sm" onClick={() => setEditing({ plan: null })}>
            Add pass plan
          </Button>
        }
      >
        <p className="text-sm text-text-secondary">Captains buy a pass to go on duty. Prices are in rupees.</p>
      </Toolbar>
      {plans.data.length === 0 ? (
        <EmptyState title="No pass plans" description="Captains need an active plan to go on duty." />
      ) : (
        <Table
          head={
            <>
              <Th>Plan</Th>
              <Th numeric>Price</Th>
              <Th>Vehicle</Th>
              <Th>Lasts</Th>
              <Th>Status</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </>
          }
        >
          {plans.data.map((plan) => (
            <tr key={plan.id} className="hover:bg-surface-sunken">
              <Td>
                <Stacked main={plan.name} sub={<span className="font-mono">{plan.code}</span>} />
              </Td>
              <Td numeric>{plan.price_paise === 0 ? "Free" : formatMoney(plan.price_paise)}</Td>
              <Td>{VEHICLE_TYPES.find((type) => type.code === plan.vehicle_type)?.label ?? "All"}</Td>
              <Td>
                {durationText(plan.duration_hours)}
                {plan.max_trips ? ` · ${plan.max_trips} trips` : ""}
              </Td>
              <Td>{plan.is_active ? <Badge tone="success">On sale</Badge> : <Badge tone="neutral">Not on sale</Badge>}</Td>
              <Td>
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => setEditing({ plan })}>
                    Edit
                  </Button>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
      {editing ? <PlanDialog plan={editing.plan} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

"use client";

import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button, Dialog, EmptyState, ErrorState, Field, Input, Select, Spinner, formatMoney } from "@vsolve/ui";
import { useState } from "react";

import { filterChipStyles } from "@/features/money/service-tabs";

import {
  RATE_FIELDS,
  VEHICLE_TYPES,
  areasOf,
  changedRates,
  rateForm,
  readRates,
  type RateForm,
} from "../model";
import { useRateCards, useSaveRateCard, type RideRateCard } from "../queries";

type Editing = { card: RideRateCard } | { card: null };

function RateCardDialog({
  editing,
  areas,
  onClose,
}: {
  editing: Editing;
  areas: { id: string; name: string }[];
  onClose: () => void;
}) {
  const save = useSaveRateCard();
  const card = editing.card;
  const [form, setForm] = useState<RateForm>(() => rateForm(card));
  const [areaId, setAreaId] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function submit() {
    const read = readRates(form);
    if ("error" in read) return setProblem(read.error);
    if (card) {
      const changed = changedRates(card, read.rates);
      if (Object.keys(changed).length === 0) return setProblem("Nothing changed.");
      setProblem(null);
      save.mutate({ cardId: card.id, body: changed }, { onSuccess: onClose });
      return;
    }
    if (!areaId || !vehicle) return setProblem("Choose the area and the vehicle.");
    setProblem(null);
    save.mutate(
      { body: { service_area_id: areaId, vehicle_type: vehicle as RideRateCard["vehicle_type"], ...read.rates } },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !save.isPending) onClose();
      }}
      title={card ? `Edit ${card.service_area_name} · ${card.vehicle_type}` : "Add a rate card"}
      description={
        card
          ? "Saving makes a new version. New quotes use it at once; quotes already given keep their price."
          : "Riders here can book this vehicle as soon as it is saved."
      }
      footer={
        <>
          <Button variant="outline" disabled={save.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} loadingLabel="Saving" onClick={submit}>
            {card ? "Save new version" : "Add card"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {card ? null : (
          <>
            <Field label="Area" required>
              <Select value={areaId} placeholder="Choose an area" onChange={(e) => setAreaId(e.target.value)}>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Vehicle" required>
              <Select value={vehicle} placeholder="Choose a vehicle" onChange={(e) => setVehicle(e.target.value)}>
                {VEHICLE_TYPES.map((type) => (
                  <option key={type.code} value={type.code}>
                    {type.label}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
        {RATE_FIELDS.map(({ key, label }) => (
          <Field key={key} label={label} required>
            <Input
              inputMode="decimal"
              value={form[key]}
              onChange={(e) => setForm((old) => ({ ...old, [key]: e.target.value }))}
            />
          </Field>
        ))}
      </div>
      {problem || save.error ? (
        <p role="alert" className="mt-3 text-sm text-danger-text">
          {problem ?? friendlyErrorMessage(save.error)}
        </p>
      ) : null}
    </Dialog>
  );
}

function SwitchOff({ card, onClose }: { card: RideRateCard; onClose: () => void }) {
  const save = useSaveRateCard();
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !save.isPending) onClose();
      }}
      title={`Switch off ${card.vehicle_type} in ${card.service_area_name}?`}
      description="Riders here stop seeing this vehicle at once. Rides already booked go ahead. Add a new card to switch it back on."
      footer={
        <>
          <Button variant="outline" disabled={save.isPending} onClick={onClose}>
            Keep it on
          </Button>
          <Button
            variant="danger"
            loading={save.isPending}
            loadingLabel="Switching off"
            onClick={() => save.mutate({ cardId: card.id, body: { is_active: false } }, { onSuccess: onClose })}
          >
            Switch off
          </Button>
        </>
      }
    >
      {save.error ? (
        <p role="alert" className="text-sm text-danger-text">
          {friendlyErrorMessage(save.error)}
        </p>
      ) : null}
    </Dialog>
  );
}

/** Fares per area and vehicle. An edit is a new version, so past quotes and rides keep theirs. */
export function RateCards() {
  const cards = useRateCards();
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [switching, setSwitching] = useState<RideRateCard | null>(null);

  if (cards.isPending) return <Spinner />;
  if (cards.isError) {
    return (
      <ErrorState
        title="We couldn't load rate cards"
        message={friendlyErrorMessage(cards.error)}
        actionLabel="Try again"
        onAction={() => void cards.refetch()}
      />
    );
  }

  const shown = showAll ? cards.data : cards.data.filter((card) => card.is_active);
  const areas = areasOf(cards.data);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2" role="group" aria-label="Show rate cards">
          <button type="button" aria-pressed={!showAll} className={filterChipStyles(!showAll)} onClick={() => setShowAll(false)}>
            Active
          </button>
          <button type="button" aria-pressed={showAll} className={filterChipStyles(showAll)} onClick={() => setShowAll(true)}>
            All versions
          </button>
        </div>
        {areas.length > 0 ? (
          <Button size="sm" onClick={() => setEditing({ card: null })}>
            Add card
          </Button>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <EmptyState title="No rate cards" description="Run the rides seed command to create the first areas and cards." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-3 py-3">Area</th>
                <th className="px-3 py-3">Vehicle</th>
                <th className="px-3 py-3 text-right">Base</th>
                <th className="px-3 py-3 text-right">Incl.</th>
                <th className="px-3 py-3 text-right">Per km</th>
                <th className="px-3 py-3 text-right">Per min</th>
                <th className="px-3 py-3 text-right">Minimum</th>
                <th className="px-3 py-3 text-right">Free wait</th>
                <th className="px-3 py-3 text-right">Wait/min</th>
                <th className="px-3 py-3">Version</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {shown.map((card) => (
                <tr key={card.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-3 font-semibold">{card.service_area_name}</td>
                  <td className="px-3 py-3">{card.vehicle_type}</td>
                  <td className="px-3 py-3 text-right">{formatMoney(card.base_fare_paise)}</td>
                  <td className="px-3 py-3 text-right">{(card.included_distance_m / 1000).toFixed(1)} km</td>
                  <td className="px-3 py-3 text-right">{formatMoney(card.per_km_paise)}</td>
                  <td className="px-3 py-3 text-right">{formatMoney(card.per_minute_paise)}</td>
                  <td className="px-3 py-3 text-right">{formatMoney(card.minimum_fare_paise)}</td>
                  <td className="px-3 py-3 text-right">{card.free_waiting_minutes} min</td>
                  <td className="px-3 py-3 text-right">{formatMoney(card.waiting_per_minute_paise)}</td>
                  <td className="px-3 py-3">
                    v{card.version}{" "}
                    {card.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Retired</Badge>}
                  </td>
                  <td className="px-3 py-3">
                    {card.is_active ? (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setEditing({ card })}>
                          Edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setSwitching(card)}>
                          Switch off
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing ? <RateCardDialog editing={editing} areas={areas} onClose={() => setEditing(null)} /> : null}
      {switching ? <SwitchOff card={switching} onClose={() => setSwitching(null)} /> : null}
    </div>
  );
}

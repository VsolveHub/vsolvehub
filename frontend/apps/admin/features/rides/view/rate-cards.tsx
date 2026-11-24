"use client";

import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button, Dialog, EmptyState, ErrorState, Field, Input, Select, Spinner, formatMoney } from "@vsolve/ui";
import { useState, type ReactNode } from "react";

import {
  KIND_FILTERS,
  PARCEL_DEFAULTS,
  PARCEL_VEHICLES,
  RATE_FIELDS,
  RATE_KINDS,
  SIZE_LABEL_MAX,
  VEHICLE_TYPES,
  areasOf,
  changedParcelLimits,
  changedRates,
  distanceText,
  fromInput,
  gramsToKg,
  kgToGrams,
  kindLabel,
  limitsText,
  rateForm,
  readParcelLimits,
  readRates,
  type KindFilterKey,
  type RateForm,
} from "../model";
import { useRateCards, useSaveRateCard, type RideRateCard } from "../queries";
import { FilterGroup, Stacked, Table, Td, Th, Toolbar, vehicleLabel } from "./layout";

const SHOW_OPTIONS = [
  { key: "active", label: "Active" },
  { key: "all", label: "All versions" },
] as const;

type ShowKey = (typeof SHOW_OPTIONS)[number]["key"];

type Editing = { card: RideRateCard } | { card: null };

/** What is wrong with each box, worked out with the same rules the save uses, to show under that box. */
type Problems = Partial<Record<string, string>>;

const UNIT_HINT = {
  rupees: "Enter an amount in rupees, 0 or more.",
  metres: "Enter whole metres, 0 or more.",
  minutes: "Enter whole minutes, 0 or more.",
} as const;

function boxProblems(form: RateForm, parcel: boolean, weightKg: string, size: string): Problems {
  const problems: Problems = {};
  for (const { key, unit } of RATE_FIELDS) {
    if (fromInput(form[key], unit) === null) problems[key] = UNIT_HINT[unit];
  }
  if (parcel) {
    if (kgToGrams(weightKg) === null) problems.weight = "Enter a weight above 0 kg.";
    if (!size.trim()) problems.size = "Say what size fits, for example 40 x 30 x 20 cm.";
    else if (size.trim().length > SIZE_LABEL_MAX) problems.size = `Keep it to ${SIZE_LABEL_MAX} characters.`;
  }
  return problems;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 border-t border-line pt-4 first:border-t-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      <div>
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        {hint ? <p className="text-xs text-text-secondary">{hint}</p> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

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
  // What the card is for: fixed for an existing card, chosen for a new one.
  const [kind, setKind] = useState<RideRateCard["kind"]>(card?.kind ?? "RIDE");
  const parcel = kind === "PARCEL";
  const [weightKg, setWeightKg] = useState(card?.max_parcel_weight_grams ? gramsToKg(card.max_parcel_weight_grams) : "");
  const [size, setSize] = useState(card?.parcel_size_label ?? "");
  const [problems, setProblems] = useState<Problems>({});
  const [problem, setProblem] = useState<string | null>(null);

  /** A box's message goes as soon as it is changed again. */
  function clear(key: string) {
    setProblems((old) => (old[key] ? { ...old, [key]: undefined } : old));
  }

  // A new parcel card starts from the defaults for the vehicle (D5), which Operations may change.
  function chooseVehicle(next: string) {
    setVehicle(next);
    clear("vehicle");
    const defaults = PARCEL_DEFAULTS[next];
    if (parcel && defaults) {
      setWeightKg(defaults.weightKg);
      setSize(defaults.size);
      clear("weight");
      clear("size");
    }
  }

  function chooseKind(next: RideRateCard["kind"]) {
    setKind(next);
    // There are no cab parcels: a chosen cab is cleared when the card becomes a parcel card.
    if (next === "PARCEL" && !(PARCEL_VEHICLES as readonly string[]).includes(vehicle)) setVehicle("");
  }

  function submit() {
    const found = boxProblems(form, parcel, weightKg, size);
    if (!card && !areaId) found.area = "Choose an area.";
    if (!card && !vehicle) found.vehicle = "Choose a vehicle.";
    setProblems(found);
    if (Object.values(found).some(Boolean)) return setProblem(null);

    const read = readRates(form);
    if ("error" in read) return setProblem(read.error);
    const limits = parcel ? readParcelLimits(weightKg, size) : null;
    if (limits && "error" in limits) return setProblem(limits.error);
    if (card) {
      const changed: Record<string, number | string> = changedRates(card, read.rates);
      if (limits) Object.assign(changed, changedParcelLimits(card, limits.limits));
      if (Object.keys(changed).length === 0) return setProblem("Nothing changed.");
      setProblem(null);
      save.mutate({ cardId: card.id, body: changed }, { onSuccess: onClose });
      return;
    }
    setProblem(null);
    save.mutate(
      {
        body: {
          service_area_id: areaId,
          vehicle_type: vehicle as RideRateCard["vehicle_type"],
          kind,
          ...read.rates,
          ...(limits ? limits.limits : {}),
        },
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !save.isPending) onClose();
      }}
      title={
        card
          ? `Edit ${card.service_area_name} · ${vehicleLabel(card.vehicle_type)}${parcel ? " · Pick up & Drop" : ""}`
          : "Add a rate card"
      }
      description={
        card
          ? "Saving makes a new version. New quotes use it at once; quotes already given keep their price."
          : parcel
            ? "Customers here can send parcels with this vehicle as soon as it is saved."
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
      <div className="flex flex-col gap-5">
        {card ? null : (
          <Section title="Card" hint="Where and for what this fare applies.">
            <Field label="For" required className="sm:col-span-2">
              <Select value={kind} onChange={(e) => chooseKind(e.target.value as RideRateCard["kind"])}>
                {RATE_KINDS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Area" required error={problems.area}>
              <Select
                value={areaId}
                placeholder="Choose an area"
                onChange={(e) => {
                  setAreaId(e.target.value);
                  clear("area");
                }}
              >
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Vehicle" required error={problems.vehicle}>
              <Select value={vehicle} placeholder="Choose a vehicle" onChange={(e) => chooseVehicle(e.target.value)}>
                {VEHICLE_TYPES.filter((type) => !parcel || (PARCEL_VEHICLES as readonly string[]).includes(type.code)).map(
                  (type) => (
                    <option key={type.code} value={type.code}>
                      {type.label}
                    </option>
                  ),
                )}
              </Select>
            </Field>
          </Section>
        )}

        <Section title="Fare" hint="Amounts in rupees, distance in metres, time in minutes.">
          {RATE_FIELDS.map(({ key, label }) => (
            <Field key={key} label={label} required error={problems[key]}>
              <Input
                inputMode="decimal"
                value={form[key]}
                onChange={(e) => {
                  setForm((old) => ({ ...old, [key]: e.target.value }));
                  clear(key);
                }}
              />
            </Field>
          ))}
        </Section>

        {parcel ? (
          <Section title="Parcel limits" hint="Shown to customers before they confirm.">
            <Field label="Max weight (kg)" required description="The heaviest item this vehicle takes." error={problems.weight}>
              <Input
                inputMode="decimal"
                value={weightKg}
                onChange={(e) => {
                  setWeightKg(e.target.value);
                  clear("weight");
                }}
              />
            </Field>
            <Field label="Size" required description="For example 40 x 30 x 20 cm." error={problems.size}>
              <Input
                value={size}
                maxLength={SIZE_LABEL_MAX}
                onChange={(e) => {
                  setSize(e.target.value);
                  clear("size");
                }}
              />
            </Field>
          </Section>
        ) : null}

        {problem || save.error ? (
          <p role="alert" className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger-text">
            {problem ?? friendlyErrorMessage(save.error)}
          </p>
        ) : null}
      </div>
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
      title={`Switch off ${card.kind === "PARCEL" ? "Pick up & Drop · " : ""}${card.vehicle_type} in ${card.service_area_name}?`}
      description={
        card.kind === "PARCEL"
          ? "Customers here stop seeing Pick up & Drop for this vehicle at once. Parcels already booked go ahead. Add a new card to switch it back on."
          : "Riders here stop seeing this vehicle at once. Rides already booked go ahead. Add a new card to switch it back on."
      }
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
  const [show, setShow] = useState<ShowKey>("active");
  const showAll = show === "all";
  const [kindKey, setKindKey] = useState<KindFilterKey>("all");
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

  const kindFilter = KIND_FILTERS.find((k) => k.key === kindKey)?.kind ?? "";
  const shown = cards.data.filter(
    (card) => (showAll || card.is_active) && (kindFilter === "" || (card.kind ?? "RIDE") === kindFilter),
  );
  const areas = areasOf(cards.data);

  return (
    <div className="flex flex-col gap-4">
      <Toolbar
        action={
          areas.length > 0 ? (
            <Button size="sm" onClick={() => setEditing({ card: null })}>
              Add rate card
            </Button>
          ) : null
        }
      >
        <FilterGroup label="Show" options={SHOW_OPTIONS} value={show} onChange={setShow} />
        <FilterGroup label="Type" options={KIND_FILTERS} value={kindKey} onChange={setKindKey} />
      </Toolbar>

      {shown.length === 0 ? (
        <EmptyState title="No rate cards" description="Run the rides seed command to create the first areas and cards." />
      ) : (
        <Table
          head={
            <>
              <Th>Area</Th>
              <Th>Type</Th>
              <Th>Vehicle</Th>
              <Th numeric>Base fare</Th>
              <Th numeric>Distance in base fare</Th>
              <Th numeric>Per km</Th>
              <Th numeric>Per minute</Th>
              <Th numeric>Minimum fare</Th>
              <Th numeric>Free waiting time</Th>
              <Th numeric>Waiting per minute</Th>
              <Th>Status</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </>
          }
        >
          {shown.map((card) => (
            <tr key={card.id} className="hover:bg-surface-sunken">
              <Td className="font-semibold">{card.service_area_name}</Td>
              <Td className="whitespace-nowrap">{kindLabel(card.kind)}</Td>
              <Td>
                <Stacked main={vehicleLabel(card.vehicle_type)} sub={card.kind === "PARCEL" ? limitsText(card) : undefined} />
              </Td>
              <Td numeric>{formatMoney(card.base_fare_paise)}</Td>
              <Td numeric>{distanceText(card.included_distance_m)}</Td>
              <Td numeric>{formatMoney(card.per_km_paise)}</Td>
              <Td numeric>{formatMoney(card.per_minute_paise)}</Td>
              <Td numeric>{formatMoney(card.minimum_fare_paise)}</Td>
              <Td numeric>{card.free_waiting_minutes} min</Td>
              <Td numeric>{formatMoney(card.waiting_per_minute_paise)}</Td>
              <Td>
                <Stacked
                  main={card.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Retired</Badge>}
                  sub={`Version ${card.version}`}
                />
              </Td>
              <Td>
                {card.is_active ? (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing({ card })}>
                      Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setSwitching(card)}>
                      Switch off
                    </Button>
                  </div>
                ) : null}
              </Td>
            </tr>
          ))}
        </Table>
      )}

      {editing ? <RateCardDialog editing={editing} areas={areas} onClose={() => setEditing(null)} /> : null}
      {switching ? <SwitchOff card={switching} onClose={() => setSwitching(null)} /> : null}
    </div>
  );
}

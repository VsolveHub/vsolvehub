"use client";

import { describeError } from "@vsolve/query";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Select, Spinner, formatMoney } from "@vsolve/ui";
import { useState } from "react";

import {
  useCreateWorkItem,
  usePublishWorkItemRate,
  useServiceAreas,
  useSkillOptions,
  useUpdateWorkItem,
  useWorkItemRates,
  useWorkItems,
  type WorkItem,
} from "../queries";

/**
 * Phase A: the ops-curated work-item catalog (contract 1.46.0).
 *
 * **This is the screen that decides what a Partner may even quote.** A
 * Partner's own rate card only ever offers items published here, and a
 * Customer only ever reads item names authored on this screen — never
 * anything a Partner typed. A catalog item's `name` and `unit` are therefore
 * the customer-visible words for the work, chosen the same care the rate-card
 * board's own inclusion list documents.
 *
 * ## Retired, never deleted
 *
 * There is no delete on this surface, on the same reasoning `RateCardBoard`
 * gives for never editing a published card: a Partner's saved rate and a
 * quote already sent both point at this row. `status: RETIRED` (via the
 * catalog's own edit form) drops it from every Partner's "from my rate card"
 * list without breaking either.
 *
 * ## A reference rate is loaded, never edited
 *
 * Same pattern as the A3 day rate: publishing a new rate for an item and
 * city retires the previous version in one transaction, so a Partner rate
 * validated against version 3 still reconciles against version 3 after
 * Operations publishes version 4 next month.
 */

const UNIT_OPTIONS = [
  { value: "each", label: "Each" },
  { value: "job", label: "Job" },
  { value: "hour", label: "Hour" },
  { value: "day", label: "Day" },
  { value: "sq_ft", label: "Sq.ft" },
  { value: "running_ft", label: "Running ft" },
  { value: "metre", label: "Metre" },
  { value: "kg", label: "Kg" },
  { value: "litre", label: "Litre" },
  { value: "set", label: "Set" },
];

function rupeesToPaise(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "" || !/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const paise = Math.round(Number.parseFloat(trimmed) * 100);
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}



export function WorkItemCatalog() {
  const [skillId, setSkillId] = useState("");
  const skills = useSkillOptions();
  const areas = useServiceAreas();
  const items = useWorkItems(skillId === "" ? null : skillId);

  return (
    <div className="space-y-6">
      <Field label="Trade" className="max-w-sm">
        <Select value={skillId} onChange={(event) => setSkillId(event.target.value)}>
          <option value="">Every trade</option>
          {(skills.data ?? []).map((skill) => (
            <option key={skill.id} value={skill.id}>
              {skill.name}
            </option>
          ))}
        </Select>
      </Field>

      {items.isPending ? (
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <Spinner size="sm" />
          Loading the catalog…
        </p>
      ) : null}

      {items.isError ? (
        <ErrorState
          title="We could not load the catalog"
          message="Nothing has changed. Try again."
          actionLabel="Try again"
          onAction={() => void items.refetch()}
        />
      ) : null}

      {!items.isPending && !items.isError && (items.data ?? []).length === 0 ? (
        <EmptyState
          title="No item is published"
          description="Until one is, a Partner in this trade has nothing to add to their rate card, and every item-wise quote from them is entirely hand-typed."
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {(items.data ?? []).map((item) => (
          <WorkItemCard
            key={item.id}
            item={item}
            areas={areas.data ?? []}
            skillName={
              (skills.data ?? []).find((skill) => skill.id === item.skill)?.name ?? null
            }
          />
        ))}
      </div>

      <CreateWorkItemForm skills={skills.data ?? []} />
    </div>
  );
}

function WorkItemCard({
  item,
  areas,
  skillName,
}: {
  item: WorkItem;
  areas: readonly { id: string; name: string }[];
  skillName: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [publishingRate, setPublishingRate] = useState(false);
  const rates = useWorkItemRates(publishingRate ? item.id : null);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-text">{item.name}</h3>
            <Badge tone={item.status === "ACTIVE" ? "success" : "neutral"}>
              {item.status === "ACTIVE" ? "Active" : "Retired"}
            </Badge>
          </div>
          <p className="mt-0.5 text-sm text-text-secondary">
            {skillName ?? "Unknown trade"} · per {item.unit.replaceAll("_", " ")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
            {editing ? "Close" : "Edit"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPublishingRate((v) => !v)}>
            {publishingRate ? "Close" : "Rates"}
          </Button>
        </div>
      </div>

      {item.description ? (
        <p className="mt-2 text-sm leading-6 text-text-secondary">{item.description}</p>
      ) : null}

      <p className="mt-2 text-xs text-text-muted">
        {item.band_below_bps != null && item.band_above_bps != null
          ? `Item band override: -${(item.band_below_bps / 100).toFixed(0)}% / +${(item.band_above_bps / 100).toFixed(0)}%`
          : "No item band override — uses the trade or default band."}
      </p>

      {editing ? <EditWorkItemForm item={item} onDone={() => setEditing(false)} /> : null}

      {publishingRate ? (
        <div className="mt-4 border-t border-line pt-4">
          <h4 className="text-sm font-semibold text-text">Published reference rates</h4>
          {rates.isPending ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
              <Spinner size="sm" />
              Loading…
            </p>
          ) : null}
          <ul className="mt-2 list-none space-y-1 p-0 text-sm">
            {(rates.data ?? [])
              .filter((rate) => rate.status === "PUBLISHED")
              .map((rate) => (
                <li key={rate.id} className="flex justify-between">
                  <span className="text-text-secondary">
                    {areas.find((area) => area.id === rate.service_area)?.name ??
                      `City ${rate.service_area.slice(0, 8)}`}
                  </span>
                  <span className="font-semibold text-text" data-numeric>
                    {formatMoney(rate.reference_rate_paise)}
                  </span>
                </li>
              ))}
            {(rates.data ?? []).filter((rate) => rate.status === "PUBLISHED").length === 0 &&
            !rates.isPending ? (
              <li className="text-text-secondary">Not priced in any city yet.</li>
            ) : null}
          </ul>
          <PublishRateForm workItemId={item.id} areas={areas} />
        </div>
      ) : null}
    </Card>
  );
}

function EditWorkItemForm({ item, onDone }: { item: WorkItem; onDone: () => void }) {
  const update = useUpdateWorkItem();
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? "");
  const [sortOrder, setSortOrder] = useState(String(item.sort_order ?? 0));
  const [status, setStatus] = useState(item.status);
  const [useOverride, setUseOverride] = useState(
    item.band_below_bps != null && item.band_above_bps != null,
  );
  const [belowPercent, setBelowPercent] = useState(
    item.band_below_bps != null ? String(item.band_below_bps / 100) : "",
  );
  const [abovePercent, setAbovePercent] = useState(
    item.band_above_bps != null ? String(item.band_above_bps / 100) : "",
  );

  const belowBps = Number.parseFloat(belowPercent);
  const aboveBps = Number.parseFloat(abovePercent);
  const overrideValid =
    !useOverride ||
    (Number.isFinite(belowBps) &&
      Number.isFinite(aboveBps) &&
      belowBps >= 0 &&
      belowBps <= 100 &&
      aboveBps >= 0 &&
      aboveBps <= 100);

  function submit() {
    if (!overrideValid) return;
    update.mutate({
      workItemId: item.id,
      body: {
        name: name.trim(),
        description: description.trim(),
        sort_order: Number.parseInt(sortOrder, 10) || 0,
        status,
        band_below_bps: useOverride ? Math.round(belowBps * 100) : null,
        band_above_bps: useOverride ? Math.round(aboveBps * 100) : null,
      },
    });
  }

  const errorMessage = update.isError ? describeError(update.error, "mutation").message : null;

  return (
    <div className="mt-4 space-y-3 border-t border-line pt-4">
      <Field label="Item name">
        <Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field label="Description">
        <Input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Sort order">
          <Input
            value={sortOrder}
            inputMode="numeric"
            data-numeric
            onChange={(event) => setSortOrder(event.target.value.replace(/[^\d]/g, ""))}
          />
        </Field>
        <Field label="Status">
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value as WorkItem["status"])}
          >
            <option value="ACTIVE">Active</option>
            <option value="RETIRED">Retired</option>
          </Select>
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-text">
        <input
          type="checkbox"
          checked={useOverride}
          onChange={(event) => setUseOverride(event.target.checked)}
        />
        Override the band for this item specifically
      </label>
      {useOverride ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Below the reference (%)" error={!overrideValid ? "0–100" : undefined}>
            <Input
              value={belowPercent}
              inputMode="decimal"
              data-numeric
              onChange={(event) => setBelowPercent(event.target.value)}
            />
          </Field>
          <Field label="Above the reference (%)" error={!overrideValid ? "0–100" : undefined}>
            <Input
              value={abovePercent}
              inputMode="decimal"
              data-numeric
              onChange={(event) => setAbovePercent(event.target.value)}
            />
          </Field>
        </div>
      ) : null}

      {errorMessage ? (
        <ErrorState inline title="Could not save" message={errorMessage} />
      ) : null}

      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!overrideValid || update.isPending}
          loading={update.isPending}
          loadingLabel="Saving"
          onClick={submit}
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function PublishRateForm({
  workItemId,
  areas,
}: {
  workItemId: string;
  areas: readonly { id: string; name: string }[];
}) {
  const publish = usePublishWorkItemRate();
  const [serviceAreaId, setServiceAreaId] = useState("");
  const [rate, setRate] = useState("");

  const ratePaise = rupeesToPaise(rate);
  const ready = serviceAreaId !== "" && ratePaise !== null;

  function submit() {
    if (ratePaise === null) return;
    publish.mutate(
      { workItemId, serviceAreaId, referenceRatePaise: ratePaise },
      { onSuccess: () => setRate("") },
    );
  }

  const errorMessage = publish.isError ? describeError(publish.error, "mutation").message : null;

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <Field label="City" className="min-w-[10rem]">
        <Select value={serviceAreaId} onChange={(event) => setServiceAreaId(event.target.value)}>
          <option value="">Choose a city…</option>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Reference rate (₹)" className="w-32">
        <Input value={rate} inputMode="decimal" data-numeric onChange={(event) => setRate(event.target.value)} />
      </Field>
      <Button
        size="sm"
        disabled={!ready || publish.isPending}
        loading={publish.isPending}
        loadingLabel="Publishing"
        onClick={submit}
      >
        Publish
      </Button>
      {errorMessage ? (
        <p className="w-full text-sm text-danger-text">{errorMessage}</p>
      ) : null}
    </div>
  );
}

function CreateWorkItemForm({
  skills,
}: {
  skills: readonly { id: string; name: string }[];
}) {
  const create = useCreateWorkItem();
  const [skillId, setSkillId] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [description, setDescription] = useState("");

  const ready = skillId !== "" && name.trim() !== "" && unit !== "";

  function submit() {
    create.mutate(
      { skill_id: skillId, name: name.trim(), unit, description: description.trim(), sort_order: 0 },
      {
        onSuccess: () => {
          setName("");
          setDescription("");
        },
      },
    );
  }

  const errorMessage = create.isError ? describeError(create.error, "mutation").message : null;

  return (
    <Card className="p-5">
      <h2 className="text-base font-bold text-text">Add a work item</h2>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        The name and unit are customer-visible and appear on every Partner&rsquo;s quote that uses
        this item — write them the way a customer should read them. Publish a reference rate for
        at least one city afterwards; an item with no published rate cannot be added to any
        Partner&rsquo;s rate card yet.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Trade" required>
          <Select value={skillId} onChange={(event) => setSkillId(event.target.value)}>
            <option value="">Choose a trade…</option>
            {skills.map((skill) => (
              <option key={skill.id} value={skill.id}>
                {skill.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Unit" required>
          <Select value={unit} onChange={(event) => setUnit(event.target.value)}>
            <option value="">Choose a unit…</option>
            {UNIT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Item name" required className="mt-3">
        <Input
          value={name}
          maxLength={120}
          placeholder="6A switch fixing"
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      <Field label="Description" className="mt-3">
        <Input
          value={description}
          placeholder="Optional. Shown to Operations only."
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>

      {errorMessage ? (
        <ErrorState inline className="mt-4" title="Could not add this item" message={errorMessage} />
      ) : null}

      {create.isSuccess ? (
        <div className="mt-4 rounded-control bg-surface-sunken p-3 text-sm">
          <Badge tone="success">Added</Badge>
          <p className="mt-2 text-text-secondary">
            It has no published rate yet. Open it above and publish one for each city it should be
            priceable in.
          </p>
        </div>
      ) : null}

      <Button
        className="mt-4"
        disabled={!ready || create.isPending}
        loading={create.isPending}
        loadingLabel="Adding"
        onClick={submit}
      >
        Add item
      </Button>
    </Card>
  );
}

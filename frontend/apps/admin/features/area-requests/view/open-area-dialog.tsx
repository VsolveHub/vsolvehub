"use client";

import { useState } from "react";
import { request } from "@vsolve/api-client";
import { Button, Dialog, Field, Input } from "@vsolve/ui";
import { describeError } from "@vsolve/query";

import { getApiClient } from "@/lib/api/browser";
import { useAddPin, useCreateServiceArea, useToggleService } from "@/features/areas/queries";
import type { OperationsAreaRequestGroup } from "../queries";

/** Trades with at least this many asking partners are ticked for you (FLOW.md 3c). */
export const PRETICK_MIN_ASKS = 5;

interface OpenAreaDialogProps {
  group: OperationsAreaRequestGroup | null;
  onOpenChange: (open: boolean) => void;
  onOpened?: (areaName: string) => void;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Opens a new service area for an asked PIN: its name, zone, the PIN, whether it accepts partners
 * at once, and the services of the trades most partners asked about.
 */
export function OpenAreaDialog({ group, onOpenChange, onOpened }: OpenAreaDialogProps) {
  if (!group) return null;
  // Keyed by PIN so the form starts fresh for each request.
  return <OpenAreaForm key={group.postal_code} group={group} onOpenChange={onOpenChange} onOpened={onOpened} />;
}

function OpenAreaForm({
  group,
  onOpenChange,
  onOpened,
}: {
  group: OperationsAreaRequestGroup;
  onOpenChange: (open: boolean) => void;
  onOpened?: (areaName: string) => void;
}) {
  const initialName = group.place ?? `Area ${group.postal_code}`;
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(slugify(initialName));
  const [zone, setZone] = useState("");
  const [city, setCity] = useState(group.place ?? "");
  const [state, setState] = useState(group.state ?? "");
  const [accepting, setAccepting] = useState(true);
  const [trades, setTrades] = useState<Record<string, boolean>>(
    Object.fromEntries(
      group.trade_counts.map((trade) => [trade.skill_code, trade.count >= PRETICK_MIN_ASKS]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const createArea = useCreateServiceArea();
  const addPin = useAddPin();
  const toggleService = useToggleService();
  const busy = createArea.isPending || addPin.isPending || toggleService.isPending || progress !== null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!name.trim() || !slug.trim()) {
      setError("Name and slug are required.");
      return;
    }
    if (!group.in_pin_list && !(city.trim() && state.trim())) {
      setError("This PIN is not in our list yet. Enter its city and state.");
      return;
    }
    let areaId: string | null = null;
    try {
      setProgress("Creating the area…");
      const area = await createArea.mutateAsync({
        name: name.trim(),
        slug: slug.trim(),
        zone: zone.trim(),
        is_accepting_partners: accepting,
      });
      areaId = area.id;

      setProgress(`Adding PIN ${group.postal_code}…`);
      await addPin.mutateAsync({
        areaId,
        postalCode: group.postal_code,
        city: city.trim(),
        state: state.trim(),
      });

      const wanted = new Set(Object.entries(trades).filter(([, on]) => on).map(([code]) => code));
      if (wanted.size > 0) {
        setProgress("Switching on services…");
        const detail = await request(() =>
          getApiClient().GET("/api/v1/operations/service-areas/{area_id}/", {
            params: { path: { area_id: area.id } },
          }),
        );
        const variants = detail.services.filter((item) => wanted.has(item.skill_code));
        for (const [index, variant] of variants.entries()) {
          setProgress(`Switching on services… ${index + 1} of ${variants.length}`);
          await toggleService.mutateAsync({
            areaId: area.id,
            variantId: variant.variant_id,
            isActive: true,
          });
        }
      }
      setProgress(null);
      onOpened?.(area.name);
      onOpenChange(false);
    } catch (err) {
      setProgress(null);
      // The area may already exist if a later step failed: say so, so it is not created twice.
      setError(
        (areaId
          ? "The area was created but a later step failed, so finish it from the Areas screen. "
          : "") + describeError(err).message,
      );
    }
  };

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={`Open a new area for ${group.postal_code}`}
      description={`${group.request_count} partner(s) asked for this PIN${group.place ? ` (${group.place})` : ""}.`}
    >
      <form onSubmit={submit} className="space-y-4 pt-2">
        {error ? (
          <div className="rounded bg-danger-surface p-3 text-xs text-danger-text border border-danger-line">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Area name" required>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSlug(slugify(e.target.value));
              }}
              required
            />
          </Field>
          <Field label="Zone" description="Broad cluster, e.g. Hyderabad West">
            <Input value={zone} onChange={(e) => setZone(e.target.value)} />
          </Field>
        </div>

        <Field label="Slug" required description="Lowercase with hyphens">
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} required />
        </Field>

        {!group.in_pin_list ? (
          <div className="grid grid-cols-2 gap-4">
            <Field label="City" required description="We have not loaded this PIN yet">
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </Field>
            <Field label="State" required>
              <Input value={state} onChange={(e) => setState(e.target.value)} />
            </Field>
          </div>
        ) : null}

        {group.trade_counts.length > 0 ? (
          <fieldset className="space-y-2">
            <legend className="text-xs font-bold text-text">
              Services to switch on (trades with {PRETICK_MIN_ASKS}+ asks are ticked)
            </legend>
            {group.trade_counts.map((trade) => (
              <label key={trade.skill_code} className="flex items-center gap-2 text-xs text-text">
                <input
                  type="checkbox"
                  checked={trades[trade.skill_code] ?? false}
                  onChange={(e) => setTrades({ ...trades, [trade.skill_code]: e.target.checked })}
                />
                <span className="font-medium">{trade.trade_name}</span>
                <span className="text-text-muted">({trade.count} asks)</span>
              </label>
            ))}
          </fieldset>
        ) : null}

        <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
          <input type="checkbox" checked={accepting} onChange={(e) => setAccepting(e.target.checked)} />
          <span className="font-medium">Accepting new partners immediately</span>
        </label>

        {progress ? <p className="text-xs text-text-secondary">{progress}</p> : null}

        <div className="flex justify-end gap-3 pt-4 border-t border-line">
          <Button variant="secondary" onClick={() => onOpenChange(false)} type="button" disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? "Opening…" : "Open area"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

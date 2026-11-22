"use client";

import { useState } from "react";
import { Button, Dialog, Field, Textarea } from "@vsolve/ui";
import { describeError } from "@vsolve/query";
import {
  type OperationsBulkPinPreviewResult,
  type OperationsServiceArea,
  useBulkPinApply,
  useBulkPinPreview,
} from "../queries";

interface BulkPinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  areas: OperationsServiceArea[];
  initialAreaId?: string;
  onApplied?: () => void;
}

export function BulkPinDialog({
  open,
  onOpenChange,
  areas,
  initialAreaId,
  onApplied,
}: BulkPinDialogProps) {
  const [targetAreaId, setTargetAreaId] = useState(initialAreaId || (areas[0]?.id ?? ""));
  const [pinText, setPinText] = useState("");
  const [step, setStep] = useState<"input" | "preview">("input");
  const [previewData, setPreviewData] = useState<OperationsBulkPinPreviewResult | null>(null);
  const [onConflict, setOnConflict] = useState<"MOVE" | "SKIP">("MOVE");
  const [error, setError] = useState<string | null>(null);

  const previewMutation = useBulkPinPreview();
  const applyMutation = useBulkPinApply();

  /**
   * One PIN per entry. A line written "pin, city, state" also registers a PIN we have never
   * loaded (it needs a place name); a plain PIN is enough for one we already know.
   */
  const parseRows = (text: string) => {
    const rows = new Map<string, { pin: string; city: string; state: string }>();
    for (const line of text.split(/\r?\n/)) {
      const parts = line.split(",").map((part) => part.trim());
      if (parts.length >= 3 && /^\d{6}$/.test(parts[0] ?? "")) {
        const [pin, city, ...rest] = parts;
        rows.set(pin!, { pin: pin!, city: city ?? "", state: rest.join(" ").trim() });
        continue;
      }
      for (const token of line.split(/[\s,]+/)) {
        const pin = token.trim();
        if (pin && !rows.has(pin)) rows.set(pin, { pin, city: "", state: "" });
      }
    }
    return Array.from(rows.values());
  };

  const targetArea = areas.find((a) => a.id === targetAreaId);

  const handlePreview = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const pins = parseRows(pinText);
    if (!targetArea) {
      setError("Select a target service area.");
      return;
    }
    if (pins.length === 0) {
      setError("Enter at least one postal code.");
      return;
    }

    previewMutation.mutate(
      { rows: pins.map((row) => ({ ...row, area_slug: targetArea.slug })) },
      {
        onSuccess: (data) => {
          setPreviewData(data);
          setStep("preview");
        },
        onError: (err) => {
          setError(describeError(err).message);
        },
      },
    );
  };

  const handleApply = () => {
    if (!previewData || !targetArea) return;
    setError(null);
    const pins = parseRows(pinText);

    const conflictResolutions: Record<string, "MOVE" | "SKIP"> = {};
    previewData.conflicts.forEach((c) => {
      conflictResolutions[c.pin] = onConflict;
    });

    applyMutation.mutate(
      {
        rows: pins.map((row) => ({ ...row, area_slug: targetArea.slug })),
        conflict_resolutions: conflictResolutions,
      },
      {
        onSuccess: (result) => {
          onApplied?.();
          const failed = result?.row_errors?.length ?? 0;
          if (failed > 0) {
            // Keep the dialog open: some rows were not applied and the reason must be seen.
            setError(
              `Applied ${result.added} added, ${result.moved} moved, ${result.skipped} skipped. ${failed} row(s) were not applied: ` +
                result.row_errors
                  .slice(0, 5)
                  .map((row) => `${String(row.pin ?? "")}: ${String(row.reason ?? "")}`)
                  .join("; "),
            );
            return;
          }
          setStep("input");
          setPinText("");
          setPreviewData(null);
          onOpenChange(false);
        },
        onError: (err) => {
          setError(describeError(err).message);
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={step === "input" ? "Bulk PIN Code Assignment" : "Preview Bulk PIN Assignment"}
      description={
        step === "input"
          ? "Paste postal codes to assign to a service area in bulk."
          : `Review assignments for ${targetArea?.name ?? "selected area"}.`
      }
    >
      {error ? (
        <div className="rounded bg-danger-surface p-3 mb-4 text-xs text-danger-text border border-danger-line">
          {error}
        </div>
      ) : null}

      {step === "input" ? (
        <form onSubmit={handlePreview} className="space-y-4 pt-2">
          <Field label="Target Service Area" required>
            <select
              value={targetAreaId}
              onChange={(e) => setTargetAreaId(e.target.value)}
              className="w-full rounded border border-line bg-surface p-2 text-sm text-text"
            >
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name} {area.zone ? `(${area.zone})` : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Postal Codes"
            required
            description="Paste 6-digit postal codes separated by comma, space, or newline. For a PIN we have not loaded yet, write it as: 509216, Shadnagar, Telangana"
          >
            <Textarea
              value={pinText}
              onChange={(e) => setPinText(e.target.value)}
              placeholder="500001, 500002&#10;500003 500004"
              rows={6}
              required
            />
          </Field>

          <div className="flex justify-end gap-3 pt-4 border-t border-line">
            <Button variant="secondary" onClick={() => onOpenChange(false)} type="button">
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={previewMutation.isPending}>
              {previewMutation.isPending ? "Analysing..." : "Preview Assignment"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4 pt-2 text-xs">
          {/* Summary Chips */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            <div className="rounded border border-line bg-surface-sunken p-2.5 text-center">
              <span className="block text-text-secondary text-[10px] uppercase font-bold">New PINs</span>
              <span className="text-base font-extrabold text-success-text">
                {previewData?.add ?? 0}
              </span>
            </div>
            <div className="rounded border border-line bg-surface-sunken p-2.5 text-center">
              <span className="block text-text-secondary text-[10px] uppercase font-bold">In Other Area</span>
              <span className="text-base font-extrabold text-warning-text">
                {previewData?.conflict ?? 0}
              </span>
            </div>
            <div className="rounded border border-line bg-surface-sunken p-2.5 text-center">
              <span className="block text-text-secondary text-[10px] uppercase font-bold">Already In Area</span>
              <span className="text-base font-extrabold text-text-muted">
                {previewData?.same ?? 0}
              </span>
            </div>
            <div className="rounded border border-line bg-surface-sunken p-2.5 text-center">
              <span className="block text-text-secondary text-[10px] uppercase font-bold">Invalid</span>
              <span className="text-base font-extrabold text-danger-text">
                {previewData?.invalid ?? 0}
              </span>
            </div>
            <div className="rounded border border-line bg-surface-sunken p-2.5 text-center">
              <span className="block text-text-secondary text-[10px] uppercase font-bold">Needs city, state</span>
              <span className="text-base font-extrabold text-danger-text">
                {previewData?.unknown_pin ?? 0}
              </span>
            </div>
          </div>

          {/* Conflict Resolution Selector if conflicts exist */}
          {(previewData?.conflicts?.length ?? 0) > 0 ? (
            <div className="rounded border border-warning-line bg-warning-surface/30 p-3 space-y-2">
              <span className="font-bold text-text block">
                {previewData!.conflicts.length} PIN(s) are currently in another area:
              </span>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-text">
                  <input
                    type="radio"
                    name="conflictResolution"
                    value="MOVE"
                    checked={onConflict === "MOVE"}
                    onChange={() => setOnConflict("MOVE")}
                  />
                  <span>MOVE (Reassign from previous area)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium text-text">
                  <input
                    type="radio"
                    name="conflictResolution"
                    value="SKIP"
                    checked={onConflict === "SKIP"}
                    onChange={() => setOnConflict("SKIP")}
                  />
                  <span>SKIP (Keep in existing area)</span>
                </label>
              </div>
            </div>
          ) : null}

          {/* Rows that cannot be applied, with the reason */}
          {(previewData?.row_errors?.length ?? 0) > 0 ? (
            <div className="max-h-32 overflow-y-auto rounded border border-danger-line bg-danger-surface/30 p-2 space-y-1">
              {previewData!.row_errors.map((row, index) => (
                <div key={`${String(row.pin)}-${index}`} className="text-danger-text">
                  <span className="font-mono font-bold">{String(row.pin ?? "")}</span>{" "}
                  {String(row.reason ?? "")}
                </div>
              ))}
            </div>
          ) : null}

          {/* Conflicts list */}
          <div className="max-h-56 overflow-y-auto rounded border border-line divide-y divide-line">
            {previewData?.conflicts?.map((c) => (
              <div key={c.pin} className="flex justify-between items-center p-2 bg-surface">
                <span className="font-mono font-bold text-text">{c.pin}</span>
                <span className="text-warning-text font-medium">
                  Currently in {c.current_area_name} ({onConflict === "MOVE" ? "will move" : "will skip"})
                </span>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-line">
            <Button variant="secondary" onClick={() => setStep("input")} type="button">
              Back to Input
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => onOpenChange(false)} type="button">
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleApply}
                disabled={applyMutation.isPending}
              >
                {applyMutation.isPending ? "Applying..." : "Apply Assignments"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { Button, Dialog, Field, Input } from "@vsolve/ui";
import { describeError } from "@vsolve/query";
import { useCreateServiceArea } from "../queries";

interface NewAreaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (newAreaId: string) => void;
}

export function NewAreaDialog({ open, onOpenChange, onSuccess }: NewAreaDialogProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [zone, setZone] = useState("");
  const [stateCode, setStateCode] = useState("TG");
  const [isAccepting, setIsAccepting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateServiceArea();

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]+/g, "-")) {
      setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !slug.trim()) {
      setError("Name and slug are required.");
      return;
    }

    createMutation.mutate(
      {
        name: name.trim(),
        slug: slug.trim(),
        zone: zone.trim(),
        state_code: stateCode.trim(),
        is_accepting_partners: isAccepting,
      },
      {
        onSuccess: (data) => {
          setName("");
          setSlug("");
          setZone("");
          setStateCode("TG");
          setIsAccepting(true);
          onOpenChange(false);
          onSuccess?.(data.id);
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
      title="Create Service Area"
      description="Add a new geographic operational service area."
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        {error ? (
          <div className="rounded bg-danger-surface p-3 text-xs text-danger-text border border-danger-line">
            {error}
          </div>
        ) : null}

        <Field label="Area Name" required>
          <Input
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. South Hyderabad"
            required
            autoFocus
          />
        </Field>

        <Field label="Slug" required description="Unique alphanumeric URL identifier (lowercase with hyphens)">
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="e.g. south-hyderabad"
            required
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Zone / Region" description="Broad operational cluster">
            <Input
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              placeholder="e.g. South"
            />
          </Field>
          <Field label="State Code" description="2-letter code">
            <Input
              value={stateCode}
              onChange={(e) => setStateCode(e.target.value)}
              maxLength={2}
              placeholder="TG"
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-text cursor-pointer pt-2">
          <input
            type="checkbox"
            checked={isAccepting}
            onChange={(e) => setIsAccepting(e.target.checked)}
            className="rounded border-line text-action focus:ring-action"
          />
          <span className="font-medium">Accepting new partners immediately</span>
        </label>

        <div className="flex justify-end gap-3 pt-4 border-t border-line">
          <Button variant="secondary" onClick={() => onOpenChange(false)} type="button">
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating..." : "Create Service Area"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

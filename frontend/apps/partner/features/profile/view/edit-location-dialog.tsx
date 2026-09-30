"use client";

import { friendlyErrorMessage } from "@vsolve/query";
import { Button, Dialog, Field, Input } from "@vsolve/ui";
import { useState } from "react";

import { useUpdatePartnerProfile } from "../queries";

/**
 * Edits the partner's registered pickup / default location used to prefill
 * rental ads. Still editable per asset at create time.
 */
export interface EditLocationDialogProps {
  open: boolean;
  currentLocation: string;
  onClose: () => void;
}

export function EditLocationDialog(props: EditLocationDialogProps) {
  if (!props.open) return null;
  return <EditLocationForm {...props} />;
}

function EditLocationForm({ currentLocation, onClose }: EditLocationDialogProps) {
  const [location, setLocation] = useState(currentLocation);
  const update = useUpdatePartnerProfile();

  const trimmed = location.trim();
  const isUnchanged = trimmed === currentLocation.trim();

  function save() {
    if (isUnchanged) return;
    update.mutate({ default_location_text: trimmed }, { onSuccess: onClose });
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !update.isPending) onClose();
      }}
      title="Default pickup location"
      description="Used to prefill rental ads. You can still change the location on each ad."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={isUnchanged}
            loading={update.isPending}
            loadingLabel="Saving"
          >
            Save
          </Button>
        </>
      }
    >
      <Field
        label="Pickup / registered address"
        error={update.isError ? friendlyErrorMessage(update.error) : undefined}
      >
        <Input
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          placeholder="Area, city"
          maxLength={240}
        />
      </Field>
    </Dialog>
  );
}

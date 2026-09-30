"use client";

import { friendlyErrorMessage } from "@vsolve/query";
import { Button, Dialog, Field, Input } from "@vsolve/ui";
import { useState } from "react";

import { useUpdatePartnerProfile } from "../queries";

/**
 * Changes the name Customers see.
 *
 * A dialog rather than an inline field: this is the name on a stranger's
 * doorstep, and a control that saves as you type invites an accidental change
 * nobody notices. Open, change, save.
 *
 * The draft only exists while the dialog is open, so cancelling genuinely
 * discards it — there is no half-edited name waiting behind the screen for the
 * next time it opens.
 */
export interface EditNameDialogProps {
  open: boolean;
  currentName: string;
  onClose: () => void;
}

export function EditNameDialog(props: EditNameDialogProps) {
  if (!props.open) return null;
  return <EditNameForm {...props} />;
}

function EditNameForm({ currentName, onClose }: EditNameDialogProps) {
  const [name, setName] = useState(currentName);
  const update = useUpdatePartnerProfile();

  const trimmed = name.trim();
  const isUnchanged = trimmed === currentName.trim();

  function save() {
    if (trimmed === "" || isUnchanged) return;
    update.mutate({ display_name: trimmed }, { onSuccess: onClose });
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !update.isPending) onClose();
      }}
      title="Change your name"
      description="This is the name Customers see when you arrive."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={trimmed === "" || isUnchanged}
            loading={update.isPending}
            loadingLabel="Saving"
          >
            Save
          </Button>
        </>
      }
    >
      <Field
        label="Your name"
        required
        error={update.isError ? friendlyErrorMessage(update.error) : undefined}
      >
        <Input value={name} autoComplete="name" onChange={(event) => setName(event.target.value)} />
      </Field>
    </Dialog>
  );
}

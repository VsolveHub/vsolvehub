"use client";

import { describeError } from "@vsolve/query";
import { Button, Dialog, Field, Input } from "@vsolve/ui";
import { useCallback, useId, useRef, useState, type FormEvent, type ReactNode } from "react";

import { useCustomerSession } from "@/features/session/queries";
import { profileName } from "@/features/session/view/profile-mark";

import { useUpdateCustomerProfile } from "../queries";

type CompletionPurpose = "booking" | "payment";

/**
 * Holds the customer's original action while one missing name is collected.
 * Existing profiles never render the dialog and continue synchronously.
 */
export function useProfileCompletionGate(purpose: CompletionPurpose): {
  run: (action: () => void) => void;
  dialog: ReactNode;
} {
  const session = useCustomerSession();
  const pendingAction = useRef<(() => void) | null>(null);
  const [open, setOpen] = useState(false);

  const run = useCallback(
    (action: () => void) => {
      if (profileName(session) !== null) {
        action();
        return;
      }
      pendingAction.current = action;
      setOpen(true);
    },
    [session],
  );

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) pendingAction.current = null;
  }

  function handleSaved() {
    const action = pendingAction.current;
    pendingAction.current = null;
    setOpen(false);
    action?.();
  }

  return {
    run,
    dialog: (
      <ProfileCompletionDialog
        open={open}
        onOpenChange={handleOpenChange}
        onSaved={handleSaved}
        purpose={purpose}
        initialName={session.fullName ?? session.displayName ?? ""}
      />
    ),
  };
}

export function ProfileCompletionDialog({
  open,
  onOpenChange,
  onSaved,
  purpose,
  initialName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  purpose: CompletionPurpose;
  initialName: string;
}) {
  const formId = useId();
  const [name, setName] = useState(initialName);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const updateProfile = useUpdateCustomerProfile();
  const actionLabel = purpose === "booking" ? "Save and confirm booking" : "Save and continue";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim().replace(/\s+/g, " ");
    if (cleanName.length < 2) {
      setFieldError("Enter the name you want on this booking.");
      return;
    }
    setFieldError(undefined);
    updateProfile.mutate(
      { full_name: cleanName, display_name: cleanName },
      { onSuccess: onSaved },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      dismissable={!updateProfile.isPending}
      title="Put a name on your booking"
      description="One detail, collected when it becomes useful."
      footer={
        <Button
          type="submit"
          form={formId}
          block
          loading={updateProfile.isPending}
          loadingLabel="Saving your name"
        >
          {actionLabel}
        </Button>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate>
        <div className="mb-5 grid grid-cols-[3rem_1fr] items-center gap-3 rounded-card bg-action-surface p-3">
          <span aria-hidden className="grid size-12 place-items-center rounded-full bg-surface text-action-active ring-1 ring-action-line">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-6">
              <path d="M7 3h10v4H7V3Zm-2 4h14v14H5V7Zm4 5h6m-6 4h4" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-extrabold text-text">Booking and receipt</p>
            <p className="mt-0.5 text-xs font-medium leading-5 text-text-secondary">
              We use this name to address you and print your payment receipt.
            </p>
          </div>
        </div>

        <Field label="Your name" required error={fieldError}>
          <Input
            value={name}
            autoComplete="name"
            maxLength={150}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        {updateProfile.isError ? (
          <p className="mt-3 text-sm font-medium text-danger-text" role="alert">
            {describeError(updateProfile.error, "mutation").message}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}

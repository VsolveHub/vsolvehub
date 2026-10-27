"use client";

import { friendlyErrorMessage } from "@vsolve/query";
import { Button, Dialog, Field, Input, useT } from "@vsolve/ui";
import { User, AlertCircle } from "lucide-react";
import { useState } from "react";

import { useUpdatePartnerProfile } from "../queries";

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
  const t = useT();
  const [name, setName] = useState(currentName);
  const update = useUpdatePartnerProfile();

  const trimmed = name.trim();
  const isUnchanged = trimmed === currentName.trim();
  const isValid = trimmed.length >= 2;

  function save() {
    if (!isValid || isUnchanged) return;
    update.mutate({ display_name: trimmed }, { onSuccess: onClose });
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !update.isPending) onClose();
      }}
      title={t("me.profile.editName.title")}
      description={t("me.profile.editName.description")}
      footer={
        <div className="flex items-center justify-end gap-2.5 w-full">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={update.isPending}
            className="rounded-xl px-4"
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={save}
            disabled={!isValid || isUnchanged}
            loading={update.isPending}
            loadingLabel={t("common.saving")}
            className="rounded-xl px-5 font-semibold"
          >
            {t("common.save")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 py-1">
        <Field
          label={t("me.profile.editName.nameLabel")}
          required
          error={update.isError ? friendlyErrorMessage(update.error) : undefined}
          description="Must be at least 2 characters. Changes reflect immediately on new customer bookings."
        >
          <div className="relative">
            <Input
              value={name}
              autoComplete="name"
              autoFocus
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Ramesh Kumar or QuickFix Services"
              className="pl-3.5 pr-14 font-medium"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-text-muted select-none">
              {name.length}/60
            </span>
          </div>
        </Field>

        {trimmed.length > 0 && !isUnchanged && (
          <div className="flex items-center gap-2 rounded-xl bg-blue-50/80 border border-blue-100/80 p-3 text-xs text-blue-900">
            <User className="h-4 w-4 shrink-0 text-blue-600" />
            <span>
              Preview: <strong className="font-semibold">{trimmed}</strong>
            </span>
          </div>
        )}
      </div>
    </Dialog>
  );
}

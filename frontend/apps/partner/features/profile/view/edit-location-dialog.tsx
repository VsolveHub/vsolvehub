"use client";

import { friendlyErrorMessage } from "@vsolve/query";
import { Button, Dialog, Field, Input, useT } from "@vsolve/ui";
import { MapPin } from "lucide-react";
import { useState } from "react";

import { useUpdatePartnerProfile } from "../queries";

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
  const t = useT();
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
      title={t("me.profile.editLocation.title")}
      description={t("me.profile.editLocation.description")}
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
            disabled={isUnchanged}
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
          label={t("me.profile.editLocation.addressLabel")}
          error={update.isError ? friendlyErrorMessage(update.error) : undefined}
          description="Include your shop/hub address or prominent area & city (e.g. Madhapur, Hyderabad)"
        >
          <div className="relative">
            <Input
              value={location}
              autoFocus
              onChange={(event) => setLocation(event.target.value)}
              placeholder="e.g. Shop #12, Hitec City Road, Madhapur, Hyderabad"
              maxLength={240}
              className="pl-3.5 pr-14 font-medium"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-text-muted select-none">
              {location.length}/240
            </span>
          </div>
        </Field>

        <div className="flex items-start gap-2.5 rounded-xl bg-surface-sunken border border-line/80 p-3 text-xs text-text-secondary">
          <MapPin className="h-4 w-4 shrink-0 text-text-muted mt-0.5" />
          <span>
            This address is used to estimate transit times and automatically pre-fill your equipment or property listings. You can still customize the pickup address for individual listings.
          </span>
        </div>
      </div>
    </Dialog>
  );
}

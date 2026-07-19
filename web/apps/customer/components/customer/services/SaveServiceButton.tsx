"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useSaveServiceMutation, useUnsaveServiceMutation } from "@/lib/query/hooks";

type SaveButtonProps = {
  serviceId: string;
  initialSaved?: boolean;
};

export function SaveServiceButton({ serviceId, initialSaved = false }: SaveButtonProps) {
  const [saved, setSaved] = useState(initialSaved);
  const saveMutation = useSaveServiceMutation();
  const unsaveMutation = useUnsaveServiceMutation();
  const loading = saveMutation.isPending || unsaveMutation.isPending;

  function toggle() {
    if (saved) {
      unsaveMutation.mutate(serviceId, {
        onSuccess: () => setSaved(false),
      });
    } else {
      saveMutation.mutate(serviceId, {
        onSuccess: () => setSaved(true),
      });
    }
  }

  return (
    <Button variant="secondary" size="sm" onClick={toggle} loading={loading} disabled={loading}>
      {saved ? "Saved ♥" : "Save"}
    </Button>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

type SaveButtonProps = {
  serviceId: string;
  initialSaved?: boolean;
};

export function SaveServiceButton({ serviceId, initialSaved = false }: SaveButtonProps) {
  const [saved, setSaved] = useState(initialSaved);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    if (saved) {
      await fetch(`/api/profile/saved?serviceId=${serviceId}`, { method: "DELETE" });
      setSaved(false);
    } else {
      const res = await fetch("/api/profile/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId }),
      });
      if (res.ok) setSaved(true);
    }
    setLoading(false);
  }

  return (
    <Button variant="secondary" size="sm" onClick={toggle} loading={loading} disabled={loading}>
      {saved ? "Saved ♥" : "Save"}
    </Button>
  );
}

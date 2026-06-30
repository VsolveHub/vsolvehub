"use client";

import { useEffect } from "react";

type Props = {
  serviceId: string;
};

export function TrackRecentlyViewed({ serviceId }: Props) {
  useEffect(() => {
    fetch("/api/recently-viewed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceId }),
    }).catch(() => {});
  }, [serviceId]);

  return null;
}

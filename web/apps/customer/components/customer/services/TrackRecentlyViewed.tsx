"use client";

import { useEffect } from "react";
import { useTrackRecentlyViewedMutation } from "@/lib/query/hooks";

type Props = {
  serviceId: string;
};

export function TrackRecentlyViewed({ serviceId }: Props) {
  const trackMutation = useTrackRecentlyViewedMutation();

  useEffect(() => {
    trackMutation.mutate(serviceId);
  }, [serviceId]);

  return null;
}

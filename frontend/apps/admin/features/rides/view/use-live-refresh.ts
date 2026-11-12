import { useEffect } from "react";

import { LIVE_REFRESH_MS } from "../queries";

/** Ask again every 10 s while `on`, for lists that change under the operator's eyes. */
export function useLiveRefresh(refetch: () => unknown, on: boolean) {
  useEffect(() => {
    if (!on) return;
    const timer = setInterval(() => void refetch(), LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [refetch, on]);
}

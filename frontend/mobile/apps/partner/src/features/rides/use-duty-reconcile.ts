import { request } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppState } from "react-native";

import { reconcileDuty } from "./duty";
import { saveClockOffset } from "./model/clock";
import { captainStatusKey } from "./queries";

/**
 * On open and on every return to the front (brief §5.13): read the server, refresh the clock
 * offset, and make the location service match `on_duty`. Home then shows why duty ended, if the
 * server ended it. A failed read changes nothing; the next return tries again.
 */
export function useDutyReconcile(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    let busy = false;
    const run = async () => {
      if (busy) return;
      busy = true;
      try {
        const status = await queryClient.fetchQuery({
          queryKey: captainStatusKey,
          queryFn: () => request(() => getApiClient().GET("/api/v1/partner/rides/me/")),
          staleTime: 0,
        });
        await saveClockOffset(status.server_now);
        await reconcileDuty(status.on_duty);
      } catch {
        // Offline or the server is unreachable: leave everything as it is.
      } finally {
        busy = false;
      }
    };
    void run();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void run();
    });
    return () => subscription.remove();
  }, [queryClient]);
}

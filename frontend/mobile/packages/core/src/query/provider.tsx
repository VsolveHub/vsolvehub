import NetInfo from "@react-native-community/netinfo";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { AppState } from "react-native";

import { bindAppStateFocus, bindNetworkOnline, getMobileQueryClient } from "./query-client";

/** Stops polling in the background and pauses it while the phone is offline. */
export function MobileQueryProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const appState = AppState.addEventListener("change", bindAppStateFocus);
    const network = NetInfo.addEventListener((state) => {
      bindNetworkOnline(state.isConnected);
    });
    return () => {
      appState.remove();
      network();
    };
  }, []);

  return <QueryClientProvider client={getMobileQueryClient()}>{children}</QueryClientProvider>;
}

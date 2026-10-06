import { useEffect, useState, type ReactNode } from "react";
import { AppState, Linking, Platform, Pressable, Text, View } from "react-native";
import Constants from "expo-constants";
import { request } from "@vsolve/api-client";

import { getApiClient } from "../api/client";
import { appKind } from "../config";

interface AppConfig {
  update_required: boolean;
  store_url: string;
}

async function loadConfig(): Promise<AppConfig | null> {
  try {
    const platform = Platform.OS === "ios" ? "ios" : "android";
    const version = Constants.expoConfig?.version ?? "1.0.0";
    return await request(() =>
      getApiClient().GET("/api/v1/mobile/app-config/", {
        params: { query: { app: appKind(), platform, version } },
      }),
    );
  } catch {
    return null;
  }
}

export function UpdateRequiredScreen({ storeUrl }: { storeUrl: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 12 }}>Update V Solve Hub</Text>
      <Text style={{ textAlign: "center", marginBottom: 24 }}>
        This version is no longer supported. Update to continue.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          if (storeUrl) void Linking.openURL(storeUrl);
        }}
        style={{ backgroundColor: "#f87000", borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
      >
        <Text style={{ color: "#ffffff", fontWeight: "600" }}>Update</Text>
      </Pressable>
    </View>
  );
}

/**
 * Blocks the app only when the server says this build is too old.
 * A network error never blocks: the person can keep working offline.
 */
export function VersionGate({ children }: { children: ReactNode }) {
  const [update, setUpdate] = useState<AppConfig | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void loadConfig().then((config) => {
        if (active) setUpdate(config?.update_required ? config : null);
      });
    };
    refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  if (update?.update_required) {
    return <UpdateRequiredScreen storeUrl={update.store_url} />;
  }
  return children;
}

import { enablePush, pushPermission } from "@vsolve/mobile-core";
import { Button, COLOR_TOKENS, Text, useT } from "@vsolve/mobile-ui";
import { Bell, Sparkles, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Platform, Pressable, View } from "react-native";

export function JobAlertsBanner() {
  if (Platform.OS === "web") return null;
  return <NativeJobAlertsBanner />;
}

function NativeJobAlertsBanner() {
  const t = useT();
  // Hidden until the phone says otherwise. Expo Go reports "unavailable": no push there, so
  // there is nothing to switch on.
  const [needed, setNeeded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let mounted = true;
    void pushPermission().then((permission) => {
      if (mounted) setNeeded(permission === "undetermined" || permission === "denied");
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!needed || dismissed) return null;

  const handleRequest = async () => {
    if ((await enablePush()) === "granted") {
      setNeeded(false);
    } else {
      setDismissed(true);
    }
  };

  return (
    <View className="mx-4 my-2.5 rounded-2xl border border-brand/30 bg-orange-50/90 p-3.5 shadow-sm">
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-row items-start gap-2.5 flex-1">
          <View className="size-8 items-center justify-center rounded-full bg-brand/15 mt-0.5">
            <Bell size={16} color={COLOR_TOKENS.action} />
          </View>
          <View className="flex-1 gap-1">
            <View className="flex-row items-center gap-1.5">
              <Text className="text-xs font-bold text-navy-900">
                {t("work.jobAlerts.title")}
              </Text>
              <Sparkles size={12} color={COLOR_TOKENS.action} />
            </View>
            <Text className="text-[11px] leading-relaxed text-text-secondary">
              {t("work.jobAlerts.description")}
            </Text>

            <View className="flex-row items-center gap-2 pt-1.5">
              <Button
                variant="primary"
                size="sm"
                onPress={handleRequest}
                className="h-7 px-3 bg-brand"
              >
                <Text className="text-[11px] font-bold text-white">{t("work.jobAlerts.enableAction")}</Text>
              </Button>
            </View>
          </View>
        </View>

        <Pressable
          hitSlop={10}
          onPress={() => setDismissed(true)}
          className="size-6 items-center justify-center rounded-full bg-black/5"
        >
          <X size={13} color={COLOR_TOKENS.navy} />
        </Pressable>
      </View>
    </View>
  );
}

// Ported from frontend/apps/partner/features/session/view/language-picker.tsx
import { Button, Text, useT, type Locale } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { useLocaleStore } from "@/i18n/locale-store";

const OPTIONS: readonly { code: Locale; script: string }[] = [
  { code: "te-IN", script: "తెలుగు" },
  { code: "hi-IN", script: "हिन्दी" },
  { code: "en-IN", script: "English" },
];

export function LanguagePicker() {
  const router = useRouter();
  const t = useT();
  const currentLocale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const [selected, setSelected] = useState<Locale>(currentLocale);

  const handleConfirm = async () => {
    await setLocale(selected);
    router.back();
  };

  return (
    <View className="flex-1 bg-navy-900 px-5">
      <Text className="pb-8 pt-16 text-center text-xl font-bold text-white">
        {t("me.language.title")}
      </Text>
      <View className="flex-1 gap-3">
        {OPTIONS.map((option) => (
          <Pressable
            key={option.code}
            accessibilityRole="button"
            accessibilityState={{ selected: selected === option.code }}
            onPress={() => setSelected(option.code)}
            className={
              selected === option.code
                ? "rounded-card bg-action px-5 py-5"
                : "rounded-card bg-surface px-5 py-5"
            }
          >
            <Text className="text-3xl font-bold text-text">{option.script}</Text>
          </Pressable>
        ))}
      </View>
      <View className="pb-8 pt-6">
        <Button
          accessibilityLabel={t("me.language.confirm")}
          onPress={handleConfirm}
        >
          {t("common.confirm")}
        </Button>
      </View>
    </View>
  );
}

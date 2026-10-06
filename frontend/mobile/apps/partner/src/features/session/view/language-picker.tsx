// Ported from frontend/apps/partner/features/session/view/language-picker.tsx
import { DEFAULT_LOCALE, Button, Text, type Locale } from "@vsolve/mobile-ui";
import { kvGet, kvSet } from "@vsolve/mobile-core";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

export const LOCALE_STORAGE_KEY = "vsh-partner-locale";

const OPTIONS: readonly { code: Locale; script: string }[] = [
  { code: "te-IN", script: "తెలుగు" },
  { code: "hi-IN", script: "हिन्दी" },
  { code: "en-IN", script: "English" },
];

export function LanguagePicker() {
  const router = useRouter();
  const [selected, setSelected] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    void kvGet(LOCALE_STORAGE_KEY).then((saved) => {
      if (OPTIONS.some((option) => option.code === saved)) setSelected(saved as Locale);
    });
  }, []);

  return (
    <View className="flex-1 bg-navy-900 px-5">
      <Text className="pb-8 pt-16 text-center text-xl font-bold text-white">App Language</Text>
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
          accessibilityLabel="Confirm language"
          onPress={() => {
            void kvSet(LOCALE_STORAGE_KEY, selected).then(() => router.back());
          }}
        >
          Confirm
        </Button>
      </View>
    </View>
  );
}

import { Text, type Locale } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { ArrowLeft, Check, Globe } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { useLocaleStore } from "@/i18n/locale-store";

interface LanguageOption {
  code: Locale;
  nativeName: string;
  englishName: string;
  subtext: string;
  badgeIcon: string;
}

const OPTIONS: readonly LanguageOption[] = [
  {
    code: "en-IN",
    nativeName: "English",
    englishName: "English (India)",
    subtext: "Default system language",
    badgeIcon: "Aa",
  },
  {
    code: "te-IN",
    nativeName: "తెలుగు",
    englishName: "Telugu",
    subtext: "ఆంధ్రప్రదేశ్ & తెలంగాణ (AP & TS)",
    badgeIcon: "తె",
  },
  {
    code: "hi-IN",
    nativeName: "हिन्दी",
    englishName: "Hindi",
    subtext: "उत्तर व मध्य भारत (North & Central India)",
    badgeIcon: "अ",
  },
];

export function LanguagePicker() {
  const router = useRouter();
  const currentLocale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const [selected, setSelected] = useState<Locale>(currentLocale);

  const handleSelect = async (code: Locale) => {
    setSelected(code);
    await setLocale(code);
  };

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 48,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* App Language Header Section */}
      <View style={{ marginBottom: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "center", columnGap: 12, marginBottom: 8 }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: "#faf5ff",
              borderWidth: 1,
              borderColor: "#f3e8ff",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Globe size={22} color="#9333ea" />
          </View>
          <Text
            style={{
              fontSize: 22,
              fontWeight: "800",
              color: "#00112e",
              letterSpacing: -0.3,
            }}
          >
            App Language
          </Text>
        </View>
        <Text
          style={{
            fontSize: 13,
            color: "#64748b",
            lineHeight: 19,
            paddingLeft: 2,
          }}
        >
          Select your preferred language. All screens, job details, and notifications will display in this language.
        </Text>
      </View>

      {/* Language Options Stack */}
      <View style={{ rowGap: 14 }}>
        {OPTIONS.map((option) => {
          const isSelected = selected === option.code;
          const isActive = currentLocale === option.code;

          return (
            <Pressable cssInterop={false}
              key={option.code}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              onPress={() => void handleSelect(option.code)}
              style={({ pressed }) => ({
                width: "100%",
                borderRadius: 20,
                borderWidth: isSelected ? 1.5 : 1,
                borderColor: isSelected ? "#ea580c" : "#e2e8f0",
                backgroundColor: isSelected ? "#fff7ee" : "#ffffff",
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                opacity: pressed ? 0.92 : 1,
                boxShadow: isSelected
                  ? "0 4px 14px rgba(234, 88, 12, 0.08)"
                  : "0 2px 6px rgba(0, 17, 46, 0.03)",
              })}
            >
              {/* Left Badge Icon + Texts */}
              <View style={{ flexDirection: "row", alignItems: "center", columnGap: 14, flex: 1, paddingRight: 8 }}>
                {/* Script Character Icon Box */}
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 13,
                    borderWidth: 1,
                    borderColor: isSelected ? "#fed7aa" : "#e2e8f0",
                    backgroundColor: isSelected ? "#ffedd5" : "#f8fafc",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "700",
                      color: isSelected ? "#c2410c" : "#475569",
                    }}
                  >
                    {option.badgeIcon}
                  </Text>
                </View>

                {/* Details Column */}
                <View style={{ flex: 1 }}>
                  {/* Top Line: Native Name + Active Tag */}
                  <View style={{ flexDirection: "row", alignItems: "center", columnGap: 8 }}>
                    <Text
                      style={{
                        fontSize: 17,
                        fontWeight: "800",
                        color: "#00112e",
                        letterSpacing: -0.2,
                      }}
                    >
                      {option.nativeName}
                    </Text>

                    {isActive ? (
                      <View
                        style={{
                          backgroundColor: "#ecfdf5",
                          borderWidth: 1,
                          borderColor: "#a7f3d0",
                          borderRadius: 6,
                          paddingHorizontal: 7,
                          paddingVertical: 1.5,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "700",
                            color: "#059669",
                          }}
                        >
                          Active
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Second Line: English Name */}
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "500",
                      color: "#64748b",
                      marginTop: 2,
                    }}
                  >
                    {option.englishName}
                  </Text>

                  {/* Third Line: Subtext region / description */}
                  <Text
                    style={{
                      fontSize: 12,
                      color: "#64748b",
                      marginTop: 2,
                    }}
                  >
                    {option.subtext}
                  </Text>
                </View>
              </View>

              {/* Right Radio Indicator */}
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: isSelected ? 0 : 2,
                  borderColor: "#94a3b8",
                  backgroundColor: isSelected ? "#ea580c" : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isSelected ? (
                  <Check size={13} color="#111827" strokeWidth={3} />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

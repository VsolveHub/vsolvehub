// Ported from frontend/mobile/guide/03-design-system.md §2
import {
  Platform,
  StyleSheet,
  Text as RNText,
  type TextProps as RNTextProps,
  type TextStyle,
} from "react-native";
import { useTranslator } from "./i18n";

export const MONO_FONT_FAMILY = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

const JAKARTA_FAMILIES: readonly [string, string][] = [
  ["font-black", "PlusJakartaSans_800ExtraBold"],
  ["font-extrabold", "PlusJakartaSans_800ExtraBold"],
  ["font-bold", "PlusJakartaSans_700Bold"],
  ["font-semibold", "PlusJakartaSans_600SemiBold"],
  ["font-medium", "PlusJakartaSans_500Medium"],
  ["font-normal", "PlusJakartaSans_400Regular"],
];

const MUKTA_FAMILIES: readonly [string, string][] = [
  ["font-black", "Mukta_800ExtraBold"],
  ["font-extrabold", "Mukta_800ExtraBold"],
  ["font-bold", "Mukta_700Bold"],
  ["font-semibold", "Mukta_600SemiBold"],
  ["font-medium", "Mukta_500Medium"],
  ["font-normal", "Mukta_400Regular"],
];

const HIND_GUNTUR_FAMILIES: readonly [string, string][] = [
  ["font-black", "HindGuntur_700Bold"],
  ["font-extrabold", "HindGuntur_700Bold"],
  ["font-bold", "HindGuntur_700Bold"],
  ["font-semibold", "HindGuntur_600SemiBold"],
  ["font-medium", "HindGuntur_500Medium"],
  ["font-normal", "HindGuntur_400Regular"],
];

const WEIGHTS: readonly [string, TextStyle["fontWeight"]][] = [
  ["font-black", "900"],
  ["font-extrabold", "800"],
  ["font-bold", "700"],
  ["font-semibold", "600"],
  ["font-medium", "500"],
  ["font-normal", "400"],
];

function resolvedWeight(
  className: string | undefined,
  styleWeight?: TextStyle["fontWeight"],
): TextStyle["fontWeight"] {
  const tokens = new Set((className ?? "").split(/\s+/));
  for (const [token, weight] of WEIGHTS) {
    if (tokens.has(token)) return weight;
  }
  if (styleWeight) {
    const sw = String(styleWeight);
    if (sw === "900" || sw === "800" || sw === "700" || sw === "600" || sw === "500" || sw === "400") {
      return sw as TextStyle["fontWeight"];
    }
    if (sw === "bold") return "700";
    if (sw === "normal") return "400";
  }
  return "400";
}

function familyFor(
  className: string | undefined,
  weight: TextStyle["fontWeight"],
  locale?: string,
): string {
  const tokens = new Set((className ?? "").split(/\s+/));
  if (tokens.has("font-mono")) {
    return MONO_FONT_FAMILY ?? "monospace";
  }

  const isHindi = locale?.startsWith("hi");
  const isTelugu = locale?.startsWith("te");

  if (isHindi) {
    if (weight === "900" || weight === "800") return "Mukta_800ExtraBold";
    if (weight === "700") return "Mukta_700Bold";
    if (weight === "600") return "Mukta_600SemiBold";
    if (weight === "500") return "Mukta_500Medium";
    return "Mukta_400Regular";
  }

  if (isTelugu) {
    if (weight === "900" || weight === "800" || weight === "700") return "HindGuntur_700Bold";
    if (weight === "600") return "HindGuntur_600SemiBold";
    if (weight === "500") return "HindGuntur_500Medium";
    return "HindGuntur_400Regular";
  }

  if (weight === "900" || weight === "800") return "PlusJakartaSans_800ExtraBold";
  if (weight === "700") return "PlusJakartaSans_700Bold";
  if (weight === "600") return "PlusJakartaSans_600SemiBold";
  if (weight === "500") return "PlusJakartaSans_500Medium";
  return "PlusJakartaSans_400Regular";
}

export type TextProps = RNTextProps & { className?: string };

export function Text({ className, style, ...props }: TextProps) {
  const translator = useTranslator();
  const locale = translator?.locale;
  const flat = StyleSheet.flatten(style);
  const tokens = new Set((className ?? "").split(/\s+/));
  const tabular = tokens.has("tabular-nums");
  const isWeb = Platform.OS === "web";
  const isMono = tokens.has("font-mono") || flat?.fontFamily === "monospace";
  const weight = resolvedWeight(className, flat?.fontWeight);

  const webFont = isMono
    ? "ui-monospace, Menlo, Monaco, Consolas, monospace"
    : locale?.startsWith("hi")
      ? "'Mukta', var(--font-devanagari), system-ui, sans-serif"
      : locale?.startsWith("te")
        ? "'Hind Guntur', var(--font-telugu), system-ui, sans-serif"
        : "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";

  const textStyle: TextStyle = {
    fontFamily: isWeb ? webFont : familyFor(className, weight, locale),
    ...(isWeb ? { fontWeight: weight } : null),
    ...(tabular ? { fontVariant: ["tabular-nums"] } : null),
  };
  return <RNText className={className} style={[style, textStyle]} {...props} />;
}

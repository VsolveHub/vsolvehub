// Ported from frontend/mobile/guide/03-design-system.md §2
import { Platform, Text as RNText, type TextProps as RNTextProps, type TextStyle } from "react-native";
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

function familyFor(className: string | undefined, locale?: string): string {
  const tokens = new Set((className ?? "").split(/\s+/));
  if (tokens.has("font-mono")) {
    return MONO_FONT_FAMILY ?? "monospace";
  }

  const isHindi = locale?.startsWith("hi");
  const isTelugu = locale?.startsWith("te");

  if (isHindi) {
    for (const [token, family] of MUKTA_FAMILIES) {
      if (tokens.has(token)) return family;
    }
    return "Mukta_400Regular";
  }

  if (isTelugu) {
    for (const [token, family] of HIND_GUNTUR_FAMILIES) {
      if (tokens.has(token)) return family;
    }
    return "HindGuntur_400Regular";
  }

  for (const [token, family] of JAKARTA_FAMILIES) {
    if (tokens.has(token)) return family;
  }
  return "PlusJakartaSans_400Regular";
}

function weightFor(className: string | undefined): TextStyle["fontWeight"] {
  const tokens = new Set((className ?? "").split(/\s+/));
  for (const [token, weight] of WEIGHTS) {
    if (tokens.has(token)) return weight;
  }
  return "400";
}

export type TextProps = RNTextProps & { className?: string };

export function Text({ className, style, ...props }: TextProps) {
  const translator = useTranslator();
  const locale = translator?.locale;
  const tokens = new Set((className ?? "").split(/\s+/));
  const tabular = tokens.has("tabular-nums");
  const isWeb = Platform.OS === "web";
  const isMono = tokens.has("font-mono");
  const weight = weightFor(className);

  const webFont = isMono
    ? "ui-monospace, Menlo, Monaco, Consolas, monospace"
    : locale?.startsWith("hi")
      ? "'Mukta', var(--font-devanagari), system-ui, sans-serif"
      : locale?.startsWith("te")
        ? "'Hind Guntur', var(--font-telugu), system-ui, sans-serif"
        : "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";

  const textStyle: TextStyle = {
    fontFamily: isWeb ? webFont : familyFor(className, locale),
    ...(isWeb ? { fontWeight: weight } : null),
    ...(tabular ? { fontVariant: ["tabular-nums"] } : null),
  };
  return <RNText className={className} style={[textStyle, style]} {...props} />;
}

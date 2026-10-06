// Ported from frontend/mobile/guide/03-design-system.md §2
import { Platform, Text as RNText, type TextProps as RNTextProps, type TextStyle } from "react-native";

const FAMILIES: readonly [string, string][] = [
  ["font-black", "PlusJakartaSans_800ExtraBold"],
  ["font-extrabold", "PlusJakartaSans_800ExtraBold"],
  ["font-bold", "PlusJakartaSans_700Bold"],
  ["font-semibold", "PlusJakartaSans_600SemiBold"],
  ["font-medium", "PlusJakartaSans_500Medium"],
];

const WEIGHTS: readonly [string, TextStyle["fontWeight"]][] = [
  ["font-black", "900"],
  ["font-extrabold", "800"],
  ["font-bold", "700"],
  ["font-semibold", "600"],
  ["font-medium", "500"],
];

function familyFor(className: string | undefined): string {
  const tokens = new Set((className ?? "").split(/\s+/));
  for (const [token, family] of FAMILIES) {
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
  const tabular = (className ?? "").split(/\s+/).includes("tabular-nums");
  const isWeb = Platform.OS === "web";
  const weight = weightFor(className);
  const textStyle: TextStyle = {
    fontFamily: isWeb ? "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif" : familyFor(className),
    ...(isWeb ? { fontWeight: weight } : null),
    ...(tabular ? { fontVariant: ["tabular-nums"] } : null),
  };
  return <RNText className={className} style={[textStyle, style]} {...props} />;
}

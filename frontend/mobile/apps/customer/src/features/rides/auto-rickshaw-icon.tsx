import Svg, { Circle, Path } from "react-native-svg";

/**
 * Side view of an auto-rickshaw, drawn on lucide's 24px grid with the same 2px round stroke, so it
 * sits beside lucide's Motorbike and CarTaxiFront. lucide has no auto-rickshaw.
 */
export function AutoRickshawIcon({ size = 24, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Canopy, windscreen and body */}
      <Path d="M4 16H3v-4l3-6c.3-.6.9-1 1.6-1H19a1 1 0 0 1 1 1v10h-1" />
      {/* Dashboard line, driver pillar and passenger seat */}
      <Path d="M3 12h8" />
      <Path d="M11 5v7h9" />
      {/* Floor between the wheels */}
      <Path d="M8 16h7" />
      <Circle cx={6} cy={17} r={2} />
      <Circle cx={17} cy={17} r={2} />
    </Svg>
  );
}

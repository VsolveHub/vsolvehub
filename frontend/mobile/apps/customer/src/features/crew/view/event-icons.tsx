import Svg, { Circle, Path } from "react-native-svg";

export function EventTypeIcon({
  code,
  size = 28,
  color = "#0B1B3D",
}: {
  code: string;
  size?: number;
  color?: string;
}) {
  switch (code) {
    case "wedding":
      // Two rings
      return (
        <Svg
          viewBox="0 0 32 32"
          width={size}
          height={size}
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Circle cx="12" cy="18" r="7" />
          <Circle cx="20" cy="18" r="7" />
          <Path d="m12 11 2-4h4l2 4" />
        </Svg>
      );
    case "corporate":
      // An office block with a door
      return (
        <Svg
          viewBox="0 0 32 32"
          width={size}
          height={size}
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M7 27V7h18v20M7 27h18M11 11h3M18 11h3M11 15h3M18 15h3M11 19h3M18 19h3M14 27v-5h4v5" />
        </Svg>
      );
    case "birthday":
      // A cake with one candle
      return (
        <Svg
          viewBox="0 0 32 32"
          width={size}
          height={size}
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M6 27h20M8 27v-9h16v9M8 22c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2M16 18v-5M16 9v2M15 7a1.2 1.2 0 1 0 2 0c0-1-1-2-1-2s-1 1-1 2Z" />
        </Svg>
      );
    case "house-function":
      // A diya / oil lamp
      return (
        <Svg
          viewBox="0 0 32 32"
          width={size}
          height={size}
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M6 20h20c0 4-4 7-10 7S6 24 6 20ZM16 16c-2-2-2-5 0-7 2 2 2 5 0 7ZM10 20c1-2 3-3 6-3s5 1 6 3" />
        </Svg>
      );
    default:
      // A pen / something else
      return (
        <Svg
          viewBox="0 0 32 32"
          width={size}
          height={size}
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M6 26h20M9 21l12-12 3 3-12 12H9v-3Z" />
        </Svg>
      );
  }
}

export function RoleIcon({
  code,
  size = 24,
  color = "currentColor",
}: {
  code: string;
  size?: number;
  color?: string;
}) {
  switch (code) {
    case "waiter_count":
      // A cloche on a tray
      return (
        <Svg
          viewBox="0 0 32 32"
          width={size}
          height={size}
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M5 22h22M7 22a9 9 0 0 1 18 0M16 11v2M15 10h2" />
        </Svg>
      );
    case "bar_staff_count":
      // A tall glass with a straw
      return (
        <Svg
          viewBox="0 0 32 32"
          width={size}
          height={size}
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M11 8h10l-1.5 17h-7L11 8ZM12 14h8M17 8l3-4" />
        </Svg>
      );
    case "hostess_count":
      // A hand with a welcome mark / greeting
      return (
        <Svg
          viewBox="0 0 32 32"
          width={size}
          height={size}
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M16 27c-5 0-8-3-8-8v-6l4 2v-4l4 2V9l4 2v8" />
          <Path d="M20 19c2-1 4 0 4 2 0 3-3 6-8 6" />
        </Svg>
      );
    case "kitchen_helper_count":
      // A cooking pan
      return (
        <Svg
          viewBox="0 0 32 32"
          width={size}
          height={size}
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M6 18h14a6 6 0 0 1-12 0M20 18h6M10 12c0-2 2-2 2-4M14 12c0-2 2-2 2-4" />
        </Svg>
      );
    case "cleanup_count":
      // A broom
      return (
        <Svg
          viewBox="0 0 32 32"
          width={size}
          height={size}
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M20 5 12 17M12 17l-5 3 2 6 6-2 2-5-5-2Z" />
        </Svg>
      );
    case "setup_count":
      // Furniture / chairs
      return (
        <Svg
          viewBox="0 0 32 32"
          width={size}
          height={size}
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M6 27V17h10v10M6 21h10M18 27V13h8v14M18 18h8" />
        </Svg>
      );
    default:
      return (
        <Svg
          viewBox="0 0 32 32"
          width={size}
          height={size}
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M16 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM8 27v-2a6 6 0 0 1 16 0v2" />
        </Svg>
      );
  }
}

export function GenderIcon({ gender, size = 16 }: { gender: "men" | "women"; size?: number }) {
  if (gender === "men") {
    return (
      <Svg viewBox="0 0 16 16" width={size} height={size} fill="none">
        <Circle cx="7" cy="9.5" r="3.2" stroke="#0284C7" strokeWidth="1.6" />
        <Path d="M9.4 7.1 13 3.5M10.2 3.5H13v2.8" stroke="#0284C7" strokeWidth="1.6" strokeLinecap="round" />
      </Svg>
    );
  }
  return (
    <Svg viewBox="0 0 16 16" width={size} height={size} fill="none">
      <Circle cx="8" cy="6.2" r="3.1" stroke="#F97316" strokeWidth="1.6" />
      <Path d="M8 9.4v4.2M6.1 11.8h3.8" stroke="#F97316" strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  );
}

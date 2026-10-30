import { useWindowDimensions } from "react-native";

export const DESKTOP_BREAKPOINT = 768;

/**
 * Returns true if the viewport width is desktop width (>= 768px).
 * On phones/tablets with width < 768px, returns false.
 */
export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return width >= DESKTOP_BREAKPOINT;
}

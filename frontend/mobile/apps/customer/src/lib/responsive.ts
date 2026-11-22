import { useWindowDimensions } from "react-native";

export const DESKTOP_BREAKPOINT = 768;
export const LARGE_DESKTOP_BREAKPOINT = 1024;

/**
 * Returns true if the viewport width is desktop width (>= 768px).
 * On phones/tablets with width < 768px, returns false.
 */
export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return width >= DESKTOP_BREAKPOINT;
}

/**
 * Returns true if the viewport width matches web `lg` (>= 1024px).
 * Used for the 280px sidebar split layout (iPad Pro 1032px+, Desktop).
 * Smaller tablets like iPad Mini (768px) fall back to the left-rail split.
 */
export function useIsLargeDesktop(): boolean {
  const { width } = useWindowDimensions();
  return width >= LARGE_DESKTOP_BREAKPOINT;
}

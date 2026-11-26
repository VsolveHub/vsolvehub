import { createElement } from "react";

import { iconForService } from "./service-icon";

/**
 * Renders the catalogue icon for an `icon_key`. A stable component, so screens never
 * hold a component in a render-time variable (which React treats as a new type).
 */
export function ServiceIcon({
  iconKey,
  size,
  color,
  strokeWidth,
}: {
  iconKey?: string | null;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return createElement(iconForService(iconKey || "service"), { size, color, strokeWidth });
}

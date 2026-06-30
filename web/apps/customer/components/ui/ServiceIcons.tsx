import { FlaticonIcon } from "./FlaticonIcon";
import { SERVICE_ICON_MAP, type ServiceIconName } from "@/lib/icons/flaticon-map";

export type IconName = ServiceIconName;

export const ICON_MAP = SERVICE_ICON_MAP;

export function ServiceIcon({
  name,
  size = 24,
  color = "currentColor",
  className,
}: {
  name: IconName;
  size?: number;
  color?: string;
  className?: string;
}) {
  return <FlaticonIcon name={name} size={size} color={color} className={className} />;
}

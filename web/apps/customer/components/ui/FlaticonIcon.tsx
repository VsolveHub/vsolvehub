import { resolveFlaticonName } from "@/lib/icons/flaticon-map";

type Props = {
  name: string;
  size?: number;
  color?: string;
  className?: string;
  categorySlug?: string;
  label?: string;
};

export function FlaticonIcon({
  name,
  size = 24,
  color = "currentColor",
  className = "",
  categorySlug,
  label,
}: Props) {
  const slug = resolveFlaticonName(name, categorySlug);

  return (
    <i
      className={`fi fi-rr-${slug} flaticon-icon ${className}`.trim()}
      style={{ fontSize: size, color, width: size, height: size }}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}

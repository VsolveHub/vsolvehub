import { FlaticonIcon } from "./FlaticonIcon";

type Props = {
  slug: string;
  icon?: string;
  size?: number;
  color?: string;
  className?: string;
};

/** Renders a category icon via Flaticon (slug-first, then legacy icon string). */
export function CategoryIcon({ slug, icon, size = 24, color = "currentColor", className }: Props) {
  return (
    <FlaticonIcon
      name={icon ?? slug}
      categorySlug={slug}
      size={size}
      color={color}
      className={className}
    />
  );
}

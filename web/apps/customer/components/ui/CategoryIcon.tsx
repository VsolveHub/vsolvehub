import { getCategorySketchIllustration } from "@/lib/catalog/service-sketch-illustrations";

type Props = {
  slug: string;
  icon?: string;
  size?: number;
  color?: string;
  className?: string;
  name?: string;
};

/** Category tile / header — always uses hand-drawn niche illustration. */
export function CategoryIcon({ slug, size = 24, className, name }: Props) {
  const src = getCategorySketchIllustration(slug);

  return (
    <img
      src={src}
      alt={name ?? slug}
      width={size}
      height={size}
      className={`service-sketch service-sketch--icon${className ? ` ${className}` : ""}`}
      style={{ borderRadius: "inherit", objectFit: "cover" }}
      loading="lazy"
      decoding="async"
    />
  );
}

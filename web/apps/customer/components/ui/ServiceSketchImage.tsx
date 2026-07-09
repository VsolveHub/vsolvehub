import { resolveSketchIllustration, type SketchResolveInput } from "@/lib/catalog/service-sketch-illustrations";

type Props = SketchResolveInput & {
  size?: number;
  className?: string;
  alt?: string;
  variant?: "thumb" | "icon" | "hero" | "card";
};

export function ServiceSketchImage({
  slug,
  subCategorySlug,
  categorySlug,
  serviceName,
  icon,
  size = 48,
  className,
  alt,
  variant = "thumb",
}: Props) {
  const src = resolveSketchIllustration({
    slug,
    subCategorySlug,
    categorySlug,
    serviceName,
    icon,
  });

  const label = alt ?? serviceName ?? "Service illustration";

  if (variant === "hero" || variant === "card") {
    return (
      <img
        src={src}
        alt={label}
        className={`service-sketch service-sketch--${variant}${className ? ` ${className}` : ""}`}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <img
      src={src}
      alt={label}
      width={size}
      height={size}
      className={`service-sketch service-sketch--${variant}${className ? ` ${className}` : ""}`}
      loading="lazy"
      decoding="async"
    />
  );
}

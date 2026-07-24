import Image from "next/image";
import { serviceImageSrc, type SketchResolveInput } from "@/lib/catalog/service-sketch-illustrations";

type Props = SketchResolveInput & {
  /**
   * The real catalog image for this service. When present it is used directly;
   * only when it is missing do we fall back to the deterministic local sketch
   * illustration. This is the single place service imagery resolves — no
   * component keeps its own stock-image array.
   */
  imageUrl?: string | null;
  size?: number;
  className?: string;
  alt?: string;
  variant?: "thumb" | "icon" | "hero" | "card";
  priority?: boolean;
};

/**
 * The one component that renders a service's image. Prefers the real
 * `imageUrl`; otherwise draws a deterministic per-category sketch so the same
 * service always shows the same placeholder (never a random stock photo).
 */
export function ServiceImage({
  imageUrl,
  slug,
  subCategorySlug,
  categorySlug,
  serviceName,
  icon,
  size = 48,
  className,
  alt,
  variant = "thumb",
  priority = false,
}: Props) {
  const src = serviceImageSrc({ imageUrl, slug, subCategorySlug, categorySlug, serviceName, icon });

  const label = alt ?? serviceName ?? "Service illustration";
  const cls = `service-sketch service-sketch--${variant}${className ? ` ${className}` : ""}`;

  // For hero/card the existing CSS (`width:100%;height:100%;object-fit:cover`)
  // controls display; the width/height below are only the *decode/resize* target,
  // so next/image ships a small AVIF/WebP instead of the full-weight source.
  // Using intrinsic dimensions (not `fill`) means no `position:relative` is
  // required on the many wrapper elements.
  const dims =
    variant === "hero" ? { width: 400, height: 300 } : variant === "card" ? { width: 300, height: 210 } : { width: size, height: size };

  return (
    <Image
      src={src}
      alt={label}
      width={dims.width}
      height={dims.height}
      className={cls}
      priority={priority}
    />
  );
}

/**
 * @deprecated Use {@link ServiceImage}. Kept as an alias so existing call sites
 * keep working while they migrate; the behaviour is identical (it just also
 * honours `imageUrl` now).
 */
export const ServiceSketchImage = ServiceImage;

import Image from "next/image";
import { resolveSketchIllustration, type SketchResolveInput } from "@/lib/catalog/service-sketch-illustrations";

type Props = SketchResolveInput & {
  size?: number;
  className?: string;
  alt?: string;
  variant?: "thumb" | "icon" | "hero" | "card";
  priority?: boolean;
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
  priority = false,
}: Props) {
  const src = resolveSketchIllustration({
    slug,
    subCategorySlug,
    categorySlug,
    serviceName,
    icon,
  });

  const label = alt ?? serviceName ?? "Service illustration";
  const cls = `service-sketch service-sketch--${variant}${className ? ` ${className}` : ""}`;

  // For hero/card the existing CSS (`width:100%;height:100%;object-fit:cover`)
  // controls display; the width/height below are only the *decode/resize* target,
  // so next/image ships a small AVIF/WebP instead of the ~960px source JPEG.
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

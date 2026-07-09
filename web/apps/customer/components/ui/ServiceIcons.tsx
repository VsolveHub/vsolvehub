import { FlaticonIcon } from "./FlaticonIcon";
import { SERVICE_ICON_MAP, type ServiceIconName } from "@/lib/icons/flaticon-map";
import {
  ICON_SKETCH,
  resolveSketchIllustration,
  type SketchResolveInput,
} from "@/lib/catalog/service-sketch-illustrations";

export type IconName = ServiceIconName;

export const ICON_MAP = SERVICE_ICON_MAP;

// Re-export for sketch resolver consumers
export { ICON_SKETCH };

type ServiceIconProps = SketchResolveInput & {
  name: IconName;
  size?: number;
  color?: string;
  className?: string;
  alt?: string;
};

export function ServiceIcon({
  name,
  size = 24,
  color = "currentColor",
  className,
  alt,
  slug,
  subCategorySlug,
  categorySlug,
  serviceName,
}: ServiceIconProps) {
  const hasServiceContext = !!(slug || subCategorySlug || serviceName || categorySlug);
  const iconMapsToSketch = name in ICON_SKETCH;

  if (hasServiceContext || iconMapsToSketch) {
    const sketchSrc = resolveSketchIllustration({
      icon: name,
      slug,
      subCategorySlug,
      categorySlug,
      serviceName,
    });

    return (
      <img
        src={sketchSrc}
        alt={alt ?? serviceName ?? String(name)}
        width={size}
        height={size}
        className={`service-sketch service-sketch--icon${className ? ` ${className}` : ""}`}
        style={{ borderRadius: "inherit", objectFit: "cover" }}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return <FlaticonIcon name={name} size={size} color={color} className={className} />;
}

/** Vector icon fallback for UI chrome (nav, trust badges, hero orbit). */
export function ServiceVectorIcon({
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

import Image, { type ImageProps } from "next/image";

import { isOptimizableImage } from "@/lib/remote-images";

/**
 * `next/image` for artwork whose URL comes from the API.
 *
 * The catalogue's own art was 400–1376 px JPEGs and PNGs drawn at 50–120 px:
 * 7 MB for one visit to home and the catalogue, about 35 seconds on a slow 4G
 * phone. Through the optimizer each one arrives at the width it is drawn, as
 * AVIF or WebP — a few KB.
 *
 * A URL on a host the optimizer does not know (ops can paste any image URL)
 * renders unoptimized rather than as the broken image `/_next/image` would
 * return for it.
 *
 * Deliberately no fade-in. Hiding an image until React reports it loaded
 * means a phone still downloading JavaScript shows an empty tile for an image
 * it already has.
 */
export function RemoteImage({ src, alt, ...props }: Omit<ImageProps, "src"> & { src: string }) {
  return <Image src={src} alt={alt} unoptimized={!isOptimizableImage(src)} {...props} />;
}

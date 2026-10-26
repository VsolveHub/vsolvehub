"use client";

import { useState } from "react";
import { cn } from "./cn";

export interface ProgressiveImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
}

export function ProgressiveImage({
  src,
  alt,
  className,
  containerClassName,
  ...props
}: ProgressiveImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  return (
    <span
      className={cn(
        "relative block overflow-hidden bg-surface-sunken",
        containerClassName,
      )}
    >
      {/* Background placeholder shimmer while image loads */}
      {!isLoaded && !hasError && (
        <span
          aria-hidden
          className="absolute inset-0 block bg-surface-sunken before:absolute before:inset-0 before:-translate-x-full before:animate-[skeleton-shimmer_1.75s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/50 before:to-transparent"
        />
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
        className={cn(
          "transition-all duration-500 ease-out",
          isLoaded ? "opacity-100 blur-0 scale-100" : "opacity-0 blur-xs scale-[1.02]",
          className,
        )}
        {...props}
      />
    </span>
  );
}

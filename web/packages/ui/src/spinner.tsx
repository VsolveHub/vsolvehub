import { cn } from "./cn";

/**
 * Indeterminate progress indicator.
 *
 * Draws in `currentColor` so it inherits whatever it sits inside — an orange
 * primary button gets ink, a navy button gets white — instead of hardcoding a
 * brand hue that fails on half the surfaces it lands on.
 *
 * Purely decorative: it is `aria-hidden`, and the surrounding control owns the
 * announcement via `aria-busy` and a live label. A spinner alone tells a screen
 * reader nothing.
 */

type SpinnerSize = "sm" | "md" | "lg";

const sizes: Record<SpinnerSize, string> = {
  sm: "h-4 w-4 border-2",
  md: "h-5 w-5 border-2",
  lg: "h-8 w-8 border-[3px]",
};

export function Spinner({
  size = "sm",
  className,
}: {
  size?: SpinnerSize;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block shrink-0 animate-spin rounded-full",
        // A transparent top edge on an otherwise solid ring reads as rotation
        // without needing an SVG or a keyframe of its own.
        "border-current border-t-transparent",
        // Reduced motion is honoured globally in tokens.css, which slows the
        // animation to a stop. The ring still renders, so "busy" stays visible.
        sizes[size],
        className,
      )}
    />
  );
}

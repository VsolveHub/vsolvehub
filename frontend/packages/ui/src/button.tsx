import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "./cn";
import { Spinner } from "./spinner";

/**
 * The system's action control.
 *
 * `primary` is an orange fill with near-black text. That inversion of the
 * conventional white-on-orange is forced by the brand: the logo orange measures
 * 2.9:1 against white and 6.5:1 against navy ink, so white would fail WCAG on
 * the product's most important control. See the contrast note in tokens.css.
 *
 * Hover brightens and press darkens — the reverse of the usual convention.
 * With dark text on an orange fill, darkening reduces contrast, so the states
 * have to run the other way. It also reads like a physical control lighting up
 * and being pressed in, which suits the direction.
 *
 * One primary action per stage (plan 03). If a screen appears to need two equal
 * primary buttons, one of them is not primary.
 */

type Variant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  /** @deprecated Orange is now `primary`. Retained so existing call sites keep working. */
  | "accent";

type Size = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: Variant;
  size?: Size;
  /**
   * Shows a spinner, blocks activation and marks the control busy. The label
   * stays mounted so the button cannot change width when a mutation starts.
   */
  loading?: boolean;
  /**
   * Announced while loading. Say what is happening — "Confirming payment",
   * not "Loading".
   */
  loadingLabel?: string;
  /** Leading icon. Decorative; the label carries the meaning. */
  icon?: ReactNode;
  /** Fills its container, for the mobile sticky action bar. */
  block?: boolean;
  children: ReactNode;
}

const PRIMARY = cn(
  "bg-action text-action-text shadow-sm",
  "hover:bg-action-hover hover:shadow-md active:bg-action-active active:scale-[0.98] motion-reduce:transform-none",
  "disabled:bg-warm-200 disabled:text-warm-600 disabled:shadow-none disabled:active:scale-100",
);

const variants: Record<Variant, string> = {
  primary: PRIMARY,
  accent: PRIMARY,
  secondary: cn(
    "bg-action-secondary text-action-secondary-text shadow-sm",
    "hover:bg-action-secondary-hover hover:shadow-md active:bg-navy-900 active:scale-[0.98] motion-reduce:transform-none",
    "disabled:bg-warm-200 disabled:text-warm-600 disabled:shadow-none disabled:active:scale-100",
  ),
  outline: cn(
    "border border-line-strong bg-surface text-text shadow-2xs",
    "hover:border-navy-700 hover:bg-surface-hover active:bg-surface-sunken active:scale-[0.98] motion-reduce:transform-none",
    "disabled:border-line disabled:bg-surface disabled:text-warm-500 disabled:shadow-none disabled:active:scale-100",
  ),
  ghost: cn(
    "text-text-link",
    "hover:bg-selected-surface hover:text-navy-900 active:bg-navy-100 active:scale-[0.98] motion-reduce:transform-none",
    "disabled:text-warm-500 disabled:active:scale-100",
  ),
  danger: cn(
    "bg-danger-text text-text-inverse shadow-sm",
    "hover:bg-[#8f1e17] hover:shadow-md active:bg-[#7a1a14] active:scale-[0.98] motion-reduce:transform-none",
    "disabled:bg-warm-200 disabled:text-warm-600 disabled:shadow-none disabled:active:scale-100",
  ),
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-xs font-semibold tracking-wide",
  md: "h-11 px-5 text-sm font-semibold tracking-tight",
  lg: "h-12 px-7 text-base font-bold tracking-tight",
};

export function buttonStyles({
  variant = "primary",
  size = "md",
  block = false,
  className,
}: {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  className?: string;
} = {}): string {
  return cn(
    "relative inline-flex items-center justify-center rounded-control font-semibold select-none",
    "transition-all duration-fast ease-out",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
    variants[variant],
    sizes[size],
    block && "w-full",
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  loadingLabel,
  icon,
  block = false,
  className,
  disabled,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  const isBlocked = disabled === true || loading;

  return (
    <button
      // Defaulting to "button" prevents the classic bug where a control inside a
      // form submits it by accident.
      type={type}
      disabled={isBlocked}
      aria-busy={loading || undefined}
      className={cn(
        "relative inline-flex items-center justify-center rounded-control font-semibold",
        "transition-colors duration-fast ease-out",
        // Disabled keeps explicit colours rather than a blanket opacity drop,
        // which is the usual shortcut and pushes label contrast below the floor.
        "disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        block && "w-full",
        className,
      )}
      {...props}
    >
      {loading ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size={size === "lg" ? "md" : "sm"} />
          <span className="sr-only">{loadingLabel ?? "Working"}</span>
        </span>
      ) : null}

      <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>
        {icon ? (
          <span aria-hidden className="inline-flex shrink-0">
            {icon}
          </span>
        ) : null}
        {children}
      </span>
    </button>
  );
}

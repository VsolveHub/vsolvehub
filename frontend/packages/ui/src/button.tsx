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
  "bg-action text-action-text",
  "hover:bg-action-hover active:bg-action-active",
  "disabled:bg-warm-200 disabled:text-warm-600",
);

const variants: Record<Variant, string> = {
  primary: PRIMARY,
  accent: PRIMARY,
  secondary: cn(
    "bg-action-secondary text-action-secondary-text",
    "hover:bg-action-secondary-hover active:bg-navy-900",
    "disabled:bg-warm-200 disabled:text-warm-600",
  ),
  outline: cn(
    "border border-line-strong bg-surface text-text",
    "hover:bg-surface-hover active:bg-surface-sunken",
    "disabled:border-line disabled:bg-surface disabled:text-warm-500",
  ),
  ghost: cn(
    "text-text-link",
    "hover:bg-selected-surface active:bg-navy-100",
    "disabled:text-warm-500",
  ),
  // Destructive actions get a dedicated fill so they are never one careless
  // prop away from looking like the primary action.
  danger: cn(
    "bg-danger-text text-text-inverse",
    "hover:bg-[#8f1e17] active:bg-[#7a1a14]",
    "disabled:bg-warm-200 disabled:text-warm-600",
  ),
};

/**
 * `md` and `lg` clear the 44px minimum touch target (plan 03). `sm` is 36px and
 * exists only for dense Operations tables on pointer devices — never for a
 * customer or partner action on a phone.
 */
const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-7 text-base",
};

/**
 * The button's visual styles, without the button.
 *
 * Navigation is a link, not a button — a `<button>` that routes breaks
 * middle-click, "open in new tab" and the browser's own affordances. So when
 * something looks like a button but goes somewhere, use a real anchor and take
 * the styling from here:
 *
 * ```tsx
 * <Link href="/book/x" className={buttonStyles({ size: "lg" })}>Book now</Link>
 * ```
 *
 * Exported rather than wrapped in a `ButtonLink` so this package stays free of
 * any router dependency.
 */
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
    "relative inline-flex items-center justify-center rounded-control font-semibold",
    "transition-colors duration-fast ease-out",
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

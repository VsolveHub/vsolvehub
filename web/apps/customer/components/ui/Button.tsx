import { ButtonHTMLAttributes, forwardRef } from "react";
import { Spinner } from "@/components/ui/Spinner";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
  size?: "default" | "sm";
  block?: boolean;
  loading?: boolean;
};

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2";

const VARIANTS = {
  primary: "bg-[var(--color-brand)] text-white hover:bg-blue-900",
  secondary:
    "border border-gray-200 bg-white text-gray-900 hover:bg-gray-50",
};

const SIZES = {
  default: "px-4 py-2.5 text-sm",
  sm: "px-3 py-1.5 text-[13px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "default",
      block = false,
      loading = false,
      className = "",
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const classes = [
      BASE,
      VARIANTS[variant],
      SIZES[size],
      block ? "w-full" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button ref={ref} className={classes} disabled={disabled || loading} {...props}>
        {loading ? (
          <span className="inline-flex items-center gap-1.5">
            <Spinner size="sm" />
            <span>{children}</span>
          </span>
        ) : (
          children
        )}
      </button>
    );
  }
);
Button.displayName = "Button";

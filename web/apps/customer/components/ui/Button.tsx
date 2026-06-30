import { ButtonHTMLAttributes, forwardRef } from "react";
import { Spinner } from "@/components/ui/Spinner";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
  size?: "default" | "sm";
  block?: boolean;
  loading?: boolean;
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
      "btn",
      variant === "primary" ? "btn-primary" : "btn-secondary",
      size === "sm" ? "btn-sm" : "",
      block ? "btn-block" : "",
      loading ? "btn-loading" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button ref={ref} className={classes} disabled={disabled || loading} {...props}>
        {loading ? (
          <span className="btn-inner">
            <Spinner size="sm" className="btn-spinner" />
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

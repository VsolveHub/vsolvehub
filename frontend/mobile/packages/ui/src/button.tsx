// Ported from frontend/packages/ui/src/button.tsx
import type { ReactNode } from "react";
import { Pressable, View, type PressableProps } from "react-native";

import { cn } from "./cn";
import { Spinner } from "./spinner";
import { Text } from "./text";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "accent";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<PressableProps, "children" | "disabled"> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  loadingLabel?: string;
  icon?: ReactNode;
  block?: boolean;
  disabled?: boolean;
  className?: string;
  /** Web call sites use onClick. Mapped to press. */
  onClick?: () => void;
  children: ReactNode;
}

const PRIMARY = cn(
  "bg-action",
  "active:bg-action-active",
  "disabled:bg-warm-200",
);

const variants: Record<Variant, string> = {
  primary: PRIMARY,
  accent: PRIMARY,
  secondary: "bg-action-secondary active:bg-navy-900 disabled:bg-warm-200",
  outline: "border border-line-strong bg-surface active:bg-surface-sunken disabled:border-line",
  ghost: "active:bg-navy-100",
  danger: "bg-danger-text active:bg-[#7a1a14] disabled:bg-warm-200",
};

const labelTone: Record<Variant, string> = {
  primary: "text-action-text",
  accent: "text-action-text",
  secondary: "text-action-secondary-text",
  outline: "text-text",
  ghost: "text-text-link",
  danger: "text-text-inverse",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5",
  md: "h-11 px-5",
  lg: "h-12 px-7",
};

const labelSize: Record<Size, string> = {
  sm: "text-xs font-semibold",
  md: "text-sm font-semibold",
  lg: "text-base font-bold",
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
    "relative flex-row items-center justify-center rounded-control",
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
  onClick,
  onPress,
  children,
  ...props
}: ButtonProps) {
  const isBlocked = disabled === true || loading;
  const ink = isBlocked ? "text-warm-600" : labelTone[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isBlocked, busy: loading }}
      accessibilityLabel={loading ? (loadingLabel ?? "Working") : undefined}
      disabled={isBlocked}
      hitSlop={props.hitSlop ?? (size === "sm" ? { top: 8, bottom: 8, left: 6, right: 6 } : undefined)}
      onPress={onPress ?? onClick}
      className={cn(buttonStyles({ variant, size, block }), className)}
      {...props}
    >
      {loading ? (
        <View className="absolute inset-0 items-center justify-center">
          <Spinner size={size === "lg" ? "md" : "sm"} color={variant === "secondary" || variant === "danger" ? "#ffffff" : "#00112e"} />
        </View>
      ) : null}
      <View className={cn("flex-row items-center gap-2", loading && "opacity-0")}>
        {icon}
        <Text className={cn(labelSize[size], ink)}>{children}</Text>
      </View>
    </Pressable>
  );
}

type SpinnerProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
};

export function Spinner({ size = "md", className = "", label = "Loading" }: SpinnerProps) {
  const sizeClasses = {
    sm: "w-4 h-4 border-2",
    md: "w-8 h-8 border-3",
    lg: "w-12 h-12 border-4",
  };

  return (
    <span
      className={`inline-block rounded-full border-gray-200 border-t-[var(--color-brand)] animate-spin ${sizeClasses[size]} ${className}`.trim()}
      role="status"
      aria-label={label}
      aria-live="polite"
    />
  );
}

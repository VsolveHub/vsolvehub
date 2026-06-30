type SpinnerProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
};

export function Spinner({ size = "md", className = "", label = "Loading" }: SpinnerProps) {
  return (
    <span
      className={`spinner spinner-${size} ${className}`.trim()}
      role="status"
      aria-label={label}
      aria-live="polite"
    />
  );
}

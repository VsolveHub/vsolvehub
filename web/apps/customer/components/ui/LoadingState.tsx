import { Spinner } from "@/components/ui/Spinner";

type LoadingStateProps = {
  label?: string;
  variant?: "page" | "inline" | "partner" | "compact";
  className?: string;
};

export function LoadingState({
  label = "Loading…",
  variant = "page",
  className = "",
}: LoadingStateProps) {
  return (
    <div className={`loading-state loading-state-${variant} ${className}`.trim()}>
      <Spinner size={variant === "compact" ? "sm" : "md"} />
      {label ? <p className="loading-state-label">{label}</p> : null}
    </div>
  );
}

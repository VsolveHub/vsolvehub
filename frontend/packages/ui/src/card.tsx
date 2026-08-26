import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

/**
 * Card padding, as a prop rather than as a className override.
 *
 * `cn` is clsx, not tailwind-merge, so conflicting utilities are BOTH emitted and
 * the cascade — not the call site — picks the winner. `<Card className="p-4">`
 * therefore produces `p-6 p-4`, and Tailwind orders spacing ascending, so `p-6`
 * wins and the caller silently gets 24px. Every call site that has tried to tighten
 * a card has been quietly ignored; `onsite-screen.tsx` asks for `p-4` and renders
 * `p-6` today.
 *
 * A prop cannot be overridden by the cascade, so this is the one way to say it and
 * be obeyed. `lg` stays the default so no existing card moves.
 */
type CardPadding = "none" | "sm" | "md" | "lg";

const cardPaddings: Record<CardPadding, string> = {
  none: "",
  sm: "p-3.5",
  md: "p-4",
  lg: "p-6",
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
}

export function Card({ className, padding = "lg", ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-line bg-surface shadow-card transition-shadow duration-fast",
        cardPaddings[padding],
        className,
      )}
      {...props}
    />
  );
}

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  trend?: ReactNode;
}

export function StatCard({ label, value, icon, trend }: StatCardProps) {
  return (
    <Card className="p-5 flex flex-col justify-between">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-text-muted">{label}</p>
        {icon ? (
          <div className="flex size-9 items-center justify-center rounded-control bg-navy-50 text-navy-700 shrink-0">
            {icon}
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <p className="text-2xl font-extrabold tracking-tight text-text">{value}</p>
        {trend ? <div className="text-xs font-semibold">{trend}</div> : null}
      </div>
    </Card>
  );
}

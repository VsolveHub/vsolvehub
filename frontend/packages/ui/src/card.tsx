import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-card transition-shadow duration-fast",
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

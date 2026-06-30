import { cn } from "./cn";

interface StepperProps {
  steps: { id: string; title: string }[];
  current: number; // 0-based index
}

export function Stepper({ steps, current }: StepperProps) {
  return (
    <ol className="flex items-center gap-2">
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={step.id} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                done && "bg-brand-600 text-white",
                active && "bg-brand-600 text-white ring-4 ring-brand-100",
                !done && !active && "bg-gray-100 text-gray-500",
              )}
            >
              {done ? "✓" : i + 1}
            </span>
            <span
              className={cn(
                "hidden text-sm font-medium sm:inline",
                active ? "text-ink-900" : "text-gray-500",
              )}
            >
              {step.title}
            </span>
            {i < steps.length - 1 ? (
              <span className={cn("h-px flex-1", done ? "bg-brand-600" : "bg-border")} />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

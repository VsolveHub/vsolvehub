import { cn } from "./cn";

/**
 * Progress through a multi-stage flow.
 *
 * ## What the markup has to carry
 *
 * The step titles are hidden below `sm` for space. `hidden` removes them from
 * the accessibility tree as well as from the screen, so on a phone a screen
 * reader would otherwise hear "1 2 3 4" — the exact device the customer needs
 * most is where it says least. Every title is therefore also rendered
 * visually-hidden, and each step states its own position and state in words.
 *
 * `aria-current="step"` is what lets assistive technology jump to the active
 * stage. Without it the list is decoration.
 *
 * The tick is `aria-hidden`: left visible it is announced as "check mark",
 * which is a shape, not a status.
 */

interface StepperProps {
  steps: { id: string; title: string }[];
  /** 0-based index of the stage the customer is on. */
  current: number;
  /** Names the progress list. Override when a page has more than one. */
  label?: string;
}

export function Stepper({ steps, current, label = "Progress" }: StepperProps) {
  return (
    <ol aria-label={label} className="flex list-none items-center gap-2 p-0">
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;

        return (
          <li
            key={step.id}
            aria-current={active ? "step" : undefined}
            className="flex flex-1 items-center gap-2"
          >
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                // Semantic roles rather than raw palette steps: the active
                // marker is the same navy the rest of the system uses for
                // structure, and its ring is the focus-adjacent tint.
                done && "bg-action-secondary text-action-secondary-text",
                active &&
                  "bg-action-secondary text-action-secondary-text ring-4 ring-selected-surface",
                !done && !active && "bg-surface-sunken text-text-secondary",
              )}
            >
              <span aria-hidden>{done ? "✓" : index + 1}</span>
            </span>

            {/* Visible from `sm` up; always present for assistive technology. */}
            <span
              className={cn(
                "hidden text-sm font-medium sm:inline",
                active ? "text-text" : "text-text-secondary",
              )}
              aria-hidden
            >
              {step.title}
            </span>
            <span className="sr-only">
              {`Step ${index + 1} of ${steps.length}: ${step.title}`}
              {done ? ", completed" : active ? ", current step" : ""}
            </span>

            {index < steps.length - 1 ? (
              <span
                aria-hidden
                className={cn("h-px flex-1", done ? "bg-action-secondary" : "bg-line")}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

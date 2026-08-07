import type { ServiceDetail } from "../queries";

/**
 * How the visit actually runs, in order.
 *
 * Separate from `PolicyList` because these answer a different question. Inclusions say what the
 * price covers; these say what will happen to you and when you get to decide. The step that
 * earns the component is the quote gate — a customer who does not know a price is agreed before
 * work starts assumes the opposite, and that assumption is the one that turns into a dispute.
 *
 * Numbered from the server's `display_order`, not from array position. Switching one step off
 * would otherwise silently renumber the rest, and these numbers get quoted back to us.
 *
 * An ordered list rather than styled divs, so the sequence is announced as a sequence rather
 * than left to the visual numbering to imply.
 */
export function ProcessSteps({ steps }: { steps: ServiceDetail["policies"] }) {
  const ordered = [...steps].sort((left, right) => left.display_order - right.display_order);

  if (ordered.length === 0) return null;

  return (
    <ol className="mt-4 space-y-4">
      {ordered.map((step, index) => (
        <li key={step.id} className="flex gap-3">
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-signal-50 text-sm font-bold text-signal-700"
          >
            {index + 1}
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            {step.title ? <p className="font-semibold text-text">{step.title}</p> : null}
            <p className="mt-0.5 text-sm text-text-secondary">{step.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

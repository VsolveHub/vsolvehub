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

  // A vertical timeline at every width: five centred circles stacked down a phone screen
  // took a full screen of scrolling for five sentences.
  return (
    <ol className="mt-5">
      {ordered.map((step, index) => {
        const last = index === ordered.length - 1;
        return (
          <li key={step.id} className="relative flex gap-4 pb-6 last:pb-0">
            {last ? null : (
              <span aria-hidden className="absolute left-[0.9375rem] top-9 bottom-1 w-px bg-line" />
            )}
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-white text-[0.85rem] font-bold text-navy-900"
            >
              {index + 1}
            </span>
            <div className="min-w-0 pt-1">
              {step.title ? (
                <h3 className="text-[0.95rem] font-semibold text-navy-900">{step.title}</h3>
              ) : null}
              <p className="mt-1 text-[0.9rem] leading-relaxed text-text-secondary">{step.text}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

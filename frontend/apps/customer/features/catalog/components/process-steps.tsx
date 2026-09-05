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
    <div className="mt-8 flex flex-col md:flex-row gap-8 md:gap-4 justify-center items-start relative max-w-4xl mx-auto">
      {/* Optional connecting line for desktop */}
      {ordered.length > 1 && (
        <div className="hidden md:block absolute top-6 left-[15%] right-[15%] h-[1px] bg-line/60 -z-10" />
      )}
      
      {ordered.map((step, index) => (
        <div key={step.id} className="flex-1 flex flex-col items-center text-center relative z-10 w-full">
          <span
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-action text-[1.1rem] font-bold text-white shadow-sm mb-5"
          >
            {index + 1}
          </span>
          {step.title ? <h3 className="font-medium text-navy-900 mb-2.5">{step.title}</h3> : null}
          <p className="text-[0.875rem] leading-relaxed text-text-secondary max-w-[16rem]">
            {step.text}
          </p>
        </div>
      ))}
    </div>
  );
}

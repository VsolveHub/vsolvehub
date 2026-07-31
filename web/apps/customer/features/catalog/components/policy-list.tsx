import type { ServiceDetail } from "../queries";

/**
 * What is and is not covered.
 *
 * Grouped by kind rather than rendered as one list, because "we replace the
 * socket" and "we do not rewire the circuit" answer different questions, and
 * mixing them is how a customer books work that was never included.
 *
 * Each group carries an icon as well as a colour, so the included/excluded
 * distinction survives greyscale and colour-blindness (plan 03: never state by
 * colour alone).
 */

const GROUPS = [
  { kind: "INCLUDED", heading: "What's included", tone: "text-success-text" },
  { kind: "EXCLUDED", heading: "Not included", tone: "text-danger-text" },
  { kind: "GOOD_TO_KNOW", heading: "Good to know", tone: "text-text-secondary" },
] as const;

function Mark({ kind }: { kind: (typeof GROUPS)[number]["kind"] }) {
  const shared = {
    viewBox: "0 0 16 16",
    fill: "currentColor",
    className: "mt-0.5 h-4 w-4 shrink-0",
    "aria-hidden": true as const,
  };

  if (kind === "INCLUDED") {
    return (
      <svg {...shared}>
        <path d="M13.3 4.3a1 1 0 010 1.4l-6 6a1 1 0 01-1.4 0l-3-3a1 1 0 011.4-1.4L6.6 9.6l5.3-5.3a1 1 0 011.4 0z" />
      </svg>
    );
  }
  if (kind === "EXCLUDED") {
    return (
      <svg {...shared}>
        <path d="M4.3 4.3a1 1 0 011.4 0L8 6.6l2.3-2.3a1 1 0 111.4 1.4L9.4 8l2.3 2.3a1 1 0 01-1.4 1.4L8 9.4l-2.3 2.3a1 1 0 01-1.4-1.4L6.6 8 4.3 5.7a1 1 0 010-1.4z" />
      </svg>
    );
  }
  return (
    <svg {...shared}>
      <path
        fillRule="evenodd"
        d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 4a.9.9 0 110 1.8A.9.9 0 018 4zm0 3.2a.75.75 0 01.75.75v3.3a.75.75 0 01-1.5 0v-3.3A.75.75 0 018 7.2z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function PolicyList({ policies }: { policies: ServiceDetail["policies"] }) {
  const groups = GROUPS.map((group) => ({
    ...group,
    items: policies.filter((policy) => policy.kind === group.kind),
  })).filter((group) => group.items.length > 0);

  if (groups.length === 0) return null;

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {groups.map((group) => (
        <div key={group.kind}>
          <h2 className="text-sm font-bold uppercase tracking-[0.08em] text-text-secondary">
            {group.heading}
          </h2>
          <ul className="mt-3 space-y-2">
            {group.items.map((policy) => (
              <li key={policy.id} className="flex gap-2 text-sm text-text">
                <span className={group.tone}>
                  <Mark kind={group.kind} />
                </span>
                {policy.text}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

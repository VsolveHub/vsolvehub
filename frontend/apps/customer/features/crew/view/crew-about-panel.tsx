import type { RequirementService } from "@/features/requirement/adapters";

/**
 * What a day of this service is — included, not included, good to know.
 *
 * This is the screen the flow opens on for a specific day-hire ("Electrician by
 * the day"): the customer picked the work by picking the service, so the first
 * thing they read is what the day covers, not a question they already answered.
 * Everything here is the catalogue's own `ServicePolicy` rows — the seed authors
 * them per service, and this panel renders whatever is published, so an empty
 * catalogue renders nothing rather than inventing promises.
 */

export function hasAboutContent(service: RequirementService): boolean {
  return service.policies.some((policy) => policy.kind !== "PROCESS");
}

function lines(service: RequirementService, kind: string): string[] {
  return service.policies
    .filter((policy) => policy.kind === kind)
    .sort((a, b) => a.display_order - b.display_order)
    .map((policy) => policy.text);
}

function PolicyLines({
  title,
  items,
  mark,
}: {
  title: string;
  items: string[];
  mark: "check" | "cross";
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-text-muted">{title}</h3>
      <ul className="mt-2 flex list-none flex-col gap-1.5 p-0">
        {items.map((text) => (
          <li key={text} className="flex items-start gap-2.5 text-sm leading-6 text-text-secondary">
            <span
              aria-hidden
              className={
                mark === "check"
                  ? "mt-1 grid size-4 shrink-0 place-items-center rounded-full bg-success-surface text-success-text"
                  : "mt-1 grid size-4 shrink-0 place-items-center rounded-full bg-surface-sunken text-text-muted"
              }
            >
              {mark === "check" ? (
                <svg viewBox="0 0 16 16" fill="none" className="size-2.5">
                  <path
                    d="m3.5 8.5 3 3 6-7"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" fill="none" className="size-2.5">
                  <path
                    d="m4.5 4.5 7 7m0-7-7 7"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </span>
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CrewAboutPanel({ service }: { service: RequirementService }) {
  const included = lines(service, "INCLUDED");
  const excluded = lines(service, "EXCLUDED");
  const goodToKnow = lines(service, "GOOD_TO_KNOW");
  if (included.length === 0 && excluded.length === 0 && goodToKnow.length === 0) return null;

  return (
    <section className="rounded-[20px] border border-line bg-surface p-5 shadow-sm sm:p-6">
      {service.short_description !== "" ? (
        <p className="mb-4 max-w-prose text-sm leading-6 text-text-secondary">
          {service.short_description}
        </p>
      ) : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <PolicyLines title="What's included" items={included} mark="check" />
        <PolicyLines title="What's not included" items={excluded} mark="cross" />
      </div>
      {goodToKnow.length > 0 ? (
        <p className="mt-4 border-t border-line/70 pt-3 text-sm leading-6 text-text-secondary">
          {goodToKnow.join(" ")}
        </p>
      ) : null}
    </section>
  );
}

import Link from "next/link";

type Props = {
  /** Small uppercase kicker above the title. */
  eyebrow?: string;
  title: string;
  /** Optional sub-line under the title. */
  description?: string;
  /** Optional "see all" style link on the right. */
  action?: { label: string; href: string };
  align?: "left" | "center";
  id?: string;
};

/**
 * One heading treatment for every home section so type hierarchy and spacing
 * stay consistent: an orange eyebrow, a black display title, and an optional
 * right-aligned action link.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  align = "left",
  id,
}: Props) {
  const centered = align === "center";

  return (
    <div
      className={`mb-6 flex flex-wrap items-end gap-x-6 gap-y-3 sm:mb-8 ${
        centered ? "flex-col items-center text-center" : "justify-between"
      }`}
    >
      <div className={centered ? "flex flex-col items-center" : "min-w-0"}>
        {eyebrow && (
          <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.2em] text-[var(--color-brand-accent)]">
            {eyebrow}
          </span>
        )}
        <h2
          id={id}
          className="text-2xl font-black tracking-tight text-gray-900 sm:text-[28px]"
        >
          {title}
        </h2>
        {description && (
          <p className="mt-2 max-w-xl text-sm font-medium leading-relaxed text-gray-500">
            {description}
          </p>
        )}
      </div>

      {action && (
        <Link
          href={action.href}
          className="group inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-brand-light)] px-4 py-2 text-sm font-bold text-[var(--color-brand)] transition-colors hover:bg-[var(--color-brand)] hover:text-white"
        >
          {action.label}
          <span className="transition-transform group-hover:translate-x-0.5">→</span>
        </Link>
      )}
    </div>
  );
}

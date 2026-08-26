import type { ReactNode } from "react";
import Link from "next/link";
import { Skeleton } from "@vsolve/ui";

/**
 * Presentational category tile for the Services browse surfaces.
 *
 * Layout and interaction styling only — href, copy and heading level are
 * supplied by the caller so home (h3) and catalog index (h2) keep their
 * document outline.
 */
export function CategoryCard({
  href,
  name,
  description,
  meta,
  titleAs: TitleTag = "h3",
  variant = "standard",
  className,
  children,
}: {
  href: string;
  name: string;
  description: string;
  meta?: string | null;
  titleAs?: "h2" | "h3";
  variant?: "standard" | "large" | "wide";
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`group relative flex flex-col overflow-hidden rounded-card p-5 transition-all duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action active:scale-[0.99] motion-reduce:transform-none ${
        variant === "large"
          ? "border border-transparent bg-navy-900 text-white shadow-xl hover:-translate-y-1 hover:shadow-2xl h-full min-h-[20rem]"
          : variant === "wide"
            ? "border border-transparent bg-[#FDF9F5] shadow-sm hover:-translate-y-0.5 hover:shadow-md min-h-[9rem] sm:min-h-[10rem]"
            : "border border-line bg-surface shadow-card hover:-translate-y-0.5 hover:border-navy-300 hover:shadow-raised min-h-[9rem] sm:min-h-[10rem]"
      } ${className || ""}`}
    >
      {children ? (
        children
      ) : (
        <>
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-1 bg-action opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
          />
          <div className="flex flex-1 flex-col pl-1">
            <div className="flex items-start justify-between gap-3">
              <TitleTag className={`text-balance text-base font-bold leading-snug sm:text-[1.05rem] transition-colors ${variant === "large" ? "text-white" : "text-navy-900 group-hover:text-navy-700"}`}>
                {name}
              </TitleTag>
              {variant === "large" ? (
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-action text-white shadow-sm transition-transform duration-300 group-hover:scale-110">
                  <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
                    <path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-surface-sunken text-text-muted transition-all duration-200 group-hover:translate-x-0.5 group-hover:bg-action-surface group-hover:text-navy-900 group-hover:scale-105 motion-reduce:transform-none"
                >
                  <svg viewBox="0 0 20 20" fill="none" className="size-3.5" aria-hidden="true">
                    <path
                      d="M4 10h11m-4-4 4 4-4 4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              )}
            </div>
            <p className={`mt-2 line-clamp-2 flex-1 text-sm leading-relaxed ${variant === "large" ? "text-white/80" : "text-text-secondary"}`}>
              {description}
            </p>
            {meta ? (
              <p className={`mt-3 border-t pt-2.5 text-xs font-medium leading-5 ${variant === "large" ? "border-white/20 text-white/90" : "border-line/70 text-text-muted"}`}>{meta}</p>
            ) : null}
          </div>
        </>
      )}
    </Link>
  );
}

export function CategoryGridShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${className || ""}`}>
      {children}
    </div>
  );
}

export function CategoryGridSkeletonTiles({ count = 8 }: { count?: number }) {
  return (
    <CategoryGridShell>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-[8.5rem] w-full sm:h-[9.5rem]" />
      ))}
    </CategoryGridShell>
  );
}

import type {
  ElementType,
  HTMLAttributes,
  ReactNode,
} from "react";

/* ------------------------------------------------------------------ *
 * Shared Tailwind primitives — the migrated replacements for the old
 * hand-written CSS classes (.card, .stack, .alert, .section-title …).
 * Keep every legacy visual intent, expressed as utilities.
 * ------------------------------------------------------------------ */

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/** Vertical flex stack with a spacing scale (was .stack / .stack-lg / .stack-xs). */
export function Stack({
  gap = "md",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { gap?: "xs" | "sm" | "md" | "lg" }) {
  const gaps = { xs: "gap-1.5", sm: "gap-3", md: "gap-4", lg: "gap-6" };
  return (
    <div className={cx("flex flex-col", gaps[gap], className)} {...props}>
      {children}
    </div>
  );
}

/** Row with space-between + vertical centering (was .flex-between). */
export function FlexBetween({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("flex items-center justify-between gap-2", className)} {...props}>
      {children}
    </div>
  );
}

/** Surface card (was .card). */
export function Card({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** Card heading (was .card-title). */
export function CardTitle({
  as: Tag = "h3",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & { as?: ElementType }) {
  return (
    <Tag className={cx("mb-1 text-[15px] font-semibold text-gray-900", className)} {...props}>
      {children}
    </Tag>
  );
}

/** Section heading inside a page/card (was .section-title). */
export function SectionTitle({
  as: Tag = "h2",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & { as?: ElementType }) {
  return (
    <Tag className={cx("mb-4 text-lg font-semibold text-gray-900", className)} {...props}>
      {children}
    </Tag>
  );
}

/** Muted body text (was .text-muted). */
export function Muted({
  as: Tag = "p",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & { as?: ElementType }) {
  return (
    <Tag className={cx("text-gray-500", className)} {...props}>
      {children}
    </Tag>
  );
}

/** Page title + optional subtitle block (was .page-title / .page-subtitle). */
export function PageHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("mb-5 flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-gray-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Centered max-width page container (was .page-content). */
export function PageContainer({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("mx-auto w-full max-w-[1280px] p-4", className)} {...props}>
      {children}
    </div>
  );
}

const ALERT_VARIANTS = {
  info: "bg-[var(--color-brand-light)] text-[var(--color-brand-dark)]",
  error: "bg-red-50 text-[var(--color-danger)]",
  success: "bg-green-50 text-green-700",
  warning: "bg-amber-50 text-amber-700",
} as const;

/** Inline message banner (was .alert / .alert-error / .alert-info …). */
export function Alert({
  variant = "info",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: keyof typeof ALERT_VARIANTS }) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cx("rounded-xl px-4 py-3 text-sm", ALERT_VARIANTS[variant], className)}
      {...props}
    >
      {children}
    </div>
  );
}

/** Empty / zero-data state (was .empty-state). */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("px-4 py-10 text-center text-gray-500", className)}>
      {icon && <div className="mb-3 text-4xl opacity-70">{icon}</div>}
      {title && <p className="mb-1 font-semibold text-gray-900">{title}</p>}
      {description && <p className="mx-auto mb-4 max-w-sm text-sm">{description}</p>}
      {action}
    </div>
  );
}

/** Shimmer skeleton block (was .skeleton / .skeleton-line / .skeleton-card). */
export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("skeleton rounded-lg", className)} {...props} />;
}

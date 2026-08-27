import type { ReactNode } from "react";

export interface PageHeaderProps {
  /**
   * Optional breadcrumb navigation rendered above the title.
   * Expects a list of links or a Breadcrumb primitive.
   */
  breadcrumbs?: ReactNode;
  
  /**
   * The main H1 title for the page.
   */
  title: ReactNode;
  
  /**
   * An optional description rendered below the title.
   * Replaces the inconsistent `mt-1`/`mt-2` paragraph tags across routes.
   */
  description?: ReactNode;
  
  /**
   * Optional actions (like Primary/Secondary buttons) rendered on the right side
   * of the header on desktop, or stacked on mobile.
   */
  actions?: ReactNode;
}

/**
 * A standardized page header for Operations console routes.
 *
 * Replaces the hand-rolled `<h1>` and `<p>` pairs across the 20 routes to enforce
 * a single vertical rhythm and consistent responsive wrapping for action buttons.
 */
export function PageHeader({ breadcrumbs, title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1.5">
        {breadcrumbs && (
          <div className="text-sm text-text-secondary mb-1">
            {breadcrumbs}
          </div>
        )}
        <h1 className="text-2xl font-bold text-text tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-text-secondary max-w-2xl">{description}</p>
        )}
      </div>
      
      {actions && (
        <div className="flex shrink-0 items-center gap-3">
          {actions}
        </div>
      )}
    </div>
  );
}

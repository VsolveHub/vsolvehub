import type { ReactNode } from "react";

type FlowPageShellProps = {
  children: ReactNode;
  header?: ReactNode;
  stepper?: ReactNode;
  aside?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

/** Responsive shell for booking / track / confirm flows — full width on mobile, card on tablet, split on desktop. */
export function FlowPageShell({
  children,
  header,
  stepper,
  aside,
  footer,
  className = "",
}: FlowPageShellProps) {
  return (
    <div className={`min-h-screen w-full bg-gradient-to-b from-slate-100 to-slate-200 ${className}`.trim()}>
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col bg-[#fafafa] shadow-sm lg:max-w-5xl">
        {header ? <div className="shrink-0">{header}</div> : null}
        {stepper ? <div className="shrink-0 px-4 pt-4">{stepper}</div> : null}
        <div className="flex flex-1 flex-col lg:flex-row">
          <div className="flex flex-1 flex-col p-4">{children}</div>
          {aside ? (
            <aside className="border-t border-gray-200 p-4 lg:w-[360px] lg:shrink-0 lg:border-l lg:border-t-0">
              {aside}
            </aside>
          ) : null}
        </div>
        {footer ? (
          <div className="sticky bottom-0 z-10 border-t border-gray-200 bg-white/90 p-4 backdrop-blur-md">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function FlowPageHeader({
  title,
  onBack,
  backLabel = "Back",
}: {
  title: string;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3 bg-gradient-to-br from-[var(--color-brand-dark)] to-[var(--color-brand)] px-4 py-4 text-white">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg transition-colors hover:bg-white/20"
        >
          ←
        </button>
      ) : (
        <span className="h-9 w-9" aria-hidden />
      )}
      <span className="text-base font-bold">{title}</span>
    </div>
  );
}

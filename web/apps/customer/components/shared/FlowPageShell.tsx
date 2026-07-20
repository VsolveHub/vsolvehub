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
    <div className={`flex min-h-screen w-full flex-col bg-slate-50 ${className}`.trim()}>
      {header ? <div className="w-full shrink-0">{header}</div> : null}
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 sm:px-6">
        {stepper ? <div className="pt-4">{stepper}</div> : null}
        <div className="flex flex-col gap-6 py-6 lg:flex-row lg:items-start">
          <main className="min-w-0 flex-1">{children}</main>
          {aside ? (
            <aside className="w-full lg:sticky lg:top-4 lg:w-[340px] lg:shrink-0">{aside}</aside>
          ) : null}
        </div>
      </div>
      {footer ? (
        <div className="sticky bottom-0 z-10 border-t border-gray-200 bg-white/90 backdrop-blur-md">
          <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6">{footer}</div>
        </div>
      ) : null}
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

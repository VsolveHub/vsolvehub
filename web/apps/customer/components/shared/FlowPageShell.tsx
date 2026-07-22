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
    <div className={`flex min-h-screen w-full flex-col bg-[#f8fafc] ${className}`.trim()}>
      {header ? <div className="w-full shrink-0">{header}</div> : null}
      <div className="mx-auto w-full max-w-[1240px] flex-1 px-4 sm:px-6 lg:px-8 pb-20">
        {stepper ? <div className="pt-3">{stepper}</div> : null}
        <div className="flex flex-col gap-6 lg:gap-8 py-5 sm:py-6 lg:flex-row lg:items-start">
          <main className="min-w-0 flex-1">{children}</main>
          {aside ? (
            <aside className="w-full lg:sticky lg:top-6 lg:w-[360px] xl:w-[380px] lg:shrink-0">{aside}</aside>
          ) : null}
        </div>
      </div>
      {footer ? (
        <div className="sticky bottom-0 z-10 border-t border-gray-200 bg-white/90 backdrop-blur-md">
          <div className="mx-auto w-full max-w-[1240px] px-4 py-4 sm:px-6 lg:px-8">{footer}</div>
        </div>
      ) : null}

      {/* Floating circular support/chat bubble icon fixed to bottom-left */}
      <div className="fixed bottom-6 left-6 z-40">
        <button
          type="button"
          aria-label="Support chat"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-700 border border-gray-200/80 shadow-md transition-all hover:scale-105 active:scale-95 hover:bg-gray-50"
        >
          <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
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

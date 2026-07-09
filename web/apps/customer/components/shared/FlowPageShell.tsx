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
    <div className={`flow-page-shell ${className}`.trim()}>
      <div className="flow-page-shell__inner">
        {header ? <div className="flow-page-shell__header">{header}</div> : null}
        {stepper ? <div className="flow-page-shell__stepper">{stepper}</div> : null}
        <div className="flow-page-shell__main">
          <div className="flow-page-shell__body">{children}</div>
          {aside ? <aside className="flow-page-shell__aside">{aside}</aside> : null}
        </div>
        {footer ? <div className="flow-page-shell__footer">{footer}</div> : null}
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
    <div className="flow-page-shell__topbar">
      {onBack ? (
        <button type="button" onClick={onBack} className="flow-page-shell__back" aria-label={backLabel}>
          ←
        </button>
      ) : (
        <span className="flow-page-shell__back-spacer" aria-hidden />
      )}
      <span className="flow-page-shell__title">{title}</span>
    </div>
  );
}

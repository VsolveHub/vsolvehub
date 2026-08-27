import type { ReactNode } from "react";

export interface TooltipProps {
  /** The element that triggers the tooltip on hover */
  children: ReactNode;
  /** The text or content of the tooltip */
  content: ReactNode;
  /** Position of the tooltip relative to the trigger */
  position?: "top" | "bottom" | "left" | "right";
}

/**
 * A simple CSS-only tooltip for icon-only controls.
 */
export function Tooltip({ children, content, position = "top" }: TooltipProps) {
  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <div className="relative inline-flex group">
      {children}
      <div
        role="tooltip"
        className={`
          absolute z-50 whitespace-nowrap px-2 py-1 text-xs font-medium
          text-white bg-slate-900 rounded shadow-sm
          opacity-0 invisible group-hover:opacity-100 group-hover:visible
          transition-all duration-200 pointer-events-none
          ${positionClasses[position]}
        `}
      >
        {content}
      </div>
    </div>
  );
}

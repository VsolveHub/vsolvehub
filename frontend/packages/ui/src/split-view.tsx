"use client";

import { type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "./button";
import { cn } from "./cn";

export interface SplitViewProps {
  /** The master list/sidebar content */
  listPane: ReactNode;
  /** The detail view content */
  detailPane: ReactNode | null;
  /** Whether the detail pane should be shown on mobile */
  showDetailOnMobile: boolean;
  /** Callback when the user clicks 'Back' on mobile */
  onBack: () => void;
  /** Optional title for the mobile back button header */
  mobileDetailTitle?: string;
  /** Tailwind width classes for the list pane on sm+ breakpoints */
  listPaneWidth?: string;
  className?: string;
}

/**
 * A master-detail split layout for data-dense workspaces.
 *
 * Desktop: Shows both panes side-by-side. The list pane width is configurable,
 * while the detail pane fills the remaining space. Both scroll independently.
 *
 * Mobile: Acts as a push-navigation stack. If `showDetailOnMobile` is false,
 * it shows the list. If true, it shows the detail pane with a back button.
 *
 * Height is delegated to the parent flex column (`h-full min-h-0`) rather than
 * guessing viewport math — each workspace owns its header; SplitView fills what
 * is left.
 */
export function SplitView({
  listPane,
  detailPane,
  showDetailOnMobile,
  onBack,
  mobileDetailTitle = "Back to list",
  listPaneWidth = "sm:w-80 lg:w-96",
  className,
}: SplitViewProps) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 -mx-4 overflow-hidden bg-canvas sm:mx-0 sm:bg-transparent",
        className,
      )}
    >
      {/* List Pane */}
      <div
        className={cn(
          "h-full w-full shrink-0 flex-col border-line bg-surface sm:border-r",
          listPaneWidth,
          showDetailOnMobile ? "hidden sm:flex" : "flex",
        )}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{listPane}</div>
      </div>

      {/* Detail Pane */}
      <div
        className={cn(
          "h-full flex-1 flex-col bg-surface sm:bg-transparent",
          showDetailOnMobile ? "flex" : "hidden sm:flex",
        )}
      >
        {/* Mobile push-nav header */}
        <div className="sticky top-0 z-10 flex shrink-0 items-center border-b border-line bg-surface p-3 sm:hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="-ml-2 flex items-center gap-1"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="font-semibold">{mobileDetailTitle}</span>
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-surface sm:ml-6 sm:rounded-card sm:border sm:border-line sm:p-6 sm:shadow-card">
          {detailPane}
        </div>
      </div>
    </div>
  );
}

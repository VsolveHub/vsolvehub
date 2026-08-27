"use client";

import { useEffect, useState } from "react";

export interface KeyboardHintProps {
  /** The key command, e.g., 'K' */
  commandKey: string;
  /** Whether it uses Ctrl or Meta (Command on Mac) */
  useMeta?: boolean;
}

/**
 * A small pill showing a keyboard shortcut.
 * Automatically displays ⌘ on Mac and Ctrl on Windows/Linux.
 */
export function KeyboardHint({ commandKey, useMeta = true }: KeyboardHintProps) {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsMac(navigator.platform.toUpperCase().indexOf("MAC") >= 0);
    }
  }, []);

  const metaSymbol = isMac ? "⌘" : "Ctrl";
  const displayKey = useMeta ? `${metaSymbol} ${commandKey}` : commandKey;

  return (
    <kbd className="inline-flex items-center justify-center rounded border border-line-strong bg-surface-sunken px-1.5 py-0.5 font-sans text-[10px] font-medium text-text-secondary h-5 min-w-[20px]">
      {displayKey}
    </kbd>
  );
}

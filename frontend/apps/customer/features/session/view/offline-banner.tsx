"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    // Check initial online status
    if (typeof window !== "undefined" && !navigator.onLine) {
      setIsOffline(true);
    }

    const handleOffline = () => {
      setIsOffline(true);
      setShowRestored(false);
    };

    const handleOnline = () => {
      setIsOffline(false);
      setShowRestored(true);
      const timer = setTimeout(() => {
        setShowRestored(false);
      }, 3500);
      return () => clearTimeout(timer);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  // Register service worker if supported
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Silently catch registration errors
      });
    }
  }, []);

  if (!isOffline && !showRestored) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none px-4 w-full max-w-sm transition-all duration-300"
    >
      {isOffline ? (
        <div className="flex items-center justify-center gap-2.5 rounded-full bg-navy-950/95 border border-line/40 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
          <WifiOff className="size-4 shrink-0 text-signal-400 animate-pulse" />
          <span>You are offline. Reconnecting...</span>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2.5 rounded-full bg-emerald-950/95 border border-emerald-500/40 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
          <Wifi className="size-4 shrink-0 text-emerald-400" />
          <span>Back online!</span>
        </div>
      )}
    </div>
  );
}

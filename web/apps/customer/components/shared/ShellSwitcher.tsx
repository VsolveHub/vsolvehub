"use client";

import { usePathname } from "next/navigation";
import { AppHeader, BottomNav } from "@/components/shared/AppShell";
import { AppFooter } from "@/components/shared/AppFooter";
import { AnimatePresence, motion } from "framer-motion";

/**
 * App chrome wrapper (header, bottom nav, footer) shared by every customer page.
 * Uses Framer Motion for smooth page-to-page transitions.
 */
export function ShellSwitcher({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col min-h-screen w-full bg-[#f1f5f9]" suppressHydrationWarning>
      <AppHeader />
      <AnimatePresence mode="wait">
        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="flex-1 w-full max-w-full m-0 pb-[88px]"
        >
          {children}
        </motion.main>
      </AnimatePresence>
      <BottomNav />
      <AppFooter />
    </div>
  );
}

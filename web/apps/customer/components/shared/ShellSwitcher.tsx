"use client";

import { usePathname } from "next/navigation";
import { AppHeader, BottomNav } from "@/components/shared/AppShell";
import { AppFooter } from "@/components/shared/AppFooter";
import { motion } from "framer-motion";

/**
 * App chrome wrapper (header, bottom nav, footer) shared by every customer page.
 *
 * Enter-only transition on purpose. An `AnimatePresence mode="wait"` here used to
 * hold the incoming page back until the outgoing one finished its exit animation,
 * which put a fixed ~600ms floor (300ms out + 300ms in) on every single
 * navigation before the new screen could even start painting. Keying `motion.main`
 * on the pathname still gives each page a fade-in, but the new content renders
 * immediately instead of queueing behind the old one.
 */
export function ShellSwitcher({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col min-h-screen w-full bg-[#f1f5f9]" suppressHydrationWarning>
      <AppHeader />
      <motion.main
        key={pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="flex-1 w-full max-w-full m-0 pb-[88px]"
      >
        {children}
      </motion.main>
      <BottomNav />
      <AppFooter />
    </div>
  );
}

import Link from "next/link";

export function SiteFooter({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const dark = variant === "dark";
  return (
    <footer className={dark ? "bg-ink-900 text-white/70" : "border-t border-border bg-white text-gray-500"}>
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-6 text-sm sm:flex-row">
        <span className={dark ? "font-bold text-accent-500" : "font-bold text-brand-600"}>
          V Solve Hub
        </span>
        <span>© {new Date().getFullYear()} V Solve Hub. All rights reserved.</span>
        <nav className="flex gap-5">
          <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
          <Link href="/terms" className="hover:underline">Terms of Service</Link>
          <Link href="/contact" className="hover:underline">Contact Us</Link>
        </nav>
      </div>
    </footer>
  );
}

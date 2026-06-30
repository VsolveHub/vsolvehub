import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** Dark navy top bar used across auth + onboarding (matches the Figma). */
export function BrandBar({ backHref }: { backHref?: string }) {
  return (
    <header className="bg-ink-800">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-5">
        {backHref ? (
          <Link href={backHref} className="text-white/80 hover:text-white" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        ) : null}
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="inline-block h-6 w-6 rounded-md bg-gradient-to-br from-brand-500 to-accent-500" />
          <span className="text-lg">
            <span className="text-accent-500">V Solve</span>{" "}
            <span className="text-white">Hub</span>
          </span>
        </Link>
      </div>
    </header>
  );
}

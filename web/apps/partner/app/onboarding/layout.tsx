import { BrandBar } from "@/components/brand-bar";
import { SiteFooter } from "@/components/site-footer";

export const metadata = { robots: { index: false } };

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-surface-muted">
      <BrandBar backHref="/" />
      <main className="flex flex-1 justify-center px-4 py-6 sm:px-5 sm:py-10">
        <div className="w-full max-w-2xl">{children}</div>
      </main>
      <SiteFooter variant="light" />
    </div>
  );
}

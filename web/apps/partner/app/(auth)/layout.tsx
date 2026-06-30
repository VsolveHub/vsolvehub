import { BrandBar } from "@/components/brand-bar";
import { SiteFooter } from "@/components/site-footer";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-surface-muted">
      <BrandBar backHref="/" />
      <main className="flex flex-1 items-center justify-center px-5 py-12">{children}</main>
      <SiteFooter variant="light" />
    </div>
  );
}

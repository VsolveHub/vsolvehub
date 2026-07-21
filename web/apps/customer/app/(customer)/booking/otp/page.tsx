import { OtpForm } from "@/components/customer/auth/OtpForm";
import { getServerSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<{ redirect?: string }>;
};

export default async function BookingOtpPage({ searchParams }: PageProps) {
  const session = await getServerSession();
  const { redirect: redirectTo } = await searchParams;

  if (session) {
    redirect(redirectTo ?? "/booking");
  }

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 sm:p-10 border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <h1 className="text-2xl font-black text-gray-900 mb-2">Customer sign in</h1>
        <p className="text-sm font-semibold text-gray-500 leading-relaxed mb-8">
          Sign in to book services, track bookings, and manage your profile. Demo OTP is <strong className="text-gray-900">1234</strong>.
        </p>
        
        <OtpForm redirectTo={redirectTo ?? "/booking"} />
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-4 text-xs font-bold text-gray-500 uppercase tracking-wider" aria-hidden>
        <span className="flex items-center gap-1.5"><span className="text-base">🔒</span> Secure OTP</span>
        <span className="flex items-center gap-1.5"><span className="text-[var(--color-brand)] text-sm">✓</span> Verified pros</span>
        <span className="flex items-center gap-1.5"><span className="text-yellow-500 text-sm">⚡</span> Instant booking</span>
      </div>
    </div>
  );
}

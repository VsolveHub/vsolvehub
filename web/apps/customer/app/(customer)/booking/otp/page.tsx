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
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="page-title">Customer sign in</h1>
        <p className="page-subtitle">
          Sign in to book services, track bookings, and manage your profile. Demo OTP is <strong>1234</strong>.
        </p>
        <OtpForm redirectTo={redirectTo ?? "/booking"} />
      </div>
    </div>
  );
}

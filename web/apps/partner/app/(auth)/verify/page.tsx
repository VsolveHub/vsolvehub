import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OtpForm } from "./otp-form";

export const metadata = { title: "Verify your number", robots: { index: false } };

export default async function VerifyPage() {
  const store = await cookies();
  const phone = store.get("otp_phone")?.value;
  if (!phone) redirect("/login");
  const devCode = store.get("otp_dev_code")?.value;
  const masked = phone.replace(/(\+91)(\d{2})\d{4}(\d{4})/, "$1 $2•••• $3");

  return (
    <div className="w-full max-w-md rounded-[var(--radius-card)] border border-border bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-ink-900">Verify your number</h1>
      <p className="mt-1 text-sm text-gray-500">
        Enter the 6-digit code sent to <span className="font-medium text-ink-900">{masked}</span>.
      </p>

      {devCode ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <span className="font-semibold">SMS not enabled yet</span> — your code is{" "}
          <span className="font-mono font-bold tracking-widest">{devCode}</span>
        </div>
      ) : null}

      <OtpForm />
    </div>
  );
}

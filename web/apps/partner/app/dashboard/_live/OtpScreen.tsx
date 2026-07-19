import { ShieldCheck } from "lucide-react";
import { cn } from "@vsolve/ui";
import { Medallion } from "@/components/graphics";
import type { HomeProps } from "./homeShared";

export function OtpScreen(p: HomeProps) {
  const digits = [0, 1, 2, 3, 4, 5];
  return (
    <div className="vsh-rise flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">ARRIVED</span>
      </div>

      <div className="mt-4 rounded-3xl border border-border bg-white p-6 text-center shadow-sm">
        <Medallion icon={ShieldCheck} tone="brand" size={64} className="mx-auto" />
        <h2 className="mt-4 text-lg font-bold text-ink-900">Start the job</h2>
        <p className="mx-auto mt-1 max-w-[16rem] text-sm text-gray-500">
          Ask the customer for the 6-digit start code to begin and unlock payment.
        </p>

        <div className="mt-6 flex justify-center gap-2">
          {digits.map((i) => (
            <div
              key={i}
              className={cn(
                "grid h-14 w-10 place-items-center rounded-xl border-2 text-2xl font-bold",
                p.otp.length > i ? "border-brand-500 bg-brand-50 text-ink-900" : "border-border bg-surface-muted text-gray-300",
              )}
            >
              {p.otp[i] ?? ""}
            </div>
          ))}
        </div>
        {p.workError ? <p className="mt-3 text-sm font-medium text-red-600">{p.workError}</p> : null}
      </div>

      {/* keypad */}
      <div className="mt-5 grid grid-cols-3 gap-2.5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, idx) => (
          <button
            key={idx}
            disabled={k === ""}
            onClick={() => {
              if (k === "⌫") p.setOtp(p.otp.slice(0, -1));
              else if (k && p.otp.length < 6) p.setOtp(p.otp + k);
            }}
            className={cn(
              "h-12 rounded-xl text-lg font-bold transition active:scale-95",
              k === "" ? "invisible" : "bg-white text-ink-900 shadow-sm",
            )}
          >
            {k}
          </button>
        ))}
      </div>

      <button
        onClick={p.onStartWork}
        disabled={p.otp.length < 6 || p.busy}
        className="mt-5 w-full rounded-xl bg-green-600 py-3.5 font-bold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-40"
      >
        {p.busy ? "Verifying…" : "Verify & Start"}
      </button>
    </div>
  );
}

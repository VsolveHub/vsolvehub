"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { getApiErrorMessage } from "@/lib/validation/api-error";
import { normalizePhone, phoneValidationMessage } from "@/lib/validation/phone";

type OtpFormProps = {
  redirectTo?: string;
};

export function OtpForm({ redirectTo = "/booking" }: OtpFormProps) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function sendOtp() {
    const normalized = normalizePhone(phone);
    const validationError = phoneValidationMessage(normalized);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send", phone: normalized }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(
        getApiErrorMessage(
          data,
          res.status >= 500
            ? "Server error. Refresh the page and try again."
            : "Enter a valid 10-digit phone number"
        )
      );
      setLoading(false);
      return;
    }
    setPhone(normalized);
    setStep("otp");
    setLoading(false);
  }

  async function verifyOtp() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", phone, otp }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(getApiErrorMessage(data, "Invalid OTP. Use 1234 for demo."));
      setLoading(false);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  const normalizedPhone = normalizePhone(phone);
  const canSend = phoneValidationMessage(normalizedPhone) === null;

  return (
    <div className="stack">
      {step === "phone" ? (
        <>
          <Input
            label="Mobile number"
            placeholder="10-digit mobile number"
            value={phone}
            onChange={(e) => setPhone(normalizePhone(e.target.value))}
            inputMode="numeric"
            autoComplete="tel"
            hint="We'll send a one-time password to your phone"
          />
          {error && <div className="alert alert-error">{error}</div>}
          <Button type="button" onClick={sendOtp} loading={loading} disabled={loading || !canSend} block>
            Send OTP
          </Button>
        </>
      ) : (
        <>
          <Input
            label="Enter OTP"
            placeholder="4-digit OTP"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            hint="Demo OTP: 1234"
          />
          {error && <div className="alert alert-error">{error}</div>}
          <Button type="button" onClick={verifyOtp} loading={loading} disabled={loading || otp.length < 4} block>
            Sign in to customer app
          </Button>
          <Button type="button" variant="secondary" onClick={() => setStep("phone")} disabled={loading}>
            Change number
          </Button>
        </>
      )}
    </div>
  );
}

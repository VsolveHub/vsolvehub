"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { getApiErrorMessage } from "@/lib/validation/api-error";
import { normalizePhone, phoneValidationMessage } from "@/lib/validation/phone";
import { qk } from "@/lib/query/keys";
import { motion, AnimatePresence } from "framer-motion";

type OtpFormProps = {
  redirectTo?: string;
};

export function OtpForm({ redirectTo = "/booking" }: OtpFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
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
    await queryClient.invalidateQueries({ queryKey: qk.session() });
    router.push(redirectTo);
    router.refresh();
  }

  const normalizedPhone = normalizePhone(phone);
  const canSend = phoneValidationMessage(normalizedPhone) === null;

  return (
    <div className="flex flex-col gap-5">
      <AnimatePresence mode="wait">
        {step === "phone" ? (
          <motion.div
            key="phone"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-col gap-5"
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-black text-gray-500 uppercase tracking-wider">Mobile number</label>
              <input
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:border-transparent transition-all text-sm font-semibold text-gray-900 placeholder:text-gray-400 placeholder:font-medium"
                placeholder="10-digit mobile number"
                value={phone}
                onChange={(e) => setPhone(normalizePhone(e.target.value))}
                inputMode="numeric"
                autoComplete="tel"
              />
              <p className="text-[11px] font-semibold text-gray-400 mt-1">We'll send a one-time password to your phone</p>
            </div>
            
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-xs font-semibold border border-red-200"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={sendOtp}
              disabled={loading || !canSend}
              className="w-full py-4 px-6 bg-[var(--color-brand)] text-white rounded-xl text-sm font-black shadow-xl shadow-[var(--color-brand)]/20 disabled:opacity-60 transition-opacity flex items-center justify-center gap-2"
            >
              {loading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : "Send OTP"}
            </motion.button>
          </motion.div>
        ) : (
          <motion.div
            key="otp"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="flex flex-col gap-5"
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-black text-gray-500 uppercase tracking-wider">Enter OTP</label>
              <input
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:border-transparent transition-all text-sm font-semibold text-gray-900 placeholder:text-gray-400 placeholder:font-medium tracking-widest text-center text-lg"
                placeholder="••••"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
              />
              <p className="text-[11px] font-semibold text-gray-400 mt-1 text-center">Demo OTP: 1234</p>
            </div>
            
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-xs font-semibold border border-red-200"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex flex-col gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={verifyOtp}
                disabled={loading || otp.length < 4}
                className="w-full py-4 px-6 bg-[var(--color-brand)] text-white rounded-xl text-sm font-black shadow-xl shadow-[var(--color-brand)]/20 disabled:opacity-60 transition-opacity flex items-center justify-center gap-2"
              >
                {loading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : "Sign in to customer app"}
              </motion.button>

              <button
                type="button"
                onClick={() => setStep("phone")}
                disabled={loading}
                className="w-full py-4 px-6 bg-transparent text-gray-500 hover:text-gray-900 rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
              >
                Change number
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

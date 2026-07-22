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
    <div className="w-full">
      <AnimatePresence mode="wait">
        {step === "phone" ? (
          <motion.div
            key="phone"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-5"
          >
            <div className="flex flex-col gap-2">
              <label htmlFor="mobile-input" className="text-xs font-bold text-[#45464d] uppercase tracking-wider">
                Mobile number
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-4 text-slate-400 text-sm select-none pointer-events-none">
                  📞
                </span>
                <input
                  id="mobile-input"
                  className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-slate-200 bg-[#f8f9fa] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ea580c]/20 focus:border-[#ea580c] transition-all text-sm font-bold text-[#0b1c30] placeholder:text-slate-400 placeholder:font-normal"
                  placeholder="Enter 10-digit mobile number"
                  value={phone}
                  onChange={(e) => setPhone(normalizePhone(e.target.value))}
                  inputMode="numeric"
                  autoComplete="tel"
                />
              </div>
              <p className="text-[11px] font-semibold text-slate-400">
                We'll send a one-time password to your phone
              </p>
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
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              type="button"
              onClick={sendOtp}
              disabled={loading || !canSend}
              className="w-full py-3.5 px-6 bg-gradient-to-r from-[#ea580c] to-[#f97316] hover:from-[#c2410c] hover:to-[#ea580c] text-white rounded-xl text-sm font-bold shadow-md shadow-orange-500/20 disabled:opacity-50 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                "Send OTP"
              )}
            </motion.button>
          </motion.div>
        ) : (
          <motion.div
            key="otp"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-5"
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label htmlFor="otp-input" className="text-xs font-bold text-[#45464d] uppercase tracking-wider">
                  Enter 4-digit OTP
                </label>
                <span className="text-[11px] font-bold text-[#ea580c] bg-[#fff7ed] px-2.5 py-0.5 rounded-full border border-[#ffedd5]">
                  Demo OTP: 1234
                </span>
              </div>
              <input
                id="otp-input"
                className="w-full px-4 py-3.5 rounded-xl border border-slate-200 bg-[#f8f9fa] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ea580c]/20 focus:border-[#ea580c] transition-all text-lg font-bold text-[#0b1c30] placeholder:text-slate-300 tracking-widest text-center"
                placeholder="••••"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                autoFocus
              />
              <p className="text-[11px] font-semibold text-slate-400 text-center">
                OTP sent to +91 {phone}
              </p>
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

            <div className="flex flex-col gap-2.5">
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                type="button"
                onClick={verifyOtp}
                disabled={loading || otp.length < 4}
                className="w-full py-3.5 px-6 bg-gradient-to-r from-[#ea580c] to-[#f97316] hover:from-[#c2410c] hover:to-[#ea580c] text-white rounded-xl text-sm font-bold shadow-md shadow-orange-500/20 disabled:opacity-50 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {loading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  "Verify & Sign In"
                )}
              </motion.button>

              <button
                type="button"
                onClick={() => {
                  setStep("phone");
                  setOtp("");
                  setError("");
                }}
                disabled={loading}
                className="w-full py-2.5 px-4 bg-transparent text-slate-500 hover:text-[#0b1c30] text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
              >
                ← Change mobile number
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trusted By Thousands Divider */}
      <div className="relative my-6 text-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-100" />
        </div>
        <span className="relative bg-white px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          TRUSTED BY THOUSANDS
        </span>
      </div>

      {/* 3 Trust Badges */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-red-50/50 border border-red-100/50">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100 text-red-600 text-sm font-bold">
            🔒
          </div>
          <span className="text-[10px] font-bold text-slate-700 uppercase tracking-tight">
            SECURE OTP
          </span>
        </div>

        <div className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-blue-50/50 border border-blue-100/50">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-sm font-bold">
            🛡️
          </div>
          <span className="text-[10px] font-bold text-slate-700 uppercase tracking-tight">
            VERIFIED PROS
          </span>
        </div>

        <div className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-amber-50/50 border border-amber-100/50">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-600 text-sm font-bold">
            ⚡
          </div>
          <span className="text-[10px] font-bold text-slate-700 uppercase tracking-tight">
            INSTANT BOOKING
          </span>
        </div>
      </div>
    </div>
  );
}

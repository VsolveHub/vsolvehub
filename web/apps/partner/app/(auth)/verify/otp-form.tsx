"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@vsolve/ui";
import { verifyOtp, resendOtp, type AuthState } from "../actions";

const LENGTH = 6;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Verifying…" : "Verify & continue"}
    </Button>
  );
}

export function OtpForm() {
  const [state, action] = useActionState<AuthState, FormData>(verifyOtp, {});
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(""));
  const [resent, setResent] = useState<string | null>(null);
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const code = digits.join("");

  function setDigit(i: number, v: string) {
    const clean = v.replace(/\D/g, "");
    setDigits((prev) => {
      const next = [...prev];
      if (clean.length > 1) {
        // pasted a full code
        clean.split("").slice(0, LENGTH).forEach((c, k) => (next[k] = c));
      } else {
        next[i] = clean;
      }
      return next;
    });
    if (clean && i < LENGTH - 1) refs.current[i + 1]?.focus();
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
  }

  async function onResend() {
    const res = await resendOtp();
    setResent(res.devCode ? `New code: ${res.devCode}` : "A new code has been sent.");
  }

  return (
    <form action={action} className="mt-6 space-y-5">
      <input type="hidden" name="code" value={code} />
      <div className="flex justify-between gap-2">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={d}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            inputMode="numeric"
            maxLength={LENGTH}
            aria-label={`Digit ${i + 1}`}
            className="h-14 w-12 rounded-lg border border-border text-center text-xl font-bold outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        ))}
      </div>
      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {resent ? <p className="text-sm text-success">{resent}</p> : null}
      <SubmitButton />
      <div className="text-center text-sm text-gray-500">
        Didn&apos;t get it?{" "}
        <button type="button" onClick={onResend} className="font-semibold text-brand-600 hover:underline">
          Resend code
        </button>
      </div>
    </form>
  );
}

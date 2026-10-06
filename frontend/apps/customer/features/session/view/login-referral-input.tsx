"use client";

import { Badge, Button } from "@vsolve/ui";
import { request } from "@vsolve/api-client";
import { CheckCircle2, Gift, Tag } from "lucide-react";
import { useEffect, useState } from "react";
import { readPendingReferral, savePendingReferral } from "@/features/referral/pending-referral";
import { getApiClient } from "@/lib/api/browser";

export function LoginReferralInput() {
  const [isOpen, setIsOpen] = useState(false);
  const [code, setCode] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [validationSuccess, setValidationSuccess] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const validateCode = async (codeToTest: string) => {
    const clean = codeToTest.trim().toUpperCase();
    if (!clean) return;

    setIsValidating(true);
    setValidationError(null);
    try {
      const data = await request(() =>
        getApiClient().POST("/api/v1/customer/referral/validate/", {
          body: { code: clean },
        }),
      );
      if (data?.valid) {
        setValidationSuccess(data.referee_reward_summary || "Referral reward confirmed!");
        savePendingReferral(clean);
      } else {
        setValidationError("Invalid referral code");
        setValidationSuccess(null);
      }
    } catch {
      setValidationError("Referral code is not recognized");
      setValidationSuccess(null);
    } finally {
      setIsValidating(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check URL params for ?ref=...
    const urlParams = new URLSearchParams(window.location.search);
    const refParam = urlParams.get("ref");
    const pendingCode = refParam || readPendingReferral();

    if (pendingCode) {
      setCode(pendingCode);
      setIsOpen(true);
      void validateCode(pendingCode);
    }
  }, []);

  const handleApplyClick = (e: React.MouseEvent) => {
    e.preventDefault();
    void validateCode(code);
  };

  if (!isOpen && !validationSuccess) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 text-xs font-semibold text-[#EA580C] hover:text-[#d65f1a] transition-colors"
      >
        <Gift className="size-3.5" />
        <span>Have an invite code? Apply it only at signup</span>
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-[#e7e2da] bg-[#FAF9F7] p-3 text-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-semibold text-navy-900">
          <Tag className="size-3.5 text-[#EA580C]" />
          <span>Referral Invite</span>
        </div>
        {validationSuccess && (
          <Badge tone="success" className="text-[10px] py-0">
            Applied
          </Badge>
        )}
      </div>

      {validationSuccess ? (
        <div className="mt-2 flex items-center gap-2 text-emerald-800">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
          <span className="font-medium text-[11px]">{validationSuccess}</span>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. VS9876A1"
            className="flex-1 rounded-lg border border-[#e7e2da] bg-white px-2.5 py-1.5 font-mono text-xs uppercase text-navy-900 placeholder:text-text-muted focus:border-[#EA580C] focus:outline-none"
          />
          <Button
            type="button"
            variant="outline"
            className="h-8 text-xs font-semibold px-3"
            disabled={isValidating || !code.trim()}
            onClick={handleApplyClick}
          >
            {isValidating ? "..." : "Apply"}
          </Button>
        </div>
      )}

      {validationError && (
        <p className="mt-1 text-[11px] font-medium text-rose-600">{validationError}</p>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-text-secondary">
        The code is applied when you create your account. An existing account cannot add one.
      </p>
    </div>
  );
}

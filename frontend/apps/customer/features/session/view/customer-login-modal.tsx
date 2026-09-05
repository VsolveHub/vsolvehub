"use client";

import type { OtpFlow } from "@vsolve/query";
import { cn, useHydrated } from "@vsolve/ui";
import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { claimViewport } from "@/lib/focus-mode";

import { CustomerLoginExperience } from "./customer-login-experience";
import { useMobileLoginViewport } from "./use-mobile-login-viewport";

const LOGIN_FOOTER = (
  <p>
    New here?{" "}
    <a
      href="/catalog"
      className="font-semibold text-info-text underline-offset-4 hover:underline"
    >
      Browse services
    </a>{" "}
    — you can add to your basket before signing in.
  </p>
);

function useLoginModalDialog(open: boolean, onOpenChange: (open: boolean) => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      trigger.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (open) return;
    const element = trigger.current;
    trigger.current = null;
    if (element === null) return;
    const active = document.activeElement;
    const platformRestored = active !== null && active !== document.body;
    if (platformRestored || !element.isConnected) return;
    element.focus();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => onOpenChange(false);
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return ref;
}

export function CustomerLoginModal({
  open,
  onOpenChange,
  flow,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flow: OtpFlow;
}) {
  const ref = useLoginModalDialog(open, onOpenChange);
  const id = useId();
  const isMobile = useMobileLoginViewport();
  const mounted = useHydrated();

  useLayoutEffect(() => {
    if (!open || !isMobile) return;
    return claimViewport();
  }, [open, isMobile]);

  const dialog = (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onClick={(event) => {
        if (!isMobile && event.target === event.currentTarget) onOpenChange(false);
      }}
      className={cn(
        isMobile
          ? [
              "fixed inset-0 m-0 h-dvh max-h-dvh w-full max-w-none overflow-hidden rounded-none border-0 p-0 shadow-none",
              "bg-[#F8F9FA] text-text backdrop:bg-[#F8F9FA] backdrop:backdrop-blur-none",
            ]
          : [
              "m-auto w-[calc(100vw-1.5rem)] max-w-[960px] max-h-[calc(100dvh-2rem)] overflow-hidden rounded-[2rem] p-0",
              "bg-surface text-text shadow-overlay border border-line/60",
              "backdrop:bg-navy-900/50 backdrop:backdrop-blur-sm",
            ],
      )}
    >
      <h2 id={`${id}-title`} className="sr-only">
        Log in to V Solve Hub
      </h2>
      <p id={`${id}-description`} className="sr-only">
        Verify your mobile number to view bookings and checkout
      </p>

      {isMobile ? (
        <div className="flex h-dvh flex-col overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-4">
            <div className="overflow-hidden rounded-2xl border border-line/60 bg-white shadow-[0_8px_30px_rgba(0,17,46,0.08)]">
              <CustomerLoginExperience
                flow={flow}
                variant="modal"
                mobileFocused
                onClose={() => onOpenChange(false)}
                footer={LOGIN_FOOTER}
              />
            </div>
          </div>
        </div>
      ) : (
        <CustomerLoginExperience
          flow={flow}
          variant="modal"
          onClose={() => onOpenChange(false)}
          footer={LOGIN_FOOTER}
        />
      )}
    </dialog>
  );

  if (!mounted || !open) return null;
  return createPortal(dialog, document.body);
}

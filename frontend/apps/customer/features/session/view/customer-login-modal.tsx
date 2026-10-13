"use client";

import type { OtpFlow } from "@vsolve/query";
import { cn, useHydrated } from "@vsolve/ui";
import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { claimViewport } from "@/lib/focus-mode";

import { CustomerLoginExperience } from "./customer-login-experience";
import { useMobileLoginViewport } from "./use-mobile-login-viewport";

const LOGIN_FOOTER = (
  <a
    href="/catalog"
    className="block text-center text-[13px] font-medium text-[#64748B] hover:text-navy-900 hover:underline transition-colors"
  >
    Browse services first
  </a>
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
      onCancel={() => onOpenChange(false)}
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
      className={cn(
        "m-auto w-[calc(100vw-2rem)] max-w-[420px] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[20px] p-0",
        "bg-white text-text shadow-2xl border border-line/60",
        "backdrop:bg-navy-900/60 backdrop:backdrop-blur-sm",
      )}
    >
      <h2 id={`${id}-title`} className="sr-only">
        Log in to V Solve Hub
      </h2>
      <p id={`${id}-description`} className="sr-only">
        Enter your mobile number to continue
      </p>

      <CustomerLoginExperience
        flow={flow}
        variant="modal"
        mobileFocused
        onClose={() => onOpenChange(false)}
        footer={
          <a
            href="/catalog"
            onClick={() => onOpenChange(false)}
            className="block text-center text-[13px] font-medium text-[#64748B] hover:text-navy-900 hover:underline transition-colors"
          >
            Browse services first
          </a>
        }
      />
    </dialog>
  );

  if (!mounted || !open) return null;
  return createPortal(dialog, document.body);
}

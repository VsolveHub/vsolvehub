"use client";

import type { ReactNode } from "react";
import { LogIn, User } from "lucide-react";
import { isApiRequestError } from "@vsolve/api-client";
import { Skeleton } from "@vsolve/ui";

import { useCustomerSession } from "../queries";

/**
 * "Sign in to …" in place of an action a signed-out customer cannot take.
 *
 * Browsing stays open: a rental's price, a stay's rooms, a job's details. Only the step that
 * needs an account (booking, enquiring, applying) becomes this card, so nobody fills a form
 * that the server then refuses.
 *
 * The button opens the header's sign-in popup rather than going to /login, so the customer
 * stays on the page: their dates and choices are still there, and the form appears in place
 * of the card the moment they are signed in.
 */

/** The site header listens for this and opens its sign-in popup. */
export const OPEN_SIGN_IN_EVENT = "open-login-popup";

export function openSignIn(): void {
  window.dispatchEvent(new CustomEvent(OPEN_SIGN_IN_EVENT));
}

/** A request refused because there is no session (never signed in, or it ended). */
export function isSignInError(error: unknown): boolean {
  return isApiRequestError(error) && error.status === 401;
}

export function SignInCard({
  title,
  message,
  expired = false,
  onSignIn,
  className = "",
}: {
  /** e.g. "Sign in to book this rental". */
  title: string;
  message?: string;
  /** The session ended part-way through: say so, rather than "sign in" out of nowhere. */
  expired?: boolean;
  /** Called as the popup opens, e.g. to clear the refused request's error. */
  onSignIn?: () => void;
  className?: string;
}) {
  const session = useCustomerSession();
  return (
    <div
      data-testid="sign-in-card"
      className={`rounded-card border border-navy-200 bg-navy-50/60 p-5 text-center ${className}`}
    >
      <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-navy-100 text-navy-700">
        <User className="size-5" aria-hidden />
      </div>
      <h3 className="mt-3 text-sm font-bold text-text">
        {expired ? "Your session ended. Sign in again" : title}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-text-secondary">
        {expired
          ? "Nothing was submitted. Sign in and your choices here are still kept."
          : (message ?? "Sign in with your phone number. It takes a few seconds.")}
      </p>
      <button
        type="button"
        onClick={() => {
          // Re-ask who is signed in first: after a session ends mid-flow the cached answer
          // still says "signed in", and the header only opens its popup for a signed-out
          // visitor.
          session.refetch();
          onSignIn?.();
          openSignIn();
        }}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-navy-900 px-4 py-2.5 text-sm font-semibold text-warm-0 shadow-card transition hover:bg-navy-800"
      >
        <LogIn className="size-4" aria-hidden />
        Sign in
      </button>
    </div>
  );
}

/**
 * Renders `children` for a signed-in customer and the sign-in card for a signed-out one.
 *
 * While the session is still being checked it shows a placeholder, so a signed-in customer
 * never sees the card flash. When the check itself failed (offline) it shows `children`: the
 * server still refuses a signed-out request, and a login wall is the wrong answer to a
 * dropped connection.
 */
export function SignInGate({
  title,
  message,
  children,
  className,
}: {
  title: string;
  message?: string;
  children: ReactNode;
  className?: string;
}) {
  const session = useCustomerSession();
  if (session.isResolving) return <Skeleton className={`h-40 w-full ${className ?? ""}`} />;
  if (session.isAnonymous) return <SignInCard title={title} message={message} className={className} />;
  return <>{children}</>;
}

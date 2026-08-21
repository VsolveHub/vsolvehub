"use client";

import { cn } from "@vsolve/ui";

import { Pictogram } from "@/components/pictogram";

/**
 * The screen a Partner stares at while there is nothing to do.
 *
 * ## Why this is worth animating at all
 *
 * An idle stack answers "do you have work?" with an empty rectangle, which
 * reads the same as a screen that has failed to load. The question a vendor is
 * actually asking is *"is the app still trying?"* — and for an online Partner
 * the honest answer is yes: the dispatch cascade is running and will push an
 * offer to this device. The pulse says that, continuously, without a number
 * anybody has to trust.
 *
 * It is the one animation in the app. It earns its place because it is the only
 * screen whose entire content is "wait", and it stops the moment there is
 * anything to show.
 *
 * ## Why it goes still when the Partner is offline
 *
 * Nothing is looking for them. A pulsing radar over "you are offline" would be
 * the app performing activity it is not performing — the visual equivalent of a
 * spinner on a request nobody sent. Offline is a dormant ring and a different
 * sentence: the fix is one tap away and it is theirs to make.
 *
 * ## Motion
 *
 * Three rings on one 2.8s cycle, staggered by a third each, scaling out and
 * fading — a sonar sweep rather than a spinner, because a spinner means "this
 * screen is loading" and this screen has finished loading. Pure CSS: no
 * animation library, no rAF loop, nothing to keep a mid-range phone's CPU awake
 * beyond what the compositor does for a transform.
 *
 * The keyframes are `vsh-ping`, already in `app/globals.css` and already
 * exactly this shape (`scale(0.3)` at 55% opacity out to `scale(1)` at zero).
 * Not `vsh-sweep`, despite the name — that one is a 360° rotation for a
 * different control, and a second definition under the same name would have
 * silently changed it.
 *
 * `motion-reduce:` drops every ring to a static outline. A vendor who has asked
 * their phone to stop moving things gets a still diagram that says exactly the
 * same thing. (The `@media (prefers-reduced-motion)` block in `globals.css`
 * only reaches `.vsh-*` class names, so the Tailwind variant is what covers an
 * arbitrary `animate-[…]` utility.)
 */
export function WaitingRadar({ isOnline }: { readonly isOnline: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-10">
      <div className="relative grid h-44 w-44 place-items-center">
        {isOnline ? (
          <>
            <Ring delay="0s" />
            <Ring delay="0.93s" />
            <Ring delay="1.86s" />
          </>
        ) : (
          <span className="absolute inset-4 rounded-full border-2 border-dashed border-[var(--color-warm-300)]" />
        )}

        <span
          className={cn(
            "relative grid h-20 w-20 place-items-center rounded-full",
            isOnline
              ? "bg-[linear-gradient(150deg,var(--color-navy-500),var(--color-navy-800))] shadow-raised"
              : "bg-surface-sunken",
          )}
        >
          <Pictogram
            name={isOnline ? "all-work" : "power"}
            size="xl"
            className={isOnline ? "text-surface" : "text-text-muted"}
          />
        </span>
      </div>

      <div className="flex max-w-[26ch] flex-col items-center gap-1.5 text-center">
        <p className="text-lg font-bold text-text">
          {isOnline ? "Looking for work near you" : "You are not taking work"}
        </p>
        <p className="text-sm leading-relaxed text-text-secondary">
          {isOnline
            ? "Keep this app installed and your phone on. We will alert you the moment a job comes in."
            : "Go online above and jobs near you will start coming through."}
        </p>
      </div>
    </div>
  );
}

/**
 * One sweep.
 *
 * `animate-[…]` with an inline `animationDelay` rather than three named
 * utilities: the keyframes are declared once in `globals.css` and the only
 * thing that differs between rings is when each starts.
 */
function Ring({ delay }: { readonly delay: string }) {
  return (
    <span
      aria-hidden
      style={{ animationDelay: delay }}
      className={cn(
        "absolute inset-0 rounded-full border-2 border-action-line opacity-0",
        "animate-[vsh-ping_2.8s_ease-out_infinite]",
        "motion-reduce:animate-none motion-reduce:opacity-100",
      )}
    />
  );
}

"use client";

import { useMemo } from "react";

import { useCategories } from "@/features/catalog/client-queries";

/**
 * Shown at the top of every chat, so the starter chips stay one tap away. The same block as the
 * phone app's `welcome-hero.tsx`: the helper, "How can I help you today?", and up to six service
 * categories as chips. It eases in once; with "reduce motion" on it just appears.
 */
export function WelcomeHero({
  onPick,
  disabled,
}: {
  /** Called with a service category's name when the customer picks its chip. */
  onPick: (categoryName: string) => void;
  disabled: boolean;
}) {
  const categoryNames = useStarterCategories();

  return (
    <div className="assistant-welcome-enter flex flex-col items-center py-4 text-center">
      <div aria-hidden className="grid size-24 place-items-center rounded-full bg-orange-50">
        <HelperBot />
      </div>
      <p className="mt-3 text-lg font-extrabold tracking-tight text-navy-900">
        V Solve <span className="text-[#EA580C]">Hub</span> AI
      </p>
      <p className="mt-1 text-sm text-[#6B6560]">How can I help you today?</p>
      {categoryNames.length ? (
        <div className="mt-4 flex flex-wrap justify-center gap-2 px-1">
          {categoryNames.map((name) => (
            <button
              key={name}
              type="button"
              disabled={disabled}
              onClick={() => onPick(name)}
              className="min-h-10 max-w-full truncate rounded-full border border-[#EA580C]/30 bg-white px-4 text-sm font-medium text-navy-900 hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00112e] disabled:opacity-50"
            >
              {name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const MAX_STARTER_CHIPS = 6;
const MAX_CHIP_NAME_LENGTH = 40;

/**
 * Starter chips come from the service categories the server already serves, never a typed-in
 * list. Until they load, or if they fail or come back empty, there are none. Blank, over-long
 * and repeated names are left out. Same rule as the phone app.
 */
function useStarterCategories(): string[] {
  const categories = useCategories();
  return useMemo(() => {
    const names = (categories.data ?? [])
      .map((category) => category.name.trim())
      .filter((name) => name.length > 0 && name.length <= MAX_CHIP_NAME_LENGTH);
    return [...new Set(names)].slice(0, MAX_STARTER_CHIPS);
  }, [categories.data]);
}

/** The V Solve Hub helper: a friendly navy bot with the brand's orange. Decorative only. */
export function HelperBot({
  size = 72,
  className,
  animated = true,
}: {
  size?: number;
  className?: string;
  animated?: boolean;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={className} aria-hidden>
      <line x1={60} y1={24} x2={60} y2={12} stroke="#0B1B3D" strokeWidth={4} strokeLinecap="round" />
      <circle
        cx={60}
        cy={10}
        r={6}
        fill="#EA580C"
        className={animated ? "assistant-antenna-pulse" : undefined}
      />
      <rect x={10} y={50} width={11} height={24} rx={5.5} fill="#EA580C" />
      <rect x={99} y={50} width={11} height={24} rx={5.5} fill="#EA580C" />
      <rect x={34} y={94} width={52} height={22} rx={11} fill="#0B1B3D" />
      <circle cx={60} cy={105} r={4} fill="#EA580C" />
      <rect x={18} y={24} width={84} height={68} rx={26} fill="#0B1B3D" />
      <rect x={27} y={34} width={66} height={46} rx={20} fill="#FFFFFF" />
      <g className={animated ? "assistant-bot-eyes" : undefined}>
        <circle cx={47} cy={55} r={6} fill="#0B1B3D" />
        <circle cx={73} cy={55} r={6} fill="#0B1B3D" />
        <circle cx={49} cy={53} r={2} fill="#FFFFFF" />
        <circle cx={75} cy={53} r={2} fill="#FFFFFF" />
      </g>
      <circle cx={38} cy={65} r={4} fill="#EA580C" opacity={0.25} />
      <circle cx={82} cy={65} r={4} fill="#EA580C" opacity={0.25} />
      <path d="M51 66 Q60 74 69 66" stroke="#0B1B3D" strokeWidth={3.5} strokeLinecap="round" fill="none" />
    </svg>
  );
}

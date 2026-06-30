import { cn } from "@vsolve/ui";

// Celebratory success animation — animated check draw + halo pulse + confetti burst.
// Pure CSS (keyframes in globals.css), SSR-safe, respects prefers-reduced-motion.

const CONFETTI = [
  { tx: -70, ty: -50, c: "#f59e0b", d: 0 },
  { tx: 65, ty: -60, c: "#6366f1", d: 60 },
  { tx: -90, ty: 10, c: "#16a34a", d: 120 },
  { tx: 85, ty: 20, c: "#fb7185", d: 40 },
  { tx: -45, ty: -85, c: "#38bdf8", d: 160 },
  { tx: 40, ty: -90, c: "#fbbf24", d: 100 },
  { tx: -100, ty: -30, c: "#7c3aed", d: 200 },
  { tx: 100, ty: -25, c: "#34d399", d: 140 },
  { tx: 0, ty: -100, c: "#f59e0b", d: 80 },
  { tx: -30, ty: 40, c: "#6366f1", d: 220 },
  { tx: 30, ty: 45, c: "#fb7185", d: 180 },
];

export function SuccessAnimation({ size = 96 }: { size?: number }) {
  return (
    <div className="relative mx-auto grid place-items-center" style={{ width: size * 1.6, height: size * 1.6 }}>
      {/* confetti */}
      {CONFETTI.map((p, i) => (
        <span
          key={i}
          className="vsh-burst absolute h-2 w-2 rounded-full"
          style={
            {
              backgroundColor: p.c,
              ["--tx" as string]: `${p.tx}px`,
              ["--ty" as string]: `${p.ty}px`,
              animationDelay: `${350 + p.d}ms`,
            } as React.CSSProperties
          }
        />
      ))}
      {/* halo */}
      <span
        className="vsh-halo absolute rounded-full bg-green-200"
        style={{ width: size * 1.3, height: size * 1.3 }}
      />
      {/* check badge */}
      <span
        className={cn("vsh-pop relative grid place-items-center rounded-full bg-green-500 shadow-lg")}
        style={{ width: size, height: size }}
      >
        <svg
          viewBox="0 0 52 52"
          className="vsh-check"
          style={{ width: size * 0.5, height: size * 0.5 }}
          fill="none"
        >
          <path
            d="M14 27 L23 36 L39 18"
            stroke="white"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  );
}

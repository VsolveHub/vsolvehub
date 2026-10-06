// Ported from frontend/apps/partner/components/pictogram.tsx
import { cn } from "@vsolve/mobile-ui";
import Svg, { Circle, Path, Rect } from "react-native-svg";

export type PictogramName =
  | "wiring"
  | "water"
  | "walls"
  | "paint"
  | "floor"
  | "wood"
  | "cooling"
  | "machine"
  | "clean"
  | "welding"
  | "fit-out"
  | "warranty"
  | "all-work"
  | "site"
  | "home"
  | "more"
  | "yes"
  | "no"
  | "call"
  | "photo"
  | "go"
  | "back"
  | "price"
  | "power"
  | "distance"
  | "time"
  | "date"
  | "days"
  | "money"
  | "crew"
  | "rating"
  | "papers"
  | "now"
  | "doing"
  | "done"
  | "held"
  | "later"
  | "stopped"
  | "new"
  | "language";

const PATHS: Record<PictogramName, string> = {
  wiring: "M13.5 2.5 5 13.5h6l-1.5 8 9.5-11.5h-6z",
  water: "M4 20.5h16|M12 20.5v-5.5|M12 10.9V7.4h4a3 3 0 0 1 3 3v1|M9.8 7.4h4.4",
  walls: "M3 9.7h18|M3 14.3h18|M9 5v4.7|M15 9.7v4.6|M9 14.3V19",
  paint: "M15 6.2h3.7a1.8 1.8 0 0 1 1.8 1.8v2.4a1.8 1.8 0 0 1-1.8 1.8h-7.2a1.8 1.8 0 0 0-1.8 1.8v1.3",
  floor: "",
  wood: "M2.8 13.5 13.5 2.8l3.6 3.6L6.4 17.1z|M6.4 17.1l-2 2 1.4 1.4 2-2z|M5.2 14.7l1 1|M7.2 12.7l1 1|M9.2 10.7l1 1|M11.2 8.7l1 1|M13.2 6.7l1 1",
  cooling: "M6 9h12|M7 15.4c0 2-1.5 2-1.5 4|M12 15.4c0 2-1.5 2-1.5 4|M17 15.4c0 2-1.5 2-1.5 4",
  machine: "M4 8h16",
  clean: "M9.6 8.5h4.8v12H9.6z|M9.6 8.5V5.4h3.2|M17 4.4h2.2|M17 7.6h2.2|M18.4 10.8h1.8",
  welding: "M12 2.8s4.2 4.6 4.2 8.4a4.2 4.2 0 0 1-8.4 0C7.8 7.4 12 2.8 12 2.8z|M9.4 21h5.2",
  "fit-out": "M3.5 9.5 12 3.5l8.5 6|M5.8 9.5V20.5h12.4V9.5|M9.9 20.5v-5.8h4.2v5.8",
  warranty: "M12 3 4.6 6v6c0 4.6 3.1 8 7.4 9.5 4.3-1.5 7.4-4.9 7.4-9.5V6z|M9 12.2l2.2 2.3L15.4 10",
  "all-work": "M8 8.5V6.8A2.3 2.3 0 0 1 10.3 4.5h3.4A2.3 2.3 0 0 1 16 6.8v1.7|M2.5 13.5h19|M10 13.5v2.4h4v-2.4",
  site: "M4.5 18.5h15|M6.5 18.5v-5.2l5.5-4.2 5.5 4.2v5.2|M12 9.1V4.4",
  home: "M3.5 20.5h17|M5.5 20.5V9.2h13v11.3|M8.6 13.2h2.6|M12.8 13.2h2.6|M8.6 16.8h2.6|M12.8 16.8h2.6|M4 9.2 12 3.4l8 5.8",
  more: "M12 5.5v13|M5.5 12h13",
  yes: "M4.5 12.5 9.5 17.5 19.5 6.5",
  no: "M6 6l12 12|M18 6L6 18",
  call: "M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5z",
  photo: "M8.6 7l1.6-2.6h3.6L15.4 7",
  go: "M4.5 12h14|M13 6.5 18.5 12 13 17.5",
  back: "M15 5.5 8.5 12 15 18.5",
  price: "M6.5 3.5h11|M6.5 8.4h11|M14.6 3.5c0 3.3-2.4 4.9-5.3 4.9H6.5l8.6 12.1",
  power: "M12 3v9|M18.4 6.6a9 9 0 1 1-12.8 0",
  distance: "M12 21.5s7-6 7-11.5a7 7 0 0 0-14 0c0 5.5 7 11.5 7 11.5z",
  time: "M12 7v5.2l3.4 2",
  date: "M8 2.8v4|M16 2.8v4|M3 10h18",
  days: "M12 2v2|M12 20v2|M4.9 4.9l1.4 1.4|M17.7 17.7l1.4 1.4|M2 12h2|M20 12h2|M4.9 19.1l1.4-1.4|M17.7 6.3l1.4-1.4",
  money: "M6 9.5v5|M18 9.5v5",
  crew: "M2.5 20.5c0-3.6 2.9-6.2 6.5-6.2s6.5 2.6 6.5 6.2|M16.5 5.6a3.4 3.4 0 0 1 0 6.6|M17.6 14.8c2.3.7 3.9 2.9 3.9 5.7",
  rating: "m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  papers: "M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z|M13.5 3v5.5H19|M8.6 13.4h6.8|M8.6 16.8h4.4",
  now: "M12 7v5.2l3.4 2",
  doing: "M8 8.5V6.8A2.3 2.3 0 0 1 10.3 4.5h3.4A2.3 2.3 0 0 1 16 6.8v1.7|M2.5 13.5h19|M10 13.5v2.4h4v-2.4",
  done: "M4.5 12.5 9.5 17.5 19.5 6.5",
  held: "M8 10.5V7.5a4 4 0 0 1 8 0v3",
  later: "M12 7.4v5.6|M12 16.4v.1",
  stopped: "M5.6 5.6l12.8 12.8",
  new: "M18 8.5a6 6 0 0 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5z|M13.7 20a2 2 0 0 1-3.4 0",
  language: "M3.2 9.5h17.6|M3.2 14.5h17.6|M12 3a14 14 0 0 1 0 18|M12 3a14 14 0 0 0 0 18",
};

type RectSpec = readonly [number, number, number, number, number];
type CircleSpec = readonly [number, number, number];

const RECTS: Partial<Record<PictogramName, readonly RectSpec[]>> = {
  water: [[8.4, 10.9, 7.2, 4.1, 1.4]],
  walls: [[3, 5, 18, 14, 1.6]],
  paint: [
    [3.5, 3.5, 11.5, 5.4, 1.6],
    [8, 15.6, 3.4, 4.9, 1.2],
  ],
  floor: [
    [3, 3, 7.6, 7.6, 1.4],
    [13.4, 3, 7.6, 7.6, 1.4],
    [3, 13.4, 7.6, 7.6, 1.4],
    [13.4, 13.4, 7.6, 7.6, 1.4],
  ],
  cooling: [[2.5, 4.5, 19, 8, 2]],
  machine: [[4, 3, 16, 18, 2.4]],
  "all-work": [[2.5, 8.5, 19, 11.5, 2]],
  photo: [[2.5, 7, 19, 13, 2.6]],
  date: [[3, 5, 18, 16, 2.4]],
  money: [[2.5, 6, 19, 12, 2.2]],
  doing: [[2.5, 8.5, 19, 11.5, 2]],
  held: [[4.5, 10.5, 15, 10, 2.2]],
};

const CIRCLES: Partial<Record<PictogramName, readonly CircleSpec[]>> = {
  machine: [
    [12, 14, 4.4],
    [7.2, 5.6, 0.9],
  ],
  site: [[12, 3.3, 1.3]],
  photo: [[12, 13.6, 3.6]],
  distance: [[12, 10, 2.6]],
  time: [[12, 12, 9]],
  days: [[12, 12, 4.2]],
  money: [[12, 12, 3]],
  crew: [[9, 8, 3.4]],
  now: [[12, 12, 9]],
  later: [[12, 12, 9]],
  stopped: [[12, 12, 9]],
  language: [[12, 12, 9]],
};

const FILLED = new Set<PictogramName>(["rating"]);

const SIZE_PX = { xs: 12, sm: 16, md: 24, lg: 32, xl: 40 } as const;
export type PictogramSize = keyof typeof SIZE_PX;

const INK: readonly [string, string][] = [
  ["text-action-active", "#d65e00"],
  ["text-action-secondary-text", "#ffffff"],
  ["text-action-secondary", "#00246b"],
  ["text-action-text", "#00112e"],
  ["text-action", "#f87000"],
  ["text-success-text", "#166534"],
  ["text-info-text", "#00246b"],
  ["text-warning-text", "#8a5a00"],
  ["text-danger-text", "#8f1e17"],
  ["text-signal-700", "#a94900"],
  ["text-text-secondary", "#453f37"],
  ["text-text-muted", "#756c5e"],
  ["text-text-inverse", "#ffffff"],
  ["text-navy-200", "#b0c2e8"],
  ["text-navy-100", "#d9e2f5"],
  ["text-surface", "#ffffff"],
  ["text-white", "#ffffff"],
  ["text-text", "#00112e"],
  ["text-warm-400", "#a89f90"],
];

function inkFrom(className: string | undefined): string {
  const tokens = className ?? "";
  for (const [token, hex] of INK) {
    if (tokens.includes(token)) return hex;
  }
  return "#00112e";
}

export function Pictogram({
  name,
  size = "md",
  className,
}: {
  name: PictogramName;
  size?: PictogramSize;
  className?: string;
}) {
  const filled = FILLED.has(name);
  const color = inkFrom(className);
  const px = SIZE_PX[size];
  return (
    <Svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill={filled ? color : "none"}
      stroke={filled ? "none" : color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(className)}
    >
      {RECTS[name]?.map((rect, index) => (
        <Rect key={`rect-${index}`} x={rect[0]} y={rect[1]} width={rect[2]} height={rect[3]} rx={rect[4]} />
      ))}
      {CIRCLES[name]?.map((circle, index) => (
        <Circle key={`circle-${index}`} cx={circle[0]} cy={circle[1]} r={circle[2]} />
      ))}
      {PATHS[name]
        ? PATHS[name].split("|").map((segment, index) => <Path key={`path-${index}`} d={segment} />)
        : null}
    </Svg>
  );
}

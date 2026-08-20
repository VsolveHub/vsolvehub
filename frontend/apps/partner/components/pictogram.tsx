import { cn } from "@vsolve/ui";

/**
 * Every icon in the tap-first redesign. One stroke style — 24 viewBox,
 * 1.8 stroke, round caps and joins — transcribed from the approved design
 * canvas (`Icons.dc.html`, artboard "The pictogram set") so a hand-drawn
 * glyph exists everywhere the app previously used an emoji.
 *
 * ## Transcription, not approximation
 *
 * Every `<path>`, `<rect>` and `<circle>` below was copied element-for-
 * element from `Icons.dc.html`'s "Trades", "Do", "Know" and "State"
 * sections — not redrawn by eye. A `<rect>` in the source keeps its `rx`
 * here (see `RECTS`) rather than being flattened into a sharp-cornered
 * path, and a `<circle>` in the source is a `<circle>` here (see
 * `CIRCLES`), not omitted. Several icons need more than one of either
 * (`floor` is four rects and no path at all; `paint` is two rects;
 * `machine` is two circles), so both tables hold arrays, not single
 * shapes — a single shape would have been enough for `held` alone, but
 * not for the set as a whole.
 */
export type PictogramName =
  // Trades
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
  // Do
  | "yes"
  | "no"
  | "call"
  | "photo"
  | "go"
  | "back"
  | "price"
  | "power"
  // Know
  | "distance"
  | "time"
  | "date"
  | "days"
  | "money"
  | "crew"
  | "rating"
  | "papers"
  // State
  | "now"
  | "doing"
  | "done"
  | "held"
  | "later"
  | "stopped"
  | "new"
  | "language";

/** One `<path d="…">` per `|`-delimited segment. A source `<path>` whose
 * `d` chains multiple `M` subpaths (e.g. the four short rays of `wood`'s
 * saw-tooth line) is split at each `M` into its own segment here — this
 * renders identically, since SVG treats a multi-subpath `d` and several
 * single-subpath `<path>` elements the same way, and keeps every segment
 * independently diffable against the source. `floor` is drawn entirely
 * from rects (see `RECTS`), so it has no path segments at all. */
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

type RectSpec = readonly [x: number, y: number, width: number, height: number, rx: number];
type CircleSpec = readonly [cx: number, cy: number, r: number];

/**
 * Container shapes the source draws as `<rect>` rather than as a path —
 * a wall frame, a coin's body, a padlock's case. Kept as real rects (with
 * their `rx`) instead of being folded into a `d` string, since a rounded
 * rect is not a path command and approximating one with `h`/`v`/`z` line
 * segments silently squares off corners the canvas drew rounded.
 */
const RECTS: Partial<Record<PictogramName, readonly RectSpec[]>> = {
  water: [[8.4, 10.9, 7.2, 4.1, 1.4]],
  walls: [[3, 5, 18, 14, 1.6]],
  paint: [
    [3.5, 3.5, 11.5, 5.4, 1.6],
    [8, 15.6, 3.4, 4.9, 1.2],
  ],
  // Four floor tiles — this icon is rects only, no path segments.
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
  // Same case shape as "all-work" — the canvas reuses it verbatim for the
  // in-progress job state.
  doing: [[2.5, 8.5, 19, 11.5, 2]],
  held: [[4.5, 10.5, 15, 10, 2.2]],
  // "clean" has no <rect> in the source — its bottle body is a genuinely
  // sharp-cornered closed path (`M9.6 8.5h4.8v12H9.6z` in PATHS), so it is
  // deliberately absent here rather than an oversight.
};

/** Small circles the source draws separately from its strokes — a map
 * pin's dot, a clock face, a camera lens. */
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

/**
 * Icons the source draws as a solid `currentColor` fill rather than a
 * `currentColor` stroke. Just `rating`: the canvas's star cell is
 * `fill="#f87000" stroke="none"`, a solid star, not an outline — the only
 * glyph in the set drawn that way. Everything else in this file stays a
 * stroke so a screen recolours it the same way it recolours every other
 * pictogram, via `className="text-…"`.
 */
const FILLED_NAMES = new Set<PictogramName>(["rating"]);

export function Pictogram({
  name,
  className,
}: {
  name: PictogramName;
  className?: string;
}) {
  const d = PATHS[name];
  const rects = RECTS[name];
  const circles = CIRCLES[name];
  const filled = FILLED_NAMES.has(name);

  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("h-6 w-6", className)}
    >
      {rects?.map((r, index) => (
        <rect key={`rect-${index}`} x={r[0]} y={r[1]} width={r[2]} height={r[3]} rx={r[4]} />
      ))}
      {circles?.map((c, index) => (
        <circle key={`circle-${index}`} cx={c[0]} cy={c[1]} r={c[2]} />
      ))}
      {d
        ? d.split("|").map((segment, index) => <path key={`path-${index}`} d={segment} />)
        : null}
    </svg>
  );
}

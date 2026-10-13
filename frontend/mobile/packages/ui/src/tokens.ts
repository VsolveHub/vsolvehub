/** Values copied from frontend/packages/ui/src/tokens.css. Change them there first, never here only. */
export const PALETTE = {
  signal: {
    50: "#fff4ec",
    100: "#ffe3d1",
    200: "#ffc4a0",
    300: "#ff9e63",
    400: "#fb8130",
    500: "#f87000",
    600: "#d65e00",
    700: "#a94900",
    800: "#8a3a00",
    900: "#5c2600",
  },
  navy: {
    50: "#eef2fb",
    100: "#d9e2f5",
    200: "#b0c2e8",
    300: "#7d9ad6",
    400: "#4a70bf",
    500: "#2551a3",
    600: "#0f3a87",
    700: "#00246b",
    800: "#001a4e",
    900: "#00112e",
  },
  warm: {
    0: "#ffffff",
    25: "#fdfcfa",
    50: "#faf8f5",
    100: "#f4f1ec",
    200: "#e7e2da",
    300: "#d3ccc0",
    400: "#a89f90",
    500: "#756c5e",
    600: "#5f584d",
    700: "#453f37",
  },
} as const;

export const COLOR_TOKENS = {
  // Surfaces
  canvas: PALETTE.warm[50],
  surface: PALETTE.warm[0],
  surfaceSunken: PALETTE.warm[100],
  surfaceHover: PALETTE.warm[50],
  surfaceMuted: PALETTE.warm[100],

  // Borders
  line: PALETTE.warm[200],
  lineStrong: PALETTE.warm[500],

  // Text
  text: PALETTE.navy[900],
  textSecondary: PALETTE.warm[700],
  textMuted: PALETTE.warm[500],
  textInverse: PALETTE.warm[0],
  textLink: PALETTE.navy[700],

  // Primary action
  action: PALETTE.signal[500],
  actionHover: PALETTE.signal[400],
  actionActive: PALETTE.signal[600],
  actionText: PALETTE.navy[900],

  // Secondary action
  actionSecondary: PALETTE.navy[700],
  actionSecondaryHover: PALETTE.navy[800],
  actionSecondaryText: PALETTE.warm[0],

  // Status roles (matching tokens.css exactly)
  info: PALETTE.navy[700],
  infoSurface: PALETTE.navy[50],
  infoLine: PALETTE.navy[200],
  infoText: PALETTE.navy[700],

  success: "#0e7c3a",
  successSurface: "#e8f6ed",
  successLine: "#a8ddbc",
  successText: "#0e7c3a",
  successActive: "#0a5c2b",

  warning: "#8a5200",
  warningSurface: PALETTE.signal[50],
  warningLine: PALETTE.signal[200],
  warningText: "#8a5200",

  danger: "#b3261e",
  dangerSurface: "#fdecea",
  dangerLine: "#f4b8b3",
  dangerText: "#b3261e",

  brand: PALETTE.navy[700],
  placeholderText: "rgba(107, 101, 96, 0.5)",
} as const;

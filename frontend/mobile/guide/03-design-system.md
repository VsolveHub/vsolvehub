# Design system

The web look comes from `frontend/packages/ui/src/tokens.css` and the `@vsolve/ui` components.
Mobile uses **the same token names**, so a web class like `bg-action text-action-text
rounded-control` is copied to mobile unchanged.

## 1. `tailwind.config.js` (the same file in both apps)

```js
/** Values copied from frontend/packages/ui/src/tokens.css. Change them there first, never here only. */
const signal = { 50: "#fff4ec", 100: "#ffe3d1", 200: "#ffc4a0", 300: "#ff9e63", 400: "#fb8130",
  500: "#f87000", 600: "#d65e00", 700: "#a94900", 800: "#8a3a00", 900: "#5c2600" };
const navy = { 50: "#eef2fb", 100: "#d9e2f5", 200: "#b0c2e8", 300: "#7d9ad6", 400: "#4a70bf",
  500: "#2551a3", 600: "#0f3a87", 700: "#00246b", 800: "#001a4e", 900: "#00112e" };
const warm = { 0: "#ffffff", 25: "#fdfcfa", 50: "#faf8f5", 100: "#f4f1ec", 200: "#e7e2da",
  300: "#d3ccc0", 400: "#a89f90", 500: "#756c5e", 600: "#5f584d", 700: "#453f37" };

module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        signal, navy, warm,
        canvas: warm[50], surface: { DEFAULT: warm[0], sunken: warm[100], hover: warm[50], muted: warm[100] },
        line: { DEFAULT: warm[200], strong: warm[500] },
        text: { DEFAULT: navy[900], secondary: warm[700], muted: warm[500], inverse: warm[0], link: navy[700] },
        action: { DEFAULT: signal[500], hover: signal[400], active: signal[600], text: navy[900],
          secondary: navy[700], "secondary-hover": navy[800], "secondary-text": warm[0],
          surface: signal[50], line: signal[200] },
        selected: { DEFAULT: navy[700], surface: navy[50], line: navy[200] },
        "focus-ring": { DEFAULT: navy[600], inverse: warm[0] },
        info: { surface: navy[50], line: navy[200], text: navy[700] },
        success: { DEFAULT: "#0e7c3a", surface: "#e8f6ed", line: "#a8ddbc", text: "#0e7c3a", active: "#0a5c2b" },
        warning: { surface: signal[50], line: signal[200], text: "#8a5200" },
        danger: { DEFAULT: "#b3261e", surface: "#fdecea", line: "#f4b8b3", text: "#b3261e" },
        // Legacy aliases still used in web markup (tokens.css "LEGACY ALIASES").
        brand: { 50: navy[50], 100: navy[100], 500: navy[600], 600: navy[700], 700: navy[800], 900: navy[900] },
        accent: { 400: signal[400], 500: signal[500], 600: signal[600] },
        ink: { 800: navy[800], 900: navy[900] },
        border: warm[200],
        critical: { DEFAULT: "#b3261e", 50: "#fdecea", 200: "#f4b8b3" },
        aurora: { 1: "#2dd4bf", 2: "#34d399" },
      },
      borderRadius: { control: "0.5rem", card: "0.875rem", plate: "0.25rem" },
      minHeight: { touch: "2.75rem" },
      minWidth: { touch: "2.75rem" },
    },
  },
};
```

Screens also use a few raw web colours (for example the Customer page background `#FAF9F7`).
Copy the class exactly as written on web (`bg-[#FAF9F7]`). NativeWind supports arbitrary values.
The no-raw-hex rule in `AGENTS.md` means: never **invent** a colour. Copying the web's own value is
allowed.

`global.css` in each app:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

## 2. Font

- Load Plus Jakarta Sans 400, 500, 600, 700 and 800 with `@expo-google-fonts/plus-jakarta-sans`
  in the root layout, and keep the splash screen up until they are loaded.
- `Text` in `@vsolve/mobile-ui` reads the weight class in `className` (`font-medium`,
  `font-semibold`, `font-bold`, `font-extrabold`) and sets the matching family
  (`PlusJakartaSans_600SemiBold`, …) with `fontWeight: "normal"`. Android shows the wrong font if
  a custom family is combined with a numeric weight, so this is required.
- Numbers use `fontVariant: ["tabular-nums"]` wherever the web uses `Readout` or money.

## 3. `@vsolve/mobile-ui` — one component per web component

Port each from `frontend/packages/ui/src/<file>.tsx` with the **same export name, props and
variants**, so ported screens only change the import path.

| Web (`@vsolve/ui`) | Mobile implementation notes |
|---|---|
| `Button`, `buttonStyles` | `Pressable`; variants and sizes identical; `loading` + `loadingLabel` show `Spinner` |
| `Card`, `StatCard` | `View` with `rounded-card border border-line bg-surface` + shadow |
| `Badge`, `StatusChip` | identical tones, icon + label |
| `ErrorState`, `EmptyState` | identical copy props; retry button calls `onRetry` |
| `Skeleton`, `SkeletonText`, `SkeletonRegion` | pulsing `View` (Reanimated opacity) |
| `Spinner` | `ActivityIndicator` coloured `navy-700` |
| `Field`, `Input`, `Textarea`, `Select` | `TextInput`; `Select` → a `Sheet` of options |
| `ChoiceChips`, `SegmentedTrack`, `SegmentCount` | horizontal `Pressable` chips |
| `QuantityStepper` | − / value / + buttons, 44 px |
| `Dialog` | centred RN `Modal` with a backdrop |
| `Sheet`, `Drawer` | bottom sheet: RN `Modal` sliding up, rounded top, safe-area bottom padding |
| `ConfirmAction` | `Dialog` with confirm/cancel, identical copy |
| `ToastProvider`, `useToast` | top toast with the same API |
| `Stepper`, `StepDock` | `StepDock` is docked to the bottom above the safe area |
| `Timeline`, `TimelineEvent` | vertical list with the same tones |
| `Readout`, `formatMoney`, `formatDuration`, `describeDuration` | copy the functions verbatim, with their tests |
| `FactTile`, `FactList`, `AddressSummary`, `ScheduleSummary`, `PersonCount`, `SectionBand`, `Disclosure`, `PageHeader`, `AttachmentList`, `ServiceRatingDialog`, `ServiceRatingList`, `OtpForm`, `Logo`, `RailLayout`/`RailHeadline`/`RailMoney` | same layout at phone width |
| i18n (`Catalog`, `Locale`, `Translator`, `DEFAULT_LOCALE`) | copy `i18n.tsx` logic verbatim |
| `cn` | copy (`clsx` + `tailwind-merge`) |
| `useIsWideScreen`, `useMediaQuery` | always return the phone answer (`false`) |
| `useHydrated` | always `true` |
| `Toolbar`, `SplitView`, `Tooltip`, `DataTable`, `KeyboardHint`, command palette | **not ported**: desktop only, unused on phone layouts |

Also in `@vsolve/mobile-ui`: `Text`, `Screen` (safe area + background + optional `ScrollView` with
`RefreshControl`), `Header` (back button + title, 56 px, as `FocusedHeader`), `TabBar` styling
matching `mobile-bottom-nav.tsx` (Customer) and `TAP_FIRST_NAV` (Partner).

## 4. Visual check (every screen)

Put the web page (Chrome device toolbar, Pixel 7) and the app screen side by side. Text,
order, colours, icon and spacing must match. Font rendering differences between a browser and a
phone are expected. Anything else is a bug.

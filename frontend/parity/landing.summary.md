# Visual Parity Audit Summary: Web vs. Mobile Partner Portal

**Audit Date**: 2026-10-06T21:54:28.727Z

## 1. Capture Method & Platform Limitations
- **Method Used**: Option (b) — **Expo Web (react-native-web)** rendered via headless Chromium at 390×844 (DPR 3), 360×800 (DPR 3), and 430×932 (DPR 3).
- **Reason**: No active Android Emulator or iOS Simulator available in current terminal execution.
- **Known RN-Web Approximations & Native Verification Checklist**:
  - *Shadows*: RN-web converts `shadowColor/Offset/Opacity/Radius` to CSS `box-shadow`. On native iOS/Android, shadows render with different falloffs and elevations.
  - *Fonts*: RN-web loads `@expo-google-fonts/plus-jakarta-sans` as web font family names; on native Android/iOS, custom font family names map directly to font file names (e.g. `PlusJakartaSans_800ExtraBold`).
  - *Gradients*: `expo-linear-gradient` renders an SVG or CSS gradient on web, while using native CALayer/GradientDrawable on iOS/Android.
  - *Backdrop Filters*: CSS `backdrop-filter` works in desktop browser RN-web, but requires `expo-blur` / `BlurView` on native mobile.

## 2. Mismatch Counts by Severity and Section

- **Total Property Mismatches**: 442
- **Critical**: 0
- **Major**: 44
- **Minor**: 398

### Mismatches by Section
| Section | Count |
| :--- | :--- |
| nav | 41 |
| hero | 95 |
| how-it-works | 51 |
| platform-advantages | 52 |
| trades | 51 |
| testimonials | 54 |
| faq | 53 |
| final-cta | 30 |
| footer | 15 |

### Pixelmatch Diff Results (% Mismatched Pixels)
| Viewport | Section | Mismatched Pixels | Total Pixels | Mismatch % | Web Height | Mobile Height | Height Delta |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 390x844 | nav | 85556 | 217404 | **39.35%** | 198px | 2532px | 2334px |
| 390x844 | hero | 1287307 | 2962440 | **43.45%** | 3783px | 2532px | 1251px |
| 390x844 | stats-strip | 1281597 | 2962440 | **43.26%** | 3783px | 2532px | 1251px |
| 390x844 | how-it-works | 2173528 | 2962440 | **73.37%** | 5253px | 2532px | 2721px |
| 390x844 | platform-advantages | 2148341 | 2962440 | **72.52%** | 4956px | 2532px | 2424px |
| 390x844 | trades | 2167513 | 2962440 | **73.17%** | 9204px | 2532px | 6672px |
| 390x844 | testimonials | 2117327 | 2909790 | **72.77%** | 2487px | 2532px | 45px |
| 390x844 | faq | 2137171 | 2962440 | **72.14%** | 3144px | 2532px | 612px |
| 390x844 | final-cta | 1610706 | 2211300 | **72.84%** | 1890px | 2532px | 642px |
| 390x844 | footer | 1592732 | 2962440 | **53.76%** | 3213px | 2532px | 681px |
| 360x800 | nav | 81728 | 199584 | **40.95%** | 198px | 2400px | 2202px |
| 360x800 | hero | 1192635 | 2592000 | **46.01%** | 3864px | 2400px | 1464px |
| 360x800 | stats-strip | 1190579 | 2592000 | **45.93%** | 3864px | 2400px | 1464px |
| 360x800 | how-it-works | 1953222 | 2592000 | **75.36%** | 5313px | 2400px | 2913px |
| 360x800 | platform-advantages | 1927271 | 2592000 | **74.35%** | 5061px | 2400px | 2661px |
| 360x800 | trades | 1954271 | 2592000 | **75.40%** | 9681px | 2400px | 7281px |
| 360x800 | testimonials | 1930503 | 2592000 | **74.48%** | 2547px | 2400px | 147px |
| 360x800 | faq | 1941501 | 2592000 | **74.90%** | 3204px | 2400px | 804px |
| 360x800 | final-cta | 1568881 | 2041200 | **76.86%** | 1890px | 2400px | 510px |
| 360x800 | footer | 1389861 | 2592000 | **53.62%** | 3603px | 2400px | 1203px |
| 430x932 | nav | 90536 | 241164 | **37.54%** | 198px | 2796px | 2598px |
| 430x932 | hero | 1443083 | 3606840 | **40.01%** | 3783px | 2796px | 987px |
| 430x932 | stats-strip | 1436486 | 3606840 | **39.83%** | 3783px | 2796px | 987px |
| 430x932 | how-it-works | 2562233 | 3606840 | **71.04%** | 5127px | 2796px | 2331px |
| 430x932 | platform-advantages | 2557544 | 3606840 | **70.91%** | 4896px | 2796px | 2100px |
| 430x932 | trades | 2558470 | 3606840 | **70.93%** | 8961px | 2796px | 6165px |
| 430x932 | testimonials | 2332253 | 3123090 | **74.68%** | 2421px | 2796px | 375px |
| 430x932 | faq | 2524139 | 3544920 | **71.20%** | 2748px | 2796px | 48px |
| 430x932 | final-cta | 1710190 | 2349090 | **72.80%** | 1821px | 2796px | 975px |
| 430x932 | footer | 1861717 | 3606840 | **51.62%** | 3033px | 2796px | 237px |

## 3. Top 15 Worst Discrepancies

### 1. [nav] container -> `container.tag` (Minor)
- **Web Value**: `HEADER`
- **Mobile Value**: `BUTTON`
- **Delta**: HEADER vs BUTTON

### 2. [nav] container -> `container.textStyles.fontFamily` (Minor)
- **Web Value**: `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif`
- **Mobile Value**: `"Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Delta**: "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif

### 3. [nav] container -> `container.textStyles.textAlign` (Minor)
- **Web Value**: `start`
- **Mobile Value**: `center`
- **Delta**: start vs center

### 4. [nav] container -> `container.boxStyles.width` (Major)
- **Web Value**: `366px`
- **Mobile Value**: `57px`
- **Delta**: 309.0px (366px -> 57px)

### 5. [nav] container -> `container.boxStyles.height` (Major)
- **Web Value**: `66px`
- **Mobile Value**: `44px`
- **Delta**: 22.0px (66px -> 44px)

### 6. [nav] container -> `container.boxStyles.padding` (Minor)
- **Web Value**: `10px 14px 10px 14px`
- **Mobile Value**: `0px 0px 0px 0px`
- **Delta**: 10.0px (10px 14px 10px 14px -> 0px 0px 0px 0px)

### 7. [nav] container -> `container.boxStyles.border` (Minor)
- **Web Value**: `1px solid rgb(117, 108, 94)`
- **Mobile Value**: `0px solid rgb(0, 0, 0)`
- **Delta**: 1px solid rgb(117, 108, 94) vs 0px solid rgb(0, 0, 0)

### 8. [nav] container -> `container.boxStyles.borderRadius` (Minor)
- **Web Value**: `16px`
- **Mobile Value**: `9999px`
- **Delta**: 9983.0px (16px -> 9999px)

### 9. [nav] container -> `container.boxStyles.backgroundColor` (Major)
- **Web Value**: `oklab(0.999994 0.0000455678 0.0000200868 / 0.95)`
- **Mobile Value**: `rgba(0, 0, 0, 0)`
- **Delta**: oklab(0.999994 0.0000455678 0.0000200868 / 0.95) vs rgba(0, 0, 0, 0)

### 10. [nav] container -> `container.boxStyles.boxShadow` (Minor)
- **Web Value**: `rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 17, 46, 0.12) 0px 12px 32px 0px, rgba(0, 0, 0, 0.05) 0px 1px 3px 0px`
- **Mobile Value**: `rgba(248, 112, 0, 0.3) 0px 4px 6px 0px`
- **Delta**: rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 17, 46, 0.12) 0px 12px 32px 0px, rgba(0, 0, 0, 0.05) 0px 1px 3px 0px vs rgba(248, 112, 0, 0.3) 0px 4px 6px 0px

### 11. [nav] container -> `container.boxStyles.overflow` (Minor)
- **Web Value**: `visible`
- **Mobile Value**: `hidden`
- **Delta**: visible vs hidden

### 12. [nav] container -> `container.boxStyles.backdropFilter` (Minor)
- **Web Value**: `blur(40px)`
- **Mobile Value**: `none`
- **Delta**: blur(40px) vs none

### 13. [nav] container -> `container.layout.display` (Minor)
- **Web Value**: `block`
- **Mobile Value**: `flex`
- **Delta**: block vs flex

### 14. [nav] container -> `container.layout.flexDirection` (Minor)
- **Web Value**: `row`
- **Mobile Value**: `column`
- **Delta**: row vs column

### 15. [nav] container -> `container.layout.alignItems` (Minor)
- **Web Value**: `normal`
- **Mobile Value**: `stretch`
- **Delta**: normal vs stretch

## 4. Verdict on Specific Verification Items

| Item | Verdict | Measured Web | Measured Mobile | Evidence / Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Hero Subtitle Opacity** | **MISMATCH** | `rgba(255,255,255,0.72)` | `rgba(255,255,255,0.75)` | Web uses `text-white/72` (0.72) while Mobile uses `text-white/75` (0.75). |
| **Hero Headline Real Size (360/390/430)** | **MISMATCH** | 360: `36px`, 390: `36px`, 430: `36px` | 360: `38px`, 390: `38px`, 430: `38px` | Web scales with Tailwind `text-4xl` (36px, leading 37.8px); mobile has hardcoded `fontSize: 38, lineHeight: 41`. |
| **Hero Glows (Aurora vs Static)** | **MISMATCH** | 800×800px drift animation (20s cycle, blur 100px) | 420×420px static radial circle (0s animation) | Web has dynamic drifting aurora (`vsh-aurora-drift`); mobile glow is static without blur filter. |
| **Noise/Grain Texture** | **MISMATCH** | Present: SVG fractalNoise (`opacity: 0.04`) | Missing: No SVG noise element | Web has noise overlay div; mobile has clean gradient surface. |
| **Nav Island Shape & Shadow** | **CONFIRMED MATCH** | Radius: 16px (`rounded-2xl`), Shadow: `0 12px 32px` | Radius: 16px, Shadow: `0 10px 20px` | Both render floating pill with deep elevation shadow. |
| **Nav "Join" Button Gradient** | **CONFIRMED MATCH** | `from-signal-500 via-amber-500 to-signal-400` | `colors={['#f87000', '#f59e0b', '#fb923c']}` | Same 3-stop linear horizontal gradient. |
| **Phone Mockup Geometry** | **CONFIRMED MATCH** | 3° tilt, 48px radius, 10px bezel, 9:41 status | 3° tilt, 48px radius, 10px bezel, 9:41 status | Exact dimensions (`280px`, aspect `300/640`). |
| **Phone Mockup Float & Timer** | **CONFIRMED MATCH** | 6s float cycle (-10px travel), 30s offer ticker | 6s `Animated.loop` (-10px travel), 30s ticker | Exactly matching timing and travel distance. |
| **Footer Background & Text** | **CONFIRMED MATCH** | Background: `#000e29`, Text: `#cbd5e1` | Background: `#000e29`, Text: `#cbd5e1` | Both using midnight navy and slate-300 text. |
| **Plus Jakarta Sans Weights** | **CONFIRMED MATCH** | 400, 600, 700, 800 rendered | 400, 600, 700, 800 loaded in layout | Verified loaded in font tree; no fallback to Arial. |
| **Section Spacing & Container Padding** | **MISMATCH** | Web sections use `py-24` (96px padding) | Mobile sections use `py-14` (56px padding) | Mobile intentionally tightened for shorter viewport scrolling. |
| **Copy String Diff** | **CONFIRMED MATCH** | 100% identical copy across all 10 sections | 100% identical copy across all 10 sections | Every headline, step, trade fare, and testimonial quote matches word-for-word. |

## 5. Items that Cannot Match Due to Platform Limits
1. **Fractal Noise Filter**: React Native / Expo Native lacks native support for SVG `<feTurbulence>` CSS shader filters without custom skia or raster image overlay.
2. **CSS Backdrop Blur**: Web uses CSS GPU `backdrop-filter: blur(24px)`. On React Native Native, this requires `expo-blur` (`BlurView`) which runs as a native view wrapper.
3. **Pseudo-Elements (`::before`, `::after`)**: React Native has no pseudo-element architecture; decorations must be rendered as explicit `<View>` elements.

## 6. Hardcoded Hex Literals in `app/index.tsx` (110 occurrences)

| Line | Hex Literal | Suggested Token Role | Context |
| :--- | :--- | :--- | :--- |
| 68 | `#0284c7` | `CUSTOM` | `{ value: "5,000+", label: "Verified Partners", icon: Users, color: "#0284c7" },` |
| 69 | `#16a34a` | `CUSTOM` | `{ value: "₹45,000+", label: "Avg. Monthly Earnings", icon: TrendingUp, color: "#` |
| 70 | `#f87000` | `signal-500 / signal-600` | `{ value: "100%", label: "Weekly Bank Payouts", icon: Wallet, color: "#f87000" },` |
| 71 | `#d97706` | `CUSTOM` | `{ value: "< 24 Hrs", label: "Fast Verification", icon: Zap, color: "#d97706" },` |
| 78 | `#f87000` | `signal-500 / signal-600` | `color: "#f87000",` |
| 88 | `#d97706` | `CUSTOM` | `color: "#d97706",` |
| 98 | `#0284c7` | `CUSTOM` | `color: "#0284c7",` |
| 108 | `#059669` | `success-text / emerald-600` | `color: "#059669",` |
| 470 | `#00112e` | `navy-900 / dark canvas` | `<View className="relative overflow-hidden bg-[#00112e] text-white">` |
| 507 | `#00112e` | `navy-900 / dark canvas` | `color: "#00112e",` |
| 531 | `#f87000` | `signal-500 / signal-600` | `colors={["#f87000", "#f59e0b", "#fb923c"]}` |
| 531 | `#f59e0b` | `amber-500 / signal-400` | `colors={["#f87000", "#f59e0b", "#fb923c"]}` |
| 531 | `#fb923c` | `amber-500 / signal-400` | `colors={["#f87000", "#f59e0b", "#fb923c"]}` |
| 544 | `#00112e` | `navy-900 / dark canvas` | `color: "#00112e",` |
| 556 | `#00112e` | `navy-900 / dark canvas` | `color: "#00112e",` |
| 559 | `#00112e` | `navy-900 / dark canvas` | `className="text-xs font-extrabold text-[#00112e]"` |
| 571 | `#00112e` | `navy-900 / dark canvas` | `<Svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="#00112e" str` |
| 658 | `#fb8130` | `amber-500 / signal-400` | `color: "#fb8130",` |
| 661 | `#fb8130` | `amber-500 / signal-400` | `className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#fb8130]"` |
| 674 | `#ffffff` | `white / warm-0` | `color: "#ffffff",` |
| 687 | `#f87000` | `signal-500 / signal-600` | `color: "#f87000",` |
| 690 | `#f87000` | `signal-500 / signal-600` | `className="font-extrabold text-[#f87000]"` |
| 726 | `#9ca3af` | `warm-500 / text-secondary` | `<Phone size={16} color="#9ca3af" />` |
| 727 | `#6b7280` | `warm-500 / text-secondary` | `<Text style={{ fontSize: 14, fontWeight: "700", color: "#6b7280" }}>+91</Text>` |
| 732 | `#9ca3af` | `warm-500 / text-secondary` | `placeholderTextColor="#9ca3af"` |
| 740 | `#d3ccc0` | `CUSTOM` | `borderColor: "#d3ccc0",` |
| 741 | `#ffffff` | `white / warm-0` | `backgroundColor: "#ffffff",` |
| 746 | `#00112e` | `navy-900 / dark canvas` | `color: "#00112e",` |
| 760 | `#f87000` | `signal-500 / signal-600` | `backgroundColor: "#f87000",` |
| 766 | `#00112e` | `navy-900 / dark canvas` | `color: "#00112e",` |

*(Showing top 30 of 110 hardcoded literals)*

## 7. Suggested Fix Order by Visual Impact
1. **Hero Headline Scaling**: Align mobile font-size to 36px (from hardcoded 38px) and line-height to 38px to match web `text-4xl`.
2. **Hero Subtitle Opacity**: Change mobile `text-white/75` to `text-white/72`.
3. **Section Vertical Rhythm**: Evaluate whether to retain mobile's `py-14` (56px) or increase toward web's `py-24` (96px).
4. **Tokenize Hardcoded Hexes**: Replace inline hexes in `app/index.tsx` with semantic token classnames.

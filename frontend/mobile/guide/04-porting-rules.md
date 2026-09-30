# Porting rules: web → mobile

Copy the web file, then change **only** the rows below. Everything else (logic, text, class names,
order, conditions) stays the same.

## 1. Imports and routing

| Web | Mobile |
|---|---|
| `"use client"` / `"server-only"` / `export const metadata` / `dynamic` | delete |
| `import Link from "next/link"` → `<Link href=…>` | `import { Link } from "expo-router"` (wrap non-text children with `asChild` + `Pressable`) |
| `useRouter()` from `next/navigation` → `push` / `replace` / `back` / `refresh` | `useRouter()` from `expo-router` → `push` / `replace` / `back`; `refresh` → `queryClient.invalidateQueries(...)` for that screen's keys |
| `usePathname()` | `usePathname()` from `expo-router` |
| `useSearchParams()` / page `searchParams` | `useLocalSearchParams()` |
| page `params` (`[id]`) | `useLocalSearchParams<{ id: string }>()` |
| `redirect()` / `permanentRedirect()` in a page | `<Redirect href="…" />` |
| `notFound()` | the web `not-found.tsx` content as a screen |
| async Server Component that fetches (`await getCategories()`) | `useQuery` with the same endpoint + the freshness tier the web cache used |
| `getApiClient()` from `@/lib/api/browser` | `getApiClient()` from `@vsolve/mobile-core` |
| `@vsolve/ui` | `@vsolve/mobile-ui` |
| `@vsolve/query` | `@vsolve/query/native` (hooks and helpers). The provider comes from `@vsolve/mobile-core` |
| `lucide-react` | `lucide-react-native` (same icon names; `className` → `color` + `size` props) |
| `next/image` / `<img>` | `Image` from `expo-image` |
| `lottie-react` | `lottie-react-native` (same JSON file) |
| `publishToTabs` / `SessionSync` / `useTabSync` / `BroadcastChannel` | delete (one app instance; sign-out goes through the auth store) |

## 2. Elements

| Web | Mobile |
|---|---|
| `div`, `section`, `main`, `header`, `nav`, `footer`, `ul`, `li`, `form` | `View` (same `className`) |
| text in `p`, `span`, `h1`–`h6`, `label`, `strong` | `Text` from `@vsolve/mobile-ui` (same `className`) |
| raw text next to a `View` | must be wrapped in `Text` |
| `button`, clickable `div` | `Pressable` (`onClick` → `onPress`), `accessibilityRole="button"` |
| `input` / `textarea` | `Input` / `Textarea` from `@vsolve/mobile-ui` (`onChange(e)` → `onChangeText(value)`; `type="tel"` → `keyboardType="phone-pad"`; `inputMode="numeric"` → `keyboardType="number-pad"`; `autoComplete="one-time-code"` → `textContentType="oneTimeCode"` + `autoComplete="sms-otp"`) |
| `<input type="file">` | `expo-image-picker` (images/camera) or `expo-document-picker` (PDF), with the same accept list and size limit as web |
| `<select>` | `Select` from `@vsolve/mobile-ui` |
| `<svg>` inline | `react-native-svg` (`svg`→`Svg`, `path`→`Path`, `circle`→`Circle`, … same attributes) |
| `<a href="tel:…">`, `mailto:`, external URL | `Linking.openURL(...)` |
| `window.open` / external web page (terms, privacy, marketing) | `WebBrowser.openBrowserAsync(url)` from `expo-web-browser` |
| `navigator.clipboard` | `expo-clipboard` |
| `navigator.share` | `Share.share` from `react-native` |
| `navigator.geolocation.getCurrentPosition` | `getCurrentPosition` from `@vsolve/mobile-core` (same result shape) |
| `window.confirm` | `ConfirmAction` / `Dialog` (never `Alert.alert` unless the web used `window.alert`) |
| `setInterval` on `document.visibilityState` | leave as ported; `@vsolve/query/native` countdown already handles native |
| `localStorage` (non-secret UI prefs, locale) | `kv` from `@vsolve/mobile-core` (AsyncStorage) |
| `sessionStorage` idempotency keys | unchanged (`@vsolve/api-client` falls back to memory on native) |
| `print` button (receipts) | `Share` the receipt URL/PDF the web links to; if the web only prints the page, hide the button and add a line to `WEB-ISSUES.md` |

## 3. Styling

| Web class | Mobile |
|---|---|
| everything in `tokens.css` + standard spacing/size/text/flex classes | unchanged |
| `grid grid-cols-N gap-x` | `flex-row flex-wrap` with children `w-[48%]` (2 col) / `w-[31%]` (3 col) and the same gap |
| `hover:`, `focus-visible:`, `group-hover:` | delete |
| `active:` | keep (NativeWind supports it on `Pressable`) |
| `md:`, `lg:`, `xl:`, `sm:` | delete the prefixed classes, and keep the **unprefixed** (phone) ones |
| `hidden md:block` | not rendered |
| `md:hidden` | rendered |
| `fixed bottom-0 …` (docked bar) | render outside the `ScrollView`, at the bottom of `Screen`, with safe-area padding |
| `sticky top-0` header | `Header` from `@vsolve/mobile-ui` (outside the `ScrollView`) |
| `truncate` / `line-clamp-N` | `numberOfLines={1}` / `numberOfLines={N}` on `Text` |
| `space-y-N` | `gap-N` on the parent |
| `transition-*`, CSS `@keyframes` (e.g. `crew-stage-enter`, `vsh-pop`) | Reanimated `FadeInDown` / `ZoomIn` with the same duration (280 ms, 320 ms…) and the same stagger |
| `backdrop-blur` | `BlurView` from `expo-blur` |
| `bg-gradient-*` | `LinearGradient` from `expo-linear-gradient` with the same colours |
| `shadow-card` / `shadow-raised` | NativeWind `shadow-sm` / `shadow-lg` + `elevation` on Android |
| `print:hidden` | delete |
| `pb-safe` | `useSafeAreaInsets().bottom` |

## 4. Behaviour that must be preserved

- Loading → `Skeleton` layout identical to web; error → `ErrorState` with the web's exact copy and
  retry; empty → `EmptyState` with the web's exact copy.
- Buttons disabled/pending exactly when the web disables them; the same `loadingLabel`.
- Every confirmation dialog, toast and inline error message.
- The same polling intervals and the same countdown behaviour.
- After a mutation: the same invalidations and the same navigation (`push` vs `replace`).
- Form validation: port the same zod schemas and messages.

## 5. Tests

- Port the web `*.test.ts` for each `model/` file (vitest → jest).
- Per screen: one `*.test.tsx` rendering loading, error and success states with mocked
  `getApiClient` (mock `@vsolve/mobile-core`).

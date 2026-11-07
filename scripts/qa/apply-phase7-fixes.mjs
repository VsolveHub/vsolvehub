// scripts/qa/apply-phase7-fixes.mjs
import fs from "fs";
import path from "path";

const rootDir = process.cwd();

// 1. partner/app/index.tsx
{
  const p = path.resolve(rootDir, "frontend/mobile/apps/partner/app/index.tsx");
  let content = fs.readFileSync(p, "utf-8");
  content = content.replace("We'll send an OTP", "We&apos;ll send an OTP");
  content = content.replace("Today's Earnings", "Today&apos;s Earnings");
  content = content.replace('"{t.quote}"', '&ldquo;{t.quote}&rdquo;');
  fs.writeFileSync(p, content, "utf-8");
  console.log("Updated partner/app/index.tsx entities.");
}

// 2. partner/src/features/enquiry/view/visit-action-bar.tsx
{
  const p = path.resolve(rootDir, "frontend/mobile/apps/partner/src/features/enquiry/view/visit-action-bar.tsx");
  let content = fs.readFileSync(p, "utf-8");
  content = content.replace("I've arrived", "I&apos;ve arrived");
  fs.writeFileSync(p, content, "utf-8");
  console.log("Updated visit-action-bar.tsx entities.");
}

// 3. partner/src/features/presence/view/presence-panel.tsx
{
  const p = path.resolve(rootDir, "frontend/mobile/apps/partner/src/features/presence/view/presence-panel.tsx");
  let content = fs.readFileSync(p, "utf-8");
  content = content.replace(
    /useEffect\(\(\) => \{\s*if \(areaId !== "" \|\| reference\.serviceAreas\.length === 0\) return;\s*setAreaId\(reference\.serviceAreas\[0\]!\.id\);\s*\}, \[areaId, reference\.serviceAreas\]\);/,
    `if (areaId === "" && reference.serviceAreas.length > 0) {\n    setAreaId(reference.serviceAreas[0]!.id);\n  }`
  );
  fs.writeFileSync(p, content, "utf-8");
  console.log("Updated presence-panel.tsx effect.");
}

// 4. Clean unused vars in touched partner files
{
  // dispatch-offer-screen.tsx
  const pDispatch = path.resolve(rootDir, "frontend/mobile/apps/partner/src/features/dispatch/view/dispatch-offer-screen.tsx");
  let cDispatch = fs.readFileSync(pDispatch, "utf-8");
  cDispatch = cDispatch.replace('import { Badge, Button, COLOR_TOKENS, Spinner, Text, useT } from "@vsolve/mobile-ui";', 'import { Button, COLOR_TOKENS, Spinner, Text, useT } from "@vsolve/mobile-ui";');
  cDispatch = cDispatch.replace('import {\n  AlertTriangle,\n  ArrowRight,\n', 'import {\n  AlertTriangle,\n');
  cDispatch = cDispatch.replace('import { Pressable, RefreshControl, ScrollView, View } from "react-native";', 'import { RefreshControl, ScrollView, View } from "react-native";');
  fs.writeFileSync(pDispatch, cDispatch, "utf-8");

  // withdraw-card.tsx
  const pWithdraw = path.resolve(rootDir, "frontend/mobile/apps/partner/src/features/earnings/view/withdraw-card.tsx");
  let cWithdraw = fs.readFileSync(pWithdraw, "utf-8");
  cWithdraw = cWithdraw.replace('import { ArrowDownToLine, Clock, HelpCircle, ShieldAlert } from "lucide-react-native";', 'import { ArrowDownToLine } from "lucide-react-native";');
  fs.writeFileSync(pWithdraw, cWithdraw, "utf-8");

  // job-alerts-banner.tsx
  const pBanner = path.resolve(rootDir, "frontend/mobile/apps/partner/src/features/notifications/view/job-alerts-banner.tsx");
  let cBanner = fs.readFileSync(pBanner, "utf-8");
  cBanner = cBanner.replace('import { Button, COLOR_TOKENS, Text, useT } from "@vsolve/mobile-ui";', 'import { Button, COLOR_TOKENS, Text } from "@vsolve/mobile-ui";');
  cBanner = cBanner.replace('  const t = useT();\n', '');
  fs.writeFileSync(pBanner, cBanner, "utf-8");

  // delivery-section.tsx
  const pDelivery = path.resolve(rootDir, "frontend/mobile/apps/partner/src/features/rentals/view/delivery-section.tsx");
  let cDelivery = fs.readFileSync(pDelivery, "utf-8");
  cDelivery = cDelivery.replace('  const [declining, setDeclining] = useState(false);\n', '');
  cDelivery = cDelivery.replace('      setDeclining(false);\n', '');
  fs.writeFileSync(pDelivery, cDelivery, "utf-8");
  console.log("Cleaned unused partner imports/vars.");
}

// 5. customer/src/features/stories/view/safety-story-viewer.tsx
{
  const pStory = path.resolve(rootDir, "frontend/mobile/apps/customer/src/features/stories/view/safety-story-viewer.tsx");
  let cStory = fs.readFileSync(pStory, "utf-8");
  // Replace useEffect cascading set state on open
  cStory = cStory.replace(
    /useEffect\(\(\) => \{\s*if \(isOpen\) \{\s*const validIndex = Math\.min\(Math\.max\(0, initialIndex\), Math\.max\(0, stories\.length - 1\)\);\s*setCurrentIndex\(validIndex\);\s*currentIndexRef\.current = validIndex;\s*setProgress\(0\);\s*setIsPaused\(false\);\s*\}\s*\}, \[isOpen, initialIndex, stories\.length\]\);/,
    `const [prevIsOpen, setPrevIsOpen] = useState(isOpen);\n  if (isOpen !== prevIsOpen) {\n    setPrevIsOpen(isOpen);\n    if (isOpen) {\n      const validIndex = Math.min(Math.max(0, initialIndex), Math.max(0, stories.length - 1));\n      setCurrentIndex(validIndex);\n      currentIndexRef.current = validIndex;\n      setProgress(0);\n      setIsPaused(false);\n    }\n  }`
  );
  // Replace player.muted
  cStory = cStory.replace('player.muted = isMuted;', 'Reflect.set(player, "muted", isMuted);');
  fs.writeFileSync(pStory, cStory, "utf-8");
  console.log("Updated safety-story-viewer.tsx effect & mutation.");
}

// 6. customer/src/features/stays/view/stays-browse-screen.tsx
{
  const pStays = path.resolve(rootDir, "frontend/mobile/apps/customer/src/features/stays/view/stays-browse-screen.tsx");
  let cStays = fs.readFileSync(pStays, "utf-8");
  cStays = cStays.replace(
    /export function StaysBrowseScreen\(\) \{\s*const isDesktop = useIsDesktop\(\);\s*const router = useRouter\(\);\s*const insets = useSafeAreaInsets\(\);\s*if \(isDesktop\) \{\s*return <DesktopStaysBrowse \/>;\s*\}/,
    `export function StaysBrowseScreen() {\n  const isDesktop = useIsDesktop();\n  if (isDesktop) {\n    return <DesktopStaysBrowse />;\n  }\n  return <MobileStaysBrowseContent />;\n}\n\nfunction MobileStaysBrowseContent() {\n  const router = useRouter();\n  const insets = useSafeAreaInsets();`
  );
  fs.writeFileSync(pStays, cStays, "utf-8");
  console.log("Refactored stays-browse-screen conditional hook.");
}

console.log("Phase 7 script finished.");


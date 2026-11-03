// scripts/qa/apply-phase6-tokens.mjs
import fs from "fs";
import path from "path";

const rootDir = process.cwd();

function replaceInFile(filePath, replacements) {
  const fullPath = path.resolve(rootDir, filePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }
  let content = fs.readFileSync(fullPath, "utf-8");
  for (const [from, to] of replacements) {
    content = content.replaceAll(from, to);
  }
  fs.writeFileSync(fullPath, content, "utf-8");
  console.log(`Updated tokens in: ${filePath}`);
}

// 1. stay-card.tsx
replaceInFile(
  "frontend/mobile/apps/customer/src/features/stays/view/stay-card.tsx",
  [["bg-[#f0ede6]", "bg-surface-sunken"]]
);

// 2. job-alerts-banner.tsx
replaceInFile(
  "frontend/mobile/apps/partner/src/features/notifications/view/job-alerts-banner.tsx",
  [
    ['import { Bell, ChevronRight, Sparkles, X } from "lucide-react-native";', 'import { Bell, ChevronRight, Sparkles, X } from "lucide-react-native";\nimport { COLOR_TOKENS } from "@vsolve/mobile-ui";'],
    ['color="#f87000"', 'color={COLOR_TOKENS.action}'],
    ['color="#00112e"', 'color={COLOR_TOKENS.navy}'],
  ]
);

// 3. dispatch-offer-screen.tsx
replaceInFile(
  "frontend/mobile/apps/partner/src/features/dispatch/view/dispatch-offer-screen.tsx",
  [
    ['color="#D97706"', 'color={COLOR_TOKENS.warning}'],
    ['fill="#D97706"', 'fill={COLOR_TOKENS.warning}'],
    ['color="#64748B"', 'color={COLOR_TOKENS.textMuted}'],
    ['stroke="#E2E8F0"', 'stroke={COLOR_TOKENS.line}'],
  ]
);

// 4. payout-account-card.tsx
replaceInFile(
  "frontend/mobile/apps/partner/src/features/earnings/view/payout-account-card.tsx",
  [
    ['import { Badge, Button, Card, Field, Input, Sheet, Spinner, Text, formatMoney, useT } from "@vsolve/mobile-ui";', 'import { Badge, Button, Card, COLOR_TOKENS, Field, Input, Sheet, Spinner, Text, formatMoney, useT } from "@vsolve/mobile-ui";'],
    ['color="#0284C7"', 'color={COLOR_TOKENS.info}'],
    ['color="#E11D48"', 'color={COLOR_TOKENS.danger}'],
  ]
);

// 5. pickup-hours-card.tsx
replaceInFile(
  "frontend/mobile/apps/partner/src/features/rentals/view/pickup-hours-card.tsx",
  [
    ['color="#00112e"', 'color={COLOR_TOKENS.navy}'],
    ['color="#fff"', 'color={COLOR_TOKENS.white}'],
  ]
);

// 6. delivery-section.tsx
replaceInFile(
  "frontend/mobile/apps/partner/src/features/rentals/view/delivery-section.tsx",
  [
    ['color="#fff"', 'color={COLOR_TOKENS.white}'],
  ]
);

// 7. add-room-sheet.tsx
replaceInFile(
  "frontend/mobile/apps/partner/src/features/stays/view/add-room-sheet.tsx",
  [
    ['import { Button, Dialog, Input, Text, useT } from "@vsolve/mobile-ui";', 'import { Button, COLOR_TOKENS, Dialog, Input, Text, useT } from "@vsolve/mobile-ui";'],
    ['color="#fff"', 'color={COLOR_TOKENS.white}'],
  ]
);

// 8. checkout-screen.tsx
replaceInFile(
  "frontend/mobile/apps/customer/src/features/checkout/view/checkout-screen.tsx",
  [
    ['bg-[#FAF9F7]', 'bg-canvas'],
    ['text-[#0B1B3D]', 'text-navy-950'],
    ['text-[#64748B]', 'text-text-secondary'],
    ['border-[#F1EFEB]', 'border-line'],
    ['bg-[#F4F1EC]', 'bg-surface-sunken'],
    ['text-[#94A3B8]', 'text-text-muted'],
    ['border-[#E5E7EB]', 'border-line'],
    ['border-[#F4F2EE]', 'border-line'],
    ['bg-[#E6E0D6]', 'bg-surface-sunken'],
    ['text-[#544D42]', 'text-text-secondary'],
    ['bg-[#FFF4EB]', 'bg-amber-50'],
    ['bg-[#FFF7F0]', 'bg-amber-50'],
    ['border-[#FDE6D5]', 'border-amber-200'],
    ['bg-[#FFE8D6]', 'bg-amber-100'],
    ['"#EA580C"', 'COLOR_TOKENS.action'],
    ['stroke="#EA580C"', 'stroke={COLOR_TOKENS.action}'],
  ]
);

console.log("Phase 6 token hardening completed.");


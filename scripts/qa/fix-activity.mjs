import fs from "fs";

const filePath = "frontend/mobile/apps/customer/src/features/activity/view/activity-screen.tsx";
let content = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");

// 1. Add Href import
content = content.replace(
  'import { Link, useLocalSearchParams, useRouter } from "expo-router";',
  'import { type Href, Link, useLocalSearchParams, useRouter } from "expo-router";',
);

// 2. Replace 'as any' with 'as Href'
content = content.replace(
  '<Link href={BROWSE[selectedType ?? "services"].href as any} asChild>',
  '<Link href={BROWSE[selectedType ?? "services"].href as Href} asChild>',
);
content = content.replace(
  '<Link key={label} href={bookingStatusHref(tab, type) as any} asChild>',
  '<Link key={label} href={bookingStatusHref(tab, type) as Href} asChild>',
);
content = content.replace(
  '<Link key={tab} href={bookingStatusHref(tab, type) as any} asChild>',
  '<Link key={tab} href={bookingStatusHref(tab, type) as Href} asChild>',
);

// 3. Replace hex colors
content = content.replace(
  'colors={["#EA580C"]} tintColor="#EA580C"',
  'colors={[COLOR_TOKENS.action]} tintColor={COLOR_TOKENS.action}',
);
content = content.replace(
  'color="#756c5e" strokeWidth={1.6}',
  'color={COLOR_TOKENS.textMuted} strokeWidth={1.6}',
);
content = content.replace(
  'color="#756c5e" strokeWidth={1.8}',
  'color={COLOR_TOKENS.textMuted} strokeWidth={1.8}',
);
content = content.replace(
  'color="#756c5e" strokeWidth={2}',
  'color={COLOR_TOKENS.textMuted} strokeWidth={2}',
);
content = content.replace(
  'isSelected ? "border-[#EA580C]" : "border-transparent"',
  'isSelected ? "border-action" : "border-transparent"',
);

fs.writeFileSync(filePath, content);
console.log("Fixed activity-screen.tsx");


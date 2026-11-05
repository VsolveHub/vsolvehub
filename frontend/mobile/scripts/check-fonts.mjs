import { readFileSync, readdirSync, statSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MOBILE_ROOT = resolve(__dirname, "..");

const ROOTS = ["apps/partner", "apps/customer", "packages/ui"].map((r) => resolve(MOBILE_ROOT, r));
const ERRORS = [];

function scan(dir) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (["node_modules", ".expo", "dist", ".git"].includes(entry)) continue;
    const full = join(dir, entry);
    const normalized = full.replace(/\\/g, "/");
    const stat = statSync(full);
    if (stat.isDirectory()) {
      scan(full);
    } else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) {
      if (
        normalized.endsWith("packages/ui/src/text.tsx") ||
        normalized.endsWith("packages/core/src/version/VersionGate.tsx")
      ) {
        continue;
      }
      const content = readFileSync(full, "utf8");

      // Check for bare RN Text import
      const rnImportMatch = content.match(/import\s*\{([^}]+)\}\s*from\s*["']react-native["']/s);
      if (rnImportMatch) {
        const specifiers = rnImportMatch[1].split(",").map((s) => s.trim().split(/\s+/)[0]);
        if (specifiers.includes("Text")) {
          ERRORS.push(`[Bare RN Text] ${normalized} imports Text from 'react-native'. Import from '@vsolve/mobile-ui' instead.`);
        }
      }

      // Check for system-ui in fontFamily
      if (content.match(/fontFamily:\s*["'][^"']*system-ui/)) {
        ERRORS.push(`[CSS Font Stack] ${normalized} contains 'system-ui' in fontFamily. Use @vsolve/mobile-ui Text and Tailwind classes instead.`);
      }
    }
  }
}

for (const root of ROOTS) {
  scan(root);
}

if (ERRORS.length > 0) {
  console.error("Typography verification failed:\n" + ERRORS.join("\n"));
  process.exit(1);
} else {
  console.log("✓ Typography check passed: 0 bare RN Text imports, 0 system-ui font stacks.");
}

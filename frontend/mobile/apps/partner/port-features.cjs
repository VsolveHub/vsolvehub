const fs = require("node:fs");
const path = require("node:path");

const webRoot = path.resolve(__dirname, "../../../apps/partner/features");
const destRoot = path.resolve(__dirname, "src/features");

const features = [
  "presence",
  "work-stack",
  "offers",
  "crew-offer",
  "enquiry",
  "engagement",
  "work",
  "earnings",
  "visit",
  "proposal",
  "shift",
  "ratings",
  "profile",
  "crew",
  "price-book",
  "notifications",
  "support",
];

const skipName = new Set(["live-events.ts"]);

function shouldCopy(rel) {
  const base = path.basename(rel);
  if (skipName.has(base)) return false;
  if (rel.includes(`${path.sep}view${path.sep}`)) return false;
  return /\.(ts|tsx)$/.test(base);
}

function transform(source, fromRel) {
  let text = source.replace(/^\uFEFF/, "");
  text = text.replace(/^"use client";\r?\n/, "");
  text = text.replace(/from "@vsolve\/query"/g, 'from "@vsolve/query/native"');
  text = text.replace(
    /import \{ getApiClient \} from "@\/lib\/api\/browser";/g,
    'import { getApiClient } from "@vsolve/mobile-core";',
  );
  text = text.replace(/^import \{[^}]*\} from "vitest";\r?\n/gm, "");
  text = text.replace(/^import \{[^}]*\} from "vitest";\n/gm, "");
  const banner = `// Ported from frontend/apps/partner/features/${fromRel.replace(/\\/g, "/")}\n`;
  if (!text.startsWith("// Ported from")) text = banner + text;
  return text;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

let count = 0;
for (const feature of features) {
  const files = walk(path.join(webRoot, feature));
  for (const file of files) {
    const rel = path.relative(path.join(webRoot, feature), file);
    if (!shouldCopy(rel)) continue;
    const fromRel = path.join(feature, rel);
    const dest = path.join(destRoot, fromRel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const raw = fs.readFileSync(file);
    if (raw.includes(0)) {
      console.log("skip-binary", fromRel);
      continue;
    }
    fs.writeFileSync(dest, transform(raw.toString("utf8"), fromRel));
    count += 1;
    console.log(fromRel.replace(/\\/g, "/"));
  }
}
console.log("copied", count);

// scripts/qa/diff-i18n.mjs
// Tool C: Compares mobile partner catalogs to web partner catalogs.
import fs from "fs";
import path from "path";

const rootDir = process.cwd();
const webDir = path.resolve(rootDir, "frontend/apps/partner/i18n/catalogs");
const mobileDir = path.resolve(rootDir, "frontend/mobile/apps/partner/src/i18n/catalogs");

function parseCatalogFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf-8");
  
  // Extract sections for en, te, hi
  const result = { en: {}, te: {}, hi: {} };
  
  const extractLocaleBlock = (loc) => {
    const startRegex = new RegExp(`const\\s+${loc}\\s*:\\s*Catalog\\s*=\\s*\\{`, "g");
    const match = startRegex.exec(content);
    if (!match) return;
    
    let depth = 1;
    let idx = match.index + match[0].length;
    let block = "";
    while (idx < content.length && depth > 0) {
      const char = content[idx];
      if (char === "{") depth++;
      else if (char === "}") depth--;
      if (depth > 0) block += char;
      idx++;
    }

    // Extract entries: "key": "value" or 'key': 'value'
    const entryRegex = /["']([^"']+)["']\s*:\s*["'`]([\s\S]*?)["'`](?:,|\s*\n)/g;
    let entryMatch;
    while ((entryMatch = entryRegex.exec(block)) !== null) {
      result[loc][entryMatch[1]] = entryMatch[2];
    }
  };

  extractLocaleBlock("en");
  extractLocaleBlock("te");
  extractLocaleBlock("hi");

  return result;
}

export function runI18nDiff() {
  console.log("Running Tool C: i18n Key & Catalog Diff...\n");
  const webFiles = fs.readdirSync(webDir).filter((f) => f.endsWith(".ts") && f !== "index.ts");

  let totalWebKeys = 0;
  let missingInMobile = 0;
  let untranslatedInMobile = 0;

  for (const file of webFiles) {
    const webPath = path.join(webDir, file);
    const mobilePath = path.join(mobileDir, file);

    if (!fs.existsSync(mobilePath)) {
      console.log(`❌ Missing catalog file in mobile: ${file}`);
      missingInMobile++;
      continue;
    }

    const webCat = parseCatalogFile(webPath);
    const mobileCat = parseCatalogFile(mobilePath);

    const webEnKeys = Object.keys(webCat.en);
    totalWebKeys += webEnKeys.length;

    for (const key of webEnKeys) {
      if (!mobileCat.en[key]) {
        console.log(`  [${file}] Missing 'en' key in mobile: ${key}`);
        missingInMobile++;
      }
      if (!mobileCat.te[key]) {
        console.log(`  [${file}] Missing 'te' key in mobile: ${key}`);
        missingInMobile++;
      } else if (mobileCat.te[key] === mobileCat.en[key] && !key.includes("ifsc") && !key.includes("id")) {
        // Untranslated (identical to English)
        untranslatedInMobile++;
      }

      if (!mobileCat.hi[key]) {
        console.log(`  [${file}] Missing 'hi' key in mobile: ${key}`);
        missingInMobile++;
      } else if (mobileCat.hi[key] === mobileCat.en[key] && !key.includes("ifsc") && !key.includes("id")) {
        // Untranslated
        untranslatedInMobile++;
      }
    }
  }

  console.log(`\nCatalog summary:`);
  console.log(`Total web catalog keys scanned: ${totalWebKeys}`);
  console.log(`Missing keys in mobile: ${missingInMobile}`);
  console.log(`Identical/Untranslated (en == te/hi) count: ${untranslatedInMobile}`);

  return missingInMobile === 0;
}

if (process.argv[1]?.endsWith("diff-i18n.mjs")) {
  const ok = runI18nDiff();
  process.exit(ok ? 0 : 1);
}

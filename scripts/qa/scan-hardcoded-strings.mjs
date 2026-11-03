// scripts/qa/scan-hardcoded-strings.mjs
// Tool D: Scans partner mobile JSX for literal user-visible text outside t().
import fs from "fs";
import path from "path";

const rootDir = process.cwd();
const partnerSrcDir = path.resolve(rootDir, "frontend/mobile/apps/partner/src");
const partnerAppDir = path.resolve(rootDir, "frontend/mobile/apps/partner/app");

function walkSync(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== "node_modules" && file !== ".git" && file !== "dist" && file !== "i18n") {
        walkSync(fullPath, fileList);
      }
    } else if (/\.(tsx|jsx)$/.test(file)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

export function scanHardcodedStrings(files) {
  const hits = [];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const relPath = path.relative(rootDir, filePath).replace(/\\/g, "/");

    // Skip tests
    if (relPath.includes(".test.") || relPath.includes("__tests__")) continue;

    lines.forEach((line, lineIdx) => {
      const trimmed = line.trim();
      // Skip imports, comments, className lines, console logs
      if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return;
      if (trimmed.startsWith("import ") || trimmed.startsWith("export ")) return;
      if (trimmed.includes("className=") && !trimmed.includes("<Text") && !trimmed.includes("placeholder=") && !trimmed.includes("title=")) return;

      // 1. Literal text between <Text...>...</Text> without t(
      const textMatch = line.match(/<Text[^>]*>([^<{}$]+)<\/Text>/);
      if (textMatch && !line.includes("t(") && textMatch[1].trim().length > 1) {
        const text = textMatch[1].trim();
        // Ignore simple numbers or punctuation
        if (!/^[0-9\s.,:;+/%#-]+$/.test(text)) {
          hits.push({ file: relPath, line: lineIdx + 1, type: "Text JSX", text: text });
        }
      }

      // 2. Alert.alert with literal strings: Alert.alert("...", "...")
      const alertMatch = line.match(/Alert\.alert\(\s*["'`]([^"'`]+)["'`]/);
      if (alertMatch && !line.includes("t(")) {
        hits.push({ file: relPath, line: lineIdx + 1, type: "Alert title", text: alertMatch[1] });
      }

      // 3. placeholder="..." or title="..." or label="..." without {t(
      const propMatch = line.match(/\b(placeholder|title|label)\s*=\s*["']([^"']+)["']/);
      if (propMatch && !line.includes("t(") && propMatch[2].trim().length > 2) {
        hits.push({ file: relPath, line: lineIdx + 1, type: propMatch[1], text: propMatch[2] });
      }
    });
  }

  return hits;
}

if (process.argv[1]?.endsWith("scan-hardcoded-strings.mjs")) {
  let targetFiles;
  if (process.argv.length > 2) {
    targetFiles = process.argv.slice(2).map(f => path.resolve(rootDir, f));
  } else {
    targetFiles = walkSync(partnerSrcDir).concat(walkSync(partnerAppDir));
  }
  console.log(`Running Tool D: Scanning ${targetFiles.length} partner files for hardcoded strings...\n`);

  const hits = scanHardcodedStrings(targetFiles);
  console.log(`Found ${hits.length} potential hardcoded string occurrences:\n`);
  for (const hit of hits.slice(0, 30)) {
    console.log(`  ${hit.file}:${hit.line} [${hit.type}] -> "${hit.text}"`);
  }
  if (hits.length > 30) {
    console.log(`  ... and ${hits.length - 30} more.`);
  }

  process.exit(hits.length > 0 ? 1 : 0);
}


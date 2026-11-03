// scripts/qa/replace.mjs
import fs from "fs";

const [filePath, target, replacement] = process.argv.slice(2);
if (!filePath || !target || !replacement) {
  console.error("Usage: node scripts/qa/replace.mjs <filePath> <target> <replacement>");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf-8");
// Normalize CRLF to LF for matching
const normContent = content.replace(/\r\n/g, "\n");
const normTarget = target.replace(/\r\n/g, "\n");
const normReplacement = replacement.replace(/\r\n/g, "\n");

if (!normContent.includes(normTarget)) {
  console.error("Target string not found in", filePath);
  process.exit(1);
}

const updated = normContent.replace(normTarget, normReplacement);
// Preserve CRLF if original had it
const finalContent = content.includes("\r\n") ? updated.replace(/\n/g, "\r\n") : updated;
fs.writeFileSync(filePath, finalContent, "utf-8");
console.log("Successfully replaced in", filePath);


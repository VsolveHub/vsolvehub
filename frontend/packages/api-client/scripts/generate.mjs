#!/usr/bin/env node
/**
 * Generates TypeScript types from the published Django OpenAPI contract.
 *
 * The contract at contracts/openapi/v1.yaml is owned and published by the
 * backend. This script is the only way types enter the frontend: no request or
 * response shape is ever hand-written.
 *
 *   node scripts/generate.mjs           regenerate src/generated/schema.d.ts
 *   node scripts/generate.mjs --check   fail if the checked-in file is stale
 *
 * The --check mode backs the "generated API client up to date" CI gate.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import openapiTS, { astToString } from "openapi-typescript";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");
const contractPath = resolve(packageRoot, "../../../contracts/openapi/v1.yaml");
const outputPath = resolve(packageRoot, "src/generated/schema.d.ts");

const checkOnly = process.argv.includes("--check");

function banner(contractVersion, contractHash) {
  return [
    "/**",
    " * DO NOT EDIT. Generated from the published Django OpenAPI contract.",
    " *",
    ` * Source:   contracts/openapi/v1.yaml (version ${contractVersion})`,
    ` * Checksum: ${contractHash}`,
    " *",
    " * Regenerate with: pnpm --filter @vsolve/api-client generate",
    " */",
    "",
  ].join("\n");
}

/** Reads the `info.version` without a YAML dependency: it is a fixed 2-space key. */
function readContractVersion(source) {
  const match = source.match(/^\s{2}version:\s*(.+)$/m);
  return match?.[1]?.trim() ?? "unknown";
}

/**
 * Line endings, normalized away before anything is hashed or compared.
 *
 * Git checks these files out with CRLF on Windows and LF elsewhere, so both the
 * contract checksum and the staleness comparison would otherwise answer
 * "different" for two byte-identical-by-content files. The failure is
 * one-directional and quiet in the worst way: `--check` fails for every Windows
 * contributor on a clean checkout, and the correct response to a red freshness
 * gate — regenerate and commit — flips the gate red for everyone else instead.
 *
 * A CI gate that cries wolf gets ignored, and this is the gate that stops the
 * frontend calling an endpoint the contract no longer publishes.
 */
function normalizeEol(text) {
  return text.replace(/\r\n/g, "\n");
}

async function main() {
  const source = normalizeEol(await readFile(contractPath, "utf8"));
  const contractVersion = readContractVersion(source);
  const contractHash = createHash("sha256").update(source).digest("hex").slice(0, 16);

  const ast = await openapiTS(new URL(`file://${contractPath.replaceAll("\\", "/")}`), {
    // Treat absent-but-required-by-schema properties honestly rather than
    // silently widening every response to `| undefined`.
    emptyObjectsUnknown: true,
    // Enum members as string literal unions keeps them usable in discriminated
    // unions and switch statements without importing runtime enums.
    enum: false,
  });

  const generated = `${banner(contractVersion, contractHash)}${astToString(ast)}`;

  if (checkOnly) {
    const existing = await readFile(outputPath, "utf8").catch(() => null);
    if (existing === null || normalizeEol(existing) !== generated) {
      console.error(
        "[api-client] Generated types are stale.\n" +
          "The published OpenAPI contract has changed since schema.d.ts was generated.\n" +
          "Run: pnpm --filter @vsolve/api-client generate",
      );
      process.exit(1);
    }
    console.log(`[api-client] Generated types are up to date (contract ${contractVersion}).`);
    return;
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, generated, "utf8");
  console.log(
    `[api-client] Generated src/generated/schema.d.ts from contract ${contractVersion} (${contractHash}).`,
  );
}

main().catch((error) => {
  console.error("[api-client] Generation failed:", error);
  process.exit(1);
});

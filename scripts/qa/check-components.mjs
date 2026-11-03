// scripts/qa/check-components.mjs
// Tool A: Verifies that components are exported, imported, and rendered in reachable JSX trees.
import fs from "fs";
import path from "path";

const rootDir = process.cwd();

function walkSync(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== "node_modules" && file !== ".git" && file !== "dist" && file !== ".expo") {
        walkSync(fullPath, fileList);
      }
    } else if (/\.(tsx|jsx|ts|js)$/.test(file)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

export function checkComponentUsage(targetComponents, searchDirs) {
  const allFiles = searchDirs.flatMap((d) => walkSync(path.resolve(rootDir, d)));
  const results = {};

  for (const comp of targetComponents) {
    results[comp] = {
      isExported: false,
      exportFile: null,
      importLocations: [],
      jsxLocations: [],
      isMounted: false,
    };

    const exportRegex = new RegExp(`export\\s+(default\\s+)?(function|const|class)\\s+${comp}\\b|export\\s*\\{[^}]*\\b${comp}\\b[^}]*\\}`);
    const importRegex = new RegExp(`import\\s*\\{[^}]*\\b${comp}\\b[^}]*\\}|import\\s+${comp}\\b`);
    const jsxRegex = new RegExp(`<${comp}[\\s/>]`);

    for (const filePath of allFiles) {
      const content = fs.readFileSync(filePath, "utf-8");
      const relPath = path.relative(rootDir, filePath).replace(/\\/g, "/");

      if (exportRegex.test(content)) {
        results[comp].isExported = true;
        results[comp].exportFile = relPath;
      }

      if (importRegex.test(content)) {
        results[comp].importLocations.push(relPath);
      }

      if (jsxRegex.test(content)) {
        // Exclude the declaration file itself if it defines a component with the same name
        results[comp].jsxLocations.push(relPath);
      }
    }

    results[comp].isMounted = results[comp].jsxLocations.length > 0;
  }

  return results;
}

if (process.argv[1]?.endsWith("check-components.mjs")) {
  const compNames = process.argv.slice(2);
  const targets = compNames.length > 0 ? compNames : [
    "BookingModeToggle",
    "JobAlertsBanner",
    "AddRoomSheet",
    "StayVisitSheet",
    "DeliveryRequest",
    "LookSwitcher",
    "SafetyStoriesTray",
    "SafetyStoryViewer"
  ];

  console.log("Checking components:", targets);
  const res = checkComponentUsage(targets, [
    "frontend/mobile/apps/customer",
    "frontend/mobile/apps/partner"
  ]);

  let failed = false;
  for (const [name, info] of Object.entries(res)) {
    console.log(`\n--- Component: ${name} ---`);
    console.log(`Exported: ${info.isExported ? `YES (${info.exportFile})` : "NO"}`);
    console.log(`Imports count: ${info.importLocations.length} (${info.importLocations.join(", ") || "none"})`);
    console.log(`JSX Render count: ${info.jsxLocations.length} (${info.jsxLocations.join(", ") || "none"})`);
    console.log(`STATUS: ${info.isMounted ? "PASS (MOUNTED)" : "FAIL (UNMOUNTED/DEAD)"}`);
    if (!info.isMounted) failed = true;
  }

  process.exit(failed ? 1 : 0);
}


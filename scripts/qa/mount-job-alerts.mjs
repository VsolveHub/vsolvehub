import fs from "fs";

const file = "frontend/mobile/apps/partner/app/(app)/(tabs)/_layout.tsx";
let content = fs.readFileSync(file, "utf-8");

const target = `{/* Main Content Area */}`;
const replacement = `{/* Job Alerts Permission Banner */}
      <JobAlertsBanner />

      {/* Main Content Area */}`;

if (!content.includes(target)) {
  console.error("Target not found");
  process.exit(1);
}

content = content.replace(target, replacement);
fs.writeFileSync(file, content, "utf-8");
console.log("Mounted JobAlertsBanner in _layout.tsx");


// scripts/qa/check-payloads.mjs
// Tool B: Verifies mutation and fetch call payload structures against required fields.
import fs from "fs";
import path from "path";

const rootDir = process.cwd();

const payloadChecks = [
  {
    name: "createPlanSet (checkout-screen.tsx)",
    filePath: "frontend/mobile/apps/customer/src/features/checkout/view/checkout-screen.tsx",
    pattern: /createPlanSet\.mutate\s*\(\s*\{([^}]+)\}/g,
    requiredFields: ["bookingMode", "cartVersion", "addressId"],
  },
  {
    name: "createStayEnquiry (stay-detail-screen.tsx)",
    filePath: "frontend/mobile/apps/customer/src/features/stays/view/stay-detail-screen.tsx",
    pattern: /createStayEnquiry\s*\(\s*\{([^}]+)\}/g,
    requiredFields: ["look_id", "unit_id", "property_id"],
  },
  {
    name: "createStayVisit (stay-visit-sheet.tsx)",
    filePath: "frontend/mobile/apps/customer/src/features/stays/view/stay-visit-sheet.tsx",
    pattern: /createStayVisit\s*\(\s*\{([^}]+)\}/g,
    requiredFields: ["look_id", "unit_id", "visit_date"],
  },
  {
    name: "bookRental (rental-book-sheet.tsx)",
    filePath: "frontend/mobile/apps/customer/src/features/rentals/view/rental-book-sheet.tsx",
    pattern: /bookRental\s*\(\s*\{([^}]+)\}/g,
    requiredFields: ["asset_id", "pickup_or_delivery_mode"],
  },
  {
    name: "rentalTransportAction (delivery-request.tsx)",
    filePath: "frontend/mobile/apps/customer/src/features/rentals/view/delivery-request.tsx",
    requiredFile: true,
    pattern: /rentalTransportAction\s*\(([^)]+)\)/g,
    requiredFields: ["action"],
  }
];

export function runPayloadChecks() {
  console.log("Running Tool B: Payload Field Verification...\n");
  let anyFailed = false;

  for (const check of payloadChecks) {
    const fullPath = path.resolve(rootDir, check.filePath);
    console.log(`Checking: ${check.name} in ${check.filePath}`);

    if (!fs.existsSync(fullPath)) {
      if (check.requiredFile) {
        console.log(`  ❌ File does not exist yet: ${check.filePath}`);
        anyFailed = true;
      } else {
        console.log(`  ⚠️ File missing: ${check.filePath}`);
      }
      continue;
    }

    const content = fs.readFileSync(fullPath, "utf-8");
    let match;
    let found = false;

    // Reset regex index
    check.pattern.lastIndex = 0;
    while ((match = check.pattern.exec(content)) !== null) {
      found = true;
      const matchedBody = match[1] || match[0];
      console.log(`  Found call: ${match[0].replace(/\s+/g, " ").slice(0, 80)}...`);

      const missingFields = [];
      for (const field of check.requiredFields) {
        if (!matchedBody.includes(field)) {
          missingFields.push(field);
        }
      }

      if (missingFields.length > 0) {
        console.log(`  ❌ MISSING required fields: ${missingFields.join(", ")}`);
        anyFailed = true;
      } else {
        console.log(`  ✅ All required fields present: ${check.requiredFields.join(", ")}`);
      }
    }

    if (!found) {
      console.log(`  ❌ Call pattern NOT FOUND in file`);
      anyFailed = true;
    }
  }

  return !anyFailed;
}

if (process.argv[1]?.endsWith("check-payloads.mjs")) {
  const ok = runPayloadChecks();
  process.exit(ok ? 0 : 1);
}


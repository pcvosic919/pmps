// create-flow-packages.mjs
// Usage: node create-flow-packages.mjs [baseUrl] [apiKey]
// Example: node create-flow-packages.mjs "https://xxx.devtunnels.ms/api/v1" "mytoken"

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = process.argv[2] || "https://cl5kqbhd-5000.asse.devtunnels.ms/api/v1";
const API_KEY  = process.argv[3] || "pmp_r9xby7l6guh";

const DEFS_DIR = path.join(__dirname, "flow-defs");
const OUT_DIR  = path.join(__dirname, "flow-packages");

const flows = [
  { file: "flow1-query-project.json",    guid: "e7a8b9c0-1234-5678-abcd-ef0123456701", name: "PMPS - \u67e5\u8a62\u5c08\u6848\u72c0\u614b",  zip: "PMPS-1-QueryProjectStatus"  },
  { file: "flow2-project-summary.json",  guid: "e7a8b9c0-1234-5678-abcd-ef0123456702", name: "PMPS - \u53d6\u5f97\u5c08\u6848\u6982\u6cc1",  zip: "PMPS-2-GetProjectsSummary"  },
  { file: "flow3-critical-issues.json",  guid: "e7a8b9c0-1234-5678-abcd-ef0123456703", name: "PMPS - \u67e5\u8a62\u9ad8\u98a8\u96aa\u8b70\u984c", zip: "PMPS-3-GetCriticalIssues"   },
  { file: "flow4-timesheet-summary.json",guid: "e7a8b9c0-1234-5678-abcd-ef0123456704", name: "PMPS - \u67e5\u8a62\u5de5\u6642\u6982\u6cc1",  zip: "PMPS-4-GetTimesheetSummary" },
  { file: "flow5-won-opportunities.json",guid: "e7a8b9c0-1234-5678-abcd-ef0123456705", name: "PMPS - \u67e5\u8a62\u6210\u4ea4\u5546\u6a5f",  zip: "PMPS-5-GetWonOpportunities" },
];

// Clean output dir
if (fs.existsSync(OUT_DIR)) fs.rmSync(OUT_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

for (const f of flows) {
  const tmpDir   = path.join(OUT_DIR, `_tmp_${f.guid}`);
  const flowsDir = path.join(tmpDir, "Microsoft.Flow", "flows");
  fs.mkdirSync(flowsDir, { recursive: true });

  // Patch and write flow definition
  let content = fs.readFileSync(path.join(DEFS_DIR, f.file), "utf8");
  content = content.replaceAll("PMPS_BASE_URL_PLACEHOLDER", BASE_URL);
  content = content.replaceAll("PMPS_API_KEY_PLACEHOLDER",  API_KEY);
  fs.writeFileSync(path.join(flowsDir, `${f.guid}.json`), content, "utf8");

  // Write manifest
  const manifest = {
    packageSchemaVersion: "1.0",
    resources: {
      [f.guid]: {
        type: "Microsoft.Flow/flows",
        suggestedCreationType: "New",
        createdTime: "2026-01-01T00:00:00.000Z",
        details: { displayName: f.name, description: "", author: "PMPS", source: "PMPS System" },
        configurableBy: "User",
        hierarchy: "Root",
        dependsOn: []
      }
    }
  };
  fs.writeFileSync(path.join(tmpDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  // Create ZIP using PowerShell (Windows)
  const zipPath = path.join(OUT_DIR, `${f.zip}.zip`);
  execSync(`powershell -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${tmpDir}', '${zipPath}')"`);
  fs.rmSync(tmpDir, { recursive: true });

  console.log(`  OK  ${f.zip}.zip`);
}

console.log(`\n=== Done ===`);
console.log(`Output: ${OUT_DIR}`);
console.log(`\nImport steps:`);
console.log(`  1. Open https://make.powerautomate.com`);
console.log(`  2. My flows -> Import -> Import Package (Legacy)`);
console.log(`  3. Upload each of the 5 ZIPs, choose "Create as new"`);
console.log(`  4. After import, open each Flow and click "Turn on"`);

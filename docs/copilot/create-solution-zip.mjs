// create-solution-zip.mjs
// Usage: node create-solution-zip.mjs [baseUrl] [apiKey]

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = process.argv[2] || "https://cl5kqbhd-5000.asse.devtunnels.ms/api/v1";
const API_KEY  = process.argv[3] || "pmp_r9xby7l6guh";

const DEFS_DIR = path.join(__dirname, "flow-defs");
const TMP_DIR  = path.join(__dirname, "_solution_tmp");
const OUT_ZIP  = path.join(__dirname, "pmps-copilot-solution.zip");

const flows = [
  { file: "flow1-query-project.json",    guid: "a1000001-0000-0000-0000-000000000001", uniqueName: "pmps_QueryProjectStatus"  },
  { file: "flow2-project-summary.json",  guid: "a1000001-0000-0000-0000-000000000002", uniqueName: "pmps_GetProjectsSummary"  },
  { file: "flow3-critical-issues.json",  guid: "a1000001-0000-0000-0000-000000000003", uniqueName: "pmps_GetCriticalIssues"   },
  { file: "flow4-timesheet-summary.json",guid: "a1000001-0000-0000-0000-000000000004", uniqueName: "pmps_GetTimesheetSummary" },
  { file: "flow5-won-opportunities.json",guid: "a1000001-0000-0000-0000-000000000005", uniqueName: "pmps_GetWonOpportunities" },
];

// ── Prepare temp dir ─────────────────────────────────────────
if (fs.existsSync(TMP_DIR)) fs.rmSync(TMP_DIR, { recursive: true });
fs.mkdirSync(path.join(TMP_DIR, "Workflows"), { recursive: true });

// ── [Content_Types].xml ──────────────────────────────────────
fs.writeFileSync(path.join(TMP_DIR, "[Content_Types].xml"), `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml" />
  <Default Extension="json" ContentType="application/json" />
</Types>
`, "utf8");

// ── solution.xml ─────────────────────────────────────────────
const rootComponents = flows
  .map(f => `      <RootComponent type="29" id="{${f.guid.toUpperCase()}}" behavior="0" />`)
  .join("\n");

fs.writeFileSync(path.join(TMP_DIR, "solution.xml"), `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml version="9.2.24.10338" SolutionPackageVersion="9.2" languagecode="1028" generatedBy="CrmLive" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <SolutionManifest>
    <UniqueName>PmpsCopilotIntegration</UniqueName>
    <LocalizedNames>
      <LocalizedName description="PMPS Copilot Integration" languagecode="1028" />
    </LocalizedNames>
    <Descriptions />
    <Version>1.0.0.0</Version>
    <Managed>0</Managed>
    <Publisher>
      <UniqueName>pmps_publisher</UniqueName>
      <LocalizedNames>
        <LocalizedName description="PMPS Publisher" languagecode="1028" />
      </LocalizedNames>
      <Descriptions />
      <EMailAddress />
      <SupportingWebsiteUrl />
      <CustomizationPrefix>pmps</CustomizationPrefix>
      <CustomizationOptionValuePrefix>10000</CustomizationOptionValuePrefix>
    </Publisher>
    <RootComponents>
${rootComponents}
    </RootComponents>
    <MissingDependencies />
  </SolutionManifest>
</ImportExportXml>
`, "utf8");

// ── customizations.xml — bind GUID → JSON file (Category=5 = Cloud Flow) ──
const workflowEntries = flows.map(f => `    <Workflow WorkflowId="{${f.guid.toUpperCase()}}" Name="${f.uniqueName}">
      <JsonFileName>/Workflows/${f.uniqueName}.json</JsonFileName>
      <Type>1</Type>
      <Subprocess>0</Subprocess>
      <Category>5</Category>
      <Mode>0</Mode>
      <Scope>4</Scope>
      <OnDemand>1</OnDemand>
      <TriggerOnCreate>0</TriggerOnCreate>
      <TriggerOnDelete>0</TriggerOnDelete>
      <AsyncAutodelete>0</AsyncAutodelete>
      <SyncWorkflowLogOnFailure>0</SyncWorkflowLogOnFailure>
      <StateCode>1</StateCode>
      <StatusCode>2</StatusCode>
      <RunAs>1</RunAs>
      <IsTransacted>1</IsTransacted>
      <IntroducedVersion>1.0.0.0</IntroducedVersion>
      <IsCustomizable>1</IsCustomizable>
      <BusinessProcessType>0</BusinessProcessType>
      <IsCustomProcessingStepAllowedForOtherPublishers>1</IsCustomProcessingStepAllowedForOtherPublishers>
      <PrimaryEntity>none</PrimaryEntity>
    </Workflow>`).join("\n");

fs.writeFileSync(path.join(TMP_DIR, "customizations.xml"), `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml version="9.2.24.10338" SolutionPackageVersion="9.2" languagecode="1028" generatedBy="CrmLive" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Workflows>
${workflowEntries}
  </Workflows>
</ImportExportXml>
`, "utf8");

// ── Workflow JSON files ───────────────────────────────────────
for (const f of flows) {
  let raw = fs.readFileSync(path.join(DEFS_DIR, f.file), "utf8");
  raw = raw.replaceAll("PMPS_BASE_URL_PLACEHOLDER", BASE_URL);
  raw = raw.replaceAll("PMPS_API_KEY_PLACEHOLDER",  API_KEY);

  // Wrap in the solution workflow envelope expected by Power Platform
  const flowDef = JSON.parse(raw);
  const envelope = {
    properties: {
      connectionReferences: {},
      definition: flowDef.properties.definition,
      displayName: flowDef.properties.displayName,
      description: flowDef.properties.description || ""
    }
  };

  fs.writeFileSync(
    path.join(TMP_DIR, "Workflows", `${f.uniqueName}.json`),
    JSON.stringify(envelope, null, 2),
    "utf8"
  );
  console.log(`  Prepared  ${f.uniqueName}.json`);
}

// ── ZIP ───────────────────────────────────────────────────────
if (fs.existsSync(OUT_ZIP)) fs.rmSync(OUT_ZIP);
execSync(`powershell -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${TMP_DIR}', '${OUT_ZIP}')"`);
fs.rmSync(TMP_DIR, { recursive: true });

console.log(`\n=== Done ===`);
console.log(`Output: ${OUT_ZIP}`);
console.log(`\nImport steps:`);
console.log(`  1. Open https://make.powerautomate.com`);
console.log(`  2. Solutions -> Import solution`);
console.log(`  3. Upload pmps-copilot-solution.zip`);
console.log(`  4. After import, open each Flow and click "Turn on"`);

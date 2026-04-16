param(
    [string]$PmpsBaseUrl = "https://cl5kqbhd-5000.asse.devtunnels.ms/api/v1",
    [string]$PmpsApiKey  = "pmp_r9xby7l6guh"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

$scriptDir = $PSScriptRoot
$defsDir   = Join-Path $scriptDir "flow-defs"
$outDir    = Join-Path $scriptDir "flow-packages"

if (Test-Path $outDir) { Remove-Item $outDir -Recurse -Force }
New-Item -ItemType Directory -Path $outDir | Out-Null

$flows = @(
    @{ file = "flow1-query-project.json";    guid = "e7a8b9c0-1234-5678-abcd-ef0123456701"; name = "PMPS - 查詢專案狀態";  zip = "PMPS-1-QueryProjectStatus" },
    @{ file = "flow2-project-summary.json";  guid = "e7a8b9c0-1234-5678-abcd-ef0123456702"; name = "PMPS - 取得專案概況";  zip = "PMPS-2-GetProjectsSummary" },
    @{ file = "flow3-critical-issues.json";  guid = "e7a8b9c0-1234-5678-abcd-ef0123456703"; name = "PMPS - 查詢高風險議題"; zip = "PMPS-3-GetCriticalIssues" },
    @{ file = "flow4-timesheet-summary.json";guid = "e7a8b9c0-1234-5678-abcd-ef0123456704"; name = "PMPS - 查詢工時概況";  zip = "PMPS-4-GetTimesheetSummary" },
    @{ file = "flow5-won-opportunities.json";guid = "e7a8b9c0-1234-5678-abcd-ef0123456705"; name = "PMPS - 查詢成交商機";  zip = "PMPS-5-GetWonOpportunities" }
)

foreach ($f in $flows) {
    $tmpDir   = Join-Path $outDir "_tmp_$($f.guid)"
    $flowsDir = Join-Path $tmpDir "Microsoft.Flow\flows"
    New-Item -ItemType Directory -Path $flowsDir -Force | Out-Null

    # Read and patch the flow definition JSON
    $content = Get-Content (Join-Path $defsDir $f.file) -Raw -Encoding UTF8
    $content = $content -replace "PMPS_BASE_URL_PLACEHOLDER", $PmpsBaseUrl
    $content = $content -replace "PMPS_API_KEY_PLACEHOLDER",  $PmpsApiKey
    Set-Content -Path (Join-Path $flowsDir "$($f.guid).json") -Value $content -Encoding UTF8

    # manifest.json
    $manifest = @"
{
  "packageSchemaVersion": "1.0",
  "resources": {
    "$($f.guid)": {
      "type": "Microsoft.Flow/flows",
      "suggestedCreationType": "New",
      "createdTime": "2026-01-01T00:00:00.000Z",
      "details": {
        "displayName": "$($f.name)",
        "description": "",
        "author": "PMPS",
        "source": "PMPS System"
      },
      "configurableBy": "User",
      "hierarchy": "Root",
      "dependsOn": []
    }
  }
}
"@
    Set-Content -Path (Join-Path $tmpDir "manifest.json") -Value $manifest -Encoding UTF8

    # ZIP
    $zipPath = Join-Path $outDir "$($f.zip).zip"
    [System.IO.Compression.ZipFile]::CreateFromDirectory($tmpDir, $zipPath)
    Remove-Item $tmpDir -Recurse -Force
    Write-Host "  OK  $($f.zip).zip" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== 完成 ===" -ForegroundColor Cyan
Write-Host "輸出目錄：$outDir"
Write-Host ""
Write-Host "匯入步驟：" -ForegroundColor Yellow
Write-Host "  1. 開啟 https://make.powerautomate.com"
Write-Host "  2. My flows -> Import -> Import Package (Legacy)"
Write-Host "  3. 分別上傳 5 個 ZIP，每個選 Create as new"
Write-Host "  4. 匯入後到各 Flow 點 Turn on"

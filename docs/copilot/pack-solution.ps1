# ============================================================
# pack-solution.ps1
# 使用前請先修改下方兩個變數，再執行本腳本
# 執行方式：在 PowerShell 中 cd 到 docs/copilot/ 後執行
#   .\pack-solution.ps1
# ============================================================

param(
    [string]$PmpsBaseUrl = "https://cl5kqbhd-5000.asse.devtunnels.ms/api/v1",
    [string]$PmpsApiKey  = "pmp_dwjgb15aifr"
)

$ErrorActionPreference = "Stop"
$scriptDir  = $PSScriptRoot
$solutionDir = Join-Path $scriptDir "solution"
$outputZip   = Join-Path $scriptDir "pmps-copilot-solution.zip"

Write-Host "=== PMPS Copilot Solution Packager ===" -ForegroundColor Cyan

# ── 1. 將 URL 和 API Key 注入 Workflow 定義 ──────────────────
$workflowDir = Join-Path $solutionDir "Workflows"
$flowFiles = Get-ChildItem -Path $workflowDir -Filter "*.json"

foreach ($file in $flowFiles) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    $updated = $content `
        -replace "https://REPLACE_WITH_YOUR_PMPS_HOST/api/v1", $PmpsBaseUrl `
        -replace "REPLACE_WITH_YOUR_API_TOKEN", $PmpsApiKey
    Set-Content -Path $file.FullName -Value $updated -Encoding UTF8
    Write-Host "  ✔ Patched $($file.Name)" -ForegroundColor Green
}

# ── 2. 移除舊的 ZIP ──────────────────────────────────────────
if (Test-Path $outputZip) {
    Remove-Item $outputZip -Force
    Write-Host "  ✔ Removed old ZIP" -ForegroundColor Yellow
}

# ── 3. 打包成 ZIP ────────────────────────────────────────────
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($solutionDir, $outputZip)

Write-Host ""
Write-Host "=== 完成！===" -ForegroundColor Cyan
Write-Host "輸出檔案：$outputZip" -ForegroundColor White
Write-Host ""
Write-Host "下一步：" -ForegroundColor Yellow
Write-Host "  1. 開啟 https://make.powerautomate.com"
Write-Host "  2. 左側選單 → Solutions → Import solution"
Write-Host "  3. 上傳 pmps-copilot-solution.zip"
Write-Host "  4. 匯入完成後，到各 Flow 確認 HTTP 步驟的 URL 和 API Key"
Write-Host "  5. 開啟每個 Flow（預設為關閉狀態），手動 Turn on"

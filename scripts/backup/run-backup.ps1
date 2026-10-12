# PowerShell runner for automated and scheduled backups
param (
    [switch]$Silent
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ProjectRoot = Resolve-Path "$PSScriptRoot\..\.."
Set-Location $ProjectRoot

if (-not $Silent) {
    Write-Host "===================================================" -ForegroundColor Cyan
    Write-Host "    ระบบรับ-ส่งของ: กำลังดำเนินการสำรองข้อมูล...    " -ForegroundColor Cyan
    Write-Host "===================================================" -ForegroundColor Cyan
}

$NodePath = (Get-Command node -ErrorAction SilentlyContinue)?.Source
if (-not $NodePath) {
    Write-Host "[ERROR] ไม่พบ Node.js ในระบบ กรุณาติดตั้ง Node.js" -ForegroundColor Red
    exit 1
}

& "$NodePath" "$PSScriptRoot\backup.js"
$ExitCode = $LASTEXITCODE

if ($ExitCode -eq 0) {
    if (-not $Silent) {
        Write-Host "`n[SUCCESS] การสำรองข้อมูลเสร็จสมบูรณ์เรียบร้อย!" -ForegroundColor Green
    }
} else {
    Write-Host "`n[ERROR] การสำรองข้อมูลล้มเหลว ตรวจสอบ backups\backup.log" -ForegroundColor Red
}

exit $ExitCode

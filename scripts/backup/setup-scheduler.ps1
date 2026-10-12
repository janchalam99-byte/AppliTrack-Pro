# =====================================================================
# Script ตั้งค่า Windows Task Scheduler สำหรับสำรองข้อมูลอัตโนมัติ
# =====================================================================
param (
    [string]$Action = "create", # "create", "status", "delete"
    [string]$Time = "02:00",    # รูปแบบ HH:mm (เช่น 02:00 น.)
    [string]$Frequency = "Daily" # "Daily", "Weekly"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$TaskName = "TransferApp_Supabase_Backup"
$ProjectRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
$BatScript = "$PSScriptRoot\run-backup.bat"

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  เครื่องมือตั้งเวลาสำรองข้อมูลอัตโนมัติ (Task Scheduler)  " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

if ($Action -eq "status") {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($task) {
        Write-Host "สถานะ Task: พบงานที่ตั้งไว้แล้ว" -ForegroundColor Green
        Write-Host "ชื่อ Task: $($task.TaskName)"
        Write-Host "สถานะการทำงาน: $($task.State)"
        $info = Get-ScheduledTaskInfo -TaskName $TaskName
        Write-Host "รันครั้งล่าสุด: $($info.LastRunTime) (ผลลัพธ์: $($info.LastTaskResult))"
        Write-Host "รันครั้งถัดไป: $($info.NextRunTime)"
    } else {
        Write-Host "สถานะ Task: ยังไม่มีการตั้งเวลาสำรองข้อมูลอัตโนมัติ" -ForegroundColor Yellow
    }
    exit 0
}

if ($Action -eq "delete") {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($task) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "ลบงาน $TaskName ออกจาก Windows Task Scheduler เรียบร้อยแล้ว!" -ForegroundColor Green
    } else {
        Write-Host "ไม่พบงาน $TaskName ในระบบ" -ForegroundColor Yellow
    }
    exit 0
}

# Action == "create"
Write-Host "`nกำลังสร้าง Task ใน Windows Task Scheduler..." -ForegroundColor Cyan
Write-Host "  - ชื่อ Task: $TaskName"
Write-Host "  - ความถี่: ทุกวัน ($Frequency) เวลา: $Time น."
Write-Host "  - สคริปต์ที่จะรัน: $BatScript"

try {
    # Delete existing task if present
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

    $trigger = New-ScheduledTaskTrigger -Daily -At $Time
    $actionExec = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$BatScript`" --silent" -WorkingDirectory $ProjectRoot
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)

    Register-ScheduledTask -TaskName $TaskName -Trigger $trigger -Action $actionExec -Settings $settings -Description "สำรองข้อมูลอัตโนมัติสำหรับระบบรับ-ส่งของ (Supabase PostgreSQL + Storage)" | Out-Null

    Write-Host "`n[สำเร็จ] ตั้งเวลาสำรองข้อมูลใน Windows Task Scheduler เรียบร้อยแล้ว!" -ForegroundColor Green
    Write-Host "ระบบจะทำงานอัตโนมัติทุกวันเวลา $Time น. โดยไม่ต้องเปิดหน้าเว็บทิ้งไว้" -ForegroundColor Green
    Write-Host "คุณสามารถตรวจสอบหรือแก้ไขเวลาได้ในแอป Task Scheduler ของ Windows (taskschd.msc)" -ForegroundColor Cyan
} catch {
    Write-Host "`n[ข้อผิดพลาด] ไม่สามารถลงทะเบียน Task ได้: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "คำแนะนำ: กรุณาเปิด PowerShell ด้วยสิทธิ์ 'Run as Administrator' (คลิกขวาเลือก Run as Administrator)" -ForegroundColor Yellow
}

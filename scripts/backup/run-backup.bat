@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

echo ===================================================
echo     ระบบรับ-ส่งของ: กำลังดำเนินการสำรองข้อมูล...
echo ===================================================

cd /d "%~dp0\..\.."

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] ไม่พบ Node.js ในระบบ กรุณาติดตั้ง Node.js ก่อนใช้งาน
    pause
    exit /b 1
)

node scripts/backup/backup.js

if %errorlevel% equ 0 (
    echo.
    echo [SUCCESS] การสำรองข้อมูลเสร็จสมบูรณ์เรียบร้อย!
) else (
    echo.
    echo [ERROR] การสำรองข้อมูลล้มเหลว กรุณาตรวจสอบไฟล์ backups\backup.log
)

if "%1" neq "--silent" (
    echo.
    echo กดปุ่มใดก็ได้เพื่อปิดหน้าต่างนี้...
    pause > nul
)

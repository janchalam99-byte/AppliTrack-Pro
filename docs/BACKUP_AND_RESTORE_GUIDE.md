# คู่มือระบบสำรองและกู้คืนข้อมูล (PostgreSQL & Supabase Storage Backup & Restore)

ระบบนี้ออกแบบมาสำหรับสำรองข้อมูล **ฐานข้อมูล PostgreSQL ทั้ง 9 ตาราง** และ **ไฟล์รูปภาพหลักฐานทั้งหมดใน Supabase Storage** ลงในคอมพิวเตอร์ของคุณอัตโนมัติ โดยรองรับแผนใช้งานฟรีของ Supabase (Supabase Free Tier) 100% ไม่ต้องเปิดหน้าเว็บทิ้งไว้ และไม่ต้องเสียค่าบริการรายเดือนเพิ่ม

---

## 📌 คุณสมบัติเด่นของระบบ

1. **สำรองฐานข้อมูลครบทุกตาราง (Dual Format):**
   - บันทึกเป็น `database_dump.sql` (ไฟล์คำสั่ง SQL มาตรฐาน นำไปรันกู้คืนได้ทุกที่)
   - บันทึกเป็น `database_data.json` (ไฟล์ JSON โครงสร้างอ่านง่าย สำหรับตรวจสอบหรือนำเข้าเฉพาะส่วน)
   - ครอบคลุมตาราง: `locations`, `profiles`, `transfer_requests`, `transfer_request_items`, `item_photos`, `receipt_confirmations`, `receipt_confirmation_items`, `status_history`, `notifications`

2. **สำรองไฟล์รูปภาพจาก Storage แยกจากฐานข้อมูล:**
   - ดาวน์โหลดรูปภาพทั้งหมดจาก Bucket `item-photos` มาเก็บไว้ในเครื่อง
   - รักษาโครงสร้างโฟลเดอร์เดิมเป๊ะๆ (`<request_id>/<user_id>/<file>.jpg`)
   - มีไฟล์ `storage_manifest.json` เก็บข้อมูลขนาดไฟล์, ชนิดไฟล์ และ **SHA-256 Checksum** เพื่อป้องกันไฟล์เสียหาย

3. **ตรวจสอบความสมบูรณ์ก่อนยืนยันความสำเร็จ (Integrity Verification):**
   - ตรวจสอบว่าไฟล์ SQL/JSON มีขนาดมากกว่า 0 byte และมีข้อมูลจริง
   - ตรวจสอบ Hash SHA-256 ของรูปภาพทุกรูปที่ดาวน์โหลด
   - **กฎเหล็กความปลอดภัย:** หากพบข้อผิดพลาด ระบบจะระบุสถานะว่า `FAILED` และ **จะไม่ลบข้อมูลสำรองชุดเก่าโดยเด็ดขาด**

4. **ระบบลบข้อมูลเก่าอัตโนมัติ (Retention Policy):**
   - ตั้งค่าเก็บข้อมูลย้อนหลังได้ตามจำนวนวันที่ต้องการ (ค่าเริ่มต้น 7 วัน)
   - จะลบชุดเก่าได้ก็ต่อเมื่อ **ชุดใหม่ล่าสุดผ่านการตรวจสอบสำเร็จ 100% แล้วเท่านั้น**
   - เก็บรักษาชุดสำรองที่สมบูรณ์ไว้อย่างน้อย 2 ชุดล่าสุดเสมอ แม้ว่าจะเกินจำนวนวัน

5. **ระบบแจ้งเตือน (Notifications & Alerts):**
   - ตรวจสอบพื้นที่ว่างบนฮาร์ดดิสก์ Windows ก่อนเริ่มสำรองข้อมูล
   - แจ้งเตือนผ่าน Windows Toast Notification ทันทีเมื่อ:
     - สำรองข้อมูลสำเร็จ
     - สำรองข้อมูลล้มเหลว
     - พื้นที่ดิสก์ใกล้เต็ม (ค่าเริ่มต้นเตือนเมื่อเหลือน้อยกว่า 5 GB)

6. **ความปลอดภัยของรหัสผ่าน (Security):**
   - ไม่มีการฮาร์ดโค้ดรหัสผ่านหรือ Secret Key ในไฟล์สคริปต์
   - อ่านการตั้งค่าจากไฟล์ `.env` ในเครื่อง ซึ่งถูกระบุไว้ใน `.gitignore` เรียบร้อยแล้ว

---

## 📁 โครงสร้างชุดข้อมูลสำรอง

ชุดข้อมูลสำรองแต่ละชุดจะถูกจัดเก็บไว้ในโฟลเดอร์ `backups/backup_YYYY-MM-DD_HH-mm-ss/` โดยมีโครงสร้างดังนี้:

```text
backups/
├── backup.log                       # บันทึกประวัติการสำรองข้อมูลทั้งหมด
├── latest-summary.json              # สรุปผลการสำรองข้อมูลรอบล่าสุด
└── backup_2026-10-12_13-09-53/      # โฟลเดอร์ชุดข้อมูลสำรองตามวันเวลา
    ├── manifest.json                # ข้อมูลสรุป audit trail, วันเวลา, จำนวนแถว, SHA-256
    ├── database/
    │   ├── database_dump.sql        # ไฟล์ SQL พร้อมคำสั่ง INSERT กู้คืน
    │   └── database_data.json       # ข้อมูลตารางทั้งหมดในรูปแบบ JSON
    └── storage/
        ├── storage_manifest.json    # รายการรูปภาพ, path, ขนาด และ sha256
        └── item-photos/             # ไฟล์รูปภาพทั้งหมดตามโฟลเดอร์เดิม
            └── <request_id>/
                └── <user_id>/
                    └── photo.jpg
```

---

## 🚀 1. วิธีสั่งสำรองข้อมูลด้วยตนเอง (Manual Backup)

คุณสามารถสั่งสำรองข้อมูลได้ 3 วิธีตามความสะดวก:

### วิธีที่ 1: ดับเบิ้ลคลิกไฟล์ (ง่ายที่สุด)
- เข้าไปที่โฟลเดอร์โปรเจกต์ `scripts\backup\`
- ดับเบิ้ลคลิกที่ไฟล์ **`run-backup.bat`**
- หน้าต่างจะแสดงความคืบหน้า และแจ้งผลลัพธ์เมื่อเสร็จสิ้น

### วิธีที่ 2: รันผ่าน Terminal / Command Prompt
```bash
npm run backup
```

### วิธีที่ 3: รันตรงผ่าน Node.js
```bash
node scripts/backup/backup.js
```

---

## ⏰ 2. การตั้งเวลาสำรองข้อมูลอัตโนมัติ (Windows Task Scheduler)

ระบบสามารถทำงานเบื้องหลังได้เองอัตโนมัติทุกวัน แม้ปิดบราวเซอร์ไว้ โดยใช้เครื่องมือ **Windows Task Scheduler**

### วิธีที่ A: ติดตั้งอัตโนมัติด้วยคำสั่งเดียว (แนะนำ)
เปิด PowerShell ในเครื่องคุณ แล้วพิมพ์คำสั่ง:

```powershell
# ตั้งให้รันทุกวันเวลา 02:00 น. (ค่าเริ่มต้น)
powershell -ExecutionPolicy Bypass -File scripts/backup/setup-scheduler.ps1

# หรือระบุเวลาที่ต้องการเอง (เช่น ตี 3:30 น.)
powershell -ExecutionPolicy Bypass -File scripts/backup/setup-scheduler.ps1 -Time "03:30"

# ตรวจสอบสถานะการตั้งเวลา
powershell -ExecutionPolicy Bypass -File scripts/backup/setup-scheduler.ps1 -Action status

# ยกเลิกการตั้งเวลาอัตโนมัติ
powershell -ExecutionPolicy Bypass -File scripts/backup/setup-scheduler.ps1 -Action delete
```

---

### วิธีที่ B: ตั้งค่าด้วยตัวเองผ่านหน้าต่าง Windows (Manual GUI)

1. กดปุ่ม `Windows + R` บนคีย์บอร์ด พิมพ์ `taskschd.msc` แล้วกด **Enter** เพื่อเปิด **Task Scheduler**
2. ในแถบด้านขวา คลิกเลือก **Create Task...** (สร้างงาน)
3. **แท็บ General (ทั่วไป):**
   - **Name:** ตั้งชื่อว่า `TransferApp_Backup`
   - ติ๊กเลือก **Run whether user is logged on or not** (รันแม้ไม่ได้ล็อกอินค้างไว้) หรือ **Run only when user is logged on**
   - ติ๊กเลือก **Run with highest privileges**
4. **แท็บ Triggers (เงื่อนไขเวลา):**
   - คลิก **New...**
   - **Begin the task:** เลือก `On a schedule`
   - เลือก **Daily** (ทุกวัน) และระบุเวลาที่ต้องการ เช่น `02:00:00`
   - กด **OK**
5. **แท็บ Actions (การดำเนินการ):**
   - คลิก **New...**
   - **Action:** เลือก `Start a program`
   - **Program/script:** ใส่ `cmd.exe`
   - **Add arguments:** ใส่ `/c "C:\Users\Toto\Desktop\รับ-ส่งของ\scripts\backup\run-backup.bat" --silent`
   - **Start in:** ใส่ `C:\Users\Toto\Desktop\รับ-ส่งของ`
   - กด **OK**
6. **แท็บ Settings (การตั้งค่า):**
   - ติ๊กเลือก **If the task fails, restart every:** 10 minutes (ลองใหม่ถ้าล้มเหลว)
   - ติ๊กเลือก **Stop the task if it runs longer than:** 1 hour
7. กด **OK** เพื่อบันทึก เป็นอันเสร็จสิ้น!

---

## 🔄 3. วิธีทดสอบและกู้คืนข้อมูล (Restore Guide)

### 3.1 ทดสอบกู้คืนแบบปลอดภัย (Dry-Run Test)
คำสั่งนี้จะทำการตรวจสอบความสมบูรณ์ของไฟล์สำรอง, ทดสอบโครงสร้างตาราง, และทดสอบการเชื่อมต่อ โดย**ไม่มีการแก้ไขหรือเขียนทับข้อมูลจริงในฐานข้อมูล**:

```bash
npm run restore:test
```
หรือ
```bash
node scripts/backup/restore.js --test
```

### 3.2 กู้คืนข้อมูลจริงจากชุดสำรองล่าสุด
คำสั่งนี้จะทำการนำเข้าข้อมูลตารางและอัปโหลดรูปภาพที่ขาดหายกลับไปยัง Supabase อัตโนมัติ:

```bash
npm run restore
```

### 3.3 กู้คืนข้อมูลจากชุดสำรองเฉพาะโฟลเดอร์ที่ต้องการ
```bash
node scripts/backup/restore.js "backups/backup_2026-10-12_13-09-53"
```

### 3.4 ตัวเลือกเสริมในการกู้คืน:
- **กู้คืนเฉพาะฐานข้อมูล (ไม่ยุ่งกับรูปภาพ):**
  ```bash
  node scripts/backup/restore.js --database-only
  ```
- **กู้คืนเฉพาะรูปภาพ (ไม่ยุ่งกับฐานข้อมูล):**
  ```bash
  node scripts/backup/restore.js --storage-only
  ```

---

## ⚙️ 4. การปรับแต่งการตั้งค่า (Configuration)

คุณสามารถปรับแต่งการทำงานได้ผ่านไฟล์ [`.env`](file:///c:/Users/Toto/Desktop/รับ-ส่งของ/.env):

```env
# กำหนดโฟลเดอร์ปลายทางสำหรับเก็บข้อมูลสำรอง
# สามารถระบุเป็นแฟลชไดรฟ์ External Harddisk หรือโฟลเดอร์ Google Drive/OneDrive ได้ เช่น D:\Backups
BACKUP_DIR=./backups

# จำนวนวันที่ต้องการเก็บข้อมูลสำรองย้อนหลัง (ค่าเริ่มต้น 7 วัน)
BACKUP_RETENTION_DAYS=7

# แจ้งเตือนเมื่อพื้นที่ว่างบนฮาร์ดดิสก์เหลือน้อยกว่าค่านี้ (หน่วย GB)
BACKUP_DISK_WARNING_THRESHOLD_GB=5
```

---

## 🛠️ 5. กรณีฉุกเฉิน: ฐานข้อมูลพังทั้งหมด (Disaster Recovery)

หากวันใดวันหนึ่ง Supabase มีปัญหาจนข้อมูลหายทั้งหมด:

1. นำโครงสร้างตารางจากไฟล์ [`supabase/schema.sql`](file:///c:/Users/Toto/Desktop/รับ-ส่งของ/supabase/schema.sql) ไปกด Run ใน Supabase SQL Editor เพื่อสร้างตารางเริ่มต้น
2. รันคำสั่งกู้คืน:
   ```bash
   npm run restore
   ```
3. ข้อมูลคำขอฝากของ, การยืม-คืน, ไทม์ไลน์ และรูปภาพทั้งหมดจะถูกโหลดกลับเข้าสู่ระบบเหมือนเดิม 100%!

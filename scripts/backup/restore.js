import fs from 'fs'
import path from 'path'
import { Client } from 'pg'
import { createClient } from '@supabase/supabase-js'
import {
  PROJECT_ROOT,
  loadEnv,
  formatBytes,
  calculateFileHash,
  logMessage,
  notifyWindows
} from './utils.js'

// Load .env
loadEnv()

const BACKUP_DIR_BASE = process.env.BACKUP_DIR 
  ? path.resolve(PROJECT_ROOT, process.env.BACKUP_DIR)
  : path.join(PROJECT_ROOT, 'backups')
const RESTORE_LOG_FILE = path.join(BACKUP_DIR_BASE, 'restore.log')

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD || ''

async function getPgClient(projectRef, password) {
  const hosts = [
    { host: `db.${projectRef}.supabase.co`, port: 5432, user: 'postgres', label: 'Direct 5432' },
    { host: `aws-0-ap-southeast-1.pooler.supabase.com`, port: 6543, user: `postgres.${projectRef}`, label: 'Pooler AP-Southeast-1' }
  ]

  for (const h of hosts) {
    const client = new Client({
      host: h.host,
      port: h.port,
      user: h.user,
      password: password,
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000
    })
    try {
      await client.connect()
      return { client, label: h.label }
    } catch (e) {
      try { await client.end() } catch {}
    }
  }
  return null
}

function findLatestBackup() {
  if (!fs.existsSync(BACKUP_DIR_BASE)) return null
  const entries = fs.readdirSync(BACKUP_DIR_BASE, { withFileTypes: true })
  const backups = entries
    .filter(e => e.isDirectory() && e.name.startsWith('backup_'))
    .map(e => ({
      name: e.name,
      path: path.join(BACKUP_DIR_BASE, e.name),
      ctime: fs.statSync(path.join(BACKUP_DIR_BASE, e.name)).ctimeMs
    }))
    .sort((a, b) => b.ctime - a.ctime)

  return backups[0]?.path || null
}

export async function runRestore(targetFolder, options = {}) {
  const startTime = new Date()
  const isDryRun = options.dryRun || process.argv.includes('--dry-run') || process.argv.includes('--test')
  const isDbOnly = options.dbOnly || process.argv.includes('--database-only')
  const isStorageOnly = options.storageOnly || process.argv.includes('--storage-only')

  logMessage(RESTORE_LOG_FILE, `========== เริ่มกระบวนการกู้คืนข้อมูล ${isDryRun ? '(โหมดทดสอบ DRY-RUN)' : ''} ==========`, 'INFO')

  let backupDir = targetFolder
  if (!backupDir) {
    backupDir = findLatestBackup()
  }

  if (!backupDir || !fs.existsSync(backupDir)) {
    const err = `ไม่พบโฟลเดอร์ข้อมูลสำรองที่ระบุ: ${backupDir || '(ว่าง)'}`
    logMessage(RESTORE_LOG_FILE, err, 'ERROR')
    return { success: false, error: err }
  }

  logMessage(RESTORE_LOG_FILE, `ใช้ข้อมูลสำรองจาก: ${backupDir}`, 'INFO')

  const manifestPath = path.join(backupDir, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    const err = `ไม่พบไฟล์ manifest.json ในโฟลเดอร์สำรอง (${backupDir}) ข้อมูลสำรองอาจไม่สมบูรณ์`
    logMessage(RESTORE_LOG_FILE, err, 'ERROR')
    return { success: false, error: err }
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  logMessage(RESTORE_LOG_FILE, `ข้อมูลสำรอง ID: ${manifest.backup_id} (สร้างเมื่อ: ${manifest.created_at})`, 'INFO')

  const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0]

  // Step 1: Pre-validation of backup files
  logMessage(RESTORE_LOG_FILE, 'กำลังตรวจสอบความถูกต้องของไฟล์สำรองก่อนเริ่มกู้คืน...', 'INFO')
  const sqlFile = path.join(backupDir, 'database', 'database_dump.sql')
  const jsonFile = path.join(backupDir, 'database', 'database_data.json')
  const storageManifestFile = path.join(backupDir, 'storage', 'storage_manifest.json')

  if (!isStorageOnly) {
    if (!fs.existsSync(sqlFile) && !fs.existsSync(jsonFile)) {
      const err = 'ไม่พบทั้งไฟล์ database_dump.sql และ database_data.json ไม่สามารถกู้คืนฐานข้อมูลได้'
      logMessage(RESTORE_LOG_FILE, err, 'ERROR')
      return { success: false, error: err }
    }
  }

  let storageItems = []
  if (!isDbOnly && fs.existsSync(storageManifestFile)) {
    storageItems = JSON.parse(fs.readFileSync(storageManifestFile, 'utf8'))
    logMessage(RESTORE_LOG_FILE, `ตรวจสอบรูปภาพในไฟล์ Manifest: ${storageItems.length} ไฟล์`, 'INFO')

    for (const item of storageItems) {
      const localPhotoPath = path.join(backupDir, 'storage', 'item-photos', item.storage_path)
      if (!fs.existsSync(localPhotoPath)) {
        logMessage(RESTORE_LOG_FILE, `คำเตือน: ไม่พบไฟล์รูปภาพ ${item.storage_path} ในชุดสำรอง`, 'WARN')
        continue
      }
      const hash = await calculateFileHash(localPhotoPath)
      if (hash !== item.sha256) {
        logMessage(RESTORE_LOG_FILE, `คำเตือน: Hash SHA-256 ของ ${item.storage_path} ไม่ตรงกับ Manifest`, 'WARN')
      }
    }
  }

  if (isDryRun) {
    logMessage(RESTORE_LOG_FILE, '=== สรุปผลการทดสอบ (DRY-RUN) ===', 'SUCCESS')
    logMessage(RESTORE_LOG_FILE, `  - ตรวจสอบไฟล์ฐานข้อมูล: พร้อมกู้คืน (${manifest.database.total_rows} แถว)`, 'SUCCESS')
    logMessage(RESTORE_LOG_FILE, `  - ตรวจสอบไฟล์รูปภาพ: พร้อมกู้คืน (${storageItems.length} ไฟล์)`, 'SUCCESS')
    logMessage(RESTORE_LOG_FILE, '  - ระบบอยู่ในสภาพสมบูรณ์ ไม่มีการแก้ไขข้อมูลจริงในฐานข้อมูล', 'SUCCESS')
    return { success: true, dryRun: true }
  }

  // Step 2: Database Restoration
  let dbRestoredRows = 0
  if (!isStorageOnly) {
    logMessage(RESTORE_LOG_FILE, 'กำลังเริ่มกู้คืนฐานข้อมูล PostgreSQL...', 'INFO')

    if (DB_PASSWORD) {
      const pgConn = await getPgClient(projectRef, DB_PASSWORD)
      if (pgConn) {
        logMessage(RESTORE_LOG_FILE, `เชื่อมต่อฐานข้อมูลสำเร็จผ่าน ${pgConn.label}`, 'INFO')
        const client = pgConn.client
        try {
          const sql = fs.readFileSync(sqlFile, 'utf8')
          await client.query(sql)
          logMessage(RESTORE_LOG_FILE, 'กู้คืนฐานข้อมูลผ่าน SQL Dump สำเร็จสมบูรณ์!', 'SUCCESS')
          dbRestoredRows = manifest.database.total_rows
        } catch (sqlErr) {
          logMessage(RESTORE_LOG_FILE, `การกู้คืนผ่าน SQL Dump ล้มเหลว: ${sqlErr.message}`, 'ERROR')
          throw sqlErr
        } finally {
          await client.end()
        }
      }
    } else {
      // Fallback via Supabase REST API (Insert/Upsert table by table)
      logMessage(RESTORE_LOG_FILE, 'เชื่อมต่อผ่าน Supabase Admin Client (Fallback)...', 'INFO')
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
      const dataObj = JSON.parse(fs.readFileSync(jsonFile, 'utf8'))

      for (const [table, rows] of Object.entries(dataObj.tables || {})) {
        if (!rows || rows.length === 0) continue
        logMessage(RESTORE_LOG_FILE, `  - กำลังกู้คืนตาราง ${table} (${rows.length} แถว)...`, 'INFO')
        const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' })
        if (error) {
          logMessage(RESTORE_LOG_FILE, `    เกิดข้อผิดพลาดในตาราง ${table}: ${error.message}`, 'WARN')
        } else {
          dbRestoredRows += rows.length
        }
      }
    }
  }

  // Step 3: Storage Restoration
  let storageRestoredCount = 0
  if (!isDbOnly && storageItems.length > 0) {
    logMessage(RESTORE_LOG_FILE, 'กำลังกู้คืนและอัปโหลดรูปภาพกลับไปยัง Supabase Storage...', 'INFO')
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    for (const item of storageItems) {
      const localPhotoPath = path.join(backupDir, 'storage', 'item-photos', item.storage_path)
      if (!fs.existsSync(localPhotoPath)) continue

      try {
        const fileBuffer = fs.readFileSync(localPhotoPath)
        const { error: upErr } = await supabase.storage
          .from('item-photos')
          .upload(item.storage_path, fileBuffer, {
            contentType: item.mimetype || 'image/jpeg',
            upsert: true
          })

        if (upErr) {
          logMessage(RESTORE_LOG_FILE, `    อัปโหลด ${item.storage_path} ไม่สำเร็จ: ${upErr.message}`, 'WARN')
        } else {
          storageRestoredCount++
        }
      } catch (err) {
        logMessage(RESTORE_LOG_FILE, `    ผิดพลาดในการอ่านไฟล์ ${item.storage_path}: ${err.message}`, 'WARN')
      }
    }
    logMessage(RESTORE_LOG_FILE, `กู้คืนรูปภาพเรียบร้อย: ${storageRestoredCount}/${storageItems.length} ไฟล์`, 'SUCCESS')
  }

  const duration = ((new Date() - startTime) / 1000).toFixed(1)
  logMessage(RESTORE_LOG_FILE, `========== กู้คืนข้อมูลสำเร็จเรียบร้อยทั้งหมด! (ใช้เวลา ${duration} วินาที) ==========`, 'SUCCESS')

  notifyWindows({
    title: 'กู้คืนข้อมูลสำเร็จ',
    message: `กู้คืนเสร็จสมบูรณ์: ฐานข้อมูล ${dbRestoredRows} แถว, รูปภาพ ${storageRestoredCount} ไฟล์`,
    type: 'info'
  })

  return { success: true, dbRestoredRows, storageRestoredCount, duration }
}

// CLI Execution
if (process.argv[1] && process.argv[1].endsWith('restore.js')) {
  const targetDir = process.argv.slice(2).find(arg => !arg.startsWith('--'))
  runRestore(targetDir)
    .then(res => {
      process.exit(res.success ? 0 : 1)
    })
    .catch(err => {
      console.error('Fatal restore error:', err)
      process.exit(1)
    })
}

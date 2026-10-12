import fs from 'fs'
import path from 'path'
import { Client } from 'pg'
import { createClient } from '@supabase/supabase-js'
import {
  PROJECT_ROOT,
  loadEnv,
  formatBytes,
  getDiskSpace,
  calculateFileHash,
  calculateBufferHash,
  ensureDir,
  logMessage,
  notifyWindows
} from './utils.js'

// Load .env
loadEnv()

const BACKUP_DIR_BASE = process.env.BACKUP_DIR 
  ? path.resolve(PROJECT_ROOT, process.env.BACKUP_DIR)
  : path.join(PROJECT_ROOT, 'backups')
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '7', 10)
const DISK_WARNING_THRESHOLD_GB = parseFloat(process.env.BACKUP_DISK_WARNING_THRESHOLD_GB || '5.0')
const LOG_FILE = path.join(BACKUP_DIR_BASE, 'backup.log')
const LATEST_SUMMARY_FILE = path.join(BACKUP_DIR_BASE, 'latest-summary.json')

// Database & Storage Config
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD || ''

// Tables in Foreign Key dependency order
const TABLES_TO_BACKUP = [
  'locations',
  'profiles',
  'transfer_requests',
  'transfer_request_items',
  'item_photos',
  'receipt_confirmations',
  'receipt_confirmation_items',
  'status_history',
  'notifications'
]

async function getPgClient(projectRef, password) {
  const hosts = [
    { host: `db.${projectRef}.supabase.co`, port: 5432, user: 'postgres', label: 'Direct 5432' },
    { host: `aws-0-ap-southeast-1.pooler.supabase.com`, port: 6543, user: `postgres.${projectRef}`, label: 'Pooler AP-Southeast-1' },
    { host: `aws-0-ap-southeast-2.pooler.supabase.com`, port: 6543, user: `postgres.${projectRef}`, label: 'Pooler AP-Southeast-2' },
    { host: `aws-0-us-east-1.pooler.supabase.com`, port: 6543, user: `postgres.${projectRef}`, label: 'Pooler US-East-1' }
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

/**
 * Escape SQL value for INSERT statement
 */
function sqlEscape(val) {
  if (val === null || val === undefined) return 'NULL'
  if (val instanceof Date) {
    return `'${val.toISOString()}'`
  }
  if (typeof val === 'number') return String(val)
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE'
  if (typeof val === 'object') {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`
  }
  return `'${String(val).replace(/'/g, "''")}'`
}

/**
 * List all files recursively in Supabase Storage bucket
 */
async function listAllStorageFiles(supabase, bucketName, folder = '') {
  let files = []
  const { data, error } = await supabase.storage.from(bucketName).list(folder, {
    limit: 100,
    offset: 0,
    sortBy: { column: 'name', order: 'asc' }
  })

  if (error) {
    throw new Error(`Failed to list bucket ${bucketName} folder "${folder}": ${error.message}`)
  }

  for (const item of (data || [])) {
    const fullPath = folder ? `${folder}/${item.name}` : item.name
    if (item.id === null || !item.metadata) {
      // It is a directory, recurse into it
      const subFiles = await listAllStorageFiles(supabase, bucketName, fullPath)
      files = files.concat(subFiles)
    } else {
      files.push({
        name: item.name,
        path: fullPath,
        size: item.metadata?.size || 0,
        mimetype: item.metadata?.mimetype || 'image/jpeg',
        updated_at: item.updated_at
      })
    }
  }

  return files
}

export async function runBackup() {
  const startTime = new Date()
  const timestampStr = startTime.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const backupFolder = path.join(BACKUP_DIR_BASE, `backup_${timestampStr}`)
  const dbFolder = path.join(backupFolder, 'database')
  const storageFolder = path.join(backupFolder, 'storage', 'item-photos')

  ensureDir(BACKUP_DIR_BASE)
  logMessage(LOG_FILE, `========== เริ่มกระบวนการสำรองข้อมูล (Timestamp: ${timestampStr}) ==========`, 'INFO')

  // Step 1: Pre-flight checks
  if (!SUPABASE_URL || (!SERVICE_ROLE_KEY && !DB_PASSWORD)) {
    const err = 'ไม่พบการตั้งค่า Supabase URL หรือ Service Role Key / DB Password ในไฟล์ .env'
    logMessage(LOG_FILE, err, 'ERROR')
    notifyWindows({ title: 'สำรองข้อมูลล้มเหลว', message: err, type: 'error' })
    return { success: false, error: err }
  }

  const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0]

  // Step 2: Check Disk Space
  const disk = await getDiskSpace(BACKUP_DIR_BASE)
  logMessage(LOG_FILE, `ตรวจสอบพื้นที่ดิสก์ไดรฟ์ ${disk.root}: ว่าง ${disk.freeGb} GB จากทั้งหมด ${disk.totalGb} GB (${disk.freePct}%)`, 'INFO')

  if (disk.freeGb < 0.2) {
    const err = `พื้นที่จัดเก็บบนไดรฟ์ ${disk.root} เหลือน้อยเกินไป (${disk.freeGb} GB) ยกเลิกการสำรองข้อมูลเพื่อความปลอดภัยของระบบ`
    logMessage(LOG_FILE, err, 'ERROR')
    notifyWindows({ title: 'พื้นที่ดิสก์ไม่เพียงพอ', message: err, type: 'error' })
    return { success: false, error: err }
  }

  if (disk.freeGb < DISK_WARNING_THRESHOLD_GB) {
    const warnMsg = `คำเตือน: พื้นที่ไดรฟ์ ${disk.root} ใกล้เต็มแล้ว (เหลือ ${disk.freeGb} GB ต่ำกว่าเกณฑ์เตือน ${DISK_WARNING_THRESHOLD_GB} GB)`
    logMessage(LOG_FILE, warnMsg, 'WARN')
    notifyWindows({ title: 'คำเตือน: พื้นที่ดิสก์ใกล้เต็ม', message: warnMsg, type: 'warning' })
  }

  ensureDir(backupFolder)
  ensureDir(dbFolder)
  ensureDir(storageFolder)

  const manifest = {
    backup_id: `backup_${timestampStr}`,
    created_at: startTime.toISOString(),
    project_url: SUPABASE_URL,
    project_ref: projectRef,
    status: 'IN_PROGRESS',
    is_verified: false,
    disk_space_at_start: disk,
    database: {
      tables_count: 0,
      total_rows: 0,
      tables: {},
      dump_file: 'database/database_dump.sql',
      json_file: 'database/database_data.json'
    },
    storage: {
      bucket: 'item-photos',
      total_photos: 0,
      total_bytes: 0,
      manifest_file: 'storage/storage_manifest.json'
    },
    errors: []
  }

  // Step 3: Database Backup
  logMessage(LOG_FILE, 'กำลังเชื่อมต่อและสำรองข้อมูล PostgreSQL...', 'INFO')
  let pgConnection = null
  const tableDataDump = {}
  let totalRowsCount = 0

  try {
    if (DB_PASSWORD) {
      pgConnection = await getPgClient(projectRef, DB_PASSWORD)
    }

    if (pgConnection) {
      logMessage(LOG_FILE, `เชื่อมต่อฐานข้อมูลสำเร็จผ่าน ${pgConnection.label}`, 'INFO')
      const client = pgConnection.client

      for (const table of TABLES_TO_BACKUP) {
        try {
          const res = await client.query(`SELECT * FROM public.${table};`)
          tableDataDump[table] = res.rows
          totalRowsCount += res.rowCount
          manifest.database.tables[table] = {
            rows: res.rowCount,
            columns: res.fields.map(f => f.name)
          }
          logMessage(LOG_FILE, `  - ตาราง ${table}: สำรองข้อมูล ${res.rowCount} แถว`, 'INFO')
        } catch (tableErr) {
          logMessage(LOG_FILE, `  - ตาราง ${table} ล้มเหลว: ${tableErr.message}`, 'WARN')
          manifest.errors.push(`Table ${table} error: ${tableErr.message}`)
        }
      }
      await client.end()
    } else {
      // Fallback via Supabase REST API (Service Role)
      logMessage(LOG_FILE, 'เชื่อมต่อผ่าน Supabase Admin REST API (Fallback)...', 'INFO')
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
      })

      for (const table of TABLES_TO_BACKUP) {
        try {
          const { data, error } = await supabase.from(table).select('*')
          if (error) throw error
          tableDataDump[table] = data || []
          totalRowsCount += (data || []).length
          manifest.database.tables[table] = {
            rows: (data || []).length,
            columns: data && data[0] ? Object.keys(data[0]) : []
          }
          logMessage(LOG_FILE, `  - ตาราง ${table}: สำรองข้อมูล ${(data || []).length} แถว`, 'INFO')
        } catch (tableErr) {
          logMessage(LOG_FILE, `  - ตาราง ${table} ล้มเหลว: ${tableErr.message}`, 'WARN')
          manifest.errors.push(`Table ${table} fallback error: ${tableErr.message}`)
        }
      }
    }

    manifest.database.tables_count = Object.keys(manifest.database.tables).length
    manifest.database.total_rows = totalRowsCount

    // Write database_data.json
    const jsonPath = path.join(dbFolder, 'database_data.json')
    fs.writeFileSync(jsonPath, JSON.stringify({
      metadata: {
        timestamp: startTime.toISOString(),
        project_ref: projectRef,
        total_rows: totalRowsCount
      },
      tables: tableDataDump
    }, null, 2), 'utf8')

    // Write database_dump.sql (Self-contained SQL script)
    const sqlPath = path.join(dbFolder, 'database_dump.sql')
    let sqlContent = `-- ==========================================================\n`
    sqlContent += `-- SUPABASE POSTGRESQL BACKUP DUMP\n`
    sqlContent += `-- Timestamp: ${startTime.toISOString()}\n`
    sqlContent += `-- Project: ${SUPABASE_URL}\n`
    sqlContent += `-- Total Rows: ${totalRowsCount}\n`
    sqlContent += `-- ==========================================================\n\n`
    sqlContent += `BEGIN;\n`
    sqlContent += `SET session_replication_role = 'replica'; -- Suppress FK checks during restore\n\n`

    for (const table of TABLES_TO_BACKUP) {
      const rows = tableDataDump[table] || []
      if (rows.length === 0) continue

      sqlContent += `-- ----------------------------------------------------------\n`
      sqlContent += `-- Data for Table: public.${table} (${rows.length} rows)\n`
      sqlContent += `-- ----------------------------------------------------------\n`

      const cols = Object.keys(rows[0])
      for (const row of rows) {
        const valList = cols.map(c => sqlEscape(row[c])).join(', ')
        const colList = cols.map(c => `"${c}"`).join(', ')
        sqlContent += `INSERT INTO public.${table} (${colList}) VALUES (${valList}) ON CONFLICT (id) DO UPDATE SET ${cols.filter(c => c !== 'id').map(c => `"${c}" = EXCLUDED."${c}"`).join(', ')};\n`
      }
      sqlContent += `\n`
    }

    sqlContent += `SET session_replication_role = 'default';\n`
    sqlContent += `COMMIT;\n`
    fs.writeFileSync(sqlPath, sqlContent, 'utf8')

    logMessage(LOG_FILE, `สร้างไฟล์ฐานข้อมูลเรียบร้อย: database_dump.sql (${formatBytes(fs.statSync(sqlPath).size)})`, 'INFO')
  } catch (dbErr) {
    const err = `เกิดข้อผิดพลาดในการสำรองฐานข้อมูล: ${dbErr.message}`
    logMessage(LOG_FILE, err, 'ERROR')
    manifest.errors.push(err)
  }

  // Step 4: Supabase Storage Backup
  logMessage(LOG_FILE, 'กำลังตรวจสอบและดาวน์โหลดรูปภาพจาก Supabase Storage (item-photos)...', 'INFO')
  const storageManifest = []
  let totalStorageBytes = 0

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    // List all files in bucket
    const allFiles = await listAllStorageFiles(supabase, 'item-photos')
    logMessage(LOG_FILE, `พบไฟล์รูปภาพใน Storage ทั้งหมด: ${allFiles.length} ไฟล์`, 'INFO')

    for (const file of allFiles) {
      try {
        const { data: blob, error: dlErr } = await supabase.storage.from('item-photos').download(file.path)
        if (dlErr) throw dlErr

        const arrayBuffer = await blob.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        const localFilePath = path.join(storageFolder, file.path)
        
        ensureDir(path.dirname(localFilePath))
        fs.writeFileSync(localFilePath, buffer)

        const sha256 = calculateBufferHash(buffer)
        totalStorageBytes += buffer.length

        // Find linked item_photos record if available
        const linkedPhoto = (tableDataDump.item_photos || []).find(p => p.storage_path === file.path)

        storageManifest.push({
          storage_path: file.path,
          file_name: file.name,
          size_bytes: buffer.length,
          sha256: sha256,
          mimetype: file.mimetype,
          photo_id: linkedPhoto?.id || null,
          request_id: linkedPhoto?.request_id || null,
          photo_stage: linkedPhoto?.photo_stage || null
        })
      } catch (fileErr) {
        const msg = `ดาวน์โหลดไฟล์ ${file.path} ล้มเหลว: ${fileErr.message}`
        logMessage(LOG_FILE, msg, 'WARN')
        manifest.errors.push(msg)
      }
    }

    manifest.storage.total_photos = storageManifest.length
    manifest.storage.total_bytes = totalStorageBytes

    // Write storage manifest
    const storageManifestPath = path.join(backupFolder, 'storage', 'storage_manifest.json')
    fs.writeFileSync(storageManifestPath, JSON.stringify(storageManifest, null, 2), 'utf8')
    logMessage(LOG_FILE, `สำรองรูปภาพสำเร็จ: ${storageManifest.length} ไฟล์ (${formatBytes(totalStorageBytes)})`, 'INFO')
  } catch (storageErr) {
    const err = `เกิดข้อผิดพลาดในการสำรอง Storage: ${storageErr.message}`
    logMessage(LOG_FILE, err, 'ERROR')
    manifest.errors.push(err)
  }

  // Step 5: Integrity Verification (Do not claim success without verification!)
  logMessage(LOG_FILE, 'กำลังตรวจสอบความถูกต้องของไฟล์สำรอง (Integrity Verification)...', 'INFO')
  let isVerified = true
  const verificationIssues = []

  // Check 1: SQL Dump File
  const sqlPath = path.join(dbFolder, 'database_dump.sql')
  if (!fs.existsSync(sqlPath) || fs.statSync(sqlPath).size === 0) {
    isVerified = false
    verificationIssues.push('ไฟล์ database_dump.sql ไม่พบหรือมีขนาด 0 byte')
  }

  // Check 2: JSON Data File
  const jsonPath = path.join(dbFolder, 'database_data.json')
  if (!fs.existsSync(jsonPath) || fs.statSync(jsonPath).size === 0) {
    isVerified = false
    verificationIssues.push('ไฟล์ database_data.json ไม่พบหรือมีขนาด 0 byte')
  } else {
    try {
      const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
      if (!parsed.tables || Object.keys(parsed.tables).length === 0) {
        isVerified = false
        verificationIssues.push('ไฟล์ JSON ไม่มีโครงสร้างตารางข้อมูล')
      }
    } catch (e) {
      isVerified = false
      verificationIssues.push(`ไฟล์ JSON เสียหาย (Parse failed: ${e.message})`)
    }
  }

  // Check 3: Storage Files Hash Verification
  for (const item of storageManifest) {
    const localPath = path.join(storageFolder, item.storage_path)
    if (!fs.existsSync(localPath)) {
      isVerified = false
      verificationIssues.push(`รูปภาพ ${item.storage_path} ขาดหายไปหลังดาวน์โหลด`)
      continue
    }
    const actualHash = await calculateFileHash(localPath)
    if (actualHash !== item.sha256) {
      isVerified = false
      verificationIssues.push(`SHA-256 ของรูปภาพ ${item.storage_path} ไม่ตรงกัน`)
    }
  }

  const endTime = new Date()
  const durationSec = ((endTime - startTime) / 1000).toFixed(1)

  manifest.duration_seconds = Number(durationSec)
  manifest.is_verified = isVerified
  manifest.status = isVerified && manifest.errors.length === 0 ? 'SUCCESS' : (isVerified ? 'PARTIAL_SUCCESS' : 'FAILED')
  manifest.verification_issues = verificationIssues

  // Save final manifest.json
  const manifestPath = path.join(backupFolder, 'manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')

  // Save latest summary
  fs.writeFileSync(LATEST_SUMMARY_FILE, JSON.stringify(manifest, null, 2), 'utf8')

  if (!isVerified) {
    const errorSummary = `การสำรองข้อมูลไม่ผ่านการตรวจสอบความสมบูรณ์! (${verificationIssues.join(', ')})`
    logMessage(LOG_FILE, errorSummary, 'ERROR')
    notifyWindows({
      title: 'สำรองข้อมูลล้มเหลว',
      message: errorSummary,
      type: 'error'
    })
    logMessage(LOG_FILE, '⚠️ ข้ามการลบข้อมูลสำรองชุดเก่า เนื่องจากชุดใหม่ไม่ผ่านการตรวจสอบ', 'WARN')
    return { success: false, manifest }
  }

  logMessage(LOG_FILE, `สำรองข้อมูลสำเร็จและผ่านการตรวจสอบ 100%! ใช้เวลา ${durationSec} วินาที`, 'SUCCESS')
  logMessage(LOG_FILE, `  - ตาราง: ${manifest.database.tables_count} ตาราง (${manifest.database.total_rows} แถว)`, 'SUCCESS')
  logMessage(LOG_FILE, `  - รูปภาพ: ${manifest.storage.total_photos} รูป (${formatBytes(manifest.storage.total_bytes)})`, 'SUCCESS')
  logMessage(LOG_FILE, `  - ปลายทาง: ${backupFolder}`, 'SUCCESS')

  // Step 6: Retention Policy (Prune old backups ONLY after verification succeeds)
  logMessage(LOG_FILE, `ตรวจสอบการลบข้อมูลสำรองเก่า (อายุเกิน ${RETENTION_DAYS} วัน)...`, 'INFO')
  pruneOldBackups(BACKUP_DIR_BASE, RETENTION_DAYS, backupFolder)

  // Step 7: Notification
  notifyWindows({
    title: 'สำรองข้อมูลสำเร็จ',
    message: `สำรองข้อมูลสมบูรณ์: ${manifest.database.total_rows} แถว, ${manifest.storage.total_photos} รูปภาพ (${formatBytes(manifest.storage.total_bytes)})`,
    type: 'info'
  })

  return { success: true, manifest, backupFolder }
}

/**
 * Prune backups older than retentionDays
 * Rule: Never prune unless the current backup succeeded, and always keep at least 2 backups!
 */
function pruneOldBackups(backupDirBase, retentionDays, currentBackupFolder) {
  try {
    const entries = fs.readdirSync(backupDirBase, { withFileTypes: true })
    const backupFolders = entries
      .filter(e => e.isDirectory() && e.name.startsWith('backup_'))
      .map(e => ({
        name: e.name,
        fullPath: path.join(backupDirBase, e.name),
        ctime: fs.statSync(path.join(backupDirBase, e.name)).ctimeMs
      }))
      .sort((a, b) => b.ctime - a.ctime) // Newest first

    // Always keep at least the 2 newest backups regardless of age
    const MIN_KEEP = 2
    if (backupFolders.length <= MIN_KEEP) {
      logMessage(LOG_FILE, `มีชุดข้อมูลสำรองทั้งหมด ${backupFolders.length} ชุด (เก็บรักษาไว้ทั้งหมด)`, 'INFO')
      return
    }

    const now = Date.now()
    const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000

    for (let i = MIN_KEEP; i < backupFolders.length; i++) {
      const folder = backupFolders[i]
      if (folder.fullPath === currentBackupFolder) continue

      const ageMs = now - folder.ctime
      const ageDays = (ageMs / (24 * 60 * 60 * 1000)).toFixed(1)

      if (ageMs > maxAgeMs) {
        logMessage(LOG_FILE, `[PRUNE] กำลังลบชุดข้อมูลสำรองเก่า: ${folder.name} (อายุ ${ageDays} วัน)`, 'INFO')
        fs.rmSync(folder.fullPath, { recursive: true, force: true })
      }
    }
  } catch (err) {
    logMessage(LOG_FILE, `เกิดข้อผิดพลาดในการตรวจสอบชุดข้อมูลสำรองเก่า: ${err.message}`, 'WARN')
  }
}

// Execute directly if run via CLI
if (process.argv[1] && process.argv[1].endsWith('backup.js')) {
  runBackup()
    .then(res => {
      process.exit(res.success ? 0 : 1)
    })
    .catch(err => {
      console.error('Fatal backup error:', err)
      process.exit(1)
    })
}

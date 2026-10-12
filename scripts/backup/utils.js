import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { exec } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
export const PROJECT_ROOT = path.resolve(__dirname, '../../')

/**
 * Load .env file into process.env safely without leaking secrets
 */
export function loadEnv(envPath = path.join(PROJECT_ROOT, '.env')) {
  if (!fs.existsSync(envPath)) return {}
  const content = fs.readFileSync(envPath, 'utf8')
  const env = {}
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let val = trimmed.slice(eqIdx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    env[key] = val
    if (!process.env[key]) process.env[key] = val
  }
  return env
}

/**
 * Format bytes into human readable string (KB, MB, GB)
 */
export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

/**
 * Get disk space of the target drive
 */
export async function getDiskSpace(targetPath) {
  try {
    const resolved = path.resolve(targetPath)
    const root = path.parse(resolved).root || 'C:\\'
    const stats = await fs.promises.statfs(root)
    const totalBytes = stats.blocks * stats.bsize
    const freeBytes = stats.bavail * stats.bsize
    const freeGb = freeBytes / (1024 ** 3)
    const totalGb = totalBytes / (1024 ** 3)
    const freePct = (freeBytes / totalBytes) * 100

    return {
      root,
      totalBytes,
      freeBytes,
      totalGb: Number(totalGb.toFixed(2)),
      freeGb: Number(freeGb.toFixed(2)),
      freePct: Number(freePct.toFixed(1))
    }
  } catch (err) {
    return {
      root: 'Unknown',
      totalBytes: 0,
      freeBytes: 0,
      totalGb: 0,
      freeGb: 999, // Fallback if statfs fails
      freePct: 100,
      error: err.message
    }
  }
}

/**
 * Calculate SHA-256 hash of a file
 */
export function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) return resolve(null)
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

/**
 * Calculate SHA-256 hash of a buffer
 */
export function calculateBufferHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

/**
 * Ensure directory exists
 */
export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
  return dirPath
}

/**
 * Append message to log file and console
 */
export function logMessage(logFilePath, message, level = 'INFO') {
  const timestamp = new Date().toISOString()
  const logLine = `[${timestamp}] [${level}] ${message}\n`
  
  // Console output
  const prefix = level === 'ERROR' ? '❌' : level === 'WARN' ? '⚠️' : level === 'SUCCESS' ? '✅' : 'ℹ️'
  console.log(`${prefix} [${level}] ${message}`)

  // Write to log file
  try {
    ensureDir(path.dirname(logFilePath))
    fs.appendFileSync(logFilePath, logLine, 'utf8')
  } catch (e) {
    console.error('Failed to write log file:', e.message)
  }
}

/**
 * Send Windows notification (Toast / Balloon)
 */
export function notifyWindows({ title, message, type = 'info' }) {
  const safeTitle = (title || 'ระบบสำรองข้อมูล').replace(/'/g, "''").replace(/"/g, '`"')
  const safeMsg = (message || '').replace(/'/g, "''").replace(/"/g, '`"')
  const tipIcon = type === 'error' ? 'Error' : type === 'warning' ? 'Warning' : 'Info'

  const psCommand = `
[reflection.assembly]::loadwithpartialname('System.Windows.Forms') | Out-Null
$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = [System.Drawing.SystemIcons]::${tipIcon === 'Error' ? 'Error' : tipIcon === 'Warning' ? 'Warning' : 'Information'}
$notify.Visible = $true
$notify.ShowBalloonTip(5000, '${safeTitle}', '${safeMsg}', [System.Windows.Forms.ToolTipIcon]::${tipIcon})
Start-Sleep -Milliseconds 600
$notify.Dispose()
`.trim()

  const encoded = Buffer.from(psCommand, 'utf16le').toString('base64')
  exec(`powershell.exe -NoProfile -NonInteractive -EncodedCommand ${encoded}`, (err) => {
    if (err) {
      // Non-fatal if notification fails on headless machines
    }
  })
}

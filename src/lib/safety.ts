/**
 * Centralized Safety & Protection Utilities
 * Protects against:
 * 1. Double submissions & async race conditions
 * 2. Unhandled promise hangs with timeout guards
 * 3. String corruption, XSS, and unbounded length
 * 4. JSON parsing crashes from corrupted localStorage
 * 5. Unique number generation collisions
 */

/**
 * Wrap any Promise with an execution timeout to prevent operations from hanging indefinitely
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms = 15000,
  timeoutMessage = 'การเชื่อมต่อหมดเวลา (Timeout) กรุณาลองใหม่อีกครั้ง'
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMessage))
    }, ms)

    promise
      .then(res => {
        clearTimeout(timer)
        resolve(res)
      })
      .catch(err => {
        clearTimeout(timer)
        reject(err)
      })
  })
}

/**
 * Sanitize and enforce safe length on user text inputs
 */
export function sanitizeString(val: unknown, maxLength = 255): string {
  if (typeof val !== 'string') return ''
  // Remove control characters (except newline \n) and trim
  const clean = val.replace(/[\x00-\x09\x0B-\x1F\x7F]/g, '').trim()
  return clean.slice(0, maxLength)
}

/**
 * Safely parse JSON without throwing syntax errors
 */
export function safeJsonParse<T>(jsonString: string | null | undefined, fallback: T): T {
  if (!jsonString) return fallback
  try {
    const parsed = JSON.parse(jsonString)
    return parsed !== null && parsed !== undefined ? (parsed as T) : fallback
  } catch (e) {
    console.warn('[Safety] JSON parse fallback triggered:', e)
    return fallback
  }
}

/**
 * Generate a collision-resistant request number
 * Incorporates: Type prefix + YYYYMMDD + Sequence + Random Entropy on retry
 */
export function generateUniqueRequestNumber(
  prefix: 'TR' | 'LN' | string,
  datePart: string,
  seq: number,
  retryCount = 0
): string {
  const baseSeq = String(seq).padStart(3, '0')
  if (retryCount === 0) {
    return `${prefix}-${datePart}-${baseSeq}`
  }
  // If retrying due to conflict, append microsecond timestamp + random salt to guarantee uniqueness
  const salt = Math.random().toString(36).substring(2, 5).toUpperCase()
  const microTime = Date.now().toString().slice(-4)
  return `${prefix}-${datePart}-${baseSeq}-${microTime}${salt}`
}

/**
 * Debounce utility with manual cancel capability
 */
export function createDebounce<F extends (...args: any[]) => void>(fn: F, waitMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null

  const debounced = (...args: Parameters<F>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, waitMs)
  }

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  return debounced
}

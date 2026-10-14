import { useState, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import { withTimeout } from '../lib/safety'

export interface SafeActionOptions {
  /**
   * Minimum time (in ms) before another action can be triggered.
   * Default: 1000ms
   */
  cooldownMs?: number

  /**
   * Maximum time (in ms) to wait before timing out to prevent infinite hang.
   * Default: 20000ms
   */
  timeoutMs?: number

  /**
   * Require internet connection before executing.
   * Default: true
   */
  requireOnline?: boolean

  /**
   * Custom message when action is blocked due to rapid repeated clicks.
   */
  spamMessage?: string
}

export function useSafeAction(defaultOptions: SafeActionOptions = {}) {
  const [isPending, setIsPending] = useState(false)
  const isBusyRef = useRef(false)
  const lastExecutedRef = useRef(0)

  const execute = useCallback(
    async <T>(actionFn: () => Promise<T>, customOptions?: SafeActionOptions): Promise<T | undefined> => {
      const opts = { ...defaultOptions, ...customOptions }
      const cooldown = opts.cooldownMs ?? 1000
      const timeout = opts.timeoutMs ?? 20000
      const checkOnline = opts.requireOnline ?? true

      const now = Date.now()

      // 1. Immediate synchronous lock check
      if (isBusyRef.current) {
        console.warn('[useSafeAction] Duplicate execution blocked (already in progress)')
        return undefined
      }

      // 2. Cooldown check to prevent rapid spam clicking
      if (now - lastExecutedRef.current < cooldown) {
        console.warn('[useSafeAction] Action throttled (cooldown active)')
        if (opts.spamMessage) {
          toast.error(opts.spamMessage)
        }
        return undefined
      }

      // 3. Online connectivity check
      if (checkOnline && typeof navigator !== 'undefined' && !navigator.onLine) {
        toast.error('ขณะนี้ไม่มีสัญญาณอินเทอร์เน็ต กรุณารอเชื่อมต่อเน็ตก่อนทำรายการ', { icon: '📡' })
        return undefined
      }

      // Engage locks
      isBusyRef.current = true
      lastExecutedRef.current = now
      setIsPending(true)

      try {
        const result = await withTimeout(actionFn(), timeout)
        return result
      } catch (err: any) {
        console.error('[useSafeAction] Action failed:', err)
        throw err
      } finally {
        isBusyRef.current = false
        setIsPending(false)
      }
    },
    [defaultOptions]
  )

  return {
    isPending,
    execute,
    isBusyRef,
  }
}

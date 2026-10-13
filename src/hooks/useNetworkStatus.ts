import { useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true
  })
  const [showReconnected, setShowReconnected] = useState(false)
  const [isCheckingPing, setIsCheckingPing] = useState(false)
  const qc = useQueryClient()

  useEffect(() => {
    let reconnectTimer: any = null

    const handleOnline = () => {
      setIsOnline(true)
      setShowReconnected(true)
      // Invalidate all caches so fresh data is fetched immediately
      qc.invalidateQueries()
      toast.success('เชื่อมต่ออินเทอร์เน็ตแล้ว ข้อมูลซิงก์เรียบร้อย', {
        icon: '🟢',
        id: 'network-status',
        duration: 3500,
      })

      if (reconnectTimer) clearTimeout(reconnectTimer)
      reconnectTimer = setTimeout(() => {
        setShowReconnected(false)
      }, 4000)
    }

    const handleOffline = () => {
      setIsOnline(false)
      setShowReconnected(false)
      toast.error('ขาดการเชื่อมต่ออินเทอร์เน็ต (กำลังใช้งานโหมดออฟไลน์)', {
        icon: '📡',
        id: 'network-status',
        duration: 4000,
      })
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (reconnectTimer) clearTimeout(reconnectTimer)
    }
  }, [qc])

  // Active ping test
  const testConnection = useCallback(async () => {
    setIsCheckingPing(true)
    try {
      // Use head request with cache buster
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 4000)
      const res = await fetch(`https://wwvvmjkzrkirbyacpkmt.supabase.co/rest/v1/?_t=${Date.now()}`, {
        method: 'HEAD',
        signal: controller.signal,
      }).catch(() => null)
      clearTimeout(timeoutId)

      const currentlyOnline = res !== null && res.status < 500
      setIsOnline(currentlyOnline)
      if (currentlyOnline) {
        qc.invalidateQueries()
        toast.success('เชื่อมต่อเซิร์ฟเวอร์สำเร็จ!', { icon: '🟢', id: 'ping-status' })
      } else {
        toast.error('ยังไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบ Wi-Fi/เน็ตมือถือ', { icon: '📡', id: 'ping-status' })
      }
      return currentlyOnline
    } catch {
      setIsOnline(false)
      toast.error('ยังไม่มีสัญญาณอินเทอร์เน็ต', { icon: '📡', id: 'ping-status' })
      return false
    } finally {
      setIsCheckingPing(false)
    }
  }, [qc])

  // Helper check for action buttons
  const checkOnline = useCallback((): boolean => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.error('ขณะนี้ไม่มีสัญญาณอินเทอร์เน็ต กรุณารอเชื่อมต่อก่อนดำเนินการ', {
        icon: '📡',
        id: 'offline-guard',
      })
      return false
    }
    return true
  }, [])

  return {
    isOnline,
    showReconnected,
    isCheckingPing,
    testConnection,
    checkOnline,
  }
}

import { useState, useEffect, useCallback } from 'react'
import { Sparkles, RefreshCw, X, CheckCircle2, ShieldCheck, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import { APP_VERSION, APP_VERSION_TITLE, APP_VERSION_SUBTITLE, APP_UPDATE_HIGHLIGHTS } from '../version'

const ACKNOWLEDGED_KEY = 'applitrack_acknowledged_version'

export default function UpdateNotificationModal() {
  const [showModal, setShowModal] = useState(false)
  const [hasNewerServerVersion, setHasNewerServerVersion] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [minimized, setMinimized] = useState(false)

  // Function to perform safe cache clearing and instant reload
  const handlePerformUpdate = useCallback(async () => {
    setIsUpdating(true)
    try {
      toast.loading('กำลังอัปเดตเป็นเวอร์ชันล่าสุด...', { id: 'app-update' })

      // 1. Tell waiting service worker to skip waiting and activate
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        for (const reg of registrations) {
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' })
          }
          await reg.update().catch(() => {})
        }
      }

      // 2. Clear old browser caches
      if ('caches' in window) {
        const keys = await caches.keys()
        for (const key of keys) {
          await caches.delete(key)
        }
      }

      // 3. Mark version as acknowledged
      localStorage.setItem(ACKNOWLEDGED_KEY, hasNewerServerVersion || APP_VERSION)

      toast.success('อัปเดตเรียบร้อย! กำลังรีเฟรช...', { id: 'app-update' })

      // 4. Force hard reload from server
      setTimeout(() => {
        window.location.reload()
      }, 500)
    } catch (err) {
      console.warn('Update cache clear error:', err)
      localStorage.setItem(ACKNOWLEDGED_KEY, hasNewerServerVersion || APP_VERSION)
      window.location.reload()
    }
  }, [hasNewerServerVersion])

  // Check version against public/version.json and local storage
  const checkForUpdates = useCallback(async () => {
    try {
      const res = await fetch(`/version.json?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
      })
      if (!res.ok) return

      const data = await res.json()
      const serverVersion = data?.version

      if (serverVersion && serverVersion !== APP_VERSION) {
        // There is a newer version on server than current bundle!
        setHasNewerServerVersion(serverVersion)
        setShowModal(true)
        setMinimized(false)
        return
      }
    } catch {
      // Offline or network error - ignore
    }

    // Check if user has not yet acknowledged the current major update
    const acknowledged = localStorage.getItem(ACKNOWLEDGED_KEY)
    if (acknowledged !== APP_VERSION) {
      setShowModal(true)
    }
  }, [])

  useEffect(() => {
    // Initial check on load
    checkForUpdates()

    // Listen for Service Worker updates
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[SW] Controller changed to new version')
      })

      navigator.serviceWorker.ready.then((registration) => {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New worker ready to take over
                setShowModal(true)
                setMinimized(false)
              }
            })
          }
        })
      })
    }

    // Re-check when user re-enters or switches back to this app tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdates()
      }
    }

    window.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleVisibilityChange)

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleVisibilityChange)
    }
  }, [checkForUpdates])

  if (!showModal) return null

  // Minimized Top Floating Pill
  if (minimized) {
    return (
      <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[9999] px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-600/90 to-indigo-600/90 text-white text-xs font-semibold shadow-xl shadow-blue-500/30 backdrop-blur-md border border-blue-400/30 flex items-center gap-2 cursor-pointer animate-pulse hover:scale-105 active:scale-95 transition-all">
        <Sparkles size={14} className="text-amber-300 animate-spin" style={{ animationDuration: '4s' }} />
        <span onClick={() => setMinimized(false)}>
          มีอัปเดต {hasNewerServerVersion ? `v${hasNewerServerVersion}` : `v${APP_VERSION}`} แตะเพื่อดู
        </span>
        <button
          onClick={handlePerformUpdate}
          disabled={isUpdating}
          className="ml-1 px-2 py-0.5 rounded-full bg-white/20 hover:bg-white/30 text-[11px] font-bold"
        >
          {isUpdating ? '...' : 'อัปเดต'}
        </button>
      </div>
    )
  }

  // Full Rich Modal
  return (
    <div className="fixed inset-0 z-[99999] bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-3xl bg-slate-900/95 border border-cyan-500/30 p-6 text-white shadow-2xl shadow-cyan-500/20 flex flex-col gap-5 overflow-hidden">
        {/* Glow ambient background effect */}
        <div className="absolute -top-24 -right-24 w-52 h-52 bg-gradient-to-br from-cyan-500/20 to-blue-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-52 h-52 bg-gradient-to-tr from-indigo-500/20 to-purple-600/20 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-start justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30 text-white">
              <Zap size={24} className="fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-gradient-to-r from-cyan-500/30 to-blue-500/30 text-cyan-300 border border-cyan-400/40">
                  ✨ อัปเดตใหม่พร้อมใช้งาน
                </span>
              </div>
              <h2 className="text-lg font-bold text-white mt-1">
                {hasNewerServerVersion ? `AppliTrack Pro v${hasNewerServerVersion}` : APP_VERSION_TITLE}
              </h2>
            </div>
          </div>

          <button
            onClick={() => setMinimized(true)}
            className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition-colors"
            title="ย่อไว้ก่อน"
          >
            <X size={18} />
          </button>
        </div>

        {/* Subtitle */}
        <div className="relative z-10">
          <p className="text-xs text-slate-300 font-medium">
            {APP_VERSION_SUBTITLE}
          </p>
        </div>

        {/* Highlights List */}
        <div className="relative z-10 bg-slate-800/60 rounded-2xl p-4 border border-slate-700/60 space-y-2.5 max-h-56 overflow-y-auto">
          <div className="text-[11px] font-semibold text-cyan-400 flex items-center gap-1.5 uppercase tracking-wider">
            <ShieldCheck size={14} /> รายการปรับปรุงในเวอร์ชันนี้:
          </div>
          {APP_UPDATE_HIGHLIGHTS.map((item, idx) => (
            <div key={idx} className="flex items-start gap-2 text-xs text-slate-200 leading-relaxed">
              <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="relative z-10 flex flex-col gap-2 pt-1">
          <button
            type="button"
            disabled={isUpdating}
            onClick={handlePerformUpdate}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-cyan-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <RefreshCw size={17} className={isUpdating ? 'animate-spin' : ''} />
            <span>{isUpdating ? 'กำลังอัปเดตระบบ...' : '🚀 แตะเพื่ออัปเดตเวอร์ชันใหม่ทันที'}</span>
          </button>

          <button
            type="button"
            disabled={isUpdating}
            onClick={() => {
              localStorage.setItem(ACKNOWLEDGED_KEY, hasNewerServerVersion || APP_VERSION)
              setShowModal(false)
            }}
            className="w-full py-2.5 px-4 rounded-xl text-slate-400 hover:text-slate-200 text-xs font-semibold hover:bg-slate-800/50 transition-colors"
          >
            รับทราบแล้ว / ใช้งานต่อไป
          </button>
        </div>
      </div>
    </div>
  )
}

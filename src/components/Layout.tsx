import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { 
  Home, List, ArrowLeftRight, Bell, Settings, Plus, BookOpen, HardDrive, WifiOff, CheckCircle2
} from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useAuth } from '../contexts/AuthContext'
import { cn } from '../lib/utils'

const navItems = [
  { to: '/', icon: Home, label: 'หน้าหลัก', exact: true },
  { to: '/requests', icon: List, label: 'รายการ', exact: false },
  { to: '/loans', icon: BookOpen, label: 'ยืม-คืน', exact: false },
  { to: '/notifications', icon: Bell, label: 'แจ้งเตือน', exact: false },
  { to: '/settings', icon: Settings, label: 'ตั้งค่า', exact: false },
]

export default function Layout() {
  const { profile } = useAuth()
  const unreadCount = useAppStore((s) => s.unreadCount)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [showBackOnline, setShowBackOnline] = useState(false)

  useEffect(() => {
    let timer: any = null
    const handleOnline = () => {
      setIsOnline(true)
      setShowBackOnline(true)
      qc.invalidateQueries()
      timer = setTimeout(() => setShowBackOnline(false), 3500)
    }

    const handleOffline = () => {
      setIsOnline(false)
      setShowBackOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (timer) clearTimeout(timer)
    }
  }, [qc])

  return (
    <div className="flex flex-col min-h-screen bg-[#090d16] bg-tech-grid">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-xl border-b border-white/10 safe-top">
        <div className="flex items-center justify-between px-3 sm:px-4 h-14 max-w-2xl mx-auto w-full gap-2">
          <div className="flex items-center gap-2 sm:gap-2.5 cursor-pointer group min-w-0 shrink" onClick={() => navigate('/')}>
            <div className="w-8 h-8 shrink-0 rounded-xl bg-gradient-to-br from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-cyan-500/20 group-hover:scale-105 transition-transform">
              <span className="text-base select-none">⚡</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
              <span className="font-extrabold text-white text-sm sm:text-base tracking-tight font-sans truncate">AppliTrack</span>
              <span className="text-[9px] sm:text-[10px] font-black px-1 sm:px-1.5 py-0.5 rounded-md bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-sm shadow-cyan-500/20 shrink-0">PRO</span>
              {profile && (
                <span className={cn(
                  "text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-md border flex items-center gap-1 font-mono shrink-0",
                  profile.email?.includes('2') || profile.home_location_id === '1979ede3-5a7f-4b65-8ccf-de428093458d'
                    ? "bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-xs"
                    : "bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-xs"
                )}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse shrink-0" />
                  <span>{profile.email?.includes('2') ? 'HET-2' : profile.role === 'admin' ? 'Admin' : 'HET-1'}</span>
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={() => navigate('/usage')}
              className="flex items-center gap-1 bg-slate-800/80 hover:bg-slate-700/80 active:scale-95 text-slate-300 hover:text-white text-xs font-medium px-2 sm:px-2.5 py-1.5 rounded-xl border border-slate-700/80 transition-all"
              title="ตรวจสอบโควต้าและพื้นที่ (Free Tier)"
            >
              <HardDrive size={14} className="text-purple-400 shrink-0" />
              <span className="hidden min-[420px]:inline">โควต้า</span>
            </button>
            <button
              onClick={() => navigate('/requests/new')}
              className="flex items-center gap-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-95 text-white text-xs sm:text-sm font-semibold px-2.5 sm:px-3 py-1.5 rounded-xl shadow-md shadow-blue-500/20 transition-all duration-150 shrink-0"
            >
              <Plus size={15} className="shrink-0" />
              <span className="hidden min-[360px]:inline">สร้างรายการ</span>
              <span className="min-[360px]:hidden">สร้าง</span>
            </button>
          </div>
        </div>
      </header>

      {/* Network Offline Guardian Banner */}
      {!isOnline && (
        <div className="bg-amber-600/95 text-white text-xs px-4 py-2 flex items-center justify-center gap-2 shadow-lg animate-pulse z-50">
          <WifiOff size={14} className="flex-shrink-0" />
          <span className="font-semibold text-[11px] text-center">
            สัญญาณเน็ตขาดหาย (Offline) · ไม่ต้องตกใจ ข้อมูลในหน้านี้ยังอยู่ครบ ระบบจะเชื่อมต่อให้อัตโนมัติเมื่อมีสัญญาณ
          </span>
        </div>
      )}
      {showBackOnline && (
        <div className="bg-emerald-600/95 text-white text-xs px-4 py-2 flex items-center justify-center gap-2 shadow-lg z-50 transition-all">
          <CheckCircle2 size={14} className="flex-shrink-0" />
          <span className="font-semibold text-[11px]">
            เชื่อมต่ออินเทอร์เน็ตสำเร็จแล้ว · ข้อมูลอัปเดตเป็นเวอร์ชันล่าสุดเรียบร้อย
          </span>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-2xl mx-auto w-full pb-20">
        <Outlet />
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/85 backdrop-blur-xl border-t border-white/10 safe-bottom">
        <div className="flex items-center justify-around max-w-2xl mx-auto px-2 h-16">
          {navItems.map(({ to, icon: Icon, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all duration-200 relative touch-feedback',
                  isActive
                    ? 'text-cyan-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div className={cn(
                    'p-1.5 rounded-xl transition-all duration-200',
                    isActive ? 'bg-cyan-500/15 text-cyan-400 shadow-sm shadow-cyan-500/10' : ''
                  )}>
                    <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                    {to === '/notifications' && unreadCount > 0 && (
                      <span className="absolute top-0 right-2 min-w-[18px] h-[18px] bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow-sm">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-medium tracking-tight">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

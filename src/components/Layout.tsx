import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { 
  Home, List, ArrowLeftRight, Bell, Settings, Plus, BookOpen, HardDrive
} from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { cn } from '../lib/utils'

const navItems = [
  { to: '/', icon: Home, label: 'หน้าหลัก', exact: true },
  { to: '/requests', icon: List, label: 'รายการ', exact: false },
  { to: '/loans', icon: BookOpen, label: 'ยืม-คืน', exact: false },
  { to: '/notifications', icon: Bell, label: 'แจ้งเตือน', exact: false },
  { to: '/settings', icon: Settings, label: 'ตั้งค่า', exact: false },
]

export default function Layout() {
  const unreadCount = useAppStore((s) => s.unreadCount)
  const navigate = useNavigate()

  return (
    <div className="flex flex-col min-h-screen bg-[#0f172a]">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-[#0f172a]/95 backdrop-blur-md border-b border-slate-800 safe-top">
        <div className="flex items-center justify-between px-4 h-14 max-w-2xl mx-auto w-full">
          <div className="flex items-center gap-2.5 cursor-pointer group" onClick={() => navigate('/')}>
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 via-indigo-600 to-violet-600 flex items-center justify-center shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
              <span className="text-base select-none">⚡</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-white text-base tracking-tight font-sans">AppliTrack</span>
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-gradient-to-r from-blue-500/20 to-indigo-500/20 text-blue-400 border border-blue-500/30">PRO</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/usage')}
              className="flex items-center gap-1.5 bg-slate-800/80 hover:bg-slate-700/80 active:scale-95 text-slate-300 hover:text-white text-xs font-medium px-2.5 py-1.5 rounded-xl border border-slate-700/80 transition-all"
              title="ตรวจสอบโควต้าและพื้นที่ (Free Tier)"
            >
              <HardDrive size={14} className="text-purple-400" />
              <span>โควต้า</span>
            </button>
            <button
              onClick={() => navigate('/requests/new')}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-sm font-semibold px-3 py-1.5 rounded-xl transition-all duration-150"
            >
              <Plus size={16} />
              สร้างรายการ
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-2xl mx-auto w-full pb-20">
        <Outlet />
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#1e293b]/95 backdrop-blur-md border-t border-slate-700 safe-bottom">
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
                    ? 'text-blue-400'
                    : 'text-slate-500 hover:text-slate-300'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div className={cn(
                    'p-1.5 rounded-xl transition-all duration-200',
                    isActive ? 'bg-blue-500/15' : ''
                  )}>
                    <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                    {to === '/notifications' && unreadCount > 0 && (
                      <span className="absolute top-0 right-2 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-medium">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { 
  ChevronLeft, Search, MapPin, Compass, ArrowRight, 
  Calendar, User, Clock, Package, BookOpen, ExternalLink, 
  CheckCircle2, AlertCircle, Sparkles, X, Shield, Camera
} from 'lucide-react'
import { useToolJourney, type ToolMovementEvent } from '../hooks/useToolJourney'
import { cn, formatDate } from '../lib/utils'

const QUICK_SAMPLE_TOOLS = ['TW-1158', 'WS-33', 'TW-999', '8100-4027', '8100-4030']

export default function ToolJourneyPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQuery = searchParams.get('q') || 'TW-1158'
  const [search, setSearch] = useState(initialQuery)
  const [activeQuery, setActiveQuery] = useState(initialQuery)

  const { data: journey, isLoading, isFetching } = useToolJourney(activeQuery)

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (search.trim()) {
      setActiveQuery(search.trim())
      setSearchParams({ q: search.trim() })
    }
  }

  const handleSelectQuick = (q: string) => {
    setSearch(q)
    setActiveQuery(q)
    setSearchParams({ q })
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto pb-20">
      {/* Top Header */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors touch-feedback"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <Compass className="text-blue-400" size={20} />
                ประวัติเดินทางเครื่องมือ
              </h1>
            </div>
            <p className="text-xs text-slate-400">ตรวจสอบตำแหน่งปัจจุบันและไทม์ไลน์การย้ายข้ามไซต์</p>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearchSubmit} className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="พิมพ์ค้นหา App No (เช่น TW-1158) หรือชื่อ Terminal..."
          className="w-full bg-slate-800/90 border border-slate-700 text-white placeholder-slate-500 rounded-xl pl-10 pr-20 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-all font-medium"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="p-1 text-slate-500 hover:text-white"
            >
              <X size={14} />
            </button>
          )}
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg transition-all"
          >
            ค้นหา
          </button>
        </div>
      </form>

      {/* Quick Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
        <span className="text-[11px] text-slate-500 shrink-0 font-medium">ตัวอย่าง:</span>
        {QUICK_SAMPLE_TOOLS.map(t => (
          <button
            key={t}
            onClick={() => handleSelectQuick(t)}
            className={cn(
              'px-2 py-0.5 rounded-lg border text-[11px] font-mono shrink-0 transition-all',
              activeQuery === t
                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 font-bold'
                : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-white'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {isLoading || isFetching ? (
        <div className="space-y-3">
          <div className="h-44 bg-slate-800/60 rounded-2xl shimmer" />
          <div className="h-32 bg-slate-800/60 rounded-2xl shimmer" />
        </div>
      ) : journey ? (
        <div className="space-y-4">
          {/* Current Status Hero Card */}
          <div className="bg-gradient-to-br from-blue-950/80 via-slate-900 to-indigo-950/80 border border-blue-500/30 rounded-3xl p-5 shadow-xl relative overflow-hidden">
            {/* Subtle background glow */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative space-y-4">
              {/* Header Badges */}
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-extrabold text-blue-300 bg-blue-500/20 border border-blue-500/40 px-2.5 py-0.5 rounded-xl">
                      {journey.appNo || '-'}
                    </span>
                    {journey.maker && (
                      <span className="text-xs text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-lg border border-slate-700">
                        {journey.maker}
                      </span>
                    )}
                  </div>
                  <h2 className="text-white font-bold text-base leading-tight break-words pt-0.5">
                    {journey.terminalName}
                  </h2>
                  {(journey.terMaker || journey.model || journey.serial) && (
                    <p className="text-xs text-slate-400">
                      {[journey.terMaker, journey.model, journey.serial ? `S/N: ${journey.serial}` : ''].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>

                <span className={cn(
                  'text-xs font-bold px-3 py-1 rounded-full border flex items-center gap-1.5 shrink-0',
                  journey.isCurrentlyInTransit
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse'
                    : journey.isCurrentlyLoaned
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                )}>
                  <span className="w-2 h-2 rounded-full bg-current" />
                  {journey.isCurrentlyInTransit
                    ? 'อยู่ระหว่างขนส่ง'
                    : journey.isCurrentlyLoaned
                    ? 'ยืมใช้งาน'
                    : 'พร้อมใช้งาน'}
                </span>
              </div>

              {/* Status Metrics Box */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-800">
                <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
                  <div className="flex items-center gap-1 text-[11px] text-slate-400 font-semibold mb-1">
                    <MapPin size={12} className="text-emerald-400" />
                    ตำแหน่งปัจจุบัน
                  </div>
                  <p className="text-white font-bold text-sm truncate">
                    {journey.currentLocation}
                  </p>
                </div>

                <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
                  <div className="flex items-center gap-1 text-[11px] text-slate-400 font-semibold mb-1">
                    <User size={12} className="text-blue-400" />
                    ผู้ถือครองล่าสุด
                  </div>
                  <p className="text-white font-bold text-sm truncate">
                    {journey.currentCustodian || '-'}
                  </p>
                </div>

                <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800 col-span-2 sm:col-span-1">
                  <div className="flex items-center gap-1 text-[11px] text-slate-400 font-semibold mb-1">
                    <Compass size={12} className="text-purple-400" />
                    ประวัติเดินทาง
                  </div>
                  <p className="text-white font-bold text-sm">
                    {journey.totalTrips} เที่ยว
                  </p>
                </div>
              </div>

              {journey.baseLocation && (
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <span>สถานที่ตั้งต้นประจำ (Base): <b className="text-slate-300">{journey.baseLocation}</b></span>
                  {journey.lastUpdated && (
                    <span>อัปเดตล่าสุด: {formatDate(journey.lastUpdated)}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Timeline Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Clock size={16} className="text-blue-400" />
                ไทม์ไลน์การเคลื่อนย้าย ({journey.timeline.length} รายการ)
              </h3>
              <Link
                to={`/requests/new`}
                className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1"
              >
                + ส่ง/ยืมตัวนี้
              </Link>
            </div>

            {journey.timeline.length === 0 ? (
              <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-6 text-center space-y-2">
                <Package size={32} className="mx-auto text-slate-600" />
                <p className="text-slate-300 font-bold text-sm">ยังไม่พบประวัติการเคลื่อนย้าย</p>
                <p className="text-slate-500 text-xs">
                  เครื่องมือนี้ประจำอยู่ที่ <b className="text-slate-400">{journey.baseLocation || 'โรงงาน'}</b> และยังไม่มีบันทึกการส่งไปโรงงานอื่นในระบบ
                </p>
                <button
                  onClick={() => navigate('/requests/new')}
                  className="mt-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all"
                >
                  สร้างรายการส่งของสำหรับตัวนี้
                </button>
              </div>
            ) : (
              <div className="space-y-3 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-slate-800">
                {journey.timeline.map((event, idx) => (
                  <TimelineEventCard key={event.requestId} event={event} isLatest={idx === 0} />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-8 text-center space-y-2">
          <Compass size={36} className="mx-auto text-slate-600" />
          <p className="text-slate-300 font-bold text-sm">ไม่พบข้อมูลเครื่องมือ "{activeQuery}"</p>
          <p className="text-slate-500 text-xs">
            ลองพิมพ์ค้นหาด้วยรหัส App No อื่น เช่น TW-1158 หรือเลือกจากรายการด้านบน
          </p>
        </div>
      )}
    </div>
  )
}

function TimelineEventCard({ event, isLatest }: { event: ToolMovementEvent; isLatest: boolean }) {
  const navigate = useNavigate()

  return (
    <div className="relative pl-8">
      {/* Timeline Node Icon */}
      <div className={cn(
        'absolute left-1.5 top-3.5 -translate-x-1/2 w-4 h-4 rounded-full border-2 flex items-center justify-center',
        isLatest
          ? 'bg-blue-500 border-blue-400 shadow-md shadow-blue-500/50'
          : 'bg-slate-800 border-slate-600'
      )}>
        {isLatest && <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />}
      </div>

      <div className={cn(
        'rounded-2xl p-4 border transition-all space-y-2.5',
        isLatest
          ? 'bg-slate-800/90 border-blue-500/40 shadow-lg shadow-blue-500/5'
          : 'bg-slate-800/60 border-slate-700/70 hover:bg-slate-800'
      )}>
        {/* Top header of card */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className={cn(
              'text-[10px] font-bold px-2 py-0.5 rounded-md uppercase',
              event.type === 'loan'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
            )}>
              {event.type === 'loan' ? 'ยืมของ' : 'รับ-ส่งของ'}
            </span>
            <span className="font-mono text-xs font-semibold text-slate-300">
              {event.requestNumber}
            </span>
          </div>

          <span className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
            <Calendar size={12} />
            {formatDate(event.date)}
          </span>
        </div>

        {/* Route: From -> To */}
        <div className="bg-slate-900/80 rounded-xl p-2.5 border border-slate-800/80 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-300">
            {event.fromLocationName}
          </div>
          <div className="flex items-center gap-1 text-blue-400 px-2 font-bold text-xs">
            <span className="text-[10px] text-slate-500">ย้ายไป</span>
            <ArrowRight size={14} />
          </div>
          <div className="text-xs font-bold text-emerald-400">
            {event.toLocationName}
          </div>
        </div>

        {/* Details & Staff */}
        <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
          <div className="flex items-center gap-1.5">
            <User size={13} className="text-slate-500" />
            <span>ผู้ดำเนินการ: <b className="text-slate-200">{event.senderStaffName}</b></span>
          </div>

          <button
            onClick={() => navigate(`/requests/${event.requestId}`)}
            className="text-blue-400 hover:text-blue-300 font-semibold text-[11px] flex items-center gap-1 group"
          >
            <span>ดูใบงาน</span>
            <ExternalLink size={12} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        {event.notes && (
          <p className="text-[11px] text-slate-400 bg-slate-900/50 p-2 rounded-lg border border-slate-800 italic">
            "{event.notes}"
          </p>
        )}

        {/* Photo thumbnails if any */}
        {event.photos && event.photos.length > 0 && (
          <div className="flex items-center gap-2 pt-1 overflow-x-auto">
            {event.photos.slice(0, 3).map((p, i) => (
              <a
                key={i}
                href={p.publicUrl}
                target="_blank"
                rel="noreferrer"
                className="relative rounded-lg overflow-hidden border border-slate-700 w-12 h-12 shrink-0 group"
              >
                <img src={p.publicUrl} alt="Photo" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

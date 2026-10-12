import { useState } from 'react'
import { Smartphone, Download, Share2, PlusSquare, Check, X, Sparkles } from 'lucide-react'
import { usePwaInstall } from '../hooks/usePwaInstall'
import toast from 'react-hot-toast'

interface PwaInstallBannerProps {
  forceOpen?: boolean
  onClose?: () => void
  variant?: 'banner' | 'card'
}

export default function PwaInstallBanner({ forceOpen, onClose, variant = 'banner' }: PwaInstallBannerProps) {
  const { isInstallable, isInstalled, isIos, promptInstall } = usePwaInstall()
  const [dismissed, setDismissed] = useState(false)
  const [showIosGuide, setShowIosGuide] = useState(false)

  // Don't show if already installed in standalone mode, or dismissed by user (unless forceOpen from Settings)
  if (!forceOpen && (isInstalled || dismissed)) {
    return null
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const success = await promptInstall()
      if (success) {
        toast.success('ติดตั้งแอปลงในโทรศัพท์เรียบร้อยแล้ว!')
        if (onClose) onClose()
      }
    } else if (isIos) {
      setShowIosGuide(true)
    } else {
      toast('หากใช้ Chrome/Edge ให้กดที่เมนู 3 จุด แล้วเลือก "ติดตั้งแอป" หรือ "เพิ่มไปยังหน้าจอหลัก"', {
        icon: '💡',
        duration: 5000,
      })
    }
  }

  const handleDismiss = () => {
    setDismissed(true)
    if (onClose) onClose()
  }

  if (variant === 'card') {
    return (
      <div className="bg-gradient-to-br from-blue-900/40 via-indigo-900/30 to-slate-900 border border-blue-500/30 rounded-2xl p-4 space-y-3 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Smartphone size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-white font-bold text-sm">ติดตั้งแอปลงโทรศัพท์ (PWA)</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {isInstalled ? 'ติดตั้งแล้ว' : 'แนะนำ'}
                </span>
              </div>
              <p className="text-slate-400 text-xs mt-0.5">
                เปิดใช้งานเต็มหน้าจอ รวดเร็ว ไม่ต้องเปิดเบราว์เซอร์
              </p>
            </div>
          </div>
        </div>

        {isInstalled ? (
          <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl">
            <Check size={14} />
            <span>คุณกำลังใช้งานผ่านแอปพลิเคชันที่ติดตั้งบนเครื่องแล้ว</span>
          </div>
        ) : (
          <div className="space-y-2 pt-1">
            <button
              onClick={handleInstallClick}
              className="w-full bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              <Download size={15} />
              {isIos ? 'ดูวิธีติดตั้งบน iPhone / iPad' : 'ติดตั้งแอปลงในเครื่องทันที'}
            </button>

            {showIosGuide && (
              <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-3 text-xs space-y-2 text-slate-300 animate-in fade-in">
                <p className="font-bold text-white flex items-center gap-1.5 text-[11px]">
                  <Sparkles size={12} className="text-amber-400" />
                  วิธีติดตั้งสำหรับ Safari บน iOS:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-slate-400 text-[11px] leading-relaxed">
                  <li>แตะปุ่ม <span className="inline-flex items-center gap-1 text-white font-semibold bg-slate-800 px-1.5 py-0.5 rounded"><Share2 size={11} /> แชร์ (Share)</span> ที่แถบล่างของ Safari</li>
                  <li>เลื่อนลงแล้วเลือก <span className="inline-flex items-center gap-1 text-white font-semibold bg-slate-800 px-1.5 py-0.5 rounded"><PlusSquare size={11} /> เพิ่มไปยังหน้าจอโฮม (Add to Home Screen)</span></li>
                  <li>แตะ <span className="text-white font-bold">"เพิ่ม" (Add)</span> มุมขวาบน เพื่อเสร็จสิ้น</li>
                </ol>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Floating banner variant
  return (
    <div className="bg-gradient-to-r from-blue-950/90 via-slate-900/95 to-indigo-950/90 backdrop-blur-md border border-blue-500/30 rounded-2xl p-3.5 shadow-xl relative animate-in fade-in slide-in-from-top-2">
      <button
        onClick={handleDismiss}
        className="absolute right-2.5 top-2.5 p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
        title="ปิด"
      >
        <X size={15} />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-md shadow-blue-500/20">
          <Smartphone size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-white font-bold text-xs">ติดตั้งแอปลงในโทรศัพท์</h4>
            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-300">
              PWA
            </span>
          </div>
          <p className="text-slate-400 text-[11px] mt-0.5 line-clamp-2">
            เพิ่มไอคอนลงหน้าจอโฮมเพื่อเปิดใช้งานได้ลื่นไหลเต็มจอ ไม่ต้องพิมพ์ค้นหาในเบราว์เซอร์
          </p>

          <div className="flex items-center gap-2 mt-2.5">
            <button
              onClick={handleInstallClick}
              className="bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 shadow-sm"
            >
              <Download size={13} />
              {isIos ? 'วิธีติดตั้งบน iOS' : 'ติดตั้งเลย'}
            </button>
            <button
              onClick={handleDismiss}
              className="text-slate-400 hover:text-slate-200 text-[11px] px-2 py-1.5 font-medium transition-colors"
            >
              ไว้ทีหลัง
            </button>
          </div>

          {showIosGuide && (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-2.5 mt-2 text-[11px] space-y-1.5 text-slate-300">
              <p className="font-bold text-white text-[10px]">วิธีติดตั้งบน iPhone / iPad (Safari):</p>
              <p className="text-slate-400 text-[10px]">
                1. แตะไอคอน <Share2 size={10} className="inline text-blue-400" /> ด้านล่างของ Safari<br />
                2. เลื่อนลงแล้วแตะ "เพิ่มไปยังหน้าจอโฮม" <PlusSquare size={10} className="inline text-blue-400" /><br />
                3. แตะ "เพิ่ม" มุมบนขวา
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

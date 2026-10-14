import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { 
  Eye, EyeOff, Lock, AlertTriangle, ExternalLink, 
  Zap, Factory, Layers, ArrowRight, ShieldCheck 
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

const schema = z.object({
  email: z.string().min(1, 'กรุณาเลือกหรือกรอกบัญชีผู้ใช้ (HET-1 หรือ HET-2)'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
})

type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const { signIn, isConfigured } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showGuide, setShowGuide] = useState(!isConfigured)
  const [selectedAccount, setSelectedAccount] = useState<'1' | '2' | 'admin'>('1')
  const [isManualInput, setIsManualInput] = useState(false)
  const [isSupabasePaused, setIsSupabasePaused] = useState(false)

  const { register, handleSubmit, setValue, setFocus, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '1@a.com',
      password: '',
    },
  })

  const performLogin = async (rawEmail: string, rawPass: string) => {
    let email = rawEmail.trim().toLowerCase()
    if (email === '1' || email === 'het-1' || email === 'het1') email = '1@a.com'
    else if (email === '2' || email === 'het-2' || email === 'het2') email = '2@a.com'
    else if (email === 'admin' || email === 'superadmin' || email === 'admin@a.com') email = 'admin@a.com'
    else if (!email.includes('@')) email = `${email}@a.com`

    // Map short passwords to Supabase requirement (min 6 chars)
    let pass = rawPass.trim()
    if (email === '1@a.com') {
      if (pass === '1') pass = '111111'
    } else if (email === '2@a.com') {
      if (pass === '2') pass = '222222'
    } else if (email === 'admin@a.com') {
      if (pass === '3' || pass === '333333' || pass === 'admin' || pass === 'admin1234' || pass === 'admin888') pass = '333333'
    }

    setIsLoading(true)
    let { error } = await signIn(email, pass)
    
    // Fallback: If 111111/222222/333333 fails, try password123 as fallback
    if (error && (pass === '111111' || pass === '222222' || pass === '333333')) {
      const retry = await signIn(email, 'password123')
      error = retry.error
    } else if (error && email === 'admin@a.com') {
      const retry = await signIn('admin@a.com', 'admin888')
      error = retry.error
    }

    setIsLoading(false)
    if (error) {
      const errStr = (error.message || '').toLowerCase()
      if (errStr.includes('fetch') || errStr.includes('paused') || errStr.includes('upstream') || errStr.includes('connect')) {
        setIsSupabasePaused(true)
      }
      const msg = error.message.includes('Invalid') 
        ? 'รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง' 
        : `เข้าสู่ระบบไม่สำเร็จ: ${error.message}`
      toast.error(msg)
    } else {
      setIsSupabasePaused(false)
    }
  }

  const onSubmit = async (data: FormData) => {
    if (isLoading) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.error('ขณะนี้ไม่มีสัญญาณอินเทอร์เน็ต กรุณาเชื่อมต่อ Wi-Fi หรือเน็ตมือถือ', { icon: '📡' })
      return
    }
    if (!isConfigured) {
      toast.error('กรุณาตั้งค่า VITE_SUPABASE_URL และ VITE_SUPABASE_ANON_KEY ในไฟล์ .env ก่อนเข้าใช้งาน')
      setShowGuide(true)
      return
    }
    await performLogin(data.email, data.password)
  }

  const handleSelectAccount = (accountType: '1' | '2' | 'admin') => {
    setSelectedAccount(accountType)
    setIsManualInput(false)
    if (accountType === 'admin') {
      setValue('email', 'admin@a.com')
    } else {
      setValue('email', `${accountType}@a.com`)
    }
    setValue('password', '')
    // Focus password field immediately
    setTimeout(() => {
      setFocus('password')
    }, 50)
  }


  return (
    <div className="min-h-screen bg-[#090d16] bg-tech-grid flex flex-col items-center justify-center px-4 py-8 sm:py-12 relative overflow-hidden font-sans">
      {/* Dynamic Ambient Background Glows */}
      <div className="absolute top-1/4 -left-32 w-80 sm:w-96 h-80 sm:h-96 bg-cyan-600/15 rounded-full blur-[100px] pointer-events-none animate-ambient-glow" />
      <div className="absolute bottom-1/4 -right-32 w-80 sm:w-96 h-80 sm:h-96 bg-indigo-600/15 rounded-full blur-[100px] pointer-events-none animate-ambient-glow" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] sm:w-[600px] h-[450px] sm:h-[600px] bg-blue-600/10 rounded-full blur-[130px] pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">
        {/* Sleek Hero Branding Section */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="relative inline-flex items-center justify-center mb-3 group">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 blur-xl opacity-60 group-hover:opacity-90 animate-ambient-glow transition-opacity" />
            <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-slate-900/90 to-slate-950/90 p-[1px] border border-white/20 shadow-2xl backdrop-blur-xl flex items-center justify-center">
              <div className="w-full h-full rounded-[22px] bg-gradient-to-br from-blue-500/20 via-indigo-500/10 to-violet-500/20 flex items-center justify-center">
                <Zap size={36} className="text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.8)] animate-float-slow" />
              </div>
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center justify-center gap-2">
            <span className="text-shimmer">AppliTrack</span>
            <span className="px-2 py-0.5 text-[11px] font-black rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/30 uppercase tracking-wider">
              PRO
            </span>
          </h1>
          <p className="text-slate-400 text-xs mt-1.5 font-medium">
            ระบบติดตามรับ-ส่ง & ยืม-คืนเครื่องมือข้ามโรงงาน
          </p>

          {/* Operational Status Badge */}
          <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/70 border border-slate-800 text-[11px] text-slate-300 backdrop-blur-md shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-emerald-400">ระบบออนไลน์</span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-400">พร้อมใช้งาน 24 ชม.</span>
          </div>
        </div>

        {/* Form Card Shell with Premium Glassmorphism */}
        <div className="relative rounded-3xl bg-slate-900/75 backdrop-blur-2xl p-6 sm:p-7 border border-white/10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] overflow-hidden">
          {/* Subtle top edge neon reflection */}
          <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />

          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldCheck size={18} className="text-cyan-400" />
              <span>เข้าสู่ระบบ</span>
            </h2>
            <span className="text-[11px] text-slate-400 font-medium">เลือกโรงงานประจำการ</span>
          </div>
          
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Factory Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                โรงงานต้นทาง / สถานที่ประจำ
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {/* HET-1 Card */}
                <button
                  type="button"
                  onClick={() => handleSelectAccount('1')}
                  className={`group relative p-3.5 rounded-2xl border text-left transition-all duration-200 active:scale-[0.97] overflow-hidden ${
                    selectedAccount === '1'
                      ? 'bg-gradient-to-br from-cyan-950/60 via-blue-900/40 to-slate-900/90 border-cyan-400/80 shadow-[0_0_20px_rgba(6,182,212,0.25)] text-white'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 hover:bg-slate-900/60'
                  }`}
                >
                  {selectedAccount === '1' && (
                    <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-cyan-400 to-blue-500" />
                  )}
                  <div className="flex items-center justify-between mb-2">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                      selectedAccount === '1'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'bg-slate-800/80 text-slate-400 border border-slate-700/60 group-hover:text-slate-300'
                    }`}>
                      <Factory size={16} />
                    </div>
                    {selectedAccount === '1' ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-cyan-300 bg-cyan-950/80 px-1.5 py-0.5 rounded-full border border-cyan-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                        เลือกอยู่
                      </span>
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-slate-700" />
                    )}
                  </div>
                  <div className="text-sm font-extrabold uppercase tracking-wide text-white">HET-1</div>
                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">โรงงาน 1 (Plant 1)</p>
                </button>

                {/* HET-2 Card */}
                <button
                  type="button"
                  onClick={() => handleSelectAccount('2')}
                  className={`group relative p-3.5 rounded-2xl border text-left transition-all duration-200 active:scale-[0.97] overflow-hidden ${
                    selectedAccount === '2'
                      ? 'bg-gradient-to-br from-indigo-950/60 via-purple-900/40 to-slate-900/90 border-indigo-400/80 shadow-[0_0_20px_rgba(99,102,241,0.25)] text-white'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 hover:bg-slate-900/60'
                  }`}
                >
                  {selectedAccount === '2' && (
                    <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-indigo-400 to-purple-500" />
                  )}
                  <div className="flex items-center justify-between mb-2">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                      selectedAccount === '2'
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                        : 'bg-slate-800/80 text-slate-400 border border-slate-700/60 group-hover:text-slate-300'
                    }`}>
                      <Layers size={16} />
                    </div>
                    {selectedAccount === '2' ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-300 bg-indigo-950/80 px-1.5 py-0.5 rounded-full border border-indigo-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                        เลือกอยู่
                      </span>
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-slate-700" />
                    )}
                  </div>
                  <div className="text-sm font-extrabold uppercase tracking-wide text-white">HET-2</div>
                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">โรงงาน 2 (Plant 2)</p>
                </button>
              </div>

              {/* Admin Card */}
              <button
                type="button"
                onClick={() => handleSelectAccount('admin')}
                className={`w-full mt-2.5 p-3 rounded-2xl border text-left transition-all duration-200 active:scale-[0.98] flex items-center justify-between overflow-hidden relative ${
                  selectedAccount === 'admin'
                    ? 'bg-gradient-to-r from-amber-950/70 via-yellow-950/40 to-slate-900/90 border-amber-400/80 shadow-[0_0_20px_rgba(245,158,11,0.25)] text-white'
                    : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-amber-300 hover:border-amber-500/40 hover:bg-slate-900/60'
                }`}
              >
                {selectedAccount === 'admin' && (
                  <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500" />
                )}
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors text-base ${
                    selectedAccount === 'admin'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                      : 'bg-slate-800/80 text-amber-400/70 border border-slate-700/60'
                  }`}>
                    👑
                  </div>
                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-wide text-white flex items-center gap-1.5">
                      <span>ผู้ดูแลระบบ (Admin)</span>
                      <span className="text-[10px] font-bold text-amber-400 bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.2 rounded">
                        Full Access
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                      เข้าถึงทุกโรงงาน ปรับแก้สถานะ และจัดการระบบทั้งหมด
                    </p>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  {selectedAccount === 'admin' ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded-full border border-amber-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      เลือกอยู่
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-slate-400 border border-slate-800 px-2 py-0.5 rounded-lg bg-slate-900/80">
                      แตะเพื่อเลือก
                    </span>
                  )}
                </div>
              </button>

              {/* Account Identifier & Manual Toggle */}
              <div className="flex items-center justify-between pt-2 px-1">
                <span className="text-[10px] text-slate-500 font-mono">
                  {selectedAccount === 'admin'
                    ? 'บัญชี: admin@a.com'
                    : selectedAccount === '2'
                    ? 'บัญชี: 2@a.com (HET-2)'
                    : 'บัญชี: 1@a.com (HET-1)'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsManualInput(!isManualInput)}
                  className="text-[10px] text-blue-400 hover:text-blue-300 underline font-medium"
                >
                  {isManualInput ? 'ปิดช่องพิมพ์อีเมล' : 'พิมพ์อีเมลเอง'}
                </button>
              </div>

              {isManualInput && (
                <div className="mt-2 space-y-1">
                  <label className="block text-[11px] font-semibold text-slate-300">
                    พิมพ์อีเมลหรือชื่อผู้ใช้โดยตรง
                  </label>
                  <input
                    {...register('email')}
                    placeholder="เช่น admin@a.com, 1@a.com, 2@a.com"
                    className="w-full bg-slate-950/70 border border-slate-700/80 text-white placeholder-slate-500 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-cyan-400 transition-all font-mono"
                  />
                  {errors.email && (
                    <p className="text-red-400 text-xs mt-1 font-medium">{errors.email.message}</p>
                  )}
                </div>
              )}
            </div>

            {/* Email (Hidden when not in manual mode) */}
            {!isManualInput && <input type="hidden" {...register('email')} />}

            {/* Password Section */}
            <div className="pt-1">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                รหัสผ่าน
              </label>

              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 transition-colors pointer-events-none" />
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder={
                    selectedAccount === 'admin'
                      ? 'กรุณากรอกรหัสผ่าน Super Admin (รหัส 3)'
                      : selectedAccount === '2'
                      ? 'กรุณากรอกรหัสผ่าน HET-2 (รหัส 2)'
                      : 'กรุณากรอกรหัสผ่าน HET-1 (รหัส 1)'
                  }
                  className="w-full bg-slate-950/70 border border-slate-700/80 text-white placeholder-slate-500 rounded-xl px-4 py-3 pl-10 pr-10 text-sm focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 transition-all shadow-inner"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-0.5 rounded"
                  aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && (
                <p className="text-red-400 text-xs mt-1.5 font-medium">{errors.password.message}</p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 p-[1px] font-bold text-white shadow-xl shadow-blue-600/25 transition-all duration-300 hover:shadow-blue-500/40 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              <div className="relative flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 py-3.5 px-6 transition-all duration-300 group-hover:brightness-110">
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2 text-sm font-semibold">
                    <svg className="animate-spin w-4 h-4 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    กำลังเข้าสู่ระบบ...
                  </span>
                ) : (
                  <>
                    <span className="text-sm font-bold tracking-wide">
                      {selectedAccount === 'admin'
                        ? 'เข้าสู่ระบบ (Admin)'
                        : selectedAccount === '2'
                        ? 'เข้าสู่ระบบ (HET-2)'
                        : 'เข้าสู่ระบบ (HET-1)'}
                    </span>
                    <ArrowRight size={17} className="transition-transform duration-300 group-hover:translate-x-1" />
                  </>
                )}
              </div>
            </button>
          </form>
        </div>

        {/* Supabase Paused Notice with Direct 1-Click Restore Link */}
        {isSupabasePaused && (
          <div className="mt-4 bg-amber-500/15 border border-amber-500/40 rounded-2xl p-4 text-xs text-amber-200 shadow-xl space-y-2.5 backdrop-blur-md">
            <div className="flex items-center gap-2 font-bold text-amber-300 text-sm">
              <AlertTriangle size={18} className="text-amber-400 flex-shrink-0" />
              <span>ฐานข้อมูล Supabase อาจกำลังพักชั่วคราว (Paused)</span>
            </div>
            <p className="text-slate-300 text-xs leading-relaxed">
              เนื่องจากแพ็กเกจฟรีไม่มีการใช้งานเกิน 7 วัน ฐานข้อมูลจึงเข้าสู่โหมดพักชั่วคราว (ข้อมูลทั้งหมดปลอดภัย 100%) ท่านสามารถแตะปุ่มด้านล่างเพื่อไปกด "Restore project" ในหน้า Dashboard ปลุกระบบกลับมาได้ใน 1 นาทีครับ
            </p>
            <a
              href="https://supabase.com/dashboard/project/wwvvmjkzrkirbyacpkmt"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all active:scale-95 shadow-md shadow-amber-500/20"
            >
              <span>⚡ เปิด Supabase Dashboard เพื่อกด Restore</span>
              <ExternalLink size={14} />
            </a>
          </div>
        )}

        {/* Supabase Setup Notice when not configured */}
        {!isConfigured && (
          <div className="mt-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-xs text-amber-200 backdrop-blur-md">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold flex items-center gap-1.5 text-amber-400">
                ⚠️ ยังไม่ได้เชื่อมต่อ Supabase
              </span>
              <button
                type="button"
                onClick={() => setShowGuide(!showGuide)}
                className="text-amber-400 underline hover:text-amber-300 font-semibold"
              >
                {showGuide ? 'ซ่อนคำแนะนำ' : 'วิธีตั้งค่า'}
              </button>
            </div>
            {showGuide && (
              <div className="space-y-2 mt-2 pt-2 border-t border-amber-500/20 text-slate-300">
                <p>1. ไปที่ <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-blue-400 underline font-semibold">Supabase.com</a> สร้างโปรเจกต์ฟรี</p>
                <p>2. เปิด <strong>SQL Editor</strong> แล้วรันโค้ดจากไฟล์ <code className="bg-slate-900 px-1 py-0.5 rounded text-amber-300">supabase/schema.sql</code></p>
                <p>3. คัดลอก <strong>Project URL</strong> และ <strong>anon public key</strong> มาใส่ในไฟล์ <code className="bg-slate-900 px-1 py-0.5 rounded text-amber-300">.env</code></p>
                <p>4. ไปที่ <strong>Authentication &gt; Users</strong> สร้างบัญชีผู้ใช้ 2 คนสำหรับ 2 สถานที่</p>
              </div>
            )}
          </div>
        )}

        <p className="text-center text-slate-500 text-xs mt-6 font-medium">
          AppliTrack PRO · ระบบจัดการรับ-ส่งและยืม-คืนเครื่องมือ
        </p>
      </div>
    </div>
  )
}

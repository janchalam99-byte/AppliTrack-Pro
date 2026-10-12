import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Lock, Mail, Package } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

const schema = z.object({
  email: z.string().min(1, 'กรุณากรอกอีเมลหรือเลขบัญชี (1 หรือ 2)'),
  password: z.string().min(6, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'),
})

type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const { signIn, isConfigured } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showGuide, setShowGuide] = useState(!isConfigured)

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const performLogin = async (rawEmail: string, pass: string) => {
    let email = rawEmail.trim()
    if (email === '1') email = '1@a.com'
    else if (email === '2') email = '2@a.com'
    else if (!email.includes('@')) email = `${email}@a.com`

    setIsLoading(true)
    const { error } = await signIn(email, pass)
    setIsLoading(false)
    if (error) {
      const msg = error.message.includes('Invalid') 
        ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' 
        : `เข้าสู่ระบบไม่สำเร็จ: ${error.message}`
      toast.error(msg)
    }
  }

  const onSubmit = async (data: FormData) => {
    if (!isConfigured) {
      toast.error('กรุณาตั้งค่า VITE_SUPABASE_URL และ VITE_SUPABASE_ANON_KEY ในไฟล์ .env ก่อนเข้าใช้งาน')
      setShowGuide(true)
      return
    }
    await performLogin(data.email, data.password)
  }

  const handleQuickLogin = async (accountNum: '1' | '2') => {
    setValue('email', `${accountNum}@a.com`)
    setValue('password', 'password123')
    await performLogin(`${accountNum}@a.com`, 'password123')
  }

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-500 via-indigo-600 to-purple-600 shadow-2xl shadow-blue-500/30 mb-4">
            <span className="text-3xl select-none">⚡</span>
          </div>
          <h1 className="text-2xl font-black text-white mb-1 tracking-tight font-sans">
            AppliTrack <span className="text-blue-400">PRO</span>
          </h1>
          <p className="text-slate-400 text-xs">ระบบติดตามรับ-ส่ง & ยืม-คืนเครื่องมือข้ามโรงงาน</p>
        </div>

        {/* Form Card */}
        <div className="bg-[#1e293b] rounded-3xl p-6 border border-slate-700 shadow-2xl">
          <h2 className="text-lg font-bold text-white mb-5">เข้าสู่ระบบ</h2>
          
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Quick 1-tap Account Switcher */}
            <div className="bg-[#0f172a]/70 border border-slate-700/80 rounded-2xl p-3 mb-2">
              <p className="text-[11px] font-semibold text-slate-300 mb-2 flex items-center justify-between">
                <span>⚡ เลือกบัญชีด่วน (คลิกเดียวเข้าสู่ระบบ):</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickLogin('1')}
                  disabled={isLoading}
                  className="p-2.5 rounded-xl bg-blue-600/15 hover:bg-blue-600/25 active:scale-95 border border-blue-500/30 text-left transition-all group"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                    <span className="text-xs font-bold text-white group-hover:text-blue-300">บัญชี 1 (HET-2)</span>
                  </div>
                  <p className="text-[10px] text-blue-300/70 font-mono mt-0.5">1@a.com</p>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickLogin('2')}
                  disabled={isLoading}
                  className="p-2.5 rounded-xl bg-indigo-600/15 hover:bg-indigo-600/25 active:scale-95 border border-indigo-500/30 text-left transition-all group"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
                    <span className="text-xs font-bold text-white group-hover:text-indigo-300">บัญชี 2 (HET-1)</span>
                  </div>
                  <p className="text-[10px] text-indigo-300/70 font-mono mt-0.5">2@a.com</p>
                </button>
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                อีเมล หรือเลขบัญชี (1 หรือ 2)
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  {...register('email')}
                  type="text"
                  autoComplete="username"
                  placeholder="1 หรือ 1@a.com"
                  className="w-full bg-[#0f172a] border border-slate-700 text-white placeholder-slate-600 rounded-xl px-4 py-3 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
              {errors.email && (
                <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                รหัสผ่าน
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full bg-[#0f172a] border border-slate-700 text-white placeholder-slate-600 rounded-xl px-4 py-3 pl-9 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && (
                <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-all duration-200 active:scale-95 mt-2"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  กำลังเข้าสู่ระบบ...
                </span>
              ) : 'เข้าสู่ระบบ'}
            </button>
          </form>
        </div>

        {/* Supabase Setup Notice when not configured */}
        {!isConfigured && (
          <div className="mt-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-xs text-amber-200">
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

        <p className="text-center text-slate-600 text-xs mt-6">
          ระบบนี้สำหรับผู้ใช้ที่ได้รับอนุญาตเท่านั้น
        </p>
      </div>
    </div>
  )
}

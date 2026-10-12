import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { 
  Settings, User, MapPin, LogOut, Save, Edit2, ChevronRight, 
  HardDrive, Plus, X, Users, Tag, Database, Compass 
} from 'lucide-react'
import PwaInstallBanner from '../components/PwaInstallBanner'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useAppStore } from '../store/appStore'
import { useQuickOptions } from '../hooks/useQuickOptions'
import { cn } from '../lib/utils'
import toast from 'react-hot-toast'
import type { Location } from '../types/database'

export default function SettingsPage() {
  const { profile, signOut } = useAuth()
  const locations = useAppStore(s => s.locations)
  const fetchLocations = useAppStore(s => s.fetchLocations)
  const qc = useQueryClient()
  const [editingLocation, setEditingLocation] = useState<string | null>(null)
  const [locationName, setLocationName] = useState('')
  const [locationDesc, setLocationDesc] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Quick options management
  const { staffOptions, remarkOptions, addOption, removeOption } = useQuickOptions()
  const [newStaff, setNewStaff] = useState('')
  const [newRemark, setNewRemark] = useState('')

  const startEditLocation = (loc: Location) => {
    setEditingLocation(loc.id)
    setLocationName(loc.name)
    setLocationDesc(loc.description ?? '')
  }

  const saveLocation = async (id: string) => {
    if (!locationName.trim()) {
      toast.error('กรุณาระบุชื่อสถานที่')
      return
    }
    setIsSaving(true)
    const { error } = await supabase
      .from('locations')
      .update({ name: locationName.trim(), description: locationDesc.trim() || null })
      .eq('id', id)

    setIsSaving(false)
    if (error) {
      toast.error(`ไม่สามารถบันทึกได้: ${error.message}`)
    } else {
      toast.success('บันทึกชื่อสถานที่สำเร็จ')
      setEditingLocation(null)
      fetchLocations()
    }
  }

  const handleSignOut = async () => {
    if (!window.confirm('ต้องการออกจากระบบ?')) return
    await signOut()
  }

  return (
    <div className="p-4 space-y-4">
      <div className="pt-2">
        <h1 className="text-xl font-bold text-white">ตั้งค่า</h1>
      </div>

      {/* Profile Card */}
      <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <span className="text-white text-lg font-bold">
              {profile?.full_name?.charAt(0).toUpperCase() ?? 'U'}
            </span>
          </div>
          <div>
            <p className="text-white font-bold">{profile?.full_name ?? 'ผู้ใช้'}</p>
            <p className="text-slate-400 text-xs">{profile?.email}</p>
            <span className={cn(
              'text-[10px] font-semibold px-2 py-0.5 rounded-full mt-0.5 inline-block',
              profile?.role === 'admin'
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-slate-600/50 text-slate-400'
            )}>
              {profile?.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้'}
            </span>
          </div>
        </div>

        {/* Home Location */}
        <div className="border-t border-slate-700 pt-3">
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-slate-500" />
            <p className="text-xs text-slate-500">สถานที่ประจำ</p>
          </div>
          <p className="text-slate-300 text-sm font-medium mt-1 ml-5">
            {locations.find(l => l.id === profile?.home_location_id)?.name ?? 'ยังไม่ได้ตั้งค่า'}
          </p>
        </div>
      </div>

      {/* Location Settings (Admin only) */}
      {profile?.role === 'admin' && (
        <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={16} className="text-blue-400" />
            <h2 className="text-sm font-bold text-white">ชื่อสถานที่</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">กดปุ่มแก้ไขเพื่อเปลี่ยนชื่อสถานที่</p>

          <div className="space-y-3">
            {locations.map((loc) => (
              <div key={loc.id} className="bg-slate-900/50 rounded-xl p-3">
                {editingLocation === loc.id ? (
                  <div className="space-y-2">
                    <input
                      value={locationName}
                      onChange={e => setLocationName(e.target.value)}
                      placeholder="ชื่อสถานที่"
                      className="input-field text-sm"
                    />
                    <input
                      value={locationDesc}
                      onChange={e => setLocationDesc(e.target.value)}
                      placeholder="คำอธิบาย (ไม่บังคับ)"
                      className="input-field text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveLocation(loc.id)}
                        disabled={isSaving}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-bold py-2 rounded-xl transition-all active:scale-95"
                      >
                        {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
                      </button>
                      <button
                        onClick={() => setEditingLocation(null)}
                        className="px-3 py-2 rounded-xl bg-slate-700 text-slate-400 text-sm transition-all active:scale-95"
                      >
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-semibold text-sm">{loc.name}</p>
                      {loc.description && (
                        <p className="text-slate-500 text-xs mt-0.5">{loc.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => startEditLocation(loc)}
                      className="p-2 rounded-xl bg-slate-700 text-slate-400 hover:text-white transition-colors"
                    >
                      <Edit2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Options Management Card */}
      <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Tag size={16} className="text-purple-400" />
          <h2 className="text-sm font-bold text-white">จัดการปุ่มลัด (ชื่อพนักงาน & หมายเหตุ)</h2>
        </div>
        <p className="text-xs text-slate-400">
          เพิ่มหรือลบปุ่มลัดที่ทุกคนจะเห็นในหน้าสร้างรายการ สามารถแก้ไขได้ง่าย ๆ ทันที
        </p>

        {/* Staff Pills Management */}
        <div className="space-y-2 pt-1 border-t border-slate-700/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
              <Users size={13} />
              ปุ่มลัดชื่อพนักงาน ({staffOptions.length} คน)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              value={newStaff}
              onChange={e => setNewStaff(e.target.value)}
              placeholder="พิมพ์ชื่อพนักงานใหม่..."
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-400"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (newStaff.trim()) {
                    addOption('staff', newStaff.trim())
                    setNewStaff('')
                  }
                }
              }}
            />
            <button
              onClick={() => {
                if (newStaff.trim()) {
                  addOption('staff', newStaff.trim())
                  setNewStaff('')
                }
              }}
              className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition-all active:scale-95 flex items-center gap-1"
            >
              <Plus size={13} />
              เพิ่มชื่อ
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1 max-h-36 overflow-y-auto">
            {staffOptions.map(name => (
              <span
                key={name}
                className="inline-flex items-center gap-1 text-[11px] font-semibold bg-slate-900 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-lg group"
              >
                {name}
                <button
                  type="button"
                  onClick={() => removeOption('staff', name)}
                  className="w-3.5 h-3.5 rounded-full hover:bg-rose-500 hover:text-white flex items-center justify-center text-slate-500 transition-colors ml-0.5"
                  title={`ลบปุ่ม ${name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Remark Pills Management */}
        <div className="space-y-2 pt-2 border-t border-slate-700/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
              <Tag size={13} />
              ปุ่มลัดหมายเหตุฐาน App ({remarkOptions.length} รายการ)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              value={newRemark}
              onChange={e => setNewRemark(e.target.value)}
              placeholder="พิมพ์ข้อความหมายเหตุใหม่..."
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (newRemark.trim()) {
                    addOption('remark', newRemark.trim())
                    setNewRemark('')
                  }
                }
              }}
            />
            <button
              onClick={() => {
                if (newRemark.trim()) {
                  addOption('remark', newRemark.trim())
                  setNewRemark('')
                }
              }}
              className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition-all active:scale-95 flex items-center gap-1"
            >
              <Plus size={13} />
              เพิ่มปุ่ม
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1 max-h-36 overflow-y-auto">
            {remarkOptions.map(rem => (
              <span
                key={rem}
                className="inline-flex items-center gap-1 text-[11px] font-semibold bg-slate-900 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-lg group"
              >
                {rem}
                <button
                  type="button"
                  onClick={() => removeOption('remark', rem)}
                  className="w-3.5 h-3.5 rounded-full hover:bg-rose-500 hover:text-white flex items-center justify-center text-slate-500 transition-colors ml-0.5"
                  title={`ลบปุ่ม ${rem}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Master Applicator Management Card */}
      <Link
        to="/master-applicators"
        className="block bg-gradient-to-r from-blue-900/40 via-indigo-900/30 to-slate-800/80 hover:from-blue-900/50 hover:via-indigo-900/40 border border-blue-500/40 hover:border-blue-400/60 rounded-2xl p-4 transition-all active:scale-[0.99] group shadow-sm"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-500/20 text-blue-400 group-hover:scale-105 transition-transform">
              <Database size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-white font-bold text-sm group-hover:text-blue-300 transition-colors">
                  จัดการฐานข้อมูล Master Applicator
                </p>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  ฐาน Master
                </span>
              </div>
              <p className="text-slate-400 text-xs mt-0.5">
                เพิ่ม ลบ หรือแก้ไขข้อมูล Applicator, Terminal Name, Maker และ Serial No.
              </p>
            </div>
          </div>
          <ChevronRight size={18} className="text-slate-400 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
        </div>
      </Link>

      {/* Tool Journey Tracking Card */}
      <Link
        to="/tool-journey"
        className="block bg-gradient-to-r from-purple-900/40 via-indigo-900/30 to-slate-800/80 hover:from-purple-900/50 hover:via-indigo-900/40 border border-purple-500/40 hover:border-purple-400/60 rounded-2xl p-4 transition-all active:scale-[0.99] group shadow-sm"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-purple-500/20 text-purple-400 group-hover:scale-105 transition-transform">
              <Compass size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-white font-bold text-sm group-hover:text-purple-300 transition-colors">
                  ประวัติเดินทางเครื่องมือ (Tool Journey)
                </p>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  ติดตามตำแหน่ง
                </span>
              </div>
              <p className="text-slate-400 text-xs mt-0.5">
                ดูตำแหน่งปัจจุบัน ผู้ถือครอง และไทม์ไลน์การย้ายข้ามไซต์ HET 1 ↔ HET 2
              </p>
            </div>
          </div>
          <ChevronRight size={18} className="text-slate-400 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
        </div>
      </Link>

      {/* PWA Install Card */}
      <PwaInstallBanner variant="card" forceOpen={true} />

      {/* Usage & Quota Monitoring Card */}
      <Link
        to="/usage"
        className="block bg-gradient-to-r from-blue-900/30 to-purple-900/30 hover:from-blue-900/40 hover:to-purple-900/40 border border-blue-500/30 hover:border-blue-500/50 rounded-2xl p-4 transition-all active:scale-[0.99] group shadow-sm"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-500/20 text-blue-400 group-hover:scale-105 transition-transform">
              <HardDrive size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-white font-bold text-sm group-hover:text-blue-300 transition-colors">
                  ตรวจสอบโควต้า & พื้นที่
                </p>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Free 0 บาท
                </span>
              </div>
              <p className="text-slate-400 text-xs mt-0.5">
                ดูพื้นที่เก็บรูป (1 GB), ส่งออก CSV, และคู่มือสำรองข้อมูลลงคอมพิวเตอร์
              </p>
            </div>
          </div>
          <ChevronRight size={18} className="text-slate-400 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
        </div>
      </Link>

      {/* App Info */}
      <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Settings size={16} className="text-slate-400" />
          <h2 className="text-sm font-bold text-white">เกี่ยวกับแอป</h2>
        </div>
        <InfoRow label="เวอร์ชัน" value="1.0.0" />
        <InfoRow label="ฐานข้อมูล" value="Supabase PostgreSQL (Free Tier 500 MB)" />
        <InfoRow label="ที่เก็บรูป" value="Supabase Storage (Free Tier 1 GB)" />
        <InfoRow label="การบีบอัดภาพ" value="Client-side Adaptive 1600px (ประหยัด ~85%)" />
      </div>

      {/* Sign Out */}
      <button
        onClick={handleSignOut}
        className="w-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/30 text-red-400 font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 touch-feedback"
      >
        <LogOut size={18} />
        ออกจากระบบ
      </button>

      <div className="h-4" />
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-slate-700/50 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs text-slate-300 font-medium">{value}</span>
    </div>
  )
}

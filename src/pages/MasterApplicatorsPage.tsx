import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  ChevronLeft, Plus, Search, Edit2, Trash2, X, 
  Save, Database, Sparkles, MapPin, Tag, RefreshCw, Compass
} from 'lucide-react'
import { useMasterApplicators, type MasterApplicator, type NewMasterApplicator } from '../hooks/useMasterApplicators'
import { cn } from '../lib/utils'
import toast from 'react-hot-toast'

export default function MasterApplicatorsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  const {
    items, totalCount, isLoading, isFetching, refetch,
    addApplicator, updateApplicator, deleteApplicator,
    isAdding, isUpdating, isDeleting
  } = useMasterApplicators(search, page, pageSize)

  // Modal State
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState<MasterApplicator | null>(null)
  const [formData, setFormData] = useState<NewMasterApplicator>({
    app_no: '',
    terminal_name: '',
    maker: '',
    ter_maker: '',
    model: '',
    serial: '',
    base_location: 'HET 1',
  })

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingItem(null)
    setFormData({
      app_no: '',
      terminal_name: '',
      maker: '',
      ter_maker: '',
      model: '',
      serial: '',
      base_location: 'HET 1',
    })
    setShowModal(true)
  }

  // Open Edit Modal
  const handleOpenEdit = (item: MasterApplicator) => {
    setEditingItem(item)
    setFormData({
      app_no: item.app_no || '',
      terminal_name: item.terminal_name || '',
      maker: item.maker || '',
      ter_maker: item.ter_maker || '',
      model: item.model || '',
      serial: item.serial || '',
      base_location: item.base_location || 'HET 1',
    })
    setShowModal(true)
  }

  // Submit Modal
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.terminal_name.trim()) {
      toast.error('กรุณาระบุชื่อ Terminal Name')
      return
    }

    try {
      if (editingItem) {
        await updateApplicator(editingItem.id, formData)
      } else {
        await addApplicator(formData)
      }
      setShowModal(false)
    } catch (err: any) {
      // Error handled by hook toast
    }
  }

  // Handle Delete
  const handleDelete = async (item: MasterApplicator) => {
    const confirmText = `ต้องการลบ ${item.app_no || item.terminal_name} ออกจากฐานข้อมูล Master หรือไม่?`
    if (!window.confirm(confirmText)) return

    try {
      await deleteApplicator(item.id)
    } catch (err: any) {
      // Error handled by hook toast
    }
  }

  const totalPages = Math.ceil(totalCount / pageSize) || 1

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto pb-16">
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
              <h1 className="text-xl font-bold text-white">จัดการ Master Applicator</h1>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                {totalCount.toLocaleString()} รายการ
              </span>
            </div>
            <p className="text-xs text-slate-400">เพิ่ม ลบ หรือแก้ไขข้อมูลเครื่องมือและ Die ในระบบ</p>
          </div>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-bold px-3 py-2 rounded-xl transition-all shadow-sm"
        >
          <Plus size={16} />
          เพิ่มใหม่
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        <input
          value={search}
          onChange={e => {
            setSearch(e.target.value)
            setPage(1)
          }}
          placeholder="พิมพ์ค้นหา App No (เช่น TW-1158), Terminal Name, Maker..."
          className="w-full bg-slate-800/90 border border-slate-700 text-white placeholder-slate-500 rounded-xl pl-10 pr-9 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-all font-medium"
        />
        {search && (
          <button
            onClick={() => { setSearch(''); setPage(1); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Items List */}
      {isLoading ? (
        <div className="space-y-2">
          {Array(5).fill(0).map((_, i) => (
            <div key={i} className="h-20 bg-slate-800/60 rounded-2xl shimmer" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-8 text-center">
          <Database size={32} className="mx-auto text-slate-600 mb-2" />
          <p className="text-slate-300 font-bold text-sm">ไม่พบข้อมูลใน Master</p>
          <p className="text-slate-500 text-xs mt-1">กดปุ่ม "+ เพิ่มใหม่" ด้านบนเพื่อเพิ่มรายการแรก</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div
              key={item.id}
              className="bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 rounded-2xl p-3.5 transition-all flex items-start justify-between gap-3 group"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-bold text-blue-300 bg-blue-500/20 border border-blue-500/30 px-2 py-0.5 rounded-lg">
                    {item.app_no || '-'}
                  </span>
                  {item.base_location && (
                    <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <MapPin size={10} />
                      {item.base_location}
                    </span>
                  )}
                  {item.maker && (
                    <span className="text-[10px] text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">
                      {item.maker}
                    </span>
                  )}
                </div>

                <p className="text-white font-bold text-sm truncate">
                  {item.terminal_name}
                </p>

                {(item.ter_maker || item.model || item.serial) && (
                  <p className="text-[11px] text-slate-500 truncate">
                    {[item.ter_maker, item.model, item.serial ? `S/N: ${item.serial}` : ''].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1 shrink-0 pt-1">
                <button
                  type="button"
                  onClick={() => navigate(`/tool-journey?q=${encodeURIComponent(item.app_no || item.terminal_name)}`)}
                  className="p-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 transition-colors"
                  title="ดูประวัติการเดินทาง / ตำแหน่งปัจจุบัน"
                >
                  <Compass size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenEdit(item)}
                  className="p-2 rounded-xl bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                  title="แก้ไข"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item)}
                  className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors"
                  title="ลบ"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 text-xs text-slate-400 border-t border-slate-800">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition-colors font-medium text-white"
          >
            ← หน้าก่อน
          </button>
          <span>หน้า {page} จาก {totalPages} ({totalCount} รายการ)</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition-colors font-medium text-white"
          >
            หน้าถัดไป →
          </button>
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl max-w-md w-full p-5 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Database size={18} className="text-blue-400" />
                {editingItem ? 'แก้ไข Applicator' : 'เพิ่ม Applicator ใหม่เข้า Master'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  App No. (รหัสเครื่องมือ)
                </label>
                <input
                  value={formData.app_no}
                  onChange={e => setFormData({ ...formData, app_no: e.target.value })}
                  placeholder="เช่น TW-1158, WS-33..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  TERMINAL NAME / Part No. <span className="text-rose-400">*</span>
                </label>
                <input
                  required
                  value={formData.terminal_name}
                  onChange={e => setFormData({ ...formData, terminal_name: e.target.value })}
                  placeholder="เช่น 8100-4027 / 8100-4030, SIN-41T-2.4S..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Maker (App/Die)
                  </label>
                  <input
                    value={formData.maker || ''}
                    onChange={e => setFormData({ ...formData, maker: e.target.value })}
                    placeholder="เช่น JAM, JST..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Ter. Maker
                  </label>
                  <input
                    value={formData.ter_maker || ''}
                    onChange={e => setFormData({ ...formData, ter_maker: e.target.value })}
                    placeholder="เช่น JST, AMP, HRS..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Model
                  </label>
                  <input
                    value={formData.model || ''}
                    onChange={e => setFormData({ ...formData, model: e.target.value })}
                    placeholder="เช่น CNS-5900..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Serial No.
                  </label>
                  <input
                    value={formData.serial || ''}
                    onChange={e => setFormData({ ...formData, serial: e.target.value })}
                    placeholder="เช่น CJ722669..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-blue-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  สถานที่ประจำ
                </label>
                <select
                  value={formData.base_location || 'HET 1'}
                  onChange={e => setFormData({ ...formData, base_location: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="HET 1">HET 1</option>
                  <option value="HET 2">HET 2</option>
                  <option value="ส่วนกลาง">ส่วนกลาง</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-700">
                <button
                  type="submit"
                  disabled={isAdding || isUpdating}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <Save size={15} />
                  {editingItem ? 'บันทึกการแก้ไข' : 'เพิ่มเข้าระบบ'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl transition-colors"
                >
                  ยกเลิก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

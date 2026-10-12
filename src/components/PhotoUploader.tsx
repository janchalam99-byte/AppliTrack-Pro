import { useRef, useState } from 'react'
import { Camera, Image, X, Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { cn, compressImage, formatFileSize, type CompressionResult } from '../lib/utils'
import { uploadEvidencePhoto } from '../lib/photoUpload'
import toast from 'react-hot-toast'
import type { PhotoStage } from '../types/database'

export interface UploadedPhoto {
  id?: string
  file?: File
  previewUrl: string
  storagePath?: string
  publicUrl?: string
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
  stage: PhotoStage
  notes?: string
  compressedInfo?: {
    originalSize: number
    compressedSize: number
    savedPercent: number
  }
}

interface PhotoUploaderProps {
  stage: PhotoStage
  requestId?: string
  itemId?: string
  onPhotosChange: (photos: UploadedPhoto[]) => void
  photos: UploadedPhoto[]
  maxPhotos?: number
  label?: string
  hint?: string
}

export default function PhotoUploader({
  stage,
  requestId,
  itemId,
  onPhotosChange,
  photos,
  maxPhotos = 10,
  label = 'เพิ่มรูปภาพ',
  hint,
}: PhotoUploaderProps) {
  const { profile } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const remaining = maxPhotos - photos.length
    if (remaining <= 0) {
      toast.error(`เพิ่มรูปได้สูงสุด ${maxPhotos} รูป`)
      return
    }

    const MAX_RAW_FILE_SIZE = 25 * 1024 * 1024 // 25 MB limit for safety
    const toProcess = Array.from(files).slice(0, remaining)
    const newPhotos: UploadedPhoto[] = []

    for (const file of toProcess) {
      if (file.size > MAX_RAW_FILE_SIZE) {
        toast.error(`ไฟล์ ${file.name} ใหญ่เกิน 25 MB กรุณาเลือกไฟล์ที่เล็กลง`)
        continue
      }
      if (file.size > 8 * 1024 * 1024) {
        toast('กำลังย่อไฟล์อัตโนมัติเพื่อประหยัดพื้นที่ Free Tier...', { icon: '⚡' })
      }
      const previewUrl = URL.createObjectURL(file)
      newPhotos.push({ file, previewUrl, status: 'pending', stage })
    }

    if (newPhotos.length === 0) return

    const updated = [...photos, ...newPhotos]
    onPhotosChange(updated)

    // If we have a requestId, upload immediately
    if (requestId) {
      for (let i = 0; i < newPhotos.length; i++) {
        const idx = photos.length + i
        await uploadPhoto(updated, idx, requestId, itemId)
      }
    }
  }

  const uploadPhoto = async (
    photoList: UploadedPhoto[],
    idx: number,
    reqId: string,
    itmId?: string
  ) => {
    const photo = photoList[idx]
    if (!photo.file || !profile) return

    // Set uploading status
    const withUploading = [...photoList]
    withUploading[idx] = { ...photo, status: 'uploading' }
    onPhotosChange(withUploading)

    try {
      const result = await uploadEvidencePhoto({
        file: photo.file,
        requestId: reqId,
        stage,
        userId: profile.id,
      })

      // Update photo status with compression metrics
      const withSuccess = [...withUploading]
      withSuccess[idx] = {
        ...withSuccess[idx],
        id: result.photo.id,
        storagePath: result.photo.storage_path,
        publicUrl: result.photo.public_url ?? undefined,
        status: 'success',
        compressedInfo: {
          originalSize: result.comp.originalSize,
          compressedSize: result.comp.compressedSize,
          savedPercent: result.comp.savedPercent,
        },
      }
      onPhotosChange(withSuccess)
    } catch (err: any) {
      const withError = [...withUploading]
      withError[idx] = {
        ...withError[idx],
        status: 'error',
        error: err.message ?? 'อัปโหลดไม่สำเร็จ',
      }
      onPhotosChange(withError)
      toast.error(`อัปโหลดรูปไม่สำเร็จ: ${err.message ?? 'ลองใหม่อีกครั้ง'}`)
    }
  }

  const removePhoto = (idx: number) => {
    const photo = photos[idx]
    if (photo.previewUrl) URL.revokeObjectURL(photo.previewUrl)
    onPhotosChange(photos.filter((_, i) => i !== idx))
  }

  const retryUpload = async (idx: number) => {
    if (!requestId) return
    await uploadPhoto(photos, idx, requestId, itemId)
  }

  const uploadPending = async (reqId: string, itmId?: string) => {
    // Called when request is finally saved and we have an ID
    const updated = [...photos]
    let changed = false
    for (let i = 0; i < updated.length; i++) {
      if (updated[i].status === 'pending' && updated[i].file) {
        await uploadPhoto(updated, i, reqId, itmId)
        changed = true
      }
    }
    if (changed) onPhotosChange(updated)
  }

  const canAdd = photos.length < maxPhotos

  return (
    <div className="space-y-3">
      {/* Label */}
      {label && (
        <div>
          <p className="text-sm font-medium text-slate-300">{label}</p>
          {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
        </div>
      )}

      {/* Photo Grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo, idx) => (
            <div key={idx} className="relative aspect-square rounded-xl overflow-hidden group">
              <img
                src={photo.previewUrl || photo.publicUrl}
                alt={`รูป ${idx + 1}`}
                loading="lazy"
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setLightboxUrl(photo.previewUrl || photo.publicUrl || null)}
              />
              {/* Savings Badge */}
              {photo.compressedInfo && (
                <div className="absolute bottom-1 left-1 bg-black/75 backdrop-blur-xs text-[9px] text-emerald-300 font-mono px-1.5 py-0.5 rounded-md pointer-events-none">
                  {formatFileSize(photo.compressedInfo.compressedSize)} (-{photo.compressedInfo.savedPercent}%)
                </div>
              )}
              {/* Status overlay */}
              {photo.status === 'uploading' && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <Loader2 size={20} className="text-white animate-spin" />
                </div>
              )}
              {photo.status === 'success' && (
                <div className="absolute top-1 left-1">
                  <CheckCircle size={16} className="text-green-400 drop-shadow" />
                </div>
              )}
              {photo.status === 'error' && (
                <div className="absolute inset-0 bg-red-900/60 rounded-xl flex flex-col items-center justify-center gap-1">
                  <AlertCircle size={16} className="text-red-300" />
                  <button
                    onClick={() => retryUpload(idx)}
                    className="text-[10px] text-red-200 underline"
                  >
                    ลองใหม่
                  </button>
                </div>
              )}
              {/* Remove button (only for pending/error) */}
              {photo.status !== 'uploading' && photo.status !== 'success' && (
                <button
                  onClick={() => removePhoto(idx)}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center"
                >
                  <X size={10} className="text-white" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add buttons */}
      {canAdd && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-slate-300 rounded-2xl py-3 text-sm font-medium transition-all active:scale-95 touch-feedback"
          >
            <Camera size={18} className="text-blue-400" />
            ถ่ายรูป
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-slate-300 rounded-2xl py-3 text-sm font-medium transition-all active:scale-95 touch-feedback"
          >
            <Image size={18} className="text-purple-400" />
            เลือกรูป
          </button>
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
        onClick={e => { (e.target as HTMLInputElement).value = '' }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
        onClick={e => { (e.target as HTMLInputElement).value = '' }}
      />

      {/* Upload count hint */}
      <p className="text-xs text-slate-600 text-right">{photos.length}/{maxPhotos} รูป</p>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt="ขยายรูป"
            className="max-w-full max-h-full object-contain rounded-xl"
          />
          <button
            className="absolute top-4 right-4 w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white"
            onClick={() => setLightboxUrl(null)}
          >
            <X size={20} />
          </button>
        </div>
      )}
    </div>
  )
}

// Export upload helper for use in parent
export { }

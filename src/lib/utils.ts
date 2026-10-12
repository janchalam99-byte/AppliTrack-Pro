import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, parseISO, isValid } from 'date-fns'
import { th } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? parseISO(date) : date
  if (!isValid(d)) return '-'
  return format(d, 'd MMM yyyy', { locale: th })
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? parseISO(date) : date
  if (!isValid(d)) return '-'
  return format(d, 'd MMM yyyy HH:mm', { locale: th })
}

export function formatTimeAgo(date: string | Date | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? parseISO(date) : date
  if (!isValid(d)) return '-'
  return formatDistanceToNow(d, { addSuffix: true, locale: th })
}

export function formatDateInput(date: string | Date | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? parseISO(date) : date
  if (!isValid(d)) return ''
  return format(d, 'yyyy-MM-dd')
}

export const STATUS_LABELS: Record<string, string> = {
  pending_confirm: 'รอฝากไปกับรถ',
  preparing: 'กำลังจัดเตรียม',
  ready_to_send: 'รอฝากไปกับรถ',
  in_transit: 'รอปลายทางรับของ',
  partially_received: 'รับบางส่วน (พบปัญหา)',
  completed: 'ปิดงาน (ได้รับครบแล้ว)',
  problem_reported: 'พบปัญหา',
  returning: 'กำลังส่งคืน',
  return_in_transit: 'ฝากคืนแล้ว รอรับ',
  partially_returned: 'คืนบางส่วน',
  return_completed: 'คืนครบแล้ว (ปิดงาน)',
  cancelled: 'ยกเลิก',
}

export const TYPE_LABELS: Record<string, string> = {
  transfer: 'ฝาก/ส่งของ',
  loan: 'ยืมของ',
}

export const PHOTO_STAGE_LABELS: Record<string, string> = {
  item_creation: 'รูปตอนสร้างรายการ',
  pre_deposit: 'รูปก่อนฝากของ',
  deposit: 'รูปตอนฝากของ',
  receipt: 'รูปตอนรับของ',
  receipt_problem: 'รูปหลักฐานปัญหา',
  pre_return: 'รูปก่อนส่งคืน',
  return_receipt: 'รูปตอนรับคืน',
}

export const PROBLEM_TYPE_LABELS: Record<string, string> = {
  incomplete: 'รับไม่ครบ',
  wrong_item: 'ของผิด',
  damaged: 'ของเสียหาย',
  other: 'ปัญหาอื่น',
}

export function formatQuantity(qty: number | string | null | undefined): string {
  if (qty === null || qty === undefined) return '0'
  const n = Number(qty)
  return n % 1 === 0 ? n.toString() : n.toFixed(2)
}

export interface CompressionResult {
  file: File
  originalSize: number
  compressedSize: number
  savedPercent: number
  width: number
  height: number
}

/**
 * บีบอัดรูปภาพฝั่งผู้ใช้ (Client-Side Compression)
 * - กำหนดความละเอียดสูงสุดที่ 1600px: คมชัดพอสำหรับอ่านรหัสอะไหล่ ตัวเลขซีเรียล และข้อความบนของ
 * - ควบคุมคุณภาพ JPEG ~0.82 เพื่อให้ขนาดรูปเหลือเพียง ~150-250 KB (ลดลง 80-95%)
 * - ประหยัด Storage 1 GB ให้เก็บได้มากถึง 4,000 - 6,000 รูปใน Free Tier
 */
export function compressImage(
  file: File,
  maxWidth = 1600,
  maxHeight = 1600,
  quality = 0.82
): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    const originalSize = file.size
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img

      // คำนวณอัตราส่วนคงที่ ไม่ให้ภาพบิดเบี้ยว
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d', { alpha: false })

      if (!ctx) {
        reject(new Error('ไม่สามารถประมวลผล Canvas ได้'))
        return
      }

      // ตั้งค่า Image Smoothing คุณภาพสูงเพื่อให้อ่านข้อความและรหัสอะไหล่ได้คมชัด
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('ไม่สามารถบีบอัดรูปภาพได้'))
            return
          }

          // ตั้งชื่อไฟล์ปลายทางเป็น .jpg
          const cleanName = file.name.replace(/\.[^.]+$/, '') + '.jpg'
          const compressedFile = new File([blob], cleanName, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          })

          const compressedSize = compressedFile.size
          const savedPercent = originalSize > 0
            ? Math.max(0, Math.round(((originalSize - compressedSize) / originalSize) * 100))
            : 0

          resolve({
            file: compressedFile,
            originalSize,
            compressedSize,
            savedPercent,
            width,
            height,
          })
        },
        'image/jpeg',
        quality
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('ไม่สามารถโหลดรูปภาพเพื่อประมวลผลได้'))
    }

    img.src = url
  })
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}


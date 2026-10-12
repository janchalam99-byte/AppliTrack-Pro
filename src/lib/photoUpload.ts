import { supabase } from './supabase'
import { compressImage, type CompressionResult } from './utils'
import type { PhotoStage, ItemPhoto } from '../types/database'

export interface UploadPhotoOptions {
  file: File
  requestId: string
  requestNumber?: string
  stage: PhotoStage
  userId: string
  notes?: string
  isEvidence?: boolean
}

export interface UploadPhotoResult {
  photo: ItemPhoto
  provider: 'gdrive' | 'supabase'
  comp: CompressionResult
}

/**
 * Upload an evidence photo directly to Supabase Storage with client-side image compression
 */
export async function uploadEvidencePhoto(options: UploadPhotoOptions): Promise<UploadPhotoResult> {
  const { file, requestId, stage, userId, notes, isEvidence } = options

  // 1. Compress image client-side to save storage space and bandwidth
  const comp = await compressImage(file, 1600, 1600, 0.82)
  const compressedFile = comp.file

  // 2. Upload to Supabase Storage
  const ext = 'jpg'
  const timestamp = Date.now()
  const storagePath = `${requestId}/${userId}/${timestamp}_${stage}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('item-photos')
    .upload(storagePath, compressedFile, {
      contentType: 'image/jpeg',
      upsert: false,
    })

  if (uploadError) throw uploadError

  const { data: signedData } = await supabase.storage
    .from('item-photos')
    .createSignedUrl(storagePath, 60 * 60 * 24 * 7)

  const { data: photoRecord, error: dbError } = await supabase
    .from('item_photos')
    .insert({
      request_id: requestId,
      storage_path: storagePath,
      public_url: signedData?.signedUrl ?? null,
      storage_provider: 'supabase',
      photo_stage: stage,
      taken_by: userId,
      taken_at: new Date().toISOString(),
      file_name: file.name,
      file_size: compressedFile.size,
      mime_type: 'image/jpeg',
      notes: notes || null,
      is_evidence: isEvidence ?? ['deposit', 'receipt', 'receipt_problem', 'return_receipt'].includes(stage),
    })
    .select()
    .single()

  if (dbError) throw dbError

  return {
    photo: photoRecord as ItemPhoto,
    provider: 'supabase',
    comp,
  }
}

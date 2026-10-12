// Database type definitions for Supabase
export type RequestStatus =
  | 'pending_confirm'
  | 'preparing'
  | 'ready_to_send'
  | 'in_transit'
  | 'partially_received'
  | 'completed'
  | 'problem_reported'
  | 'returning'
  | 'return_in_transit'
  | 'partially_returned'
  | 'return_completed'
  | 'cancelled'

export type RequestType = 'transfer' | 'loan'

export type PhotoStage =
  | 'item_creation'
  | 'pre_deposit'
  | 'deposit'
  | 'receipt'
  | 'receipt_problem'
  | 'pre_return'
  | 'return_receipt'

export type ProblemType = 'incomplete' | 'wrong_item' | 'damaged' | 'other'

export type ConfirmationType = 'receipt' | 'return_receipt'

export type NotificationType =
  | 'new_request'
  | 'request_confirmed'
  | 'preparing_done'
  | 'deposited'
  | 'received_incomplete'
  | 'problem_reported'
  | 'due_date_warning'
  | 'overdue'
  | 'return_deposited'
  | 'return_received'
  | 'cancelled'

export interface Profile {
  id: string
  full_name: string
  email: string
  home_location_id: string | null
  role: 'admin' | 'user'
  avatar_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Location {
  id: string
  name: string
  description: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface TransferRequest {
  id: string
  request_number: string
  type: RequestType
  status: RequestStatus
  title: string
  notes: string | null
  from_location_id: string
  to_location_id: string
  requester_id: string
  preparer_id: string | null
  due_date: string | null
  loan_due_date: string | null
  deposited_at: string | null
  deposited_recorded_at: string | null
  deposited_by: string | null
  is_deposit_backdated: boolean
  received_at: string | null
  received_by: string | null
  return_deposited_at: string | null
  return_deposited_by: string | null
  return_received_at: string | null
  return_received_by: string | null
  app_no?: string | null
  terminal_name?: string | null
  sender_staff_name?: string | null
  receiver_staff_name?: string | null
  remark_base?: string | null
  created_at: string
  updated_at: string
  // Joined fields
  from_location?: Location
  to_location?: Location
  requester?: Profile
  preparer?: Profile
  items?: TransferRequestItem[]
  photos?: ItemPhoto[]
  status_history?: StatusHistory[]
}

export interface TransferRequestItem {
  id: string
  request_id: string
  name: string
  description: string | null
  quantity_sent: number
  quantity_received: number
  quantity_returned: number
  unit: string
  sort_order: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ItemPhoto {
  id: string
  request_id: string
  item_id: string | null
  storage_path: string
  public_url: string | null
  gdrive_file_id?: string | null
  gdrive_view_link?: string | null
  gdrive_thumbnail_link?: string | null
  storage_provider?: 'supabase' | 'gdrive' | null
  photo_stage: PhotoStage
  taken_by: string
  taken_at: string
  file_name: string | null
  file_size: number | null
  mime_type: string | null
  notes: string | null
  is_evidence: boolean
  created_at: string
  // Joined
  taker?: Profile
}

export interface BackupLog {
  id: string
  backup_timestamp: string
  status: 'success' | 'failed' | 'warning'
  backup_type: 'full' | 'db_only' | 'storage_only'
  destination: string
  gdrive_folder_id?: string | null
  gdrive_backup_file_id?: string | null
  gdrive_backup_file_name?: string | null
  total_files: number
  total_size_bytes: number
  duration_ms: number
  details?: Record<string, any> | null
  error_message?: string | null
  created_at: string
}

export interface ReceiptConfirmation {
  id: string
  request_id: string
  confirmed_by: string
  confirmed_at: string
  confirmation_type: ConfirmationType
  notes: string | null
  problem_type: ProblemType | null
  problem_description: string | null
  created_at: string
  // Joined
  confirmer?: Profile
  items?: ReceiptConfirmationItem[]
}

export interface ReceiptConfirmationItem {
  id: string
  confirmation_id: string
  item_id: string
  quantity_received: number
  quantity_returned: number
  notes: string | null
  created_at: string
}

export interface StatusHistory {
  id: string
  request_id: string
  from_status: string | null
  to_status: string
  changed_by: string
  changed_at: string
  notes: string | null
  created_at: string
  // Joined
  changer?: Profile
}

export interface Notification {
  id: string
  recipient_id: string
  request_id: string | null
  type: NotificationType
  title: string
  message: string
  is_read: boolean
  read_at: string | null
  created_at: string
  // Joined
  request?: TransferRequest
}

// Database generic type for Supabase client
export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Omit<Profile, 'created_at' | 'updated_at'>; Update: Partial<Profile> }
      locations: { Row: Location; Insert: Omit<Location, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Location> }
      transfer_requests: { Row: TransferRequest; Insert: Omit<TransferRequest, 'id' | 'created_at' | 'updated_at' | 'from_location' | 'to_location' | 'requester' | 'preparer' | 'items' | 'photos' | 'status_history'>; Update: Partial<TransferRequest> }
      transfer_request_items: { Row: TransferRequestItem; Insert: Omit<TransferRequestItem, 'id' | 'created_at' | 'updated_at'>; Update: Partial<TransferRequestItem> }
      item_photos: { Row: ItemPhoto; Insert: Omit<ItemPhoto, 'id' | 'created_at' | 'taker'>; Update: Partial<ItemPhoto> }
      receipt_confirmations: { Row: ReceiptConfirmation; Insert: Omit<ReceiptConfirmation, 'id' | 'created_at' | 'confirmer' | 'items'>; Update: Partial<ReceiptConfirmation> }
      receipt_confirmation_items: { Row: ReceiptConfirmationItem; Insert: Omit<ReceiptConfirmationItem, 'id' | 'created_at'>; Update: Partial<ReceiptConfirmationItem> }
      status_history: { Row: StatusHistory; Insert: Omit<StatusHistory, 'id' | 'created_at' | 'changer'>; Update: Partial<StatusHistory> }
      notifications: { Row: Notification; Insert: Omit<Notification, 'id' | 'request'>; Update: Partial<Notification> }
      backup_logs: { Row: BackupLog; Insert: Omit<BackupLog, 'id' | 'created_at'>; Update: Partial<BackupLog> }
    }
  }
}

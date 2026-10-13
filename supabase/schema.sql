-- =============================================
-- ระบบรับ-ส่งของ: Supabase Database Schema
-- Run this ENTIRE file in Supabase SQL Editor
-- =============================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- 1. TABLES
-- =============================================

-- 1. Profiles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT 'ผู้ใช้งาน',
  email TEXT NOT NULL DEFAULT '',
  home_location_id UUID,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Locations (exactly 2 locations)
CREATE TABLE IF NOT EXISTS public.locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK from profiles to locations safely
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_home_location_id_fkey'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_home_location_id_fkey
      FOREIGN KEY (home_location_id) REFERENCES public.locations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Transfer Requests (main table)
CREATE TABLE IF NOT EXISTS public.transfer_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_number TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('transfer', 'loan')),
  status TEXT NOT NULL DEFAULT 'pending_confirm' CHECK (status IN (
    'pending_confirm',
    'preparing',
    'ready_to_send',
    'in_transit',
    'partially_received',
    'completed',
    'problem_reported',
    'returning',
    'return_in_transit',
    'partially_returned',
    'return_completed',
    'cancelled'
  )),
  title TEXT NOT NULL,
  notes TEXT,
  from_location_id UUID NOT NULL REFERENCES public.locations(id),
  to_location_id UUID NOT NULL REFERENCES public.locations(id),
  requester_id UUID NOT NULL REFERENCES public.profiles(id),
  preparer_id UUID REFERENCES public.profiles(id),
  due_date DATE,
  loan_due_date DATE,
  deposited_at TIMESTAMPTZ,
  deposited_recorded_at TIMESTAMPTZ,
  deposited_by UUID REFERENCES public.profiles(id),
  is_deposit_backdated BOOLEAN DEFAULT false,
  received_at TIMESTAMPTZ,
  received_by UUID REFERENCES public.profiles(id),
  return_deposited_at TIMESTAMPTZ,
  return_deposited_by UUID REFERENCES public.profiles(id),
  return_received_at TIMESTAMPTZ,
  return_received_by UUID REFERENCES public.profiles(id),
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES public.profiles(id),
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Transfer Request Items
CREATE TABLE IF NOT EXISTS public.transfer_request_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES public.transfer_requests(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  quantity_sent NUMERIC(10,2) NOT NULL CHECK (quantity_sent > 0),
  quantity_received NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  quantity_returned NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (quantity_returned >= 0),
  unit TEXT NOT NULL DEFAULT 'ชิ้น',
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quantity_received_check CHECK (quantity_received <= quantity_sent),
  CONSTRAINT quantity_returned_check CHECK (quantity_returned <= quantity_received)
);

-- 5. Item Photos
CREATE TABLE IF NOT EXISTS public.item_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES public.transfer_requests(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.transfer_request_items(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  public_url TEXT,
  photo_stage TEXT NOT NULL CHECK (photo_stage IN (
    'item_creation',
    'pre_deposit',
    'deposit',
    'receipt',
    'receipt_problem',
    'pre_return',
    'return_receipt'
  )),
  taken_by UUID NOT NULL REFERENCES public.profiles(id),
  taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  file_name TEXT,
  file_size INTEGER,
  mime_type TEXT,
  notes TEXT,
  is_evidence BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Receipt Confirmations
CREATE TABLE IF NOT EXISTS public.receipt_confirmations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES public.transfer_requests(id) ON DELETE CASCADE,
  confirmed_by UUID NOT NULL REFERENCES public.profiles(id),
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmation_type TEXT NOT NULL CHECK (confirmation_type IN ('receipt', 'return_receipt')),
  notes TEXT,
  problem_type TEXT CHECK (problem_type IN ('incomplete', 'wrong_item', 'damaged', 'other')),
  problem_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Receipt Confirmation Items
CREATE TABLE IF NOT EXISTS public.receipt_confirmation_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  confirmation_id UUID NOT NULL REFERENCES public.receipt_confirmations(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.transfer_request_items(id) ON DELETE CASCADE,
  quantity_received NUMERIC(10,2) NOT NULL DEFAULT 0,
  quantity_returned NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Status History
CREATE TABLE IF NOT EXISTS public.status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES public.transfer_requests(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID NOT NULL REFERENCES public.profiles(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_id UUID REFERENCES public.transfer_requests(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'new_request',
    'request_confirmed',
    'preparing_done',
    'deposited',
    'received_incomplete',
    'problem_reported',
    'due_date_warning',
    'overdue',
    'return_deposited',
    'return_received',
    'cancelled'
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- 2. INDEXES
-- =============================================

CREATE INDEX IF NOT EXISTS idx_transfer_requests_status ON public.transfer_requests(status);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_type ON public.transfer_requests(type);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_from_location ON public.transfer_requests(from_location_id);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_to_location ON public.transfer_requests(to_location_id);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_requester ON public.transfer_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_created ON public.transfer_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_item_photos_request ON public.item_photos(request_id);
CREATE INDEX IF NOT EXISTS idx_item_photos_stage ON public.item_photos(photo_stage);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(recipient_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_status_history_request ON public.status_history(request_id);

-- =============================================
-- 3. FUNCTIONS & TRIGGERS
-- =============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_request_number(req_type TEXT)
RETURNS TEXT AS $$
DECLARE
  date_part TEXT;
  prefix TEXT;
  max_seq INTEGER;
  seq_num INTEGER;
  result TEXT;
BEGIN
  date_part := TO_CHAR(NOW(), 'YYYYMMDD');
  prefix := CASE WHEN req_type = 'loan' THEN 'LN' ELSE 'TR' END;
  
  -- Extract highest existing sequence number for today
  SELECT COALESCE(
    MAX(
      NULLIF(SUBSTRING(request_number FROM '[0-9]+$'), '')::INTEGER
    ),
    0
  ) INTO max_seq
  FROM public.transfer_requests
  WHERE request_number LIKE prefix || '-' || date_part || '-%';

  seq_num := max_seq + 1;
  result := prefix || '-' || date_part || '-' || LPAD(seq_num::TEXT, 3, '0');

  -- Ensure strictly unique even if gaps or race condition occurred
  WHILE EXISTS (SELECT 1 FROM public.transfer_requests WHERE request_number = result) LOOP
    seq_num := seq_num + 1;
    result := prefix || '-' || date_part || '-' || LPAD(seq_num::TEXT, 3, '0');
  END LOOP;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_locations_updated_at ON public.locations;
CREATE TRIGGER update_locations_updated_at
  BEFORE UPDATE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_transfer_requests_updated_at ON public.transfer_requests;
CREATE TRIGGER update_transfer_requests_updated_at
  BEFORE UPDATE ON public.transfer_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_transfer_request_items_updated_at ON public.transfer_request_items;
CREATE TRIGGER update_transfer_request_items_updated_at
  BEFORE UPDATE ON public.transfer_request_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- 4. ROW LEVEL SECURITY (RLS)
-- =============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfer_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_confirmation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Profiles RLS
DROP POLICY IF EXISTS "auth_read_all_profiles" ON public.profiles;
CREATE POLICY "auth_read_all_profiles"
  ON public.profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_update_own_profile" ON public.profiles;
CREATE POLICY "auth_update_own_profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "auth_insert_profile" ON public.profiles;
CREATE POLICY "auth_insert_profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Locations RLS
DROP POLICY IF EXISTS "auth_read_locations" ON public.locations;
CREATE POLICY "auth_read_locations"
  ON public.locations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_manage_locations" ON public.locations;
CREATE POLICY "admin_manage_locations"
  ON public.locations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Transfer Requests RLS
DROP POLICY IF EXISTS "auth_read_requests" ON public.transfer_requests;
CREATE POLICY "auth_read_requests"
  ON public.transfer_requests FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_create_requests" ON public.transfer_requests;
CREATE POLICY "auth_create_requests"
  ON public.transfer_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = requester_id);

DROP POLICY IF EXISTS "auth_update_requests" ON public.transfer_requests;
CREATE POLICY "auth_update_requests"
  ON public.transfer_requests FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_delete_requests" ON public.transfer_requests;
CREATE POLICY "admin_delete_requests"
  ON public.transfer_requests FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Items RLS
DROP POLICY IF EXISTS "auth_read_items" ON public.transfer_request_items;
CREATE POLICY "auth_read_items"
  ON public.transfer_request_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_manage_items" ON public.transfer_request_items;
CREATE POLICY "auth_manage_items"
  ON public.transfer_request_items FOR ALL TO authenticated USING (true);

-- Photos RLS
DROP POLICY IF EXISTS "auth_read_photos" ON public.item_photos;
CREATE POLICY "auth_read_photos"
  ON public.item_photos FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_photos" ON public.item_photos;
CREATE POLICY "auth_insert_photos"
  ON public.item_photos FOR INSERT TO authenticated WITH CHECK (auth.uid() = taken_by);

DROP POLICY IF EXISTS "admin_delete_photos" ON public.item_photos;
CREATE POLICY "admin_delete_photos"
  ON public.item_photos FOR DELETE TO authenticated
  USING ((NOT is_evidence) OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Confirmations RLS
DROP POLICY IF EXISTS "auth_read_confirmations" ON public.receipt_confirmations;
CREATE POLICY "auth_read_confirmations"
  ON public.receipt_confirmations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_create_confirmations" ON public.receipt_confirmations;
CREATE POLICY "auth_create_confirmations"
  ON public.receipt_confirmations FOR INSERT TO authenticated WITH CHECK (auth.uid() = confirmed_by);

DROP POLICY IF EXISTS "auth_read_confirmation_items" ON public.receipt_confirmation_items;
CREATE POLICY "auth_read_confirmation_items"
  ON public.receipt_confirmation_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_create_confirmation_items" ON public.receipt_confirmation_items;
CREATE POLICY "auth_create_confirmation_items"
  ON public.receipt_confirmation_items FOR INSERT TO authenticated WITH CHECK (true);

-- Status History RLS
DROP POLICY IF EXISTS "auth_read_status_history" ON public.status_history;
CREATE POLICY "auth_read_status_history"
  ON public.status_history FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_create_status_history" ON public.status_history;
CREATE POLICY "auth_create_status_history"
  ON public.status_history FOR INSERT TO authenticated WITH CHECK (auth.uid() = changed_by);

-- Notifications RLS
DROP POLICY IF EXISTS "auth_read_own_notifications" ON public.notifications;
CREATE POLICY "auth_read_own_notifications"
  ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = recipient_id);

DROP POLICY IF EXISTS "auth_create_notifications" ON public.notifications;
CREATE POLICY "auth_create_notifications"
  ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_own_notifications" ON public.notifications;
CREATE POLICY "auth_update_own_notifications"
  ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = recipient_id);

-- =============================================
-- 5. STORAGE BUCKET & POLICIES
-- =============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'item-photos',
  'item-photos',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "auth_upload_photos" ON storage.objects;
CREATE POLICY "auth_upload_photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'item-photos');

DROP POLICY IF EXISTS "auth_view_photos" ON storage.objects;
CREATE POLICY "auth_view_photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'item-photos');

DROP POLICY IF EXISTS "auth_update_own_uploads" ON storage.objects;
CREATE POLICY "auth_update_own_uploads"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'item-photos');

-- =============================================
-- 6. SEED DATA (2 Locations)
-- =============================================

INSERT INTO public.locations (name, description, sort_order) VALUES
  ('สถานที่ A', 'สถานที่หลักที่ 1 (แก้ไขชื่อได้ในหน้าตั้งค่า)', 1),
  ('สถานที่ B', 'สถานที่หลักที่ 2 (แก้ไขชื่อได้ในหน้าตั้งค่า)', 2)
ON CONFLICT DO NOTHING;

-- =============================================
-- 7. AUTO-CREATE PROFILE ON SIGNUP
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1), 'ผู้ใช้ใหม่'),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill existing users in auth.users to profiles
INSERT INTO public.profiles (id, full_name, email, role)
SELECT 
  id,
  COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1), 'ผู้ใช้'),
  COALESCE(email, ''),
  COALESCE(raw_user_meta_data->>'role', 'user')
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role;

-- =============================================
-- 7. SUPABASE REALTIME REPLICATION
-- =============================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE 
      public.transfer_requests, 
      public.transfer_request_items, 
      public.status_history, 
      public.notifications;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


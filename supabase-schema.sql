-- HEALTHOS DATABASE SETUP
-- Run this entire file in Supabase Dashboard -> SQL Editor.
-- This schema is designed so each signed-in user can only access their own rows.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  dob date,
  sex text,
  blood_group text,
  height_cm numeric,
  weight_kg numeric,
  conditions text,
  allergies text,
  surgeries text,
  family_history text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  dosage text,
  form text,
  frequency text,
  time text,
  status text default 'active',
  start_date date,
  end_date date,
  reason text,
  prescribed_by text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.supplements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  dosage text,
  frequency text,
  start_date date,
  status text default 'Active',
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.vitals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  value text not null,
  unit text,
  recorded_at timestamptz default now(),
  note text,
  created_at timestamptz default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  report_type text,
  report_date date,
  provider text,
  notes text,
  file_path text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.medications enable row level security;
alter table public.supplements enable row level security;
alter table public.vitals enable row level security;
alter table public.reports enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "medications_own" on public.medications;
create policy "medications_own" on public.medications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "supplements_own" on public.supplements;
create policy "supplements_own" on public.supplements for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "vitals_own" on public.vitals;
create policy "vitals_own" on public.vitals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "reports_own" on public.reports;
create policy "reports_own" on public.reports for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Storage bucket for private report files.
insert into storage.buckets (id, name, public)
values ('health-reports', 'health-reports', false)
on conflict (id) do update set public = false;

drop policy if exists "report_files_insert_own" on storage.objects;
create policy "report_files_insert_own" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'health-reports'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "report_files_select_own" on storage.objects;
create policy "report_files_select_own" on storage.objects
for select to authenticated
using (
  bucket_id = 'health-reports'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "report_files_delete_own" on storage.objects;
create policy "report_files_delete_own" on storage.objects
for delete to authenticated
using (
  bucket_id = 'health-reports'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

-- Optional: automatically create a profile row when a new auth user is created.
-- The app also creates it during onboarding, so this is not required.

create extension if not exists "pgcrypto";

create type user_role as enum ('resident', 'contractor', 'admin', 'government');
create type construction_stage as enum (
  'Survey & Eligibility Confirmed',
  'Demolition / Site Cleared',
  'Foundation Complete',
  'Structure — Floor-wise',
  'Plumbing, Electrical & Finishing',
  'Possession Ready / Handover'
);
create type submission_state as enum ('submitted', 'pending_review', 'approved', 'rejected');
create type verification_decision as enum ('approved', 'rejected');

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role user_role not null default 'resident',
  full_name text not null,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scheme_type text not null,
  ward_name text,
  status text not null default 'planning',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists buildings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  wing text,
  total_units integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  unit_number text not null,
  floor_number integer,
  area_sqm numeric(10,2),
  occupancy_status text not null default 'allocated',
  created_at timestamptz not null default now(),
  unique (building_id, unit_number)
);

create table if not exists resident_families (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  resident_user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  aadhaar_hash text,
  allotment_id text,
  family_status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (unit_id, resident_user_id)
);

create table if not exists contractor_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  company_name text not null,
  license_number text not null,
  gst_number text,
  registration_number text,
  category text,
  status text not null default 'pending_verification',
  created_at timestamptz not null default now()
);

create table if not exists project_contractors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  contractor_id uuid not null references contractor_accounts(id) on delete cascade,
  assigned_by_admin uuid not null references auth.users(id),
  assigned_at timestamptz not null default now(),
  unique (project_id, contractor_id)
);

create table if not exists construction_stage_definitions (
  id smallserial primary key,
  stage_name construction_stage not null unique,
  stage_order smallint not null unique,
  description text
);

insert into construction_stage_definitions (stage_name, stage_order, description) values
  ('Survey & Eligibility Confirmed', 1, 'Resident eligibility and project linkage confirmed.'),
  ('Demolition / Site Cleared', 2, 'Site cleared and redevelopment work begins.'),
  ('Foundation Complete', 3, 'Foundation and structural works are complete.'),
  ('Structure — Floor-wise', 4, 'Floor-wise structural progress with visible units.'),
  ('Plumbing, Electrical & Finishing', 5, 'Internal services and finishing are underway.'),
  ('Possession Ready / Handover', 6, 'Final possession preparation and handover readiness.')
  on conflict (stage_name) do nothing;

create table if not exists progress_submissions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  building_id uuid not null references buildings(id) on delete cascade,
  unit_id uuid not null references units(id) on delete cascade,
  contractor_id uuid not null references contractor_accounts(id) on delete cascade,
  stage_name construction_stage not null,
  notes text,
  submission_status submission_state not null default 'pending_review',
  created_by uuid not null references auth.users(id),
  submitted_at timestamptz not null default now(),
  geolocation jsonb,
  created_at timestamptz not null default now(),
  check (coalesce(notes, '') <> '' or stage_name is not null)
);

create table if not exists submission_documents (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references progress_submissions(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
 mime_type text not null,
  file_size bigint not null default 0,
  document_type text not null default 'photo',
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists verification_decisions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references progress_submissions(id) on delete cascade,
  reviewer_user_id uuid not null references auth.users(id),
  decision verification_decision not null,
  reason text not null,
  reviewed_at timestamptz not null default now()
);

create table if not exists complaints (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  family_id uuid references resident_families(id) on delete set null,
  submitted_by uuid not null references auth.users(id),
  title text not null,
  description text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_projects_status on projects(status);
create index if not exists idx_buildings_project_id on buildings(project_id);
create index if not exists idx_units_building_id on units(building_id);
create index if not exists idx_resident_families_unit on resident_families(unit_id);
create index if not exists idx_progress_submissions_project_stage on progress_submissions(project_id, stage_name, submission_status);
create index if not exists idx_verification_decisions_submission on verification_decisions(submission_id);
create index if not exists idx_complaints_unit on complaints(unit_id, status);
create index if not exists idx_audit_logs_entity on audit_logs(entity_type, entity_id);

create or replace function public.set_profile_role() returns trigger as $$
begin
  insert into public.profiles(user_id, role, full_name)
  values (new.id, 'resident', coalesce(new.raw_user_meta_data->>'full_name', 'Resident'))
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.set_profile_role();

alter table profiles enable row level security;
alter table projects enable row level security;
alter table buildings enable row level security;
alter table units enable row level security;
alter table resident_families enable row level security;
alter table contractor_accounts enable row level security;
alter table project_contractors enable row level security;
alter table progress_submissions enable row level security;
alter table submission_documents enable row level security;
alter table verification_decisions enable row level security;
alter table complaints enable row level security;
alter table audit_logs enable row level security;

create policy "profiles_self_read" on profiles
  for select using (auth.uid() = user_id);

create policy "profiles_admin_manage" on profiles
  for all using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  );

create policy "projects_admin_readwrite" on projects
  for all using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role in ('admin', 'government')
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role in ('admin', 'government')
    )
  );

create policy "contractor_project_scope" on project_contractors
  for select using (
    exists (
      select 1 from public.contractor_accounts ca
      join public.profiles p on p.user_id = auth.uid()
      where ca.user_id = auth.uid() and ca.id = project_contractors.contractor_id
    )
    or exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role in ('admin', 'government')
    )
  );

create policy "admin_verification_decisions" on verification_decisions
  for all using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  );

create policy "resident_private_visibility" on resident_families
  for select using (
    auth.uid() = resident_user_id
    or exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role in ('admin', 'government')
    )
  );

create policy "complaints_visible_to_owner_and_admin" on complaints
  for select using (
    auth.uid() = submitted_by
    or exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role in ('admin', 'government')
    )
  );

-- NOTE: Storage bucket must be created manually in Supabase Storage for private progress documents.
-- Use a private bucket such as: progress-documents
-- Storage access should be controlled through signed URLs, not public URLs.

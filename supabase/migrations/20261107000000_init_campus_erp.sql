-- =====================================================================
--  CAMPUS ERP  |  United Group of Institutions  |  Powered by yatsu
--  Single migration: schema + indexes + triggers + RLS + storage bucket
--
--  How to run:
--    Supabase Dashboard -> SQL Editor -> New query -> paste this entire file -> Run
--    (or CLI: `supabase db push`)
--
--  Security model (important):
--    * The browser never talks to the database directly. Everything goes through the
--      Next.js server (Server Actions / Route Handlers).
--    * The "authenticated" role has only SELECT (and marking its own notifications as
--      read), and even that is limited by RLS. INSERT/UPDATE/DELETE can only be done
--      by the server (service_role), where every action has role + department + zod
--      validation.
--    * The anon role has nothing.
-- =====================================================================

-- ---------- ENUMS ----------------------------------------------------
create type public.user_role         as enum ('student', 'teacher', 'hod', 'admin');
create type public.attendance_status as enum ('present', 'absent');
create type public.exam_type         as enum ('ST1', 'ST2', 'INTERNAL');
create type public.noc_status        as enum ('draft', 'applied', 'under_review', 'approved', 'rejected');
create type public.risk_level        as enum ('low', 'medium', 'high');
create type public.upload_type       as enum ('attendance', 'marks', 'users');
create type public.upload_status     as enum ('previewed', 'confirmed', 'failed', 'discarded');
create type public.correction_status as enum ('pending', 'approved', 'rejected');

-- ---------- COMMON TRIGGER -------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- ORGANISATION ---------------------------------------------
create table public.institutes (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (char_length(name) between 3 and 150),
  created_at timestamptz not null default now()
);

create table public.departments (
  id           uuid primary key default gen_random_uuid(),
  institute_id uuid not null references public.institutes(id) on delete restrict,
  name         text not null check (char_length(name) between 2 and 120),
  created_at   timestamptz not null default now(),
  unique (institute_id, name)
);

create table public.courses (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  code          text not null check (code ~ '^[A-Za-z0-9._-]{1,20}$'),
  name          text not null check (char_length(name) between 2 and 120),
  total_semesters smallint not null default 6 check (total_semesters between 1 and 12),
  created_at    timestamptz not null default now(),
  unique (department_id, code)
);

create table public.subjects (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses(id) on delete restrict,
  code       text not null check (code ~ '^[A-Za-z0-9._-]{1,20}$'),
  name       text not null check (char_length(name) between 2 and 150),
  semester   smallint not null check (semester between 1 and 12),
  created_at timestamptz not null default now(),
  unique (course_id, code)
);

create table public.sections (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses(id) on delete restrict,
  semester   smallint not null check (semester between 1 and 12),
  name       text not null check (char_length(name) between 1 and 20),
  created_at timestamptz not null default now(),
  unique (course_id, semester, name)
);

-- ---------- PEOPLE ---------------------------------------------------
-- users = login + role (id is the same as auth.users)
create table public.users (
  id                   uuid primary key references auth.users(id) on delete cascade,
  email                text not null unique,
  role                 public.user_role not null,
  full_name            text not null check (char_length(full_name) between 2 and 120),
  is_active            boolean not null default true,
  must_change_password boolean not null default false,
  created_at           timestamptz not null default now()
);

create table public.students (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references public.users(id) on delete cascade,
  univ_roll_no text not null unique check (univ_roll_no ~ '^[A-Za-z0-9]{4,20}$'),
  name         text not null check (char_length(name) between 2 and 120),
  course_id    uuid not null references public.courses(id) on delete restrict,
  semester     smallint not null check (semester between 1 and 12),
  phone        text check (phone is null or phone ~ '^[0-9+ -]{7,15}$'),
  created_at   timestamptz not null default now()
);
create index students_course_idx on public.students(course_id);

-- the teachers table also holds HODs (users.role = 'hod'); scope comes from the department
create table public.teachers (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references public.users(id) on delete cascade,
  name          text not null check (char_length(name) between 2 and 120),
  department_id uuid not null references public.departments(id) on delete restrict,
  created_at    timestamptz not null default now()
);
create index teachers_department_idx on public.teachers(department_id);

-- the most important table: which section each student is in for each semester
create table public.student_sections (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  section_id  uuid not null references public.sections(id) on delete cascade,
  semester    smallint not null check (semester between 1 and 12),
  assigned_by uuid references public.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  unique (student_id, semester)
);
create index student_sections_section_idx on public.student_sections(section_id);

create table public.teacher_subjects (
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  primary key (teacher_id, subject_id)
);
create index teacher_subjects_subject_idx on public.teacher_subjects(subject_id);

-- ---------- UPLOAD ENGINE LOG ----------------------------------------
create table public.upload_logs (
  id            uuid primary key default gen_random_uuid(),
  type          public.upload_type not null,
  uploaded_by   uuid not null references public.users(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  file_name     text not null,
  status        public.upload_status not null default 'previewed',
  rows_total    integer not null default 0,
  rows_ok       integer not null default 0,
  rows_failed   integer not null default 0,
  meta          jsonb not null default '{}'::jsonb,   -- selected subject / exam / date range etc.
  payload       jsonb,                                 -- validated rows (after preview, until confirm)
  errors        jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  confirmed_at  timestamptz
);
create index upload_logs_user_idx on public.upload_logs(uploaded_by, created_at desc);
create index upload_logs_dept_idx on public.upload_logs(department_id, created_at desc);

-- ---------- ATTENDANCE -----------------------------------------------
-- attendance is linked to the student's roll number, not the section.
create table public.attendance (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  subject_id  uuid not null references public.subjects(id) on delete cascade,
  date        date not null,
  status      public.attendance_status not null,
  uploaded_by uuid references public.users(id) on delete set null,
  upload_id   uuid references public.upload_logs(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (student_id, subject_id, date)            -- prevent duplicate entries
);
create index attendance_subject_date_idx on public.attendance(subject_id, date);

-- subject-wise attendance % (works with RLS: security_invoker)
create view public.attendance_summary with (security_invoker = true) as
select
  a.student_id,
  a.subject_id,
  count(*)::int                                          as total,
  count(*) filter (where a.status = 'present')::int      as present,
  round(100.0 * count(*) filter (where a.status = 'present') / count(*), 2) as percentage
from public.attendance a
group by a.student_id, a.subject_id;

-- ---------- SESSIONAL MARKS ------------------------------------------
create table public.marks (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  subject_id   uuid not null references public.subjects(id) on delete cascade,
  exam_type    public.exam_type not null,
  marks        numeric(6,2) not null check (marks >= 0),
  max_marks    numeric(6,2) not null check (max_marks > 0),
  is_published boolean not null default false,
  published_at timestamptz,
  published_by uuid references public.users(id) on delete set null,
  uploaded_by  uuid references public.users(id) on delete set null,
  updated_by   uuid references public.users(id) on delete set null,
  upload_id    uuid references public.upload_logs(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (student_id, subject_id, exam_type),
  check (marks <= max_marks)
);
create index marks_subject_idx on public.marks(subject_id, exam_type);
create trigger marks_updated_at before update on public.marks
  for each row execute function public.set_updated_at();

-- for the HOD's Marks Management page: batch summary by subject + exam
create view public.marks_batches with (security_invoker = true) as
select
  m.subject_id,
  m.exam_type,
  count(*)::int                                  as total,
  count(*) filter (where m.is_published)::int    as published,
  max(m.updated_at)                              as last_updated
from public.marks m
group by m.subject_id, m.exam_type;

create table public.marks_history (
  id         uuid primary key default gen_random_uuid(),
  marks_id   uuid not null references public.marks(id) on delete cascade,
  old_value  numeric(6,2) not null,
  old_max    numeric(6,2) not null,
  new_value  numeric(6,2) not null,
  new_max    numeric(6,2) not null,
  changed_by uuid references public.users(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index marks_history_marks_idx on public.marks_history(marks_id, changed_at desc);

-- the old version is saved automatically as soon as marks change
create or replace function public.log_marks_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (old.marks is distinct from new.marks) or (old.max_marks is distinct from new.max_marks) then
    insert into public.marks_history (marks_id, old_value, old_max, new_value, new_max, changed_by)
    values (old.id, old.marks, old.max_marks, new.marks, new.max_marks, new.updated_by);
  end if;
  return new;
end $$;
create trigger marks_history_trg after update on public.marks
  for each row execute function public.log_marks_change();

-- correction after publishing: a teacher requests it, the HOD approves it
create table public.marks_corrections (
  id           uuid primary key default gen_random_uuid(),
  marks_id     uuid not null references public.marks(id) on delete cascade,
  requested_by uuid not null references public.users(id) on delete cascade,
  new_marks    numeric(6,2) not null check (new_marks >= 0),
  reason       text not null check (char_length(reason) between 5 and 500),
  status       public.correction_status not null default 'pending',
  decided_by   uuid references public.users(id) on delete set null,
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index marks_corrections_status_idx on public.marks_corrections(status, created_at desc);
create unique index marks_corrections_one_pending on public.marks_corrections(marks_id) where status = 'pending';

-- ---------- NOC ------------------------------------------------------
create table public.noc_settings (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid not null unique references public.departments(id) on delete cascade,
  open_date     date,
  close_date    date,
  required_docs text[] not null default array['offer_letter','college_id']::text[],
  updated_by    uuid references public.users(id) on delete set null,
  updated_at    timestamptz not null default now(),
  check (open_date is null or close_date is null or open_date <= close_date)
);

create table public.noc_requests (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.students(id) on delete cascade,
  department_id   uuid not null references public.departments(id) on delete restrict,
  status          public.noc_status not null default 'draft',
  risk_level      public.risk_level,
  red_flags       jsonb not null default '[]'::jsonb,
  company_name    text not null check (char_length(company_name) between 2 and 150),
  company_email   text not null check (company_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  company_website text,
  position        text not null check (char_length(position) between 2 and 120),
  start_date      date not null,
  end_date        date not null,
  purpose         text not null check (char_length(purpose) between 10 and 600),
  remark          text,
  decided_by      uuid references public.users(id) on delete set null,
  decided_at      timestamptz,
  submitted_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (start_date <= end_date)
);
create index noc_requests_dept_idx on public.noc_requests(department_id, status, created_at desc);
-- a student can have only one active request (they can apply again after rejection)
create unique index noc_one_active_per_student on public.noc_requests(student_id)
  where status in ('draft', 'applied', 'under_review', 'approved');
create trigger noc_requests_updated_at before update on public.noc_requests
  for each row execute function public.set_updated_at();

create table public.noc_documents (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references public.noc_requests(id) on delete cascade,
  doc_type      text not null check (doc_type ~ '^[a-z_]{2,40}$'),
  file_path     text not null,
  original_name text not null,
  mime_type     text not null,
  size_bytes    integer not null check (size_bytes > 0),
  sha256        text not null,
  check_result  jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  unique (request_id, doc_type)
);
create index noc_documents_sha_idx on public.noc_documents(sha256);

-- ---------- NOTIFICATIONS / AUDIT / LOGIN THROTTLE -------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  title      text not null,
  message    text not null,
  link       text,
  dedupe_key text,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, is_read, created_at desc);
create unique index notifications_dedupe on public.notifications(user_id, dedupe_key) where dedupe_key is not null;

create table public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.users(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  action        text not null,
  entity        text,
  entity_id     text,
  details       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs(created_at desc);
create index audit_logs_dept_idx on public.audit_logs(department_id, created_at desc);
create index audit_logs_user_idx on public.audit_logs(user_id, created_at desc);

-- to guard against brute force (only the server reads/writes this)
create table public.login_attempts (
  id         bigint generated always as identity primary key,
  identifier text not null,
  ip         text,
  created_at timestamptz not null default now()
);
create index login_attempts_idx on public.login_attempts(identifier, created_at desc);

-- =====================================================================
--  ROW LEVEL SECURITY
-- =====================================================================

-- helper functions (security definer => no recursion inside RLS)
create or replace function public.app_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid() and is_active
$$;

create or replace function public.app_department_id()
returns uuid language sql stable security definer set search_path = public as $$
  select t.department_id from public.teachers t
  join public.users u on u.id = t.user_id
  where t.user_id = auth.uid() and u.is_active
$$;

create or replace function public.app_student_id()
returns uuid language sql stable security definer set search_path = public as $$
  select s.id from public.students s
  join public.users u on u.id = s.user_id
  where s.user_id = auth.uid() and u.is_active
$$;

create or replace function public.student_in_my_dept(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.students s
    join public.courses c on c.id = s.course_id
    where s.id = sid and c.department_id = public.app_department_id()
  )
$$;

create or replace function public.subject_in_my_dept(subj uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subjects sb
    join public.courses c on c.id = sb.course_id
    where sb.id = subj and c.department_id = public.app_department_id()
  )
$$;

create or replace function public.teaches_subject(subj uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.teacher_subjects ts
    join public.teachers t on t.id = ts.teacher_id
    where t.user_id = auth.uid() and ts.subject_id = subj
  )
$$;

revoke all on function public.app_role(), public.app_department_id(), public.app_student_id(),
  public.student_in_my_dept(uuid), public.subject_in_my_dept(uuid), public.teaches_subject(uuid)
  from public, anon;
grant execute on function public.app_role(), public.app_department_id(), public.app_student_id(),
  public.student_in_my_dept(uuid), public.subject_in_my_dept(uuid), public.teaches_subject(uuid)
  to authenticated, service_role;

-- table privileges: anon = nothing, authenticated = SELECT only
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on
  public.institutes, public.departments, public.courses, public.subjects, public.sections,
  public.users, public.students, public.teachers, public.student_sections, public.teacher_subjects,
  public.attendance, public.attendance_summary, public.marks, public.marks_batches, public.marks_history,
  public.marks_corrections, public.noc_settings, public.noc_requests, public.noc_documents,
  public.upload_logs, public.notifications, public.audit_logs
  to authenticated;
grant update (is_read) on public.notifications to authenticated;   -- mark your own notification as "read"
-- no grant on login_attempts for authenticated/anon (only service_role)

alter table public.institutes        enable row level security;
alter table public.departments       enable row level security;
alter table public.courses           enable row level security;
alter table public.subjects          enable row level security;
alter table public.sections          enable row level security;
alter table public.users             enable row level security;
alter table public.students          enable row level security;
alter table public.teachers          enable row level security;
alter table public.student_sections  enable row level security;
alter table public.teacher_subjects  enable row level security;
alter table public.upload_logs       enable row level security;
alter table public.attendance        enable row level security;
alter table public.marks             enable row level security;
alter table public.marks_history     enable row level security;
alter table public.marks_corrections enable row level security;
alter table public.noc_settings      enable row level security;
alter table public.noc_requests      enable row level security;
alter table public.noc_documents     enable row level security;
alter table public.notifications     enable row level security;
alter table public.audit_logs        enable row level security;
alter table public.login_attempts    enable row level security;   -- no policy => service_role only

-- reference data: any signed-in user can view these
create policy institutes_read  on public.institutes  for select to authenticated using (true);
create policy departments_read on public.departments for select to authenticated using (true);
create policy courses_read     on public.courses     for select to authenticated using (true);
create policy subjects_read    on public.subjects    for select to authenticated using (true);
create policy sections_read    on public.sections    for select to authenticated using (true);
create policy noc_settings_read on public.noc_settings for select to authenticated using (true);

create policy users_read on public.users for select to authenticated
  using (id = auth.uid() or public.app_role() = 'admin');

create policy students_read on public.students for select to authenticated
  using (
    user_id = auth.uid()
    or public.app_role() = 'admin'
    or (public.app_role() in ('hod', 'teacher') and public.student_in_my_dept(id))
  );

create policy teachers_read on public.teachers for select to authenticated
  using (
    user_id = auth.uid()
    or public.app_role() = 'admin'
    or department_id = public.app_department_id()
  );

create policy student_sections_read on public.student_sections for select to authenticated
  using (
    student_id = public.app_student_id()
    or public.app_role() = 'admin'
    or (public.app_role() in ('hod', 'teacher') and public.student_in_my_dept(student_id))
  );

create policy teacher_subjects_read on public.teacher_subjects for select to authenticated
  using (
    public.app_role() = 'admin'
    or teacher_id in (select id from public.teachers where user_id = auth.uid())
    or (public.app_role() = 'hod' and public.subject_in_my_dept(subject_id))
  );

create policy attendance_read on public.attendance for select to authenticated
  using (
    student_id = public.app_student_id()
    or public.app_role() = 'admin'
    or (public.app_role() = 'hod' and public.student_in_my_dept(student_id))
    or (public.app_role() = 'teacher' and public.teaches_subject(subject_id))
  );

-- students see marks only after they are PUBLISHED
create policy marks_read on public.marks for select to authenticated
  using (
    (student_id = public.app_student_id() and is_published)
    or public.app_role() = 'admin'
    or (public.app_role() = 'hod' and public.student_in_my_dept(student_id))
    or (public.app_role() = 'teacher' and public.teaches_subject(subject_id))
  );

create policy marks_history_read on public.marks_history for select to authenticated
  using (
    public.app_role() = 'admin'
    or (public.app_role() = 'hod' and exists (
          select 1 from public.marks m where m.id = marks_id and public.student_in_my_dept(m.student_id)))
  );

create policy marks_corrections_read on public.marks_corrections for select to authenticated
  using (
    requested_by = auth.uid()
    or public.app_role() = 'admin'
    or (public.app_role() = 'hod' and exists (
          select 1 from public.marks m where m.id = marks_id and public.student_in_my_dept(m.student_id)))
  );

create policy noc_requests_read on public.noc_requests for select to authenticated
  using (
    student_id = public.app_student_id()
    or (public.app_role() = 'hod' and department_id = public.app_department_id())
  );

create policy noc_documents_read on public.noc_documents for select to authenticated
  using (exists (select 1 from public.noc_requests r where r.id = request_id));  -- the RLS on noc_requests applies here as well

create policy upload_logs_read on public.upload_logs for select to authenticated
  using (
    uploaded_by = auth.uid()
    or public.app_role() = 'admin'
    or (public.app_role() = 'hod' and department_id = public.app_department_id())
  );

create policy notifications_read   on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy audit_logs_read on public.audit_logs for select to authenticated
  using (
    public.app_role() = 'admin'
    or (public.app_role() = 'hod' and department_id = public.app_department_id())
  );

-- =====================================================================
--  STORAGE: PRIVATE bucket for NOC documents
--  No storage policy => direct access from the browser is disabled.
--  Only the server uploads files, and the HOD/student gets a short-lived signed URL.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('noc-documents', 'noc-documents', false, 4194304,
        array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false, file_size_limit = 4194304,
      allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'];

-- =====================================================================
--  SEED: United Group institutes (from the college list on the login page)
--  Departments, courses and subjects are added from the Admin panel (/admin/academics).
-- =====================================================================
insert into public.institutes (name) values
  ('United College of Engineering and Research'),
  ('United College of Pharmacy'),
  ('United Institute of Management'),
  ('United Institute of Management (FUGS)'),
  ('United Institute of Pharmacy'),
  ('United Institute of Technology')
on conflict (name) do nothing;

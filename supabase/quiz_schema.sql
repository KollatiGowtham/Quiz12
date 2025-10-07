UPDATE users SET password = 'admin@12345' WHERE email = 'admin@example.com';UPDATE users SET password = 'admin@12345' WHERE email = 'admin@example.com';const bcrypt = require('bcrypt');
const hashedPassword = bcrypt.hashSync('admin@12345', 10);
// Use this hashedPassword to update the database-- Quiz schema setup for Supabase
-- Run this in Supabase Dashboard → SQL Editor on project nufkdbcckdikguvjfdzn

-- 1) Schema and extensions
create schema if not exists quiz;
create extension if not exists pgcrypto;

-- 2) Helper: admin check based on profiles.role
create or replace function quiz.is_admin() returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from quiz.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- 3) Tables (no institution column)
create table if not exists quiz.profiles (
  id uuid primary key,
  name text not null,
  email text not null unique,
  role text not null check (role in ('admin','student')),
  registered_at timestamptz not null default now(),
  age int,
  status text not null default 'active' check (status in ('active','inactive'))
);

create table if not exists quiz.sets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists quiz.questions (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references quiz.sets(id) on delete cascade,
  parent_id uuid references quiz.questions(id) on delete cascade,
  type text not null check (type in ('mcq','paragraph')),
  text text,
  paragraph text,
  justification text,
  media_kind text check (media_kind in ('image','audio','video')),
  media_url text,
  correct_index int
);

create table if not exists quiz.mcq_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references quiz.questions(id) on delete cascade,
  idx int not null,
  text text not null
);

create table if not exists quiz.assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  set_id uuid not null references quiz.sets(id) on delete cascade,
  time_limit_minutes int not null default 30,
  pass_percent int not null default 50,
  max_attempts int not null default 2,
  availability_start timestamptz,
  availability_end timestamptz
);

create table if not exists quiz.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  set_id uuid not null references quiz.sets(id) on delete cascade,
  timestamp timestamptz not null default now(),
  score int not null,
  percentage int not null,
  pass boolean not null,
  duration_seconds int not null default 0
);

create table if not exists quiz.attempt_answers (
  attempt_id uuid not null references quiz.attempts(id) on delete cascade,
  question_id uuid not null references quiz.questions(id) on delete cascade,
  chosen_index int,
  time_spent_seconds int,
  primary key (attempt_id, question_id)
);

create table if not exists quiz.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  set_id uuid not null references quiz.sets(id) on delete cascade,
  question_id uuid not null references quiz.questions(id) on delete cascade,
  timestamp timestamptz not null default now(),
  unique (user_id, question_id)
);

create table if not exists quiz.audit_logs (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamptz not null default now(),
  actor text,
  action text not null,
  details text
);

create table if not exists quiz.settings (
  id uuid primary key default gen_random_uuid(),
  default_time_limit_minutes int not null default 30,
  default_pass_percent int not null default 50,
  default_max_attempts int not null default 2
);

-- 4) Indexes
create index if not exists idx_questions_set on quiz.questions(set_id);
create index if not exists idx_mcq_options_question on quiz.mcq_options(question_id);
create index if not exists idx_assignments_user on quiz.assignments(user_id);
create index if not exists idx_assignments_set on quiz.assignments(set_id);
create index if not exists idx_attempts_user on quiz.attempts(user_id);
create index if not exists idx_attempts_set on quiz.attempts(set_id);
create index if not exists idx_bookmarks_user on quiz.bookmarks(user_id);

-- 5) Ensure institution column is removed (idempotent)
alter table quiz.profiles drop column if exists institution;

-- 6) RLS enable
alter table quiz.profiles enable row level security;
alter table quiz.sets enable row level security;
alter table quiz.questions enable row level security;
alter table quiz.mcq_options enable row level security;
alter table quiz.assignments enable row level security;
alter table quiz.attempts enable row level security;
alter table quiz.attempt_answers enable row level security;
alter table quiz.bookmarks enable row level security;
alter table quiz.audit_logs enable row level security;
alter table quiz.settings enable row level security;

-- 7) Policies (drop if exists for idempotency)
-- profiles
drop policy if exists profiles_insert_self on quiz.profiles;
create policy profiles_insert_self on quiz.profiles for insert
  with check (id = auth.uid());

drop policy if exists profiles_select_self_or_admin on quiz.profiles;
create policy profiles_select_self_or_admin on quiz.profiles for select
  using ((id = auth.uid()) or quiz.is_admin());

drop policy if exists profiles_update_self_or_admin on quiz.profiles;
create policy profiles_update_self_or_admin on quiz.profiles for update
  using ((id = auth.uid()) or quiz.is_admin())
  with check ((id = auth.uid()) or quiz.is_admin());

-- sets
drop policy if exists sets_select_assigned_or_admin on quiz.sets;
create policy sets_select_assigned_or_admin on quiz.sets for select
  using (
    quiz.is_admin() or exists (
      select 1 from quiz.assignments a
      where a.set_id = sets.id and a.user_id = auth.uid()
    )
  );

drop policy if exists sets_modify_admin on quiz.sets;
create policy sets_modify_admin on quiz.sets for all
  using (quiz.is_admin()) with check (quiz.is_admin());

-- questions
drop policy if exists questions_select_assigned_or_admin on quiz.questions;
create policy questions_select_assigned_or_admin on quiz.questions for select
  using (
    quiz.is_admin() or exists (
      select 1 from quiz.assignments a
      where a.set_id = questions.set_id and a.user_id = auth.uid()
    )
  );

drop policy if exists questions_modify_admin on quiz.questions;
create policy questions_modify_admin on quiz.questions for all
  using (quiz.is_admin()) with check (quiz.is_admin());

-- mcq_options
drop policy if exists mcq_options_select_assigned_or_admin on quiz.mcq_options;
create policy mcq_options_select_assigned_or_admin on quiz.mcq_options for select
  using (
    quiz.is_admin() or exists (
      select 1 from quiz.questions q
      join quiz.assignments a on a.set_id = q.set_id
      where q.id = mcq_options.question_id and a.user_id = auth.uid()
    )
  );

drop policy if exists mcq_options_modify_admin on quiz.mcq_options;
create policy mcq_options_modify_admin on quiz.mcq_options for all
  using (quiz.is_admin()) with check (quiz.is_admin());

-- assignments
drop policy if exists assignments_select_self_or_admin on quiz.assignments;
create policy assignments_select_self_or_admin on quiz.assignments for select
  using ((user_id = auth.uid()) or quiz.is_admin());

drop policy if exists assignments_modify_admin on quiz.assignments;
create policy assignments_modify_admin on quiz.assignments for all
  using (quiz.is_admin()) with check (quiz.is_admin());

-- attempts
drop policy if exists attempts_insert_self on quiz.attempts;
create policy attempts_insert_self on quiz.attempts for insert
  with check (user_id = auth.uid());

drop policy if exists attempts_select_self_or_admin on quiz.attempts;
create policy attempts_select_self_or_admin on quiz.attempts for select
  using ((user_id = auth.uid()) or quiz.is_admin());

drop policy if exists attempts_update_admin on quiz.attempts;
create policy attempts_update_admin on quiz.attempts for update
  using (quiz.is_admin()) with check (quiz.is_admin());

-- attempt_answers
drop policy if exists attempt_answers_insert_self on quiz.attempt_answers;
create policy attempt_answers_insert_self on quiz.attempt_answers for insert
  with check (exists (
    select 1 from quiz.attempts t
    where t.id = attempt_answers.attempt_id and t.user_id = auth.uid()
  ));

drop policy if exists attempt_answers_select_self_or_admin on quiz.attempt_answers;
create policy attempt_answers_select_self_or_admin on quiz.attempt_answers for select
  using (exists (
    select 1 from quiz.attempts t
    where t.id = attempt_answers.attempt_id and (t.user_id = auth.uid() or quiz.is_admin())
  ));

drop policy if exists attempt_answers_update_admin on quiz.attempt_answers;
create policy attempt_answers_update_admin on quiz.attempt_answers for update
  using (quiz.is_admin()) with check (quiz.is_admin());

-- bookmarks
drop policy if exists bookmarks_select_self on quiz.bookmarks;
create policy bookmarks_select_self on quiz.bookmarks for select
  using (user_id = auth.uid());

drop policy if exists bookmarks_write_self on quiz.bookmarks;
create policy bookmarks_write_self on quiz.bookmarks for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- audit_logs
drop policy if exists audit_logs_insert_any_auth on quiz.audit_logs;
create policy audit_logs_insert_any_auth on quiz.audit_logs for insert
  with check (true);

drop policy if exists audit_logs_select_admin on quiz.audit_logs;
create policy audit_logs_select_admin on quiz.audit_logs for select
  using (quiz.is_admin());

-- settings
drop policy if exists settings_select_all_auth on quiz.settings;
create policy settings_select_all_auth on quiz.settings for select
  using (true);

drop policy if exists settings_update_admin on quiz.settings;
create policy settings_update_admin on quiz.settings for update
  using (quiz.is_admin()) with check (quiz.is_admin());

-- 8) Grants (RLS still applies)
grant usage on schema quiz to anon, authenticated;
grant select, insert, update, delete on all tables in schema quiz to anon, authenticated;

-- 9) Optional: seed a settings row if none exists
insert into quiz.settings(id) select gen_random_uuid() where not exists (select 1 from quiz.settings);


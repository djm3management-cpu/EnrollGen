-- ============================================
-- SESSION TRACKING TABLES
-- ============================================

create table public.enrolled_agents (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text unique not null,
  name text not null,
  npn text,
  licensed_states text[] default '{}',
  role text default 'agent' check (role in ('agent', 'principal')),
  is_active boolean default true,
  created_at timestamptz default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.enrolled_agents(id) not null,
  flow text not null check (flow in ('ma', 'medsup', 'aca', 'u65')),
  started_at timestamptz default now(),
  ended_at timestamptz,
  final_section smallint,
  completed boolean default false,
  duration_seconds integer,
  created_at timestamptz default now()
);

create table public.compliance_flags (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions(id) not null,
  section_label text not null,
  level text not null check (level in ('remind', 'warn', 'critical')),
  issue_tag text,
  confidence smallint,
  message text,
  addressed boolean default false,
  created_at timestamptz default now()
);

create table public.section_scores (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions(id) not null,
  section_number real not null,
  section_label text not null,
  completed boolean default false,
  duration_seconds integer,
  checklist_total smallint,
  checklist_done smallint,
  created_at timestamptz default now()
);

-- Indexes
create index idx_sessions_agent on public.sessions(agent_id);
create index idx_sessions_started on public.sessions(started_at desc);
create index idx_compliance_flags_session on public.compliance_flags(session_id);
create index idx_section_scores_session on public.section_scores(session_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
alter table public.enrolled_agents enable row level security;
alter table public.sessions enable row level security;
alter table public.compliance_flags enable row level security;
alter table public.section_scores enable row level security;

-- Agents see only their own row
create policy "agents_own" on public.enrolled_agents
  for all using (clerk_user_id = auth.jwt()->>'sub');

-- Principals see all agents
create policy "principal_all_agents" on public.enrolled_agents
  for select using (
    exists (
      select 1 from public.enrolled_agents
      where clerk_user_id = auth.jwt()->>'sub' and role = 'principal'
    )
  );

-- Sessions: agents see own, principals see all
create policy "sessions_own" on public.sessions
  for all using (
    agent_id in (
      select id from public.enrolled_agents
      where clerk_user_id = auth.jwt()->>'sub'
    )
  );

create policy "sessions_principal" on public.sessions
  for select using (
    exists (
      select 1 from public.enrolled_agents
      where clerk_user_id = auth.jwt()->>'sub' and role = 'principal'
    )
  );

-- Compliance flags & section scores: same pattern
create policy "flags_own" on public.compliance_flags
  for all using (
    session_id in (
      select s.id from public.sessions s
      join public.enrolled_agents a on a.id = s.agent_id
      where a.clerk_user_id = auth.jwt()->>'sub'
    )
  );

create policy "flags_principal" on public.compliance_flags
  for select using (
    exists (
      select 1 from public.enrolled_agents
      where clerk_user_id = auth.jwt()->>'sub' and role = 'principal'
    )
  );

create policy "scores_own" on public.section_scores
  for all using (
    session_id in (
      select s.id from public.sessions s
      join public.enrolled_agents a on a.id = s.agent_id
      where a.clerk_user_id = auth.jwt()->>'sub'
    )
  );

create policy "scores_principal" on public.section_scores
  for select using (
    exists (
      select 1 from public.enrolled_agents
      where clerk_user_id = auth.jwt()->>'sub' and role = 'principal'
    )
  );

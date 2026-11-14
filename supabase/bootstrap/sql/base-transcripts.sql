
-- ============================================
-- ENROLLGEN CALL TRANSCRIPT KNOWLEDGE BASE
-- ============================================

-- Enable pgvector extension
create extension if not exists vector;

-- ============================================
-- AGENTS TABLE
-- ============================================
create table public.agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique,
  agency text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ============================================
-- CALL TRANSCRIPTS (parent record per call)
-- ============================================
create table public.call_transcripts (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.agents(id),

  -- Call metadata
  call_date timestamptz not null,
  duration_seconds integer,
  direction text check (direction in ('inbound', 'outbound')),

  -- Product / enrollment context
  product_line text not null check (product_line in ('MA', 'MedSup', 'ACA', 'Ancillary')),
  carrier text,                          -- e.g. 'UHC', 'Aetna', 'AmeriHealth'
  plan_name text,                        -- e.g. 'AARP Medicare Advantage (HMO)'
  enrollment_period text check (enrollment_period in ('AEP', 'OEP', 'SEP', 'IEP', 'OE')),

  -- Outcome
  disposition text check (disposition in (
    'enrolled', 'not_enrolled', 'callback', 'transferred', 'dropped', 'complaint'
  )),
  compliance_passed boolean,             -- from Conversely QA score

  -- Full transcript (raw text)
  transcript_text text not null,

  -- Source reference
  source_system text default 'conversely', -- 'conversely', 'manual', 'ringba'
  source_id text,                          -- external ID from source system
  recording_url text,                      -- link to original recording if available

  -- PHI flag — transcripts should be scrubbed before insert
  phi_scrubbed boolean default false,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================
-- TRANSCRIPT CHUNKS (searchable segments)
-- ============================================
-- Each call is split into chunks for semantic search.
-- Chunk size target: ~300-500 tokens with ~50 token overlap.
create table public.transcript_chunks (
  id uuid primary key default gen_random_uuid(),
  transcript_id uuid references public.call_transcripts(id) on delete cascade,

  -- Chunk content
  chunk_index integer not null,          -- ordering within the transcript
  chunk_text text not null,
  speaker text,                          -- 'agent' or 'beneficiary' if diarized

  -- Topic tags (set during ingestion or post-processing)
  topics text[] default '{}',            -- e.g. {'scope_of_appointment', 'plan_benefits', 'objection_handling'}

  -- Vector embedding (OpenAI text-embedding-3-small = 1536 dims)
  embedding vector(1536),

  created_at timestamptz default now()
);

-- ============================================
-- INDEXES
-- ============================================

-- Vector similarity search (IVFFlat — good for <1M rows; switch to HNSW at scale)
create index idx_chunks_embedding on public.transcript_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Metadata filters (copilot will filter + vector search together)
create index idx_transcripts_product on public.call_transcripts(product_line);
create index idx_transcripts_carrier on public.call_transcripts(carrier);
create index idx_transcripts_disposition on public.call_transcripts(disposition);
create index idx_transcripts_date on public.call_transcripts(call_date desc);
create index idx_chunks_transcript on public.transcript_chunks(transcript_id);
create index idx_chunks_topics on public.transcript_chunks using gin(topics);

-- ============================================
-- RLS POLICIES
-- ============================================
alter table public.agents enable row level security;
alter table public.call_transcripts enable row level security;
alter table public.transcript_chunks enable row level security;

-- Service role (ingestion pipeline) gets full access
-- Authenticated users (agents) see only their own agency's calls
create policy "Agents see own agency calls"
  on public.call_transcripts for select
  using (
    agent_id in (
      select id from public.agents
      where agency = (
        select agency from public.agents
        where email = auth.jwt() ->> 'email'
      )
    )
  );

create policy "Chunks follow transcript access"
  on public.transcript_chunks for select
  using (
    transcript_id in (
      select id from public.call_transcripts  -- inherits from parent policy
    )
  );

-- ============================================
-- SEMANTIC SEARCH FUNCTION
-- ============================================
-- This is what EnrollGen's copilot calls.
create or replace function search_transcript_chunks(
  query_embedding vector(1536),
  match_count int default 5,
  filter_product_line text default null,
  filter_carrier text default null,
  filter_disposition text default null,
  filter_topics text[] default null,
  similarity_threshold float default 0.7
)
returns table (
  chunk_id uuid,
  transcript_id uuid,
  chunk_text text,
  speaker text,
  topics text[],
  similarity float,
  -- joined metadata from parent
  agent_name text,
  call_date timestamptz,
  product_line text,
  carrier text,
  disposition text,
  compliance_passed boolean
)
language plpgsql
as $$
begin
  return query
  select
    tc.id as chunk_id,
    tc.transcript_id,
    tc.chunk_text,
    tc.speaker,
    tc.topics,
    1 - (tc.embedding <=> query_embedding) as similarity,
    a.name as agent_name,
    ct.call_date,
    ct.product_line,
    ct.carrier,
    ct.disposition,
    ct.compliance_passed
  from public.transcript_chunks tc
  join public.call_transcripts ct on tc.transcript_id = ct.id
  join public.agents a on ct.agent_id = a.id
  where
    1 - (tc.embedding <=> query_embedding) > similarity_threshold
    and (filter_product_line is null or ct.product_line = filter_product_line)
    and (filter_carrier is null or ct.carrier = filter_carrier)
    and (filter_disposition is null or ct.disposition = filter_disposition)
    and (filter_topics is null or tc.topics && filter_topics) -- array overlap
    and ct.phi_scrubbed = true  -- safety: only return scrubbed transcripts
  order by tc.embedding <=> query_embedding
  limit match_count;
end;
$$;

CREATE FUNCTION public.search_transcript_chunks(query_embedding vector(1536),similarity_threshold double precision,match_count integer)
RETURNS TABLE(chunk_id uuid,transcript_id uuid,chunk_text text,speaker text,topics text[],similarity double precision,agent_name text,call_date timestamptz,product_line text,carrier text,disposition text,compliance_passed boolean)
LANGUAGE sql AS $$ SELECT * FROM public.search_transcript_chunks(query_embedding,match_count,NULL::text,NULL::text,NULL::text,NULL::text[],similarity_threshold) $$;

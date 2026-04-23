create table if not exists public.dsnp_eae_lookup (
  id bigint generated always as identity primary key,
  state text not null,
  county text not null,
  carrier text not null,
  plan_name text not null,
  contract_id text not null,
  plan_id text not null,
  integration_level text not null,
  eae_status boolean not null default false,
  affiliated_medicaid_mco text,
  created_at timestamptz not null default now()
);

create unique index if not exists dsnp_eae_lookup_unique_plan_idx
  on public.dsnp_eae_lookup (state, county, contract_id, plan_id);

create index if not exists dsnp_eae_lookup_state_county_idx
  on public.dsnp_eae_lookup (state, county);

create table if not exists public.csnp_carrier_verification (
  id bigint generated always as identity primary key,
  carrier text not null unique,
  carrier_name text not null,
  verification_method text not null,
  verification_timeline text not null,
  failed_verification_consequence text not null,
  qualifying_conditions text[] not null default '{}',
  reference_notes text,
  reference_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.snp_routing_rules (
  id bigint generated always as identity primary key,
  rule_key text not null unique,
  medicaid_status text not null,
  chronic_condition_bucket text not null,
  primary_route text not null,
  fallback_route text[] not null default '{}',
  status text not null,
  rule_summary text not null,
  disclosure_points text[] not null default '{}',
  sep_paths text[] not null default '{}',
  created_at timestamptz not null default now()
);

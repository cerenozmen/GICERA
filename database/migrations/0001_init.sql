-- GICERA - initial schema
-- Backend API iskeletinin ihtiyaç duyduğu minimum tablolar.
-- Open Beauty Facts toplu veri aktarımı (CSV/JSONL) ve tam CosIng
-- kısıtlı/yasaklı madde listesi ayrı bir migration'da genişletilecek.

create extension if not exists pgcrypto;

create table if not exists products (
  barcode text primary key,
  product_name text,
  brands text,
  ingredients_text text,
  image_url text,
  source text not null default 'obf_live' check (source in ('obf_bulk', 'obf_live', 'user')),
  clean_score integer check (clean_score between 0 and 100),
  clean_rating text check (clean_rating in ('clean', 'moderate', 'riskli')),
  pregnancy_safe boolean,
  flagged_ingredients jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists restricted_substances (
  id serial primary key,
  inci_name text not null unique,
  aliases text[] not null default '{}',
  restriction_type text not null check (restriction_type in ('banned', 'restricted', 'pregnancy_unsafe', 'controversial')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists user_contributions (
  id uuid primary key default gen_random_uuid(),
  barcode text not null,
  product_name text not null,
  brands text,
  ingredients_text text not null,
  contributor_email text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists user_contributions_barcode_idx on user_contributions (barcode);
create index if not exists user_contributions_status_idx on user_contributions (status);

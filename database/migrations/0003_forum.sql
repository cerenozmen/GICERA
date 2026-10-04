-- GICERA - topluluk (Tartışma) forumu
-- Hesap sistemi yok: her telefon sunucunun verdiği gizli bir cihaz kimliği (device_id) ve
-- seçtiği takma adla yazar. device_id yalnızca backend'de kullanılır, API yanıtlarında dönmez.

create extension if not exists pgcrypto;

create table if not exists forum_posts (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  author_name text not null check (char_length(author_name) between 2 and 30),
  title text not null check (char_length(title) between 3 and 120),
  body text not null check (char_length(body) between 3 and 4000),
  category text not null check (category in ('Cilt bakımı', 'İçerikler', 'Rutin', 'Ürün önerisi')),
  created_at timestamptz not null default now()
);

create index if not exists forum_posts_created_idx on forum_posts (created_at desc);
create index if not exists forum_posts_category_idx on forum_posts (category, created_at desc);

create table if not exists forum_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references forum_posts (id) on delete cascade,
  device_id text not null,
  author_name text not null check (char_length(author_name) between 2 and 30),
  text text not null check (char_length(text) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists forum_replies_post_idx on forum_replies (post_id, created_at desc);

create table if not exists forum_post_likes (
  post_id uuid not null references forum_posts (id) on delete cascade,
  device_id text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, device_id)
);

create table if not exists forum_reply_likes (
  reply_id uuid not null references forum_replies (id) on delete cascade,
  device_id text not null,
  created_at timestamptz not null default now(),
  primary key (reply_id, device_id)
);

create table if not exists forum_saved_posts (
  post_id uuid not null references forum_posts (id) on delete cascade,
  device_id text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, device_id)
);

create index if not exists forum_post_likes_device_idx on forum_post_likes (device_id);
create index if not exists forum_reply_likes_device_idx on forum_reply_likes (device_id);
create index if not exists forum_saved_posts_device_idx on forum_saved_posts (device_id);

-- Only the backend (service role, which bypasses RLS) touches these tables: with RLS on and no
-- policies, the public anon key can't read device ids or write around the API's checks.
alter table forum_posts enable row level security;
alter table forum_replies enable row level security;
alter table forum_post_likes enable row level security;
alter table forum_reply_likes enable row level security;
alter table forum_saved_posts enable row level security;

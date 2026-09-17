-- GICERA - CosIng entegrasyonu
-- restricted_substances tablosunu gerçek CosIng Annex verisiyle (II: yasaklı,
-- III: kısıtlı, IV/V/VI: renklendirici/koruyucu/UV filtresi - izinli ama
-- düzenlemeye tabi) doldurmaya hazırlar; ayrıca tam INCI/CAS referans
-- envanterini tutan cosing_ingredients tablosunu ekler.
-- Veri: backend/src/scripts/importCosing.ts ile yüklenir.

-- Aynı isim birden fazla Annex girişinde (farklı reference number'larla)
-- tekrar edebiliyor, bu yüzden inci_name artık tekil (unique) değil.
alter table restricted_substances drop constraint if exists restricted_substances_inci_name_key;

alter table restricted_substances add column if not exists annex text;
alter table restricted_substances add column if not exists category text;

create index if not exists restricted_substances_inci_name_idx on restricted_substances (lower(inci_name));
create index if not exists restricted_substances_aliases_gin_idx on restricted_substances using gin (aliases);

create table if not exists cosing_ingredients (
  id serial primary key,
  cosing_ref_no text,
  inci_name text not null,
  inn_name text,
  cas_no text,
  einecs_no text,
  description text,
  function text,
  updated_at timestamptz not null default now()
);

create index if not exists cosing_ingredients_inci_name_idx on cosing_ingredients (lower(inci_name));

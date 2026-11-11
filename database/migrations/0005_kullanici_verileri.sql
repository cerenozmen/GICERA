-- GICERA - hesaba bağlı kullanıcı verileri
-- Rutin adımları, rutindeki ürünler, kaçınılan içerikler, tarama geçmişi ve favoriler tek bir
-- JSON olarak hesapla birlikte saklanır; böylece telefon değişince ya da uygulama silinince kaybolmaz.
-- guncelleme_zamani, verinin telefonda en son değiştiği an (ms): iki telefon çakışınca yenisi kazanır.

create table if not exists kullanici_verileri (
  kullanici_id uuid primary key references auth.users (id) on delete cascade,
  veri jsonb not null,
  guncelleme_zamani bigint not null,
  olusturma_tarihi timestamptz not null default now()
);

-- Yalnızca backend (service role) erişir.
alter table kullanici_verileri enable row level security;

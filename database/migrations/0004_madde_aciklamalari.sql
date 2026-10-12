-- GICERA - içerik maddesi açıklamaları önbelleği
-- Bir madde ilk kez sorulduğunda açıklaması Groq'tan alınır ve buraya yazılır; sonraki her
-- istekte doğrudan buradan okunur. madde_adi normalize edilmiş addır (küçük harf, boşluklar
-- sadeleştirilmiş), bu yüzden "Sodyum Benzoat" ile "sodyum benzoat " aynı satıra düşer.

create table if not exists madde_aciklamalari (
  madde_adi text primary key check (char_length(madde_adi) between 1 and 100),
  aciklama text not null check (char_length(aciklama) between 1 and 2000),
  olusturma_tarihi timestamptz not null default now()
);

-- Yalnızca backend (service role) erişir.
alter table madde_aciklamalari enable row level security;

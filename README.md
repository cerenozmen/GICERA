# GICERA

Kullanıcıların ürün barkodu okutarak içerik/temizlik analizi yapabildiği, hamileler için avantajlı önerilerin de sunulduğu bir cilt bakım mobil uygulaması.

## Takım

- **Ceren** — `ceren` branch
- **Gizem** — `gizem` branch

## Teknoloji Yığını

| Katman | Teknoloji |
|---|---|
| Frontend | React |
| Backend | Node.js + TypeScript |
| Veritabanı | PostgreSQL (Supabase) |
| Sunucu / Altyapı | Supabase |

## Veri Kaynağı

- **Toplu veri**: [world.openbeautyfacts.org/data](https://world.openbeautyfacts.org/data) üzerinden indirilen CSV/JSONL dump'ı kendi veritabanımıza aktarılır (barkod → ürün eşlemesi).
- **Canlı sorgu**: Veritabanında bulunmayan ürünler için `https://world.openbeautyfacts.org/api/v2/product/{barkod}.json` endpoint'i kullanılır.
- **İçerik güvenliği / regülasyon**: [CosIng](https://ec.europa.eu/growth/tools-databases/cosing/) INCI isim listesi ve kısıtlı/yasaklı madde verisi, kendi "temiz ürün" skorlama kurallarımızın temelini oluşturur.
- **Eksik ürünler**: Veritabanında ve Open Beauty Facts'te bulunmayan ürünler için kullanıcı katkılı içerik girişi eklenir.

## Proje Yapısı

```
GICERA/
├── frontend/          # React mobil uygulama
├── backend/           # Node.js + TypeScript API
├── database/
│   └── migrations/    # Supabase/PostgreSQL migration dosyaları
└── docs/              # Mimari notlar, veri modeli, skorlama kuralları
```

## Branch Stratejisi

- `main` — kararlı, dağıtıma hazır kod. Doğrudan push yok, sadece PR ile merge.
- `ceren` — Ceren'in geliştirme branch'i.
- `gizem` — Gizem'in geliştirme branch'i.

Herkes kendi branch'inde çalışır, işini bitirince `main`'e Pull Request açar, karşı taraf review yapar ve merge edilir.

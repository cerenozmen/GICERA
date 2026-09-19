# GICERA

Kullanıcıların ürün barkodu okutarak içerik/temizlik analizi yapabildiği, hamileler için avantajlı önerilerin de sunulduğu bir cilt bakım mobil uygulaması.

## Takım

- **Ceren** — `ceren` branch
- **Gizem** — `gizem` branch

## Teknoloji Yığını

| Katman | Teknoloji |
|---|---|
| Frontend | React Native (CLI, Expo'suz) |
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
├── frontend/          # React Native CLI mobil uygulama (android/, ios/ dahil)
├── backend/           # Node.js + TypeScript API
├── database/
│   └── migrations/    # Supabase/PostgreSQL migration dosyaları
└── docs/              # Mimari notlar, veri modeli, skorlama kuralları
```

## Mobil Uygulamayı Çalıştırma (React Native CLI)

Gereksinimler: Node 22+, JDK 17, Android Studio (Android SDK + emülatör). iOS için macOS + Xcode + CocoaPods.

```bash
# 1) Backend (ayrı terminal)
cd backend && npm install && npm run dev

# 2) Mobil uygulama
cd frontend
npm install
npx react-native start          # Metro
npx react-native run-android    # başka bir terminalde (emülatör açık olmalı)
```

- Emülatör API'ye `10.0.2.2:4000` üzerinden ulaşır. Fiziksel cihazda [frontend/src/config.ts](frontend/src/config.ts) içindeki `DEVICE_HOST` değerine bilgisayarın yerel IP'sini yaz.
- Kamera: `react-native-vision-camera` (barkod tarama + içerik listesi fotoğrafı). Emülatörde sanal kamera kullanılabilir, gerçek test için cihaz önerilir.

## Branch Stratejisi

- `main` — kararlı, dağıtıma hazır kod. Doğrudan push yok, sadece PR ile merge.
- `ceren` — Ceren'in geliştirme branch'i.
- `gizem` — Gizem'in geliştirme branch'i.

Herkes kendi branch'inde çalışır, işini bitirince `main`'e Pull Request açar, karşı taraf review yapar ve merge edilir.

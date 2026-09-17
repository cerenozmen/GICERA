# GICERA Backend

Node.js + TypeScript API. Barkod ile ürün sorgusu, temiz ürün skorlaması ve kullanıcı katkısı uçları.

## Kurulum

```bash
cd backend
npm install
cp .env.example .env   # SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY değerlerini doldurun
```

Veritabanı şemasını Supabase projenize sırayla uygulayın: `database/migrations/0001_init.sql`, sonra `0002_cosing.sql`.

## Çalıştırma

```bash
npm run dev
```

## Veri yükleme script'leri

Sırayla çalıştırılmalı (her biri gerçek Supabase projenize yazar):

1. `npm run import:cosing` — CosIng Annex II-VI (yasaklı/kısıtlı/düzenlemeye tabi madde) ve tam INCI/CAS envanterini `restricted_substances` / `cosing_ingredients` tablolarına yükler. Tekrar çalıştırıldığında önceki CosIng verisini temizleyip yeniden yükler.
2. `npm run import:obf [-- --limit=1000] [-- --dry-run]` — Open Beauty Facts toplu JSONL dump'ını `products` tablosuna aktarır (barkod → ürün eşlemesi), her ürünü aktarım sırasında skorlar.
3. `npm run rescore [-- --dry-run]` — `restricted_substances` güncellendikten sonra (ör. CosIng verisini yeniledikten sonra) zaten içeri aktarılmış ürünleri yeni kurallarla yeniden skorlar.

## Uçlar

- `GET /health` — sağlık kontrolü.
- `GET /api/products/:barcode` — barkoda göre ürün arar: önce kendi veritabanı, ardından Open Beauty Facts canlı API (`/api/v2/product/{barcode}.json`). Bulunursa sonucu skorlayıp veritabanına cache'ler.
- `POST /api/contributions` — ürün hiçbir kaynakta bulunamadığında kullanıcı katkısı olarak gönderilir (`barcode`, `productName`, `ingredientsText`, opsiyonel `brands`/`contributorEmail`). `status: pending` olarak kaydedilir, onay akışı ayrı bir adımda eklenecek.

## Skorlama

`src/services/scoringService.ts`, sunucu başlarken `restricted_substances` tablosundan (gerçek CosIng Annex II-VI verisi + `src/data/restrictedIngredients.ts` içindeki, CosIng'in kapsamadığı gebelik-güvenliği eklentileri) yüklenen bir alias haritasına göre INCI eşleşmesi yapar ve 0-100 arası `cleanScore`, `clean`/`moderate`/`riskli` derecesi ve `pregnancySafe` bayrağı üretir.

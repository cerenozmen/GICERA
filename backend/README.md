# GICERA Backend

Node.js + TypeScript API. Barkod ile ürün sorgusu, temiz ürün skorlaması ve kullanıcı katkısı uçları.

## Kurulum

```bash
cd backend
npm install
cp .env.example .env   # SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY değerlerini doldurun
```

Veritabanı şemasını Supabase projenize uygulayın: `database/migrations/0001_init.sql`.

## Çalıştırma

```bash
npm run dev
```

## Uçlar

- `GET /health` — sağlık kontrolü.
- `GET /api/products/:barcode` — barkoda göre ürün arar: önce kendi veritabanı, ardından Open Beauty Facts canlı API (`/api/v2/product/{barcode}.json`). Bulunursa sonucu skorlayıp veritabanına cache'ler.
- `POST /api/contributions` — ürün hiçbir kaynakta bulunamadığında kullanıcı katkısı olarak gönderilir (`barcode`, `productName`, `ingredientsText`, opsiyonel `brands`/`contributorEmail`). `status: pending` olarak kaydedilir, onay akışı ayrı bir adımda eklenecek.

## Skorlama

`src/services/scoringService.ts`, `src/data/restrictedIngredients.ts` içindeki tohum (seed) listeye göre INCI eşleşmesi yapar ve 0-100 arası `cleanScore`, `clean`/`moderate`/`riskli` derecesi ve `pregnancySafe` bayrağı üretir. Bu liste CosIng'in tam kısıtlı/yasaklı madde veri setiyle değiştirilecek placeholder niteliğindedir.

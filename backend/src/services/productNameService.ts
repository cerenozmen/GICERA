import { env } from "../config/env";
import { nameFromReply } from "./productNameRules";

export class ProductNameUnavailableError extends Error {}

export interface ProductNameInput {
  productName?: string | null;
  brands?: string | null;
  ingredientsText?: string | null;
}

/**
 * A short Turkish name saying what the product is ("Splat Diş Macunu", "Niasinamidli Yüz Serumu"),
 * for scans whose own name is unreadable (Cyrillic …) or missing. Null when the model can't tell.
 */
export async function suggestProductName(input: ProductNameInput): Promise<string | null> {
  if (!env.groqApiKey) throw new ProductNameUnavailableError("GROQ_API_KEY is not set");
  const facts = [
    input.productName && `Ürün adı: ${input.productName}`,
    input.brands && `Marka: ${input.brands}`,
    input.ingredientsText && `İçerikler: ${input.ingredientsText.slice(0, 900)}`,
  ].filter(Boolean);

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.groqApiKey}` },
    body: JSON.stringify({
      model: env.groqModel,
      temperature: 0.2,
      max_tokens: 600,
      ...(env.groqModel.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
      messages: [
        {
          role: "system",
          content:
            "Kozmetik ve kişisel bakım ürünlerine kısa, anlaşılır Türkçe adlar veriyorsun. " +
            "Verilen bilgilerden ürünün ne olduğunu belirle (örn. diş macunu, yüz kremi, tonik, serum, şampuan, güneş kremi) " +
            "ve en fazla 5 kelimelik bir ad yaz: varsa marka + ürün türü, örn. \"Splat Diş Macunu\" ya da \"Niasinamidli Yüz Serumu\". " +
            "Yalnızca adı yaz; tırnak, açıklama veya nokta kullanma. Ürünün ne olduğunu çıkaramıyorsan yalnızca BILINMIYOR yaz.",
        },
        { role: "user", content: facts.join("\n") },
      ],
    }),
  });
  if (!response.ok) {
    console.error(`[name] Groq ${response.status}: ${(await response.text().catch(() => "")).slice(0, 300)}`);
    throw new ProductNameUnavailableError(`Groq responded ${response.status}`);
  }
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return nameFromReply(body.choices?.[0]?.message?.content);
}

import { env } from "../config/env";
import { supabase } from "../db/supabaseClient";
import { explanationFromReply, normalizeIngredientName, UNKNOWN_MARKER } from "./ingredientExplanationRules";

const TABLE = "madde_aciklamalari";

export class ExplanationUnavailableError extends Error {}

export interface IngredientExplanation {
  name: string;
  explanation: string;
  /** "db": explained before, read from the table; "groq": asked now and saved. */
  source: "db" | "groq";
}

// The same uncached name asked twice at once (e.g. two phones) goes to Groq only once.
const inFlight = new Map<string, Promise<IngredientExplanation | null>>();

/**
 * An ingredient's explanation: from our table when it was explained before (Groq isn't called),
 * otherwise from Groq, saved to the table for next time. Null when the model doesn't recognise the name.
 */
export async function explainIngredient(rawName: string): Promise<IngredientExplanation | null> {
  const name = normalizeIngredientName(rawName);

  const { data, error } = await supabase.from(TABLE).select("aciklama").eq("madde_adi", name).maybeSingle();
  if (error) throw error;
  if (data) return { name, explanation: data.aciklama as string, source: "db" };

  let pending = inFlight.get(name);
  if (!pending) {
    pending = askAndSave(name).finally(() => inFlight.delete(name));
    inFlight.set(name, pending);
  }
  return pending;
}

async function askAndSave(name: string): Promise<IngredientExplanation | null> {
  const explanation = explanationFromReply(await askGroq(name));
  if (!explanation) return null;
  // Another server instance may have saved it meanwhile: keep the first row.
  const { error } = await supabase
    .from(TABLE)
    .upsert({ madde_adi: name, aciklama: explanation }, { onConflict: "madde_adi", ignoreDuplicates: true });
  if (error) console.error(`[explain] could not save "${name}":`, error.message);
  return { name, explanation, source: "groq" };
}

async function askGroq(name: string): Promise<string | null> {
  if (!env.groqApiKey) throw new ExplanationUnavailableError("GROQ_API_KEY is not set");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.groqApiKey}` },
    body: JSON.stringify({
      model: env.groqModel,
      temperature: 0.2,
      // gpt-oss models think before answering: the thinking counts toward max_tokens, so keep it short.
      max_tokens: 800,
      ...(env.groqModel.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
      messages: [
        {
          role: "system",
          content:
            "Kozmetik ve gıda içerik listelerindeki maddeleri sade Türkçeyle açıklayan bir asistansın. " +
            "Verilen maddenin ne olduğunu ve ürünlerde ne amaçla kullanıldığını 2-3 cümleyle anlat; " +
            "bilinen önemli bir hassasiyet ya da kısıtlama varsa kısaca belirt. Tıbbi tavsiye verme, başlık veya liste kullanma. " +
            `Ad gerçek bir içerik maddesi değilse ya da tanımıyorsan yalnızca "${UNKNOWN_MARKER}" yaz.`,
        },
        { role: "user", content: name },
      ],
    }),
  });
  if (!response.ok) {
    console.error(`[explain] Groq ${response.status}: ${(await response.text().catch(() => "")).slice(0, 300)}`);
    throw new ExplanationUnavailableError(`Groq responded ${response.status}`);
  }
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return body.choices?.[0]?.message?.content ?? null;
}

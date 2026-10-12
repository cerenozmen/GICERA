import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  // Used for sign-in / sign-up calls; falls back to the service key so a missing value still works locally.
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? null,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? null,
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-opus-5",
  // Ingredient explanations (GET /api/ingredients/explanation) for names not yet in madde_aciklamalari.
  groqApiKey: process.env.GROQ_API_KEY ?? null,
  groqModel: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
  obfApiBaseUrl: process.env.OBF_API_BASE_URL ?? "https://world.openbeautyfacts.org/api/v2",
};

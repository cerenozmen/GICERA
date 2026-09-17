import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env";

// Service-role key: backend-only, never exposed to the frontend.
export const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

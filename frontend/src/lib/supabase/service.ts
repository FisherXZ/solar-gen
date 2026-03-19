import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client with service_role key.
 * Bypasses RLS — use only in API routes, never expose to browser.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

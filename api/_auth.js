import { createClient } from "@supabase/supabase-js";

let supabaseAdmin;
let supabasePublic;

export function getSupabaseAdmin() {
  if (!process.env.SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );
  }
  return supabaseAdmin;
}

function getSupabasePublic(token) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const publishableKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl) throw new Error("Missing SUPABASE_URL");
  if (!publishableKey) throw new Error("Missing VITE_SUPABASE_ANON_KEY");

  supabasePublic = createClient(
    supabaseUrl,
    publishableKey,
    {
      auth: { persistSession: false },
      global: {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      }
    }
  );
  return supabasePublic;
}

export async function getUserContext(request) {
  const authHeader = request.headers.authorization || request.headers.Authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    throw new Error("Missing Supabase access token");
  }

  const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? getSupabaseAdmin()
    : getSupabasePublic(token);

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    throw new Error("Invalid Supabase access token");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, subscription_status")
    .eq("id", userData.user.id)
    .single();

  return {
    id: userData.user.id,
    email: userData.user.email,
    stripe_customer_id: profile?.stripe_customer_id || null,
    subscription_status: profile?.subscription_status || "free"
  };
}

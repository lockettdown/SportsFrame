import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export async function getUserContext(request) {
  const authHeader = request.headers.authorization || request.headers.Authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    throw new Error("Missing Supabase access token");
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) {
    throw new Error("Invalid Supabase access token");
  }

  const { data: profile } = await supabaseAdmin
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

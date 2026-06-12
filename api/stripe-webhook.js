import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { STRIPE_API_VERSION, assertLiveStripeInProduction } from "./_stripe-config.js";

let supabaseAdmin;

function getSupabaseAdmin() {
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

function getSubscriptionPeriodEnd(subscription) {
  return subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;
}

export default async function handler(request, response) {
  const signature = request.headers["stripe-signature"];
  let stripe;
  let supabase;
  let event;

  try {
    const secretKey = assertLiveStripeInProduction();
    stripe = new Stripe(secretKey, {
      apiVersion: STRIPE_API_VERSION
    });
    supabase = getSupabaseAdmin();
    if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error("Missing STRIPE_WEBHOOK_SECRET");
    event = stripe.webhooks.constructEvent(request.rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    response.status(400).send(`Webhook Error: ${error.message}`);
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const update = {
      stripe_customer_id: session.customer,
      subscription_status: "active"
    };

    if (session.subscription) {
      const subscription = await stripe.subscriptions.retrieve(session.subscription);
      update.subscription_status = subscription.status;
      update.subscription_current_period_end = getSubscriptionPeriodEnd(subscription);
    }

    await supabase
      .from("profiles")
      .update(update)
      .eq("id", session.client_reference_id);
  }

  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscription = event.data.object;
    await supabase
      .from("profiles")
      .update({
        subscription_status: subscription.status,
        subscription_current_period_end: getSubscriptionPeriodEnd(subscription)
      })
      .eq("stripe_customer_id", subscription.customer);
  }

  response.status(200).json({ received: true });
}

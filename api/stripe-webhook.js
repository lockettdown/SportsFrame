import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-02-25.clover"
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export default async function handler(request, response) {
  const signature = request.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(request.rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    response.status(400).send(`Webhook Error: ${error.message}`);
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    await supabase
      .from("profiles")
      .update({
        stripe_customer_id: session.customer,
        subscription_status: "active"
      })
      .eq("id", session.client_reference_id);
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscription = event.data.object;
    await supabase
      .from("profiles")
      .update({
        subscription_status: subscription.status,
        subscription_current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
      })
      .eq("stripe_customer_id", subscription.customer);
  }

  response.status(200).json({ received: true });
}

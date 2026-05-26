import Stripe from "stripe";
import { getUserContext } from "./_auth.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-02-25.clover"
});

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const user = await getUserContext(request);
    const { plan = "monthly" } = request.body || {};
    const priceId = plan === "annual"
      ? process.env.STRIPE_PRO_ANNUAL_PRICE_ID
      : process.env.STRIPE_PRO_MONTHLY_PRICE_ID;

    if (!priceId) {
      response.status(500).json({ error: "Stripe price is not configured" });
      return;
    }

    const origin = request.headers.origin || process.env.APP_URL;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: user.stripe_customer_id || undefined,
      customer_email: user.stripe_customer_id ? undefined : user.email,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancelled`,
      allow_promotion_codes: true,
      subscription_data: {
        trial_period_days: 10,
        metadata: {
          user_id: user.id,
          plan
        }
      }
    });

    response.status(200).json({ url: session.url });
  } catch (error) {
    response.status(401).json({ error: error.message });
  }
}

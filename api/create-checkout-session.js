import Stripe from "stripe";
import { getUserContext } from "./_auth.js";
import { STRIPE_API_VERSION, assertLiveStripeInProduction, getStripeErrorStatus, getStripeProPriceId } from "./_stripe-config.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const secretKey = assertLiveStripeInProduction();
    const stripe = new Stripe(secretKey, {
      apiVersion: STRIPE_API_VERSION
    });
    const user = await getUserContext(request);
    const { plan = "monthly" } = request.body || {};
    const priceId = getStripeProPriceId(plan);

    const origin = request.headers.origin || process.env.APP_URL;
    const successUrl = new URL("/app.html?checkout=success", origin).toString();
    const cancelUrl = new URL("/app.html?checkout=cancelled", origin).toString();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: user.stripe_customer_id || undefined,
      customer_email: user.stripe_customer_id ? undefined : user.email,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
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
    response.status(getStripeErrorStatus(error)).json({ error: error.message });
  }
}

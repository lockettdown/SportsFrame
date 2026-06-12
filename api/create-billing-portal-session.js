import Stripe from "stripe";
import { getUserContext } from "./_auth.js";
import { STRIPE_API_VERSION, assertLiveStripeInProduction, getStripeErrorStatus } from "./_stripe-config.js";

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
    if (!user.stripe_customer_id) {
      response.status(400).json({ error: "No Stripe customer is linked to this account" });
      return;
    }

    const origin = request.headers.origin || process.env.APP_URL;
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: origin
    });

    response.status(200).json({ url: session.url });
  } catch (error) {
    response.status(getStripeErrorStatus(error)).json({ error: error.message });
  }
}

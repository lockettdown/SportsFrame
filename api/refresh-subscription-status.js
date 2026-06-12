import Stripe from "stripe";
import { getSupabaseAdmin, getUserContext } from "./_auth.js";
import { STRIPE_API_VERSION, assertLiveStripeInProduction, getStripeErrorStatus } from "./_stripe-config.js";

const statusPriority = {
  active: 3,
  trialing: 2,
  past_due: 1
};

function getSubscriptionPeriodEnd(subscription) {
  return subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;
}

function pickBestSubscription(subscriptions) {
  return subscriptions
    .filter((subscription) => statusPriority[subscription.status])
    .sort((a, b) => {
      const priorityDiff = statusPriority[b.status] - statusPriority[a.status];
      if (priorityDiff) return priorityDiff;
      return (b.current_period_end || 0) - (a.current_period_end || 0);
    })[0] || null;
}

async function listCustomerSubscriptions(stripe, customerId) {
  const { data } = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10
  });
  return data;
}

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
    const supabase = getSupabaseAdmin();
    const customerIds = new Set();

    if (user.stripe_customer_id) customerIds.add(user.stripe_customer_id);

    if (user.email) {
      const { data: customers } = await stripe.customers.list({
        email: user.email,
        limit: 10
      });
      customers.forEach((customer) => customerIds.add(customer.id));
    }

    const subscriptions = [];
    for (const customerId of customerIds) {
      try {
        const customerSubscriptions = await listCustomerSubscriptions(stripe, customerId);
        subscriptions.push(...customerSubscriptions);
      } catch (error) {
        console.warn("Could not list Stripe subscriptions for customer", customerId, error.message);
      }
    }

    const subscription = pickBestSubscription(subscriptions);
    if (!subscription) {
      response.status(200).json({
        subscription_status: user.subscription_status || "free",
        stripe_customer_id: user.stripe_customer_id || null
      });
      return;
    }

    const update = {
      stripe_customer_id: subscription.customer,
      subscription_status: subscription.status,
      subscription_current_period_end: getSubscriptionPeriodEnd(subscription)
    };

    const { error } = await supabase
      .from("profiles")
      .update(update)
      .eq("id", user.id);

    if (error) throw error;

    response.status(200).json(update);
  } catch (error) {
    response.status(getStripeErrorStatus(error)).json({ error: error.message });
  }
}

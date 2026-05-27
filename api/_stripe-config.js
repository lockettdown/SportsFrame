export function assertLiveStripeInProduction() {
  const secretKey = process.env.STRIPE_SECRET_KEY || "";
  if (!secretKey) {
    const error = new Error("Stripe secret key is not configured.");
    error.statusCode = 500;
    throw error;
  }

  if (process.env.VERCEL_ENV === "production" && secretKey.startsWith("sk_test_")) {
    const error = new Error("Production billing is configured with a Stripe test key. Set STRIPE_SECRET_KEY to a live key in Vercel.");
    error.statusCode = 500;
    throw error;
  }
}

export function getStripeErrorStatus(error, fallbackStatus = 401) {
  return Number.isInteger(error?.statusCode) ? error.statusCode : fallbackStatus;
}

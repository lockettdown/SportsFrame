export const STRIPE_API_VERSION = "2026-02-25.clover";

const liveStripePriceIds = {
  monthly: "price_1TbtVwRtfyNEg1V9pu04kMM4",
  annual: "price_1TbtVvRtfyNEg1V9BsMHmcUl"
};

function cleanEnvValue(value) {
  return String(value || "").trim();
}

export function assertLiveStripeInProduction() {
  const secretKey = cleanEnvValue(process.env.STRIPE_SECRET_KEY);
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

  return secretKey;
}

export function getStripeProPriceId(plan = "monthly") {
  const normalizedPlan = plan === "annual" ? "annual" : "monthly";
  const envName = normalizedPlan === "annual"
    ? "STRIPE_PRO_ANNUAL_PRICE_ID"
    : "STRIPE_PRO_MONTHLY_PRICE_ID";
  return cleanEnvValue(process.env[envName]) || liveStripePriceIds[normalizedPlan];
}

export function getStripeErrorStatus(error, fallbackStatus = 401) {
  return Number.isInteger(error?.statusCode) ? error.statusCode : fallbackStatus;
}

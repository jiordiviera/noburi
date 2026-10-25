const SUBSCRIPTION = new Set(["none", "oauth"]);
const API_KEY = new Set([
  "ANTHROPIC_API_KEY",
  "apiKeyHelper",
  "/login managed key",
  "user",
  "project",
  "org",
  "temporary",
]);

export type Billing = "subscription" | "api" | "mixed" | "unknown";

/** Whether a dollar figure means anything: subscription plans are not billed per token. */
export function billingOf(sources: readonly string[]): Billing {
  if (sources.length === 0 || sources.some((s) => !SUBSCRIPTION.has(s) && !API_KEY.has(s)))
    return "unknown";
  if (sources.every((s) => SUBSCRIPTION.has(s))) return "subscription";
  if (sources.every((s) => API_KEY.has(s))) return "api";
  return "mixed";
}

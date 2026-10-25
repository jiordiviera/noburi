import { describe, expect, it } from "vite-plus/test";
import { billingOf } from "./billing";

describe("billingOf", () => {
  it("treats Claude logins as a subscription, not a bill", () => {
    expect(billingOf(["none"])).toBe("subscription");
    expect(billingOf(["oauth", "none"])).toBe("subscription");
  });

  it("recognises API keys and mixed setups", () => {
    expect(billingOf(["ANTHROPIC_API_KEY"])).toBe("api");
    expect(billingOf(["none", "ANTHROPIC_API_KEY"])).toBe("mixed");
  });

  it("does not guess when the source is missing or unknown", () => {
    expect(billingOf([])).toBe("unknown");
    expect(billingOf(["unknown"])).toBe("unknown");
  });
});

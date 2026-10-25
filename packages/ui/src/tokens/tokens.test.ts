import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { color } from "./tokens.ts";

describe("tokens", () => {
  it("keeps tokens.css in sync with tokens.ts", () => {
    const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8").toLowerCase();
    for (const hex of Object.values(color)) {
      expect(css).toContain(hex.toLowerCase());
    }
  });
});

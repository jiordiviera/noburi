import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createRuntimeServer, listenLoopback } from "./server.ts";

let server: Server | undefined;
afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

async function start() {
  server = createRuntimeServer({ token: "secret-token", allowedOrigins: ["http://localhost:1420"] });
  const port = await listenLoopback(server);
  return `http://127.0.0.1:${port}`;
}

describe("runtime server", () => {
  it("rejects requests without the session token", async () => {
    const base = await start();
    expect((await fetch(`${base}/health`)).status).toBe(401);
    expect((await fetch(`${base}/health`, { headers: { authorization: "Bearer wrong-token!" } })).status).toBe(401);
  });

  it("serves health with the token", async () => {
    const base = await start();
    const res = await fetch(`${base}/health`, { headers: { authorization: "Bearer secret-token" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: "0.1.0" });
  });

  it("rejects foreign origins", async () => {
    const base = await start();
    const res = await fetch(`${base}/health`, { headers: { authorization: "Bearer secret-token", origin: "https://evil.example" } });
    expect(res.status).toBe(403);
  });
});

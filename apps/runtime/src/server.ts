import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { json, type ApiHandler } from "./api.ts";

export interface RuntimeServerOptions {
  /** Ephemeral secret shared with the desktop shell at launch. */
  token: string;
  /** Origins allowed to call the API (the desktop webview, the Vite dev server). */
  allowedOrigins: readonly string[];
  /** Application routes, behind the origin and token checks. */
  api?: ApiHandler;
}

function tokenMatches(header: string | undefined, token: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function createRuntimeServer(options: RuntimeServerOptions): Server {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin;
    if (origin !== undefined && !options.allowedOrigins.includes(origin)) {
      return json(res, 403, { error: "origin not allowed" });
    }
    if (origin !== undefined) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("vary", "origin");
    }
    if (req.method === "OPTIONS") {
      res.setHeader("access-control-allow-headers", "authorization, content-type");
      res.setHeader("access-control-allow-methods", "GET, POST");
      res.writeHead(204);
      return res.end();
    }
    if (!tokenMatches(req.headers.authorization, options.token)) {
      return json(res, 401, { error: "unauthorized" });
    }
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, { ok: true, version: "0.1.0" });
    }
    if (options.api && (await options.api(req, res, url))) return;
    return json(res, 404, { error: "not found" });
  });
}

/** Binds to loopback only; never reachable from the LAN by default. */
export function listenLoopback(server: Server, port = 0): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") return reject(new Error("no address"));
      resolve(address.port);
    });
  });
}

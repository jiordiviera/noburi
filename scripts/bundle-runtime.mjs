// Builds what the packaged desktop app needs to run the runtime without the workspace:
//   apps/desktop/src-tauri/runtime/runtime.mjs   the runtime and its dependencies, bundled by esbuild
//   apps/desktop/src-tauri/runtime/node          an official Node.js binary, checksum-verified
//   apps/desktop/src-tauri/runtime/NODE_LICENSE  Node.js licence, shipped with the binary
// Claude Code itself is not bundled: the packaged app uses the user's installed `claude` CLI.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "apps/desktop/src-tauri/runtime");

// Pinned Node.js release; checksums copied from https://nodejs.org/dist/v24.21.0/SHASUMS256.txt
const NODE_VERSION = "24.21.0";
const NODE_SHA256 = {
  x64: "fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6",
  arm64: "6ad1325edbdb5649c379b75a237147a666c95d4f9ae8d340fef2d1575d289ad2",
};

if (process.platform !== "linux") {
  throw new Error("bundle-runtime only builds the Linux package for now");
}
const arch = process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "x64" : null;
if (!arch) throw new Error(`unsupported architecture: ${process.arch}`);

mkdirSync(out, { recursive: true });

await build({
  entryPoints: [join(root, "apps/runtime/src/main.ts")],
  outfile: join(out, "runtime.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  legalComments: "external",
  // Some dependencies still call require(); give the ESM bundle one.
  banner: {
    js: "import { createRequire as __nbRequire } from 'node:module'; const require = __nbRequire(import.meta.url);",
  },
  logLevel: "warning",
});
console.log("bundled runtime.mjs");

const name = `node-v${NODE_VERSION}-linux-${arch}`;
const cache = join(tmpdir(), "noburi-build");
const archive = join(cache, `${name}.tar.xz`);
mkdirSync(cache, { recursive: true });
if (!existsSync(archive)) {
  const res = await fetch(`https://nodejs.org/dist/v${NODE_VERSION}/${name}.tar.xz`);
  if (!res.ok) throw new Error(`Node.js download failed: ${res.status}`);
  writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
}
const sha = createHash("sha256").update(readFileSync(archive)).digest("hex");
if (sha !== NODE_SHA256[arch]) {
  throw new Error(`Node.js checksum mismatch for ${name}: got ${sha}`);
}
execFileSync("tar", ["-xJf", archive, "-C", cache, `${name}/bin/node`, `${name}/LICENSE`]);
copyFileSync(join(cache, name, "bin/node"), join(out, "node"));
chmodSync(join(out, "node"), 0o755);
copyFileSync(join(cache, name, "LICENSE"), join(out, "NODE_LICENSE"));
console.log(`node ${NODE_VERSION} (${arch}) verified and copied`);

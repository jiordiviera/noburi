import { describe, expect, it } from "vite-plus/test";
import { avatarImageFor, PackManifest } from "./pack.ts";

const valid = {
  schemaVersion: "1.0",
  id: "noburi.cozy-starters",
  name: "Cozy Starters",
  version: "0.1.0",
  license: "CC-BY-4.0",
  author: "Noburi contributors",
  tileSize: 32,
  avatars: [
    {
      id: "builder",
      displayName: "Builder",
      size: [48, 48],
      states: { idle: "avatars/builder/idle.png", working: "avatars/builder/working.png" },
    },
  ],
  worlds: ["worlds/cozy-office/map.json"],
};

describe("pack manifest", () => {
  it("accepts the documented example", () => {
    expect(PackManifest.parse(valid).avatars).toHaveLength(1);
  });

  it("rejects path traversal and absolute paths", () => {
    for (const idle of ["../../etc/passwd.png", "/abs/idle.png", "C:/x/idle.png", "a\\b.png"]) {
      const bad = { ...valid, avatars: [{ ...valid.avatars[0], states: { idle } }] };
      expect(PackManifest.safeParse(bad).success).toBe(false);
    }
  });

  it("rejects non-PNG and unknown keys", () => {
    const script = { ...valid, avatars: [{ ...valid.avatars[0], states: { idle: "idle.js" } }] };
    expect(PackManifest.safeParse(script).success).toBe(false);
    expect(PackManifest.safeParse({ ...valid, onLoad: "x" }).success).toBe(false);
  });

  it("falls back to idle for missing states", () => {
    const avatar = PackManifest.parse(valid).avatars[0]!;
    expect(avatarImageFor(avatar, "working")).toBe("avatars/builder/working.png");
    expect(avatarImageFor(avatar, "error")).toBe("avatars/builder/idle.png");
  });
});

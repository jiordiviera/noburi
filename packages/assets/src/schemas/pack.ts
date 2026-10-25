import { z } from "zod";

/** Relative path inside a pack: no absolute paths, no traversal, PNG only. */
export const PackPngPath = z
  .string()
  .min(1)
  .refine(
    (p) => !p.startsWith("/") && !p.includes("\\") && !/^[a-zA-Z]:/.test(p),
    "must be relative",
  )
  .refine((p) => !p.split("/").includes(".."), "must not traverse")
  .refine((p) => p.toLowerCase().endsWith(".png"), "must be a .png");

export const AvatarState = z.enum(["idle", "thinking", "working", "waiting", "done", "error"]);
export type AvatarState = z.infer<typeof AvatarState>;

export const PackAvatar = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  displayName: z.string().min(1).max(64),
  size: z.tuple([z.number().int().min(16).max(128), z.number().int().min(16).max(128)]),
  // Only idle is required; missing states fall back to idle.
  states: z.object({
    idle: PackPngPath,
    thinking: PackPngPath.optional(),
    working: PackPngPath.optional(),
    waiting: PackPngPath.optional(),
    done: PackPngPath.optional(),
    error: PackPngPath.optional(),
  }),
});
export type PackAvatar = z.infer<typeof PackAvatar>;

export const PackManifest = z.strictObject({
  schemaVersion: z.literal("1.0"),
  id: z.string().regex(/^[a-z0-9][a-z0-9.-]{0,127}$/),
  name: z.string().min(1).max(128),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  license: z.string().min(1),
  author: z.string().min(1),
  tileSize: z.union([z.literal(32), z.literal(48)]),
  avatars: z.array(PackAvatar).max(64),
  worlds: z.array(z.string()).default([]),
});
export type PackManifest = z.infer<typeof PackManifest>;

export function avatarImageFor(avatar: PackAvatar, state: AvatarState): string {
  return avatar.states[state] ?? avatar.states.idle;
}

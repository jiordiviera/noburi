import { isTauri } from "@tauri-apps/api/core";

/** Opens a web page in the user's browser; the desktop window itself never navigates away. */
export async function openExternal(url: string): Promise<void> {
  if (!/^https?:\/\//.test(url)) return;
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

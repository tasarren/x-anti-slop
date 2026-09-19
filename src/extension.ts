import { whitelistKey } from "./settings.ts";

declare const browser: typeof chrome | undefined;
export const extension = typeof browser === "undefined" ? chrome : browser;

export async function setWhitelisted(handle: string, allowed: boolean): Promise<void> {
  const key = whitelistKey(handle);
  // One storage key per account avoids overwriting filters or other accounts across tabs.
  if (allowed) await extension.storage.local.set({ [key]: true });
  else await extension.storage.local.remove(key);
}

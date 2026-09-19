export type Filter = { pattern: string; flags: string; enabled: boolean };
export type Settings = { enabled: boolean; mode: "placeholder" | "remove"; filters: Filter[] };

export const WHITELIST_PREFIX = "whitelist:";

export function normalizeHandle(value: string): string | undefined {
  const handle = value.trim().replace(/^@/, "").toLowerCase();
  // Older X accounts can have short handles; profile links are the source of identity.
  return /^[a-z0-9_]{1,15}$/.test(handle) ? handle : undefined;
}

export function whitelistKey(handle: string): string {
  const normalized = normalizeHandle(handle);
  if (!normalized) throw new Error("Use an X handle with 1–15 letters, numbers or underscores.");
  return WHITELIST_PREFIX + normalized;
}

export function parseWhitelist(storage: Record<string, unknown>): Set<string> {
  const accounts = new Set<string>();
  for (const [key, value] of Object.entries(storage)) {
    if (!key.startsWith(WHITELIST_PREFIX) || value !== true) continue;
    const handle = key.slice(WHITELIST_PREFIX.length);
    if (normalizeHandle(handle) === handle) accounts.add(handle);
  }
  return accounts;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  mode: "placeholder",
  filters: [{ pattern: ".?[—«»].?", flags: "u", enabled: true }],
};

export function parseSettings(value: unknown): Settings {
  if (value === undefined) return structuredClone(DEFAULT_SETTINGS);
  if (typeof value !== "object" || value === null ||
      !("enabled" in value) || typeof value.enabled !== "boolean" ||
      !("mode" in value) || (value.mode !== "placeholder" && value.mode !== "remove") ||
      !("filters" in value) || !Array.isArray(value.filters)) {
    throw new Error("Saved settings could not be read. Open X-Anti-Slop to reset them.");
  }
  const filters = value.filters.map((filter: unknown): Filter => {
    if (typeof filter !== "object" || filter === null ||
        !("pattern" in filter) || typeof filter.pattern !== "string" ||
        !("flags" in filter) || typeof filter.flags !== "string" ||
        !("enabled" in filter) || typeof filter.enabled !== "boolean") {
      throw new Error("A saved filter is invalid. Reset the filters to recover.");
    }
    return { pattern: filter.pattern, flags: filter.flags, enabled: filter.enabled };
  });
  return { enabled: value.enabled, mode: value.mode, filters };
}

export function compileFilter(filter: Filter): RegExp {
  if (!filter.pattern.trim()) throw new Error("Enter a pattern, or delete this filter.");
  return new RegExp(filter.pattern, filter.flags);
}

export function compileFilters(settings: Settings): RegExp[] {
  return settings.filters.filter(filter => filter.enabled).map(compileFilter);
}

export function matches(text: string, filters: readonly RegExp[]): boolean {
  // ponytail: native JS regexes run synchronously; use a terminable worker if untrusted filter imports are added.
  return filters.some(filter => {
    filter.lastIndex = 0;
    return filter.test(text);
  });
}

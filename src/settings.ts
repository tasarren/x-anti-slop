export type Filter = { pattern: string; flags: string; enabled: boolean };
export type Settings = { enabled: boolean; mode: "placeholder" | "remove"; filters: Filter[] };

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  mode: "placeholder",
  // Preserve the user's U+200E marks, but show their escapes in the editor.
  filters: [{ pattern: ".?[\\u200e—\\u200e«»].?", flags: "u", enabled: true }],
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

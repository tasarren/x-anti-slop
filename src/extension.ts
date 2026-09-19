declare const browser: typeof chrome | undefined;
export const extension = typeof browser === "undefined" ? chrome : browser;

import { compileFilters, matches, parseSettings } from "./settings.ts";
import type { Settings } from "./settings.ts";
import { extension } from "./extension.ts";

const POST = 'article[data-testid="tweet"]';
const TEXT = '[data-testid="tweetText"]';
const ROW = '[data-testid="cellInnerDiv"]';
type HiddenPost = { root: HTMLElement; notice: HTMLDivElement; identity: string; revealed: boolean };
const hiddenPosts = new Map<HTMLElement, HiddenPost>();
let settings: Settings = { enabled: false, mode: "placeholder", filters: [] };
let filters: RegExp[] = [];
let scheduled = false;

function textOf(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node instanceof HTMLImageElement) return node.alt;
  if (node instanceof HTMLBRElement) return "\n";
  return Array.from(node.childNodes, textOf).join("");
}

function restore(state: HiddenPost): void {
  state.root.removeAttribute("data-xas-mode");
  state.notice.remove();
}

function scan(): void {
  scheduled = false;
  // Avoid observing our own placeholder insertions and removals.
  observer.disconnect();
  try {
    for (const [post, state] of hiddenPosts) {
      if (!post.isConnected || !post.matches(POST)) {
        restore(state);
        hiddenPosts.delete(post);
      }
    }
    // ponytail: scan only X's mounted posts per mutation batch; use dirty-post tracking if this becomes costly.
    for (const post of document.querySelectorAll<HTMLElement>(POST)) {
      if (post.parentElement?.closest(POST)) continue;
      const text = Array.from(post.querySelectorAll(TEXT), textOf).join("\n");
      const cell = post.closest<HTMLElement>(ROW);
      const root = cell && cell.querySelectorAll(POST).length === 1 ? cell : post;
      const identity = (post.querySelector("time")?.closest("a")?.getAttribute("href") ?? "") + "\n" + text;
      let state = hiddenPosts.get(post);
      if (state && (state.identity !== identity || state.root !== root)) {
        restore(state);
        hiddenPosts.delete(post);
        state = undefined;
      }
      if (!settings.enabled || !text || !matches(text, filters)) {
        if (state) restore(state);
        hiddenPosts.delete(post);
        continue;
      }
      if (!state) {
        const notice = document.createElement("div");
        notice.className = "xas-notice";
        const label = document.createElement("span");
        label.textContent = "This post is hidden by X-Anti-Slop";
        const show = document.createElement("button");
        show.type = "button";
        show.textContent = "Show";
        show.setAttribute("aria-label", "Show this hidden post");
        show.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          const current = hiddenPosts.get(post);
          if (current) {
            current.revealed = true;
            restore(current);
          }
        });
        notice.append(label, show);
        state = { root, notice, identity, revealed: false };
        hiddenPosts.set(post, state);
      }
      if (!state.revealed) {
        root.setAttribute("data-xas-mode", settings.mode);
        if (state.notice.parentElement !== root) root.append(state.notice);
      }
    }
  } finally {
    observer.observe(document.body, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ["href", "alt", "data-testid"],
    });
  }
}

const observer = new MutationObserver(() => {
  if (!scheduled) {
    scheduled = true;
    window.setTimeout(scan, 40);
  }
});

function apply(value: unknown): void {
  try {
    const next = parseSettings(value);
    const compiled = compileFilters(next);
    settings = next;
    filters = compiled;
  } catch (error) {
    settings = { enabled: false, mode: "placeholder", filters: [] };
    filters = [];
    console.warn("X-Anti-Slop: filtering paused because settings are invalid.", error);
  }
  for (const state of hiddenPosts.values()) restore(state);
  hiddenPosts.clear();
  scan();
}

let storageRevision = 0;
extension.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes["settings"]) {
    storageRevision++;
    apply(changes["settings"].newValue as unknown);
  }
});
const loadingRevision = storageRevision;
void extension.storage.local.get("settings").then(data => {
  if (loadingRevision === storageRevision) apply(data["settings"] as unknown);
}).catch(error => console.warn("X-Anti-Slop: settings could not be loaded.", error));

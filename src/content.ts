import { compileFilters, matches, normalizeHandle, parseSettings, parseWhitelist } from "./settings.ts";
import type { Settings } from "./settings.ts";
import { extension, setWhitelisted } from "./extension.ts";
import { syncLauncher } from "./launcher.ts";

const POST = 'article[data-testid="tweet"]';
const TEXT = '[data-testid="tweetText"]';
const ROW = '[data-testid="cellInnerDiv"]';
const USER = '[data-testid="User-Name"]';
const SCOPE = `${POST}, [role="link"], [data-testid="quoteTweet"], blockquote`;
type HiddenPost = { root: HTMLElement; notice: HTMLDivElement; identity: string; revealed: boolean };
const hiddenPosts = new Map<HTMLElement, HiddenPost>();
const authorButtons = new WeakMap<HTMLElement, HTMLButtonElement>();
const pendingAccounts = new Set<string>();
const failedAccounts = new Set<string>();
let whitelisted = new Set<string>();
let stored: Record<string, unknown> = {};
let loaded = false;
let settings: Settings = { enabled: false, mode: "placeholder", filters: [] };
let filters: RegExp[] = [];
let scheduled = false;

function authorOf(post: HTMLElement): { header: HTMLElement; handle: string } | undefined {
  const header = Array.from(post.querySelectorAll<HTMLElement>(USER)).find(node =>
    node.closest(SCOPE) === post);
  if (!header) return undefined;
  for (const link of header.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    let url: URL;
    try { url = new URL(link.href, location.href); }
    catch { continue; }
    if (url.protocol !== "https:" || !["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname)) continue;
    const profile = /^\/([a-z0-9_]{1,15})\/?$/i.exec(url.pathname)?.[1];
    const handle = profile && normalizeHandle(profile);
    if (handle) return { header, handle };
  }
  // X quote cards render handles as spans rather than profile links.
  const avatar = Array.from(post.querySelectorAll('[data-testid^="UserAvatar-Container-"]'))
    .find(node => node.closest(SCOPE) === post);
  const avatarHandle = normalizeHandle(avatar?.getAttribute("data-testid")?.slice("UserAvatar-Container-".length) ?? "");
  if (avatarHandle) return { header, handle: avatarHandle };
  if (post.matches(POST) && !post.parentElement?.closest(POST)) return undefined;
  const handles = new Set(Array.from(header.querySelectorAll("span"))
    .map(node => node.textContent?.trim() ?? "")
    .filter(text => /^@[a-z0-9_]{1,15}$/i.test(text))
    .map(text => normalizeHandle(text)!));
  if (handles.size === 1) return { header, handle: [...handles][0]! };
  return undefined;
}

function paintAccountButton(button: HTMLButtonElement, handle: string): void {
  const allowed = whitelisted.has(handle);
  const pending = pendingAccounts.has(handle);
  const failed = failedAccounts.has(handle);
  button.dataset["xasAccount"] = handle;
  if (!button.classList.contains("xas-whitelist-icon")) {
    button.textContent = pending ? "Saving…" : failed ? "Retry" : allowed ? "Whitelisted" : "Whitelist";
  }
  button.toggleAttribute("data-xas-error", failed);
  button.disabled = pending;
  button.setAttribute("aria-pressed", String(allowed));
  button.title = failed ? `Could not save @${handle}. Click to retry.` :
    allowed ? `Remove @${handle} from the X-Anti-Slop whitelist` : `Whitelist @${handle} in X-Anti-Slop`;
  button.setAttribute("aria-label", button.title);
}

function accountButton(post: HTMLElement, handle: string, iconOnly = false): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "xas-whitelist";
  if (iconOnly) {
    button.classList.add("xas-whitelist-icon");
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");
    const star = document.createElementNS(icon.namespaceURI, "path");
    star.setAttribute("d", "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z");
    icon.append(star);
    button.append(icon);
  }
  paintAccountButton(button, handle);
  button.addEventListener("keydown", event => event.stopPropagation());
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    // X can recycle a post before our next mutation batch; never act on a stale label.
    const current = authorOf(post)?.handle;
    if (!current || current !== button.dataset["xasAccount"] || pendingAccounts.has(current)) {
      scan();
      return;
    }
    const allowed = !whitelisted.has(current);
    pendingAccounts.add(current);
    failedAccounts.delete(current);
    scan();
    void setWhitelisted(current, allowed).catch(error => {
      failedAccounts.add(current);
      console.warn("X-Anti-Slop: whitelist could not be saved.", error);
    }).finally(() => {
      pendingAccounts.delete(current);
      scan();
    });
  });
  return button;
}

function ownerOf(node: Element, scopes: ReadonlySet<HTMLElement>): HTMLElement | null {
  let scope = node.closest<HTMLElement>(SCOPE);
  while (scope && !scopes.has(scope)) scope = scope.parentElement?.closest<HTMLElement>(SCOPE) ?? null;
  return scope;
}

function postText(post: HTMLElement, scopes: ReadonlySet<HTMLElement>): string {
  function read(node: Node): string {
    if (node instanceof HTMLElement) {
      if (node.matches(".xas-notice, .xas-whitelist")) return "";
      if (node !== post && scopes.has(node)) return "\n";
    }
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (node instanceof HTMLImageElement) return node.alt;
    if (node instanceof HTMLBRElement) return "\n";
    return Array.from(node.childNodes, read).join("");
  }
  const blocks = post.matches(TEXT) ? [post] : Array.from(post.querySelectorAll(TEXT));
  return blocks
    .filter(node => {
      const parentText = node.parentElement?.closest(TEXT);
      return ownerOf(node, scopes) === post && (!parentText || ownerOf(parentText, scopes) !== post);
    })
    .map(read).filter(text => text.trim()).join("\n");
}

function restore(state: HiddenPost): void {
  state.root.removeAttribute("data-xas-mode");
  state.root.removeAttribute("data-xas-quote-hidden");
  state.notice.remove();
}

function scan(): void {
  scheduled = false;
  // Avoid observing our own placeholder insertions and removals.
  observer.disconnect();
  try {
    syncLauncher();
    const scopes = new Set(document.querySelectorAll<HTMLElement>(POST));
    for (const text of document.querySelectorAll(TEXT)) {
      const scope = text.closest<HTMLElement>(SCOPE);
      if (scope?.closest(POST)) scopes.add(scope);
    }
    for (const [post, state] of hiddenPosts) {
      if (!post.isConnected || !scopes.has(post)) {
        restore(state);
        hiddenPosts.delete(post);
      }
    }
    // ponytail: scan only X's mounted posts per mutation batch; use dirty-post tracking if this becomes costly.
    for (const post of scopes) {
      const quoted = !post.matches(POST) || Boolean(post.parentElement?.closest(POST));
      const author = authorOf(post);
      let button = authorButtons.get(post);
      if (button && (!author || button.parentElement !== author.header)) {
        button.remove();
        authorButtons.delete(post);
        button = undefined;
      }
      if (author) {
        if (!button) {
          button = accountButton(post, author.handle, true);
          author.header.append(button);
          authorButtons.set(post, button);
        }
        paintAccountButton(button, author.handle);
      }
      const text = postText(post, scopes);
      const cell = post.closest<HTMLElement>(ROW);
      const onlyPost = cell && Array.from(cell.querySelectorAll(POST)).filter(node => !node.parentElement?.closest(POST)).length === 1;
      const root = !quoted && onlyPost ? cell : post;
      const time = Array.from(post.querySelectorAll("time")).find(node => ownerOf(node, scopes) === post);
      const identity = (author?.handle ?? "") + "\n" + (post.getAttribute("href") ?? time?.closest("a")?.getAttribute("href") ?? time?.getAttribute("datetime") ?? "") + "\n" + text;
      let state = hiddenPosts.get(post);
      if (state && (state.identity !== identity || state.root !== root)) {
        restore(state);
        hiddenPosts.delete(post);
        state = undefined;
      }
      if (!settings.enabled || (author && whitelisted.has(author.handle)) || !text || !matches(text, filters)) {
        if (state) restore(state);
        hiddenPosts.delete(post);
        continue;
      }
      if (!state) {
        const notice = document.createElement("div");
        notice.className = "xas-notice";
        const label = document.createElement("span");
        label.textContent = quoted ? "Quoted post hidden by X-Anti-Slop" : "This post is hidden by X-Anti-Slop";
        const show = document.createElement("button");
        show.type = "button";
        show.textContent = "Show";
        show.setAttribute("aria-label", quoted ? "Show this hidden quoted post" : "Show this hidden post");
        show.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          const current = hiddenPosts.get(post);
          if (current) {
            current.revealed = true;
            restore(current);
            authorButtons.get(post)?.focus();
          }
        });
        notice.append(label, show);
        notice.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
        });
        notice.addEventListener("keydown", event => event.stopPropagation());
        if (quoted) notice.classList.add("xas-quote-notice");
        if (author) notice.append(accountButton(post, author.handle));
        state = { root, notice, identity, revealed: false };
        hiddenPosts.set(post, state);
      }
      if (!state.revealed) {
        const noticeButton = state.notice.querySelector<HTMLButtonElement>(".xas-whitelist");
        if (noticeButton && author) paintAccountButton(noticeButton, author.handle);
        root.setAttribute("data-xas-mode", settings.mode);
        if (quoted) {
          // Keep the notice outside X's clickable quote so hidden content cannot capture clicks.
          root.setAttribute("data-xas-quote-hidden", "");
          if (settings.mode === "placeholder") {
            if (root.previousElementSibling !== state.notice) root.before(state.notice);
          } else state.notice.remove();
        } else if (state.notice.parentElement !== root) root.append(state.notice);
      }
    }
  } finally {
    observer.observe(document.body, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ["href", "alt", "data-testid"],
    });
  }
}

function scheduleScan(): void {
  if (!scheduled) {
    scheduled = true;
    window.setTimeout(scan, 40);
  }
}
const observer = new MutationObserver(scheduleScan);
window.addEventListener("resize", scheduleScan);

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

extension.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  for (const [key, change] of Object.entries(changes)) stored[key] = change.newValue as unknown;
  if (!loaded) return;
  whitelisted = parseWhitelist(stored);
  if (changes["settings"]) apply(stored["settings"]);
  else scan();
});
// Settings remain reachable even if loading saved preferences fails.
syncLauncher();
void extension.storage.local.get(null).then(data => {
  // Events received while the initial read was pending take precedence over that snapshot.
  stored = { ...data, ...stored };
  whitelisted = parseWhitelist(stored);
  loaded = true;
  apply(stored["settings"]);
}).catch(error => console.warn("X-Anti-Slop: settings could not be loaded.", error));

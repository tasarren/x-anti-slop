import { extension } from "./extension.ts";

let card: HTMLElement | undefined;
let openButton: HTMLButtonElement | undefined;
let panel: HTMLElement | undefined;
let frame: HTMLIFrameElement | undefined;
let closeButton: HTMLButtonElement | undefined;
let loading: HTMLParagraphElement | undefined;

function closeSettings(): void {
  if (panel) panel.hidden = true;
  openButton?.setAttribute("aria-expanded", "false");
  openButton?.focus();
}

function openSettings(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  if (!panel) {
    panel = document.createElement("section");
    panel.id = "xas-settings-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "X-Anti-Slop settings");
    const header = document.createElement("div");
    header.className = "xas-panel-header";
    const title = document.createElement("strong");
    title.textContent = "X-Anti-Slop";
    const fullPage = document.createElement("a");
    fullPage.textContent = "Open in tab";
    fullPage.href = extension.runtime.getURL("options.html");
    fullPage.target = "_blank";
    fullPage.rel = "noopener noreferrer";
    closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", "Close X-Anti-Slop settings");
    closeButton.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      closeSettings();
    });
    header.append(title, fullPage, closeButton);
    loading = document.createElement("p");
    loading.className = "xas-panel-loading";
    loading.textContent = "Loading settings… If they do not appear, use Open in tab.";
    loading.setAttribute("role", "status");
    frame = document.createElement("iframe");
    frame.title = "X-Anti-Slop settings editor";
    frame.src = extension.runtime.getURL("options.html") + "?embedded=1";
    frame.referrerPolicy = "no-referrer";
    // The editor retains its extension origin. X cannot read its DOM or stored preferences.
    panel.append(header, loading, frame);
    document.body.append(panel);
  }
  panel.hidden = false;
  openButton?.setAttribute("aria-expanded", "true");
  closeButton?.focus();
}

export function syncLauncher(): void {
  if (!card) {
    card = document.createElement("aside");
    card.id = "xas-settings-card";
    card.setAttribute("aria-label", "X-Anti-Slop");
    const logo = document.createElement("img");
    logo.src = extension.runtime.getURL("icons/48.png");
    logo.alt = "";
    const copy = document.createElement("span");
    copy.className = "xas-card-copy";
    const name = document.createElement("strong");
    name.textContent = "X-Anti-Slop";
    const tagline = document.createElement("small");
    tagline.textContent = "Only your rules.";
    copy.append(name, tagline);
    openButton = document.createElement("button");
    openButton.type = "button";
    openButton.title = "X-Anti-Slop settings";
    openButton.setAttribute("aria-label", "Open X-Anti-Slop settings");
    openButton.setAttribute("aria-haspopup", "dialog");
    openButton.setAttribute("aria-expanded", "false");
    openButton.setAttribute("aria-controls", "xas-settings-panel");
    openButton.addEventListener("click", openSettings);
    const action = document.createElement("span");
    action.className = "xas-card-action";
    action.textContent = "Settings";
    openButton.append(logo, copy, action);
    card.append(openButton);
  }
  const more = document.querySelector<HTMLElement>('[data-testid="AppTabBar_More_Menu"]');
  const visible = more && more.getBoundingClientRect().width > 0;
  card.classList.toggle("xas-floating-card", !visible);
  // Follow X's actual rail width, including browser zoom and its own responsive layout.
  card.classList.toggle("xas-compact-card", !visible || more.clientWidth < 160);
  if (visible) {
    if (more.nextElementSibling !== card) more.after(card);
  } else if (card.parentElement !== document.body) document.body.append(card);
  if (panel && !panel.isConnected) document.body.append(panel);
}

window.addEventListener("message", event => {
  // Only this exact editor frame can signal readiness or ask its host to close.
  if (!frame || event.source !== frame.contentWindow) return;
  const data: unknown = event.data;
  if (typeof data !== "object" || data === null || !("type" in data)) return;
  if (data.type === "xas:settings-ready" && loading) loading.hidden = true;
  if (data.type === "xas:settings-close") closeSettings();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && panel && !panel.hidden) {
    event.preventDefault();
    event.stopPropagation();
    closeSettings();
  }
});

import { compileFilter, compileFilters, DEFAULT_SETTINGS, matches, normalizeHandle, parseSettings, parseWhitelist, WHITELIST_PREFIX } from "./settings.ts";
import type { Filter, Settings } from "./settings.ts";
import { extension, setWhitelisted } from "./extension.ts";

const embedded = new URLSearchParams(location.search).has("embedded") && window.parent !== window;
if (embedded) {
  document.documentElement.classList.add("xas-embedded");
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      // No preferences or account data cross the frame boundary, only this close signal.
      window.parent.postMessage({ type: "xas:settings-close" }, "*");
    }
  });
}

// These controls are fixed by the packaged HTML, never supplied by a website.
const form = document.querySelector<HTMLFormElement>("#settings-form")!;
const controls = document.querySelector<HTMLFieldSetElement>("#controls")!;
const list = document.querySelector<HTMLDivElement>("#filters")!;
const template = document.querySelector<HTMLTemplateElement>("#filter-template")!;
const enabled = document.querySelector<HTMLInputElement>("#enabled")!;
const sample = document.querySelector<HTMLTextAreaElement>("#sample")!;
const result = document.querySelector<HTMLParagraphElement>("#test-result")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const save = document.querySelector<HTMLButtonElement>("#save")!;
const reset = document.querySelector<HTMLButtonElement>("#reset")!;
const count = document.querySelector<HTMLSpanElement>("#filter-count")!;
const whitelistInput = document.querySelector<HTMLInputElement>("#whitelist-handle")!;
const whitelistAdd = document.querySelector<HTMLButtonElement>("#add-whitelist")!;
const whitelistList = document.querySelector<HTMLUListElement>("#whitelist-list")!;
const whitelistStatus = document.querySelector<HTMLParagraphElement>("#whitelist-status")!;
let whitelistStorage: Record<string, unknown> = {};
let whitelistLoaded = false;
let whitelistSaving = false;
let revision = 0;

function renderWhitelist(): void {
  const handles = [...parseWhitelist(whitelistStorage)].sort();
  whitelistList.replaceChildren();
  whitelistAdd.disabled = !whitelistLoaded || whitelistSaving;
  whitelistInput.disabled = !whitelistLoaded || whitelistSaving;
  for (const handle of handles) {
    const item = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = `@${handle}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "quiet";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove @${handle} from whitelist`);
    remove.disabled = whitelistSaving;
    remove.addEventListener("click", () => { void saveWhitelist(handle, false); });
    item.append(name, remove);
    whitelistList.append(item);
  }
  if (!handles.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No whitelisted accounts yet.";
    whitelistList.append(empty);
  }
}

async function saveWhitelist(handle: string, allowed: boolean): Promise<void> {
  if (!whitelistLoaded || whitelistSaving) return;
  whitelistSaving = true;
  whitelistStatus.removeAttribute("data-error");
  whitelistStatus.textContent = "Saving account…";
  renderWhitelist();
  try {
    await setWhitelisted(handle, allowed);
    whitelistStatus.textContent = allowed ? `@${handle} is whitelisted.` : `@${handle} will be filtered again.`;
    if (allowed) whitelistInput.value = "";
  } catch (error) {
    whitelistStatus.textContent = "Could not save the account. Please try again.";
    whitelistStatus.setAttribute("data-error", "true");
    console.error("X-Anti-Slop: whitelist save failed.", error);
  } finally {
    whitelistSaving = false;
    renderWhitelist();
    whitelistInput.focus();
  }
}

whitelistAdd.addEventListener("click", () => {
  const handle = normalizeHandle(whitelistInput.value);
  if (!handle) {
    whitelistStatus.textContent = "Enter an X handle: 1–15 letters, numbers or underscores, with an optional @.";
    whitelistStatus.setAttribute("data-error", "true");
    whitelistInput.setAttribute("aria-invalid", "true");
    return;
  }
  whitelistInput.removeAttribute("aria-invalid");
  void saveWhitelist(handle, true);
});
whitelistInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    whitelistAdd.click();
  }
});
extension.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  for (const [key, change] of Object.entries(changes)) {
    if (key.startsWith(WHITELIST_PREFIX)) whitelistStorage[key] = change.newValue as unknown;
  }
  renderWhitelist();
});

function rows(): HTMLDivElement[] {
  return Array.from(list.querySelectorAll<HTMLDivElement>(".filter-row"));
}

function readFilter(row: HTMLDivElement): Filter {
  return {
    pattern: row.querySelector<HTMLInputElement>(".pattern")!.value,
    flags: row.querySelector<HTMLInputElement>(".flags")!.value,
    enabled: row.querySelector<HTMLInputElement>(".filter-enabled")!.checked,
  };
}

function readForm(): Settings {
  return {
    enabled: enabled.checked,
    mode: form.querySelector<HTMLInputElement>('input[name="mode"]:checked')?.value === "remove" ? "remove" : "placeholder",
    filters: rows().map(readFilter),
  };
}

function validate(): boolean {
  let valid = true;
  for (const row of rows()) {
    let message = "";
    const filter = readFilter(row);
    if (filter.enabled) {
      try { compileFilter(filter); }
      catch (error) { message = error instanceof Error ? error.message : "Invalid regular expression."; }
    }
    row.querySelector<HTMLParagraphElement>(".filter-error")!.textContent = message;
    row.querySelector<HTMLInputElement>(".pattern")!.setAttribute("aria-invalid", String(Boolean(message)));
    if (message) valid = false;
  }
  count.textContent = String(rows().length);
  result.removeAttribute("data-match");
  if (!valid) result.textContent = "Fix the highlighted filter to test or save.";
  else if (!enabled.checked) result.textContent = "Filtering is paused. All posts will remain visible.";
  else if (!sample.value) result.textContent = "Try a sentence before you save.";
  else {
    const matched = matches(sample.value, compileFilters(readForm()));
    result.textContent = matched ? "This post would be hidden." : "This post would stay visible.";
    result.setAttribute("data-match", String(matched));
  }
  save.disabled = !valid;
  return valid;
}

function dirty(): void {
  revision++;
  status.textContent = "Unsaved changes";
  status.removeAttribute("data-error");
  validate();
}

function addFilter(filter: Filter): HTMLDivElement {
  const row = template.content.firstElementChild!.cloneNode(true) as HTMLDivElement;
  row.querySelector<HTMLInputElement>(".pattern")!.value = filter.pattern;
  row.querySelector<HTMLInputElement>(".flags")!.value = filter.flags;
  row.querySelector<HTMLInputElement>(".filter-enabled")!.checked = filter.enabled;
  row.querySelector<HTMLButtonElement>(".delete")!.addEventListener("click", () => {
    row.remove();
    dirty();
  });
  list.append(row);
  return row;
}

function render(settings: Settings): void {
  enabled.checked = settings.enabled;
  form.querySelector<HTMLInputElement>(`input[value="${settings.mode}"]`)!.checked = true;
  list.replaceChildren();
  settings.filters.forEach(addFilter);
  controls.disabled = false;
  validate();
}

document.querySelector("#add-filter")!.addEventListener("click", () => {
  const row = addFilter({ pattern: "", flags: "i", enabled: true });
  dirty();
  row.querySelector<HTMLInputElement>(".pattern")!.focus();
});
form.addEventListener("input", event => {
  if (event.target === sample) validate();
  else if (event.target === whitelistInput) whitelistInput.removeAttribute("aria-invalid");
  else dirty();
});
reset.addEventListener("click", () => {
  render(structuredClone(DEFAULT_SETTINGS));
  dirty();
});
form.addEventListener("submit", event => {
  event.preventDefault();
  if (controls.disabled || !validate()) return;
  const settings = readForm();
  const savingRevision = revision;
  controls.disabled = true;
  reset.disabled = true;
  save.disabled = true;
  status.textContent = "Saving…";
  void extension.storage.local.set({ settings }).then(() => {
    status.textContent = savingRevision === revision ? "Saved. Applied to X." : "Unsaved changes";
    status.removeAttribute("data-error");
  }).catch(error => {
    status.textContent = "Could not save. Your changes are still here. Try again.";
    status.setAttribute("data-error", "true");
    console.error("X-Anti-Slop: save failed.", error);
  }).finally(() => {
    controls.disabled = false;
    reset.disabled = false;
    validate();
  });
});

const loadingRevision = revision;
if (embedded) window.parent.postMessage({ type: "xas:settings-ready" }, "*");
void extension.storage.local.get(null).then(data => {
  whitelistStorage = { ...data, ...whitelistStorage };
  whitelistLoaded = true;
  renderWhitelist();
  if (loadingRevision !== revision) return;
  render(parseSettings(data["settings"] as unknown));
  status.textContent = "Ready";
}).catch(error => {
  if (loadingRevision !== revision) return;
  status.textContent = "Could not load settings. Reopen this page or reset defaults.";
  status.setAttribute("data-error", "true");
  console.error("X-Anti-Slop: load failed.", error);
});

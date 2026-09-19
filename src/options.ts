import { compileFilter, compileFilters, DEFAULT_SETTINGS, matches, parseSettings } from "./settings.ts";
import type { Filter, Settings } from "./settings.ts";
import { extension } from "./extension.ts";

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
let revision = 0;

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
void extension.storage.local.get("settings").then(data => {
  if (loadingRevision !== revision) return;
  render(parseSettings(data["settings"] as unknown));
  status.textContent = "Ready";
}).catch(error => {
  if (loadingRevision !== revision) return;
  status.textContent = "Could not load settings. Reopen this page or reset defaults.";
  status.setAttribute("data-error", "true");
  console.error("X-Anti-Slop: load failed.", error);
});

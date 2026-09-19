import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { runInContext } from "node:vm";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { compileFilter, compileFilters, DEFAULT_SETTINGS, matches, parseSettings } from "../src/settings.ts";
import type { Settings } from "../src/settings.ts";

const content = await readFile("dist/chromium/content.js", "utf8");
const options = await readFile("dist/chromium/options.js", "utf8");
const css = await readFile("public/content.css", "utf8");
const optionsHtml = await readFile("public/options.html", "utf8");

async function until(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (check()) return;
    await delay(20);
  }
  assert.ok(check(), "Expected DOM change did not arrive");
}

function page(html: string, stored: unknown = undefined, firefox = false) {
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://x.com/home" });
  const { window } = dom;
  Object.defineProperty(window, "structuredClone", { value: structuredClone });
  let change: ((changes: Record<string, { newValue: unknown }>, area: string) => void) | undefined;
  let saved: unknown;
  let failSave = false;
  const api = { storage: {
    onChanged: { addListener: (listener: typeof change) => { change = listener; } },
    local: {
      get: async () => ({ settings: await stored }),
      set: async (data: unknown) => {
        if (failSave) throw new Error("Simulated storage failure");
        saved = data;
      },
    },
  } };
  Object.defineProperty(window, firefox ? "browser" : "chrome", { value: api });
  const errors: unknown[] = [];
  window["console"].warn = (...args: unknown[]) => errors.push(args);
  window["console"].error = (...args: unknown[]) => errors.push(args);
  return {
    dom, window, document: window.document, errors,
    run: (code: string) => runInContext(code, dom.getInternalVMContext()),
    update: (settings: unknown) => change?.({ settings: { newValue: settings } }, "local"),
    saved: () => saved,
    failSave: () => { failSave = true; },
  };
}

function post(id: string, text: string, author = "Author"): string {
  return `<div data-testid="cellInnerDiv" id="${id}"><div><div><article data-testid="tweet"><div data-testid="User-Name">${author}</div><a href="/example/status/${id}"><time>Today</time></a><div data-testid="tweetText">${text}</div><button>Like</button></article></div></div></div>`;
}

test("default regex, custom flags, invalid input and empty filter lists", () => {
  const defaults = compileFilters(DEFAULT_SETTINGS);
  for (const symbol of ["—", "«", "»", "\u200e"]) assert.ok(matches(`before${symbol}after`, defaults));
  for (const text of ["A human sentence.", "hyphen-separated", "", "–"]) assert.equal(matches(text, defaults), false);
  assert.deepEqual(parseSettings(undefined), DEFAULT_SETTINGS);
  const empty = parseSettings({ enabled: true, mode: "remove", filters: [] });
  assert.equal(matches("—", compileFilters(empty)), false);
  assert.throws(() => parseSettings(null));
  assert.throws(() => parseSettings({ ...DEFAULT_SETTINGS, filters: [{}] }));
  assert.throws(() => compileFilter({ pattern: "[", flags: "", enabled: true }));
  assert.throws(() => compileFilter({ pattern: "a", flags: "ii", enabled: true }));
  assert.throws(() => compileFilter({ pattern: "", flags: "", enabled: true }));
  const regex = compileFilter({ pattern: "slop", flags: "ig", enabled: true });
  for (let i = 0; i < 4; i++) assert.ok(matches("Some SLOP here", [regex]));
  const sticky = compileFilter({ pattern: "slop", flags: "iy", enabled: true });
  assert.equal(matches("Some SLOP here", [sticky]), false);
  assert.equal(matches("SLOP here", [sticky]), true);
  assert.equal(matches("SLOP here", [sticky]), true);
  assert.equal(compileFilters({ ...DEFAULT_SETTINGS, filters: [{ pattern: "[", flags: "", enabled: false }] }).length, 0);
});

test("new, edited, quoted and recycled posts; reveal; removal; restoration", async t => {
  const p = page(`<style>${css}</style>${post("one", "Hello — world")}${post("two", "Ordinary text", "Name — only")}${post("quote", 'My comment<div data-testid="tweetText">Quoted «text»</div>')}`);
  t.after(() => p.dom.window.close());
  p.run(content);
  const row = p.document.getElementById("one")!;
  const article = row.querySelector("article")!;
  await until(() => row.getAttribute("data-xas-mode") === "placeholder");
  assert.equal(p.window.getComputedStyle(row).height, "50px");
  assert.equal(p.document.getElementById("two")!.hasAttribute("data-xas-mode"), false, "Ignore author punctuation");
  assert.equal(p.document.getElementById("quote")!.getAttribute("data-xas-mode"), "placeholder");
  assert.equal(row.querySelector(".xas-notice span")!.textContent, "This post is hidden by X-Anti-Slop");
  row.querySelector<HTMLButtonElement>(".xas-notice button")!.click();
  assert.equal(row.hasAttribute("data-xas-mode"), false);
  article.querySelector("a")!.setAttribute("href", "/example/status/different");
  await until(() => row.hasAttribute("data-xas-mode"));
  article.querySelector('[data-testid="tweetText"]')!.textContent = "Edited to ordinary text";
  await until(() => !row.hasAttribute("data-xas-mode"));
  p.document.body.insertAdjacentHTML("beforeend", post("new", "New — post"));
  const fresh = p.document.getElementById("new")!;
  await until(() => fresh.hasAttribute("data-xas-mode"));
  p.update({ ...DEFAULT_SETTINGS, mode: "remove" });
  assert.equal(fresh.getAttribute("data-xas-mode"), "remove");
  assert.equal(p.window.getComputedStyle(fresh).height, "0px");
  assert.equal(p.window.getComputedStyle(fresh).visibility, "hidden");
  assert.equal(p.window.getComputedStyle(fresh.querySelector(".xas-notice")!).display, "none");
  fresh.querySelector("article")!.remove();
  await until(() => !fresh.hasAttribute("data-xas-mode"));
  assert.equal(fresh.querySelector(".xas-notice"), null, "Remove orphan notices when X reuses a cell");
  p.update({ ...DEFAULT_SETTINGS, enabled: false });
  assert.equal(p.document.querySelectorAll("[data-xas-mode], .xas-notice").length, 0);
  assert.ok(article.isConnected, "Original post remains owned by X");
  p.update({ ...DEFAULT_SETTINGS, filters: [] });
  assert.equal(p.document.querySelectorAll("[data-xas-mode]").length, 0);
  p.update({ ...DEFAULT_SETTINGS, filters: [{ pattern: "[", flags: "", enabled: true }] });
  assert.equal(p.document.querySelectorAll("[data-xas-mode]").length, 0, "Invalid saved regex fails open");
  assert.equal(p.errors.length, 1);
});

test("Firefox API, emoji alt text, line breaks, and posts without a timeline cell", async t => {
  const settings: Settings = { enabled: true, mode: "placeholder", filters: [{ pattern: "🦊|^second$", flags: "mu", enabled: true }] };
  const p = page(`${post("emoji", '<img alt="🦊" src="fox.png">')}${post("lines", "first<br>second")}<article id="standalone" data-testid="tweet"><div data-testid="tweetText">🦊</div></article>`, settings, true);
  t.after(() => p.dom.window.close());
  p.run(content);
  await until(() => p.document.querySelectorAll("[data-xas-mode]").length === 3);
  p.document.querySelector("img")!.setAttribute("alt", "cat");
  await until(() => !p.document.getElementById("emoji")!.hasAttribute("data-xas-mode"));
  p.update({ ...settings, enabled: false });
  assert.equal(p.document.querySelectorAll(".xas-notice").length, 0);
});

test("a slow initial storage read cannot overwrite newer preferences", async t => {
  let finishLoading: (value: unknown) => void = () => {};
  const delayedSettings = new Promise(resolve => { finishLoading = resolve; });
  const p = page(post("race", "Contains — punctuation"), delayedSettings);
  t.after(() => p.dom.window.close());
  p.run(content);
  p.update({ ...DEFAULT_SETTINGS, enabled: false });
  finishLoading(DEFAULT_SETTINGS);
  await delay(30);
  assert.equal(p.document.querySelectorAll("[data-xas-mode]").length, 0);
});

test("options validate drafts, test matches, save, and preserve drafts on failure", async t => {
  const p = page(optionsHtml);
  t.after(() => p.dom.window.close());
  p.run(options);
  const save = p.document.querySelector<HTMLButtonElement>("#save")!;
  await until(() => !save.disabled);
  const input = p.document.querySelector<HTMLInputElement>(".pattern")!;
  const sample = p.document.querySelector<HTMLTextAreaElement>("#sample")!;
  const status = p.document.getElementById("status")!;
  const form = p.document.querySelector<HTMLFormElement>("form")!;
  input.value = "[";
  input.dispatchEvent(new p.window.Event("input", { bubbles: true }));
  assert.equal(save.disabled, true);
  assert.ok(p.document.querySelector(".filter-error")!.textContent);
  assert.equal(p.saved(), undefined);
  input.value = "spam";
  input.dispatchEvent(new p.window.Event("input", { bubbles: true }));
  sample.value = "some spam";
  sample.dispatchEvent(new p.window.Event("input", { bubbles: true }));
  assert.equal(p.document.getElementById("test-result")!.textContent, "This post would be hidden.");
  form.dispatchEvent(new p.window.Event("submit", { cancelable: true }));
  await until(() => status.textContent === "Saved. Applied to X.");
  assert.deepEqual(JSON.parse(JSON.stringify(p.saved())), { settings: { enabled: true, mode: "placeholder", filters: [{ pattern: "spam", flags: "u", enabled: true }] } });
  p.failSave();
  input.value = "updated";
  input.dispatchEvent(new p.window.Event("input", { bubbles: true }));
  form.dispatchEvent(new p.window.Event("submit", { cancelable: true }));
  await until(() => status.getAttribute("data-error") === "true");
  assert.equal(input.value, "updated");
  assert.equal(save.disabled, false);
  assert.equal(p.errors.length, 1);
});

test("an intentionally empty list survives reload; corrupt storage can be reset", async t => {
  for (const stored of [{ ...DEFAULT_SETTINGS, filters: [] }, null]) {
    const p = page(optionsHtml, stored);
    t.after(() => p.dom.window.close());
    p.run(options);
    await until(() => p.document.getElementById("status")!.textContent !== "Loading settings…");
    assert.equal(p.document.querySelectorAll(".filter-row").length, 0);
    p.document.querySelector<HTMLButtonElement>("#reset")!.click();
    assert.equal(p.document.querySelectorAll(".filter-row").length, 1);
    assert.equal(p.document.querySelector<HTMLButtonElement>("#save")!.disabled, false);
  }
});

test("both manifests reference bundled local assets and request only storage", async () => {
  for (const browser of ["chromium", "firefox"]) {
    const manifest = JSON.parse(await readFile(`dist/${browser}/manifest.json`, "utf8"));
    assert.equal(manifest.manifest_version, 3);
    assert.deepEqual(manifest.permissions, ["storage"]);
    assert.equal(manifest.background, undefined);
    for (const file of [manifest.action.default_popup, ...manifest.content_scripts[0].js, ...manifest.content_scripts[0].css]) {
      assert.ok((await readFile(`dist/${browser}/${file}`)).length);
    }
    if (browser === "firefox") assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions.required, ["none"]);
  }
});

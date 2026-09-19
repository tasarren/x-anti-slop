import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { runInContext } from "node:vm";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { compileFilter, compileFilters, DEFAULT_SETTINGS, matches, normalizeHandle, parseSettings, parseWhitelist, whitelistKey } from "../src/settings.ts";
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

function page(html: string, stored: unknown = undefined, firefox = false, accounts: string[] = []) {
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://x.com/home" });
  const { window } = dom;
  Object.defineProperty(window, "structuredClone", { value: structuredClone });
  let change: ((changes: Record<string, { newValue: unknown }>, area: string) => void) | undefined;
  let saved: unknown;
  let failSave = false;
  const storedAccounts: Record<string, unknown> = Object.fromEntries(accounts.map(handle => [whitelistKey(handle), true]));
  function updateAccounts(data: Record<string, unknown>): void {
    Object.assign(storedAccounts, data);
    change?.(Object.fromEntries(Object.entries(data).map(([key, newValue]) => [key, { newValue }])), "local");
  }
  const api = { runtime: { getURL: (path: string) => `https://extension.invalid/${path}` }, storage: {
    onChanged: { addListener: (listener: typeof change) => { change = listener; } },
    local: {
      get: async () => {
        const snapshot = { ...storedAccounts };
        return { settings: await stored, ...snapshot };
      },
      set: async (data: Record<string, unknown>) => {
        if (failSave) throw new Error("Simulated storage failure");
        saved = data;
        updateAccounts(data);
      },
      remove: async (key: string) => {
        if (failSave) throw new Error("Simulated storage failure");
        delete storedAccounts[key];
        change?.({ [key]: { newValue: undefined } }, "local");
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
    updateAccounts,
    accounts: () => parseWhitelist(storedAccounts),
    saved: () => saved,
    failSave: (fail = true) => { failSave = fail; },
  };
}

function post(id: string, text: string, author = "Author"): string {
  return `<div data-testid="cellInnerDiv" id="${id}"><div><div><article data-testid="tweet"><div data-testid="User-Name"><a href="/${id}">${author}</a><a href="/${id}">@${id}</a></div><a href="/example/status/${id}"><time>Today</time></a><div data-testid="tweetText">${text}</div><button>Like</button></article></div></div></div>`;
}

function quote(handle: string, text: string, id = `quote-${handle}`): string {
  return `<div id="${id}" role="link" tabindex="0"><div><div data-testid="UserAvatar-Container-${handle}"></div><div data-testid="User-Name"><span>Quoted author</span><span>@${handle}</span><time datetime="2026-09-19T12:00:00Z">Today</time></div><div data-testid="tweetText">${text}</div></div></div>`;
}

test("default regex, custom flags, invalid input and empty filter lists", () => {
  const defaults = compileFilters(DEFAULT_SETTINGS);
  for (const symbol of ["—", "«", "»"]) assert.ok(matches(`before${symbol}after`, defaults));
  for (const text of ["A human sentence.", "hyphen-separated", "", "–", "before\u200eafter", "\u200f", "\u200b", "\ufeff"]) assert.equal(matches(text, defaults), false);
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
  const p = page(`<style>${css}</style>${post("one", "Hello — world")}${post("two", "Ordinary text", "Name — only")}${post("quote", 'My comment' + quote("cited", 'Quoted «text»'))}`);
  t.after(() => p.dom.window.close());
  p.run(content);
  const row = p.document.getElementById("one")!;
  const article = row.querySelector("article")!;
  await until(() => row.getAttribute("data-xas-mode") === "placeholder");
  assert.equal(p.window.getComputedStyle(row).height, "50px");
  assert.equal(p.document.getElementById("two")!.hasAttribute("data-xas-mode"), false, "Ignore author punctuation");
  assert.equal(p.document.getElementById("quote")!.hasAttribute("data-xas-mode"), false);
  assert.equal(p.document.getElementById("quote-cited")!.getAttribute("data-xas-mode"), "placeholder");
  assert.equal(row.querySelector(".xas-notice span")!.textContent, "This post is hidden by X-Anti-Slop");
  row.querySelector<HTMLButtonElement>(".xas-notice button")!.click();
  assert.equal(row.hasAttribute("data-xas-mode"), false);
  article.querySelector("time")!.closest("a")!.setAttribute("href", "/example/status/different");
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
    assert.equal(manifest.action.default_popup, "options.html");
    if (browser === "firefox") assert.equal(manifest.action.default_area, "navbar");
    else assert.equal(manifest.action.default_area, undefined);
    assert.deepEqual(manifest.web_accessible_resources[0].resources, ["options.html", "icons/48.png"]);
    assert.deepEqual(manifest.web_accessible_resources[0].matches, manifest.content_scripts[0].matches);
  }
});

test("settings card opens the real editor in one persistent panel and closes accessibly", async t => {
  const p = page(post("author", "A — post"));
  t.after(() => p.dom.window.close());
  p.run(content);
  const card = p.document.getElementById("xas-settings-card")!;
  assert.ok(card, "The card is available before preferences finish loading");
  const open = card.querySelector<HTMLButtonElement>("button")!;
  open.click();
  const panel = p.document.getElementById("xas-settings-panel")!;
  const frame = panel.querySelector("iframe")!;
  assert.equal(frame.src, "https://extension.invalid/options.html?embedded=1");
  assert.equal(panel.getAttribute("role"), "dialog");
  assert.equal(open.getAttribute("aria-expanded"), "true");
  assert.equal(panel.querySelector("a")!.href, "https://extension.invalid/options.html");
  assert.equal(p.document.activeElement, panel.querySelector("button"));
  p.window.dispatchEvent(new p.window.MessageEvent("message", { data: { type: "xas:settings-close" } }));
  assert.equal(panel.hidden, false, "Unrelated windows cannot control the editor");
  p.document.dispatchEvent(new p.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(panel.hidden, true);
  assert.equal(p.document.activeElement, open);
  open.click();
  assert.equal(p.document.querySelectorAll("#xas-settings-panel").length, 1);
  assert.equal(panel.querySelector("iframe"), frame, "Reopening preserves unsaved edits");
  p.window.dispatchEvent(new p.window.MessageEvent("message", { source: frame.contentWindow, data: { type: "xas:settings-ready" } }));
  assert.equal(panel.querySelector<HTMLParagraphElement>(".xas-panel-loading")!.hidden, true);
  p.window.dispatchEvent(new p.window.MessageEvent("message", { source: frame.contentWindow, data: { type: "xas:settings-close" } }));
  assert.equal(panel.hidden, true);
});

test("settings launcher follows More, collapses with the rail, and survives navigation replacement", async t => {
  const p = page('<nav id="primary"><button data-testid="AppTabBar_More_Menu">More</button></nav><button id="post">Post</button>' + post("author", "plain text"));
  t.after(() => p.dom.window.close());
  const nav = p.document.getElementById("primary")!;
  const more = nav.querySelector("button")!;
  let width = 260;
  Object.defineProperty(more, "getBoundingClientRect", { value: () => ({ width }) });
  Object.defineProperty(more, "clientWidth", { get: () => width });
  p.run(content);
  const card = p.document.getElementById("xas-settings-card")!;
  assert.equal(more.nextElementSibling, card);
  assert.equal(nav.nextElementSibling, p.document.getElementById("post"));
  assert.equal(card.classList.contains("xas-compact-card"), false);
  width = 68;
  p.window.dispatchEvent(new p.window.Event("resize"));
  await until(() => card.classList.contains("xas-compact-card"));
  assert.ok(card.querySelector("button img"), "The compact icon remains part of the real button");
  assert.equal(card.querySelector("button")!.getAttribute("aria-label"), "Open X-Anti-Slop settings");
  width = 260;
  p.window.dispatchEvent(new p.window.Event("resize"));
  await until(() => !card.classList.contains("xas-compact-card"));
  card.remove();
  await until(() => card.isConnected);
  assert.equal(more.nextElementSibling, card);
  assert.equal(p.document.querySelectorAll("#xas-settings-card").length, 1);
  nav.remove();
  await until(() => card.parentElement === p.document.body);
  assert.ok(card.classList.contains("xas-floating-card"));
  assert.ok(card.classList.contains("xas-compact-card"));
  const replacement = p.document.createElement("nav");
  replacement.append(more);
  p.document.body.prepend(replacement);
  await until(() => more.nextElementSibling === card);
  assert.equal(card.classList.contains("xas-floating-card"), false);
});

test("whitelist handles are normalized and corrupt keys never grant an exception", () => {
  assert.equal(normalizeHandle(" @Some_Account "), "some_account");
  for (const invalid of ["", "@", "two words", "x.com/person", "abcdefghijklmnop", "\u200eauthor", "@@author"]) assert.equal(normalizeHandle(invalid), undefined);
  assert.deepEqual([...parseWhitelist({ "whitelist:good_user": true, "whitelist:UPPER": true, "whitelist:bad/user": true, "whitelist:disabled": false, "whitelist:truthy": "true" })], ["good_user"]);
});

test("whitelisting a hidden author persists, reveals all their posts, and can be undone", async t => {
  const p = page(post("Alice", "Hello — world") + post("Bob", "Other «post»"));
  t.after(() => p.dom.window.close());
  p.run(content);
  const alice = p.document.getElementById("Alice")!;
  await until(() => alice.hasAttribute("data-xas-mode"));
  const noticeButton = alice.querySelector<HTMLButtonElement>(".xas-notice .xas-whitelist")!;
  let bubbled = false;
  p.document.body.addEventListener("click", () => { bubbled = true; });
  noticeButton.click();
  await until(() => !alice.hasAttribute("data-xas-mode"));
  assert.equal(bubbled, false, "The toggle must not navigate or trigger X post actions");
  assert.deepEqual(JSON.parse(JSON.stringify(p.saved())), { "whitelist:alice": true }, "Do not overwrite filter preferences");
  const authorButton = alice.querySelector<HTMLButtonElement>('[data-testid="User-Name"] .xas-whitelist')!;
  await until(() => !authorButton.disabled);
  assert.equal(authorButton.textContent, "");
  assert.ok(authorButton.querySelector('svg[aria-hidden="true"]'));
  assert.equal(authorButton.getAttribute("aria-label"), "Remove @alice from the X-Anti-Slop whitelist");
  assert.equal(authorButton.getAttribute("aria-pressed"), "true");
  assert.ok(p.document.getElementById("Bob")!.hasAttribute("data-xas-mode"));
  p.document.body.insertAdjacentHTML("beforeend", post("ALICE", "Another — post"));
  await until(() => !!p.document.getElementById("ALICE")!.querySelector(".xas-whitelist"));
  assert.equal(p.document.getElementById("ALICE")!.hasAttribute("data-xas-mode"), false);
  authorButton.click();
  await until(() => alice.hasAttribute("data-xas-mode"));
  assert.ok(p.document.getElementById("ALICE")!.hasAttribute("data-xas-mode"));
  assert.equal(p.accounts().size, 0);
});

test("stored whitelist works in remove mode, excludes quoted authors and handles recycled headers", async t => {
  const p = page(post("allowed", "Allowed — content") + post("other", "My own — matching text" + quote("allowed", "Quoted — text")) + post("unknown", "Hidden — content").replaceAll('href="/unknown"', 'href="https://example.com/allowed"'), { ...DEFAULT_SETTINGS, mode: "remove" }, true, ["allowed"]);
  t.after(() => p.dom.window.close());
  p.run(content);
  await until(() => p.document.getElementById("other")!.hasAttribute("data-xas-mode"));
  const allowed = p.document.getElementById("allowed")!;
  assert.equal(allowed.hasAttribute("data-xas-mode"), false);
  assert.equal(p.document.getElementById("quote-allowed")!.hasAttribute("data-xas-quote-hidden"), false);
  assert.equal(p.document.querySelector('[role="link"] .xas-whitelist')!.getAttribute("aria-pressed"), "true");
  assert.equal(p.document.getElementById("unknown")!.querySelector(".xas-whitelist"), null);
  const oldButton = allowed.querySelector<HTMLButtonElement>(".xas-whitelist")!;
  for (const link of allowed.querySelectorAll('[data-testid="User-Name"] a')) link.setAttribute("href", "/new_author");
  oldButton.click(); // Click before MutationObserver runs: stale labels must not modify either account.
  assert.deepEqual([...p.accounts()], ["allowed"]);
  assert.equal(allowed.getAttribute("data-xas-mode"), "remove");
  const header = allowed.querySelector('[data-testid="User-Name"]')!;
  header.querySelector(".xas-whitelist")!.remove();
  await until(() => header.querySelectorAll(".xas-whitelist").length === 1);
  assert.ok(header.querySelector("button")!.getAttribute("aria-label")!.includes("@new_author"));
});

test("a quote match hides only its card, can be revealed, and never contaminates the author's text", async t => {
  const settings = { ...DEFAULT_SETTINGS, filters: [...DEFAULT_SETTINGS.filters, { pattern: "hidden", flags: "i", enabled: true }] };
  const p = page(`<style>${css}</style>` + post("commenter", "My comment stays visible." + quote("cited", "A matching — citation") + quote("clean", "An ordinary citation")), settings);
  t.after(() => p.dom.window.close());
  p.run(content);
  const parent = p.document.getElementById("commenter")!;
  const cited = p.document.getElementById("quote-cited")!;
  await until(() => cited.hasAttribute("data-xas-quote-hidden"));
  assert.equal(parent.hasAttribute("data-xas-mode"), false);
  assert.equal(p.document.getElementById("quote-clean")!.hasAttribute("data-xas-mode"), false);
  assert.equal(p.window.getComputedStyle(cited).display, "none");
  const notice = cited.previousElementSibling!;
  assert.ok(notice.classList.contains("xas-quote-notice"));
  assert.equal(notice.querySelector("span")!.textContent, "Quoted post hidden by X-Anti-Slop");
  assert.ok(notice.querySelector(".xas-whitelist")!.getAttribute("aria-label")!.includes("@cited"));
  p.document.body.append(p.document.createElement("div"));
  await delay(60);
  assert.equal(parent.hasAttribute("data-xas-mode"), false, "The inserted notice must not match the parent's regex");
  let navigated = false;
  cited.addEventListener("click", () => { navigated = true; });
  notice.querySelector<HTMLButtonElement>('button[aria-label="Show this hidden quoted post"]')!.click();
  assert.equal(navigated, false);
  assert.equal(cited.hasAttribute("data-xas-quote-hidden"), false);
  assert.equal(cited.getAttribute("role"), "link");
  assert.equal(cited.getAttribute("tabindex"), "0");
  assert.equal(parent.hasAttribute("data-xas-mode"), false);
  cited.querySelector('[data-testid="tweetText"]')!.textContent = "Edited — citation";
  await until(() => cited.hasAttribute("data-xas-quote-hidden"));
  cited.remove();
  await until(() => !parent.querySelector(".xas-quote-notice"));
  assert.equal(parent.hasAttribute("data-xas-mode"), false);
});

test("quoted authors have independent whitelist exceptions, including inside an allowed parent's post", async t => {
  const p = page(post("trusted", "My comment" + quote("untrusted", "A — citation")) + post("ordinary", "My comment" + quote("trusted", "An allowed — citation")), DEFAULT_SETTINGS, true, ["trusted"]);
  t.after(() => p.dom.window.close());
  p.run(content);
  const cited = p.document.getElementById("quote-untrusted")!;
  await until(() => cited.hasAttribute("data-xas-quote-hidden"));
  assert.equal(p.document.getElementById("trusted")!.hasAttribute("data-xas-mode"), false);
  assert.equal(p.document.getElementById("ordinary")!.hasAttribute("data-xas-mode"), false);
  assert.equal(p.document.getElementById("quote-trusted")!.hasAttribute("data-xas-mode"), false);
  cited.previousElementSibling!.querySelector<HTMLButtonElement>(".xas-whitelist")!.click();
  await until(() => !cited.hasAttribute("data-xas-quote-hidden"));
  assert.ok(p.accounts().has("untrusted"));
  assert.deepEqual([...p.accounts()].sort(), ["trusted", "untrusted"]);
});

test("complete removal and nested article quotes preserve the citing post", async t => {
  const nested = '<article id="nested-quote" data-testid="tweet"><div data-testid="User-Name"><a href="/nested">Nested</a></div><div data-testid="tweetText">A nested — quote</div></article>';
  const p = page(`<style>${css}</style>` + post("parent", "Visible comment" + nested) + post("no_comment", quote("source", "Only a quoted «post»")), { ...DEFAULT_SETTINGS, mode: "remove" });
  t.after(() => p.dom.window.close());
  p.run(content);
  await until(() => p.document.querySelectorAll("[data-xas-quote-hidden]").length === 2);
  for (const id of ["parent", "no_comment"]) assert.equal(p.document.getElementById(id)!.hasAttribute("data-xas-mode"), false);
  assert.equal(p.document.querySelector(".xas-quote-notice"), null);
  p.update({ ...DEFAULT_SETTINGS, enabled: false });
  assert.equal(p.document.querySelectorAll("[data-xas-mode], [data-xas-quote-hidden]").length, 0);
});

test("matches cannot span parent and quoted post text", async t => {
  const p = page(post("parent", "hello" + quote("child", "world")), { enabled: true, mode: "placeholder", filters: [{ pattern: "hello\\s+world", flags: "u", enabled: true }] });
  t.after(() => p.dom.window.close());
  p.run(content);
  await until(() => !!p.document.querySelector('[data-testid="User-Name"] button'));
  assert.equal(p.document.querySelector("[data-xas-mode]"), null);
});

test("failed whitelist writes remain filtered and expose a retry", async t => {
  const p = page(post("author", "Hidden — text"));
  t.after(() => p.dom.window.close());
  p.run(content);
  await until(() => !!p.document.querySelector(".xas-notice .xas-whitelist"));
  p.failSave();
  p.document.querySelector<HTMLButtonElement>(".xas-notice .xas-whitelist")!.click();
  await until(() => p.document.querySelector(".xas-notice .xas-whitelist")!.textContent === "Retry");
  assert.equal(p.accounts().size, 0);
  assert.ok(p.document.getElementById("author")!.hasAttribute("data-xas-mode"));
  p.failSave(false);
  p.document.querySelector<HTMLButtonElement>(".xas-notice .xas-whitelist")!.click();
  await until(() => !p.document.getElementById("author")!.hasAttribute("data-xas-mode"));
  assert.ok(p.accounts().has("author"));
});

test("an account removed during initial loading stays removed", async t => {
  let finishLoading: (value: unknown) => void = () => {};
  const settings = new Promise(resolve => { finishLoading = resolve; });
  const p = page(post("author", "Hidden — text"), settings, false, ["author"]);
  t.after(() => p.dom.window.close());
  p.run(content);
  p.updateAccounts({ "whitelist:author": undefined });
  finishLoading(DEFAULT_SETTINGS);
  await until(() => p.document.getElementById("author")!.hasAttribute("data-xas-mode"));
  assert.equal(p.document.querySelector('[data-testid="User-Name"] button')!.getAttribute("aria-pressed"), "false");
});

test("settings manage accounts immediately without losing unsaved filter edits", async t => {
  const p = page(optionsHtml, undefined, false, ["existing"]);
  t.after(() => p.dom.window.close());
  p.run(options);
  const add = p.document.querySelector<HTMLButtonElement>("#add-whitelist")!;
  await until(() => !add.disabled);
  const input = p.document.querySelector<HTMLInputElement>("#whitelist-handle")!;
  const pattern = p.document.querySelector<HTMLInputElement>(".pattern")!;
  pattern.value = "unsaved";
  pattern.dispatchEvent(new p.window.Event("input", { bubbles: true }));
  input.value = "@ALIce";
  add.click();
  await until(() => p.document.getElementById("whitelist-status")!.textContent === "@alice is whitelisted.");
  assert.ok(p.accounts().has("alice"));
  p.updateAccounts({ "whitelist:another": true });
  assert.equal(pattern.value, "unsaved");
  assert.equal(p.document.getElementById("status")!.textContent, "Unsaved changes");
  p.document.querySelector<HTMLButtonElement>('[aria-label="Remove @existing from whitelist"]')!.click();
  await until(() => !p.accounts().has("existing"));
  p.document.querySelector<HTMLButtonElement>("#reset")!.click();
  assert.ok(p.accounts().has("alice"), "Reset defaults must preserve the whitelist");
  input.value = "not a handle";
  await until(() => !add.disabled);
  add.click();
  assert.equal(input.getAttribute("aria-invalid"), "true");
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { strFromU8, unzipSync } from "fflate";
import { assertReleaseTag, VERSION } from "../scripts/version.ts";
import { publishChrome } from "../scripts/publish-chrome.ts";

test("release tags, manifests, badge, lockfile and ZIP names agree", async () => {
  assertReleaseTag(`v${VERSION}`);
  for (const tag of ["main", VERSION, "v999.0.0", `v${VERSION}-beta.1`]) assert.throws(() => assertReleaseTag(tag));
  const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
  assert.equal(lock.version, VERSION);
  assert.equal(lock.packages[""].version, VERSION);
  for (const browser of ["chromium", "firefox"]) {
    const zip = unzipSync(await readFile(`artifacts/x-anti-slop-${VERSION}-${browser}.zip`));
    const manifest = JSON.parse(strFromU8(zip["manifest.json"]!));
    assert.equal(manifest.version, VERSION);
    assert.ok(strFromU8(zip["options.html"]!).includes(`>v${VERSION}</span>`));
    assert.equal(Object.keys(zip).some(name => name.includes("__VERSION__")), false);
  }
});

test("source archive is rebuildable, excludes generated/private files, and checksums match", async () => {
  const source = unzipSync(await readFile(`artifacts/x-anti-slop-${VERSION}-source.zip`));
  for (const path of ["package-lock.json", "scripts/build.ts", "src/content.ts", "tests/check.ts", ".github/workflows/ci.yml", "docs/RELEASING.md"]) assert.ok(source[path], path);
  assert.equal(Object.keys(source).some(path => /^(node_modules|dist|artifacts|\.git\/|\.env)/.test(path)), false);
  const sums = await readFile("artifacts/SHA256SUMS.txt", "utf8");
  for (const line of sums.trim().split("\n")) {
    const [expected, name] = line.split("  ");
    const actual = createHash("sha256").update(await readFile(`artifacts/${name}`)).digest("hex");
    assert.equal(actual, expected);
  }
  execFileSync(process.execPath, ["scripts/package.ts"], { stdio: "pipe" });
  assert.equal(await readFile("artifacts/SHA256SUMS.txt", "utf8"), sums, "Repacking must produce identical bytes");
});

const credentials = { publisherId: "publisher", extensionId: "extension", clientId: "client", clientSecret: "secret", refreshToken: "refresh" };
const zip = new Uint8Array([80, 75]);

test("Chrome uploader authenticates, uploads, and submits only after success", async () => {
  const responses = [{ access_token: "test-token" }, { uploadState: "SUCCEEDED", crxVersion: VERSION }, { state: "PENDING_REVIEW" }];
  const calls: { url: string; options: RequestInit | undefined }[] = [];
  const request: typeof fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json(responses.shift());
  };
  assert.equal(await publishChrome(credentials, zip, request), "PENDING_REVIEW");
  assert.equal(calls.length, 3);
  assert.equal(calls[0]!.url, "https://oauth2.googleapis.com/token");
  assert.equal(calls[1]!.url, "https://chromewebstore.googleapis.com/upload/v2/publishers/publisher/items/extension:upload");
  assert.equal(calls[1]!.options!.body, zip);
  assert.equal(calls[2]!.url.endsWith(":publish"), true);
  assert.deepEqual(JSON.parse(String(calls[2]!.options!.body)), { publishType: "DEFAULT_PUBLISH", skipReview: false });
});

test("Chrome uploader never publishes a failed or mismatched upload", async () => {
  for (const upload of [{ uploadState: "FAILED" }, { uploadState: "SUCCEEDED", crxVersion: "999.0.0" }]) {
    const responses = [{ access_token: "test-token" }, upload];
    let calls = 0;
    const request: typeof fetch = async () => { calls++; return Response.json(responses.shift()); };
    await assert.rejects(publishChrome(credentials, zip, request));
    assert.equal(calls, 2);
  }
  let called = false;
  await assert.rejects(publishChrome({ ...credentials, clientSecret: "" }, zip, async () => { called = true; return Response.json({}); }));
  assert.equal(called, false);
});

test("Chrome HTTP errors fail without disclosing credential-bearing response bodies", async () => {
  await assert.rejects(publishChrome(credentials, zip, async () => new Response("sensitive-server-body", { status: 401 })), error => {
    assert.ok(error instanceof Error);
    assert.ok(error.message.includes("401"));
    assert.equal(error.message.includes("sensitive-server-body"), false);
    return true;
  });
});

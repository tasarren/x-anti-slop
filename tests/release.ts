import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { assertReleaseTag, VERSION } from "../scripts/version.ts";
import { publishChrome } from "../scripts/publish-chrome.ts";
import { signedFirefox } from "../scripts/collect-firefox.ts";

test("release tags, manifests, badge, lockfile and ZIP names agree", async () => {
  assertReleaseTag(`v${VERSION}`);
  assertReleaseTag(`v${VERSION}-rc.1`);
  for (const tag of ["main", VERSION, "v999.0.0", `v${VERSION}-beta.1`, `v${VERSION}-rc.0`, `v${VERSION}-rc.01`, `v${VERSION}-rc.1-extra`]) assert.throws(() => assertReleaseTag(tag));
  const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
  assert.equal(lock.version, VERSION);
  assert.equal(lock.packages[""].version, VERSION);
  for (const browser of ["chromium", "firefox"]) {
    const zip = unzipSync(await readFile(`artifacts/x-anti-slop-${VERSION}-${browser}.zip`));
    const manifest = JSON.parse(strFromU8(zip["manifest.json"]!));
    assert.equal(manifest.version, VERSION);
    assert.ok(strFromU8(zip["LICENSE"]!).includes("MIT License"));
    assert.ok(strFromU8(zip["options.html"]!).includes(`>v${VERSION}</span>`));
    assert.equal(Object.keys(zip).some(name => name.includes("__VERSION__")), false);
  }
});

test("source archive is rebuildable, excludes generated/private files, and checksums match", async () => {
  const source = unzipSync(await readFile(`artifacts/x-anti-slop-${VERSION}-source.zip`));
  for (const path of ["LICENSE", "CONTRIBUTING.md", "SECURITY.md", "package-lock.json", "scripts/build.ts", "src/content.ts", "tests/check.ts", ".github/workflows/ci.yml", "docs/RELEASING.md", "public/icons/128.png"]) assert.ok(source[path], path);
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

test("source packaging honors shared/local ignores and skips deleted files and symlinks", async t => {
  const fixture = await mkdtemp(join(tmpdir(), "xas-package-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  execFileSync("git", ["init", "--quiet", fixture]);
  await mkdir(join(fixture, "docs"));
  await writeFile(join(fixture, ".gitignore"), "dist/\nartifacts/\n*.pem\n");
  await writeFile(join(fixture, ".git/info/exclude"), "notes.local.md\n");
  await writeFile(join(fixture, "docs/guide.md"), "Public documentation");
  await writeFile(join(fixture, "docs/private.pem"), "SYNTHETIC SECRET");
  await writeFile(join(fixture, "notes.local.md"), "Personal notes");
  await symlink("guide.md", join(fixture, "docs/link.md"));
  await writeFile(join(fixture, "deleted.md"), "Removed source");
  execFileSync("git", ["-C", fixture, "add", "deleted.md"]);
  await rm(join(fixture, "deleted.md"));
  for (const browser of ["chromium", "firefox"]) {
    await mkdir(join(fixture, "dist", browser), { recursive: true });
    await writeFile(join(fixture, "dist", browser, "manifest.json"), "{}");
  }
  execFileSync(process.execPath, [resolve("scripts/package.ts")], { cwd: fixture, stdio: "pipe" });
  const source = unzipSync(await readFile(join(fixture, `artifacts/x-anti-slop-${VERSION}-source.zip`)));
  assert.ok(source["docs/guide.md"]);
  for (const path of ["docs/private.pem", "notes.local.md", "docs/link.md", "deleted.md"]) assert.equal(source[path], undefined, path);
});

test("public documentation does not embed email addresses or machine home paths", async () => {
  const paths = execFileSync('git', ['ls-files', '-z', '*.md', 'LICENSE'], { encoding:'utf8' }).split('\0').filter(Boolean);
  for (const path of paths) {
    const text = await readFile(path, 'utf8');
    assert.doesNotMatch(text, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, `${path} contains a literal email address`);
    assert.doesNotMatch(text, /\/(?:home|Users)\/[^\s/]+/, `${path} contains a machine-specific home path`);
  }
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

test("Firefox collection waits for approval and rejects changed, unsigned, or untrusted downloads", async () => {
  const released = await readFile(`artifacts/x-anti-slop-${VERSION}-firefox.zip`);
  const files = unzipSync(released);
  const signed = zipSync({ ...files, "META-INF/mozilla.rsa": strToU8("synthetic signature") });
  const url = "https://addons.mozilla.org/firefox/downloads/file/123/addon.xpi";
  const metadata = (bytes = signed) => ({
    version: VERSION, channel: "listed",
    file: { status: "public", url, size: bytes.length, hash: `sha256:${createHash("sha256").update(bytes).digest("hex")}` },
  });
  for (const status of [401, 404]) assert.equal(await signedFirefox(released, VERSION, async () => new Response(null, { status })), null);
  assert.equal(await signedFirefox(released, VERSION, async () => Response.json({ ...metadata(), file: { status: "unreviewed" } })), null);
  assert.equal(await signedFirefox(released, VERSION, async () => Response.json({ ...metadata(), is_disabled: true })), null);
  await assert.rejects(signedFirefox(released, VERSION, async () => new Response(null, { status: 429 })), /429/);
  const responses = [Response.json(metadata()), new Response(null, { status: 302, headers: { location: "https://addons.cdn.mozilla.net/addon.xpi" } }), new Response(signed)];
  assert.deepEqual(await signedFirefox(released, VERSION, async () => responses.shift()!), signed);
  const changed = zipSync({ ...files, "content.js": strToU8("changed code"), "META-INF/mozilla.rsa": strToU8("synthetic signature") });
  const extra = zipSync({ ...files, "extra.js": strToU8("extra code"), "META-INF/mozilla.rsa": strToU8("synthetic signature") });
  for (const [info, body] of [
    [{ ...metadata(), version: "999.0.0" }, signed],
    [{ ...metadata(), channel: "unlisted" }, signed],
    [metadata(), changed], // Wrong AMO checksum/size.
    [metadata(changed), changed], // Valid checksum, different released content.
    [metadata(extra), extra],
    [metadata(released), released], // An unsigned ZIP must never become an XPI.
    [{ ...metadata(), file: { ...metadata().file, url: "https://example.com/addon.xpi" } }, signed],
  ] as const) {
    let calls = 0;
    await assert.rejects(signedFirefox(released, VERSION, async () => ++calls === 1 ? Response.json(info) : new Response(body)));
  }
  let calls = 0;
  await assert.rejects(signedFirefox(released, VERSION, async () => ++calls === 1 ? Response.json(metadata()) :
    new Response(null, { status: 302, headers: { location: "https://example.com/addon.xpi" } })), /Unexpected Mozilla download host/);
  assert.equal(calls, 2, "Never follow a redirect to an unrelated host");
});

test("store checks never submit by default and require the item ID only for a Chrome submission", async () => {
  const workflow = await readFile('.github/workflows/publish-stores.yml', 'utf8');
  assert.match(workflow, /submit:\n(?:[^\n]*\n)*?        default: false/);
  assert.match(workflow, /if: inputs\.submit && inputs\.tag == ''/);
  for (const store of ['chrome', 'firefox']) assert.ok(workflow.includes(`if: inputs.submit && matrix.store == '${store}'`));
  const script = workflow.match(/- name: Check the selected store configuration[\s\S]*?        run: \|\n([\s\S]*?)(?=\n      -)/)?.[1]?.replace(/^          /gm, '');
  assert.ok(script);
  const base = Object.fromEntries(['CHROME_PUBLISHER_ID', 'CHROME_CLIENT_ID', 'CHROME_CLIENT_SECRET', 'CHROME_REFRESH_TOKEN', 'AMO_JWT_ISSUER', 'AMO_JWT_SECRET'].map(name => [name, 'synthetic-private-value']));
  for (const [store, submit, extensionId, issuer, expected] of [
    ['chrome', 'false', '', 'set', 0], ['chrome', 'true', '', 'set', 1],
    ['chrome', 'true', 'item', 'set', 0], ['firefox', 'false', '', 'set', 0],
    ['firefox', 'false', '', '', 1],
  ] as const) {
    const result: SpawnSyncReturns<string> = spawnSync('bash', ['-e', '-u', '-o', 'pipefail', '-c', script], { encoding:'utf8', env:{ PATH:process.env['PATH'], ...base, STORE:store, SUBMIT:submit, CHROME_EXTENSION_ID:extensionId, AMO_JWT_ISSUER:issuer } });
    assert.equal(result.status, expected, result.stdout + result.stderr);
    assert.equal((result.stdout + result.stderr).includes('synthetic-private-value'), false);
  }
});

test("documentation-only changes skip packaging without dropping the required build check", async () => {
  const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
  assert.equal(workflow.includes('paths-ignore:'), false);
  assert.match(workflow, /tags: \['v\*'\]/);
  assert.match(workflow, /^ {2}workflow_dispatch:$/m);
  assert.match(workflow, /if: github\.event_name == 'push' && github\.ref_type == 'tag'/);
  assert.equal([...workflow.matchAll(/steps\.docs\.outputs\.skip != 'true'/g)].length, 8);
  const script = workflow.match(/- name: Check whether the change is documentation only[\s\S]*?        run: \|\n([\s\S]*?)(?=\n      - )/)?.[1]?.replace(/^          /gm, '');
  assert.ok(script);
  const base = 'a'.repeat(40);
  const head = 'b'.repeat(40);
  const before = 'c'.repeat(40);
  const sha = 'd'.repeat(40);
  const zero = '0'.repeat(40);
  const bin = await mkdtemp(join(tmpdir(), 'xas-docs-ci-'));
  const fixturePath = join(bin, 'fixture.json');
  const callsPath = join(bin, 'calls');
  const outputPath = join(bin, 'output');
  const summaryPath = join(bin, 'summary');
  await writeFile(join(bin, 'gh'), [
    '#!/bin/bash',
    'printf \'%s\\n\' "$*" >> "$GH_LOG"',
    'if [[ "${GH_EXIT:-0}" -ne 0 ]]; then echo compare-failed >&2; exit "$GH_EXIT"; fi',
    'cat "$GH_FIXTURE"',
    '',
  ].join('\n'), { mode: 0o755 });
  await chmod(join(bin, 'gh'), 0o755);
  const docs = ['README.md', 'docs/PRIVACY.md', 'docs/nested/note.txt', 'docs/file[1].md', '.github/FUNDING.yml', 'LICENSE', 'LICENSE.txt', '.github/PULL_REQUEST_TEMPLATE.md', 'store-assets/README.md'];
  const files = (paths: { filename: string; previous?: string }[]) => ({ files: paths.map(path => ({ filename: path.filename, previous_filename: path.previous ?? null, status: path.previous ? 'renamed' : 'modified' })) });
  const cases = [
    { name: 'pull request docs', event: 'pull_request', ref: 'branch', base, head, before, sha, body: files(docs.map(filename => ({ filename }))), skip: true, calls: true, range: `${base}...${head}` },
    { name: 'mixed docs and code', event: 'pull_request', ref: 'branch', base, head, before, sha, body: files([{ filename: 'README.md' }, { filename: 'src/content.ts' }]), skip: false, calls: true, range: `${base}...${head}` },
    { name: 'rename from code', event: 'pull_request', ref: 'branch', base, head, before, sha, body: files([{ filename: 'docs/moved.md', previous: 'src/old.ts' }]), skip: false, calls: true, range: `${base}...${head}` },
    { name: 'rename within docs', event: 'pull_request', ref: 'branch', base, head, before, sha, body: files([{ filename: 'docs/MOVED.md', previous: 'README.md' }]), skip: true, calls: true, range: `${base}...${head}` },
    { name: 'workflow file', event: 'pull_request', ref: 'branch', base, head, before, sha, body: files([{ filename: '.github/workflows/ci.yml' }]), skip: false, calls: true, range: `${base}...${head}` },
    { name: 'markdown extension only', event: 'pull_request', ref: 'branch', base, head, before, sha, body: files([{ filename: 'notes.markdown' }]), skip: false, calls: true, range: `${base}...${head}` },
    { name: 'file named docs', event: 'pull_request', ref: 'branch', base, head, before, sha, body: files([{ filename: 'docs' }]), skip: false, calls: true, range: `${base}...${head}` },
    { name: '299 markdown files', event: 'pull_request', ref: 'branch', base, head, before, sha, body: files(Array.from({ length: 299 }, (_, index) => ({ filename: `docs/f${index}.md` }))), skip: true, calls: true, range: `${base}...${head}` },
    { name: '300 markdown files', event: 'pull_request', ref: 'branch', base, head, before, sha, body: files(Array.from({ length: 300 }, (_, index) => ({ filename: `docs/f${index}.md` }))), skip: false, calls: true, range: `${base}...${head}` },
    { name: 'empty file list', event: 'pull_request', ref: 'branch', base, head, before, sha, body: { files: [] }, skip: false, calls: true, range: `${base}...${head}` },
    { name: 'null file list', event: 'pull_request', ref: 'branch', base, head, before, sha, body: { files: null }, skip: false, calls: true, range: `${base}...${head}` },
    { name: 'compare error', event: 'pull_request', ref: 'branch', base, head, before, sha, body: files([{ filename: 'README.md' }]), skip: false, calls: true, range: `${base}...${head}`, ghExit: '1' },
    { name: 'invalid compare body', event: 'pull_request', ref: 'branch', base, head, before, sha, body: 'not-json', skip: false, calls: true, range: `${base}...${head}` },
    { name: 'invalid sha', event: 'pull_request', ref: 'branch', base: 'abc', head, before, sha, body: files([{ filename: 'README.md' }]), skip: false, calls: false },
    { name: 'zero sha', event: 'push', ref: 'branch', base, head, before: zero, sha, body: files([{ filename: 'README.md' }]), skip: false, calls: false },
    { name: 'unchanged sha', event: 'pull_request', ref: 'branch', base, head: base, before, sha, body: files([{ filename: 'README.md' }]), skip: false, calls: false },
    { name: 'push to main', event: 'push', ref: 'branch', base, head, before, sha, body: files([{ filename: 'AGENTS.md' }]), skip: true, calls: true, range: `${before}...${sha}` },
    { name: 'tag push', event: 'push', ref: 'tag', base, head, before, sha, body: files([{ filename: 'README.md' }]), skip: false, calls: false },
    { name: 'manual run', event: 'workflow_dispatch', ref: 'branch', base, head, before, sha, body: files([{ filename: 'README.md' }]), skip: false, calls: false },
  ] as const;
  try {
    for (const item of cases) {
      await writeFile(fixturePath, typeof item.body === 'string' ? item.body : JSON.stringify(item.body));
      await rm(callsPath, { force: true });
      await rm(outputPath, { force: true });
      await rm(summaryPath, { force: true });
      const result: SpawnSyncReturns<string> = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script], {
        encoding: 'utf8',
        env: {
          PATH: `${bin}:${process.env['PATH'] ?? ''}`,
          GH_TOKEN: 'synthetic-private-value',
          GH_LOG: callsPath,
          GH_FIXTURE: fixturePath,
          GH_EXIT: 'ghExit' in item ? item.ghExit : '0',
          GITHUB_OUTPUT: outputPath,
          GITHUB_STEP_SUMMARY: summaryPath,
          GITHUB_REPOSITORY: 'tasarren/x-anti-slop',
          GITHUB_SHA: item.sha,
          EVENT_NAME: item.event,
          REF_TYPE: item.ref,
          BASE_SHA: item.base,
          HEAD_SHA: item.head,
          BEFORE_SHA: item.before,
        },
      });
      const output = result.stdout + result.stderr;
      assert.equal(result.status, 0, `${item.name}\n${output}`);
      assert.equal(output.includes('synthetic-private-value'), false, item.name);
      assert.equal(await readFile(outputPath, 'utf8'), `skip=${item.skip}\n`, item.name);
      const calls = await readFile(callsPath, 'utf8').catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? '' : Promise.reject(error));
      assert.equal(calls.length > 0, item.calls, `${item.name}\n${calls}`);
      if ('range' in item) assert.equal(calls.trim(), `api repos/tasarren/x-anti-slop/compare/${item.range}`, item.name);
      const summary = await readFile(summaryPath, 'utf8').catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? '' : Promise.reject(error));
      assert.equal(summary.includes('install and packaging were skipped'), item.skip, item.name);
      assert.equal(summary.includes('synthetic-private-value'), false, item.name);
    }
  } finally {
    await rm(bin, { recursive: true, force: true });
  }
});

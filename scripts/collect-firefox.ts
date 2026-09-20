import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { strFromU8, unzipSync } from "fflate";

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

// A public AMO download needs no publisher credentials. Keep them out of this job.
export async function signedFirefox(released: Uint8Array, version: string, request = fetch): Promise<Uint8Array | null> {
  const original = unzipSync(released);
  const manifest = JSON.parse(strFromU8(original["manifest.json"]!));
  assert.equal(manifest.version, version, "Release manifest version does not match the tag");
  const id: unknown = manifest.browser_specific_settings?.gecko?.id;
  assert.ok(typeof id === "string" && id.length > 0, "Missing Firefox add-on ID");
  const response = await request(`https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/`, {
    redirect: "error", signal: AbortSignal.timeout(30_000),
  });
  // AMO returns 401 or 404 for versions that are not publicly available yet.
  if (response.status === 401 || response.status === 404) return null;
  assert.ok(response.ok, `AMO version lookup failed: HTTP ${response.status}`);
  const metadata = await response.json();
  assert.equal(metadata.version, version, "AMO returned a different version");
  assert.equal(metadata.channel, "listed", "Only listed releases are distributed here");
  if (metadata.file?.status !== "public" || metadata.is_disabled) return null;
  assert.match(metadata.file.hash, /^sha256:[a-f0-9]{64}$/, "Missing AMO checksum");
  assert.ok(Number.isSafeInteger(metadata.file.size) && metadata.file.size > 0 && metadata.file.size <= 20_000_000, "Unexpected XPI size");

  let url = new URL(metadata.file.url);
  for (let redirects = 0; redirects <= 5; redirects++) {
    assert.ok(url.protocol === "https:" && !url.username && !url.password && !url.port &&
      ["addons.mozilla.org", "addons.cdn.mozilla.net"].includes(url.hostname), "Unexpected Mozilla download host");
    const download = await request(url.href, { redirect: "manual", signal: AbortSignal.timeout(60_000) });
    if ([301, 302, 303, 307, 308].includes(download.status)) {
      const location = download.headers.get("location");
      assert.ok(location, "Missing download redirect");
      await download.body?.cancel();
      url = new URL(location, url);
      continue;
    }
    assert.ok(download.ok, `XPI download failed: HTTP ${download.status}`);
    const bytes = new Uint8Array(await download.arrayBuffer());
    assert.equal(bytes.length, metadata.file.size, "XPI size mismatch");
    assert.equal(`sha256:${sha256(bytes)}`, metadata.file.hash, "XPI checksum mismatch");
    const signed = unzipSync(bytes);
    assert.ok(signed["META-INF/mozilla.rsa"] || signed["META-INF/cose.sig"], "XPI has no signing metadata");
    const signature = /^META-INF\/(?:manifest\.mf|mozilla\.(?:rsa|sf)|cose\.(?:manifest|sig))$/;
    const payload = Object.keys(signed).filter(name => !name.endsWith("/") && !signature.test(name)).sort();
    assert.deepEqual(payload, Object.keys(original).filter(name => !name.endsWith("/")).sort(), "XPI file list differs from the release");
    for (const name of payload) assert.deepEqual(signed[name], original[name], `XPI changes released file: ${name}`);
    return bytes;
  }
  throw new Error("Too many Mozilla download redirects");
}

async function collect(): Promise<void> {
  const requested = process.env["RELEASE_TAG"] || "";
  const tagPattern = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.[1-9]\d*)?$/;
  if (requested) assert.match(requested, tagPattern, "Expected vMAJOR.MINOR.PATCH or vMAJOR.MINOR.PATCH-rc.N");
  const gh = (...args: string[]) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  // ponytail: scheduled runs collect the latest stable release; use RELEASE_TAG for older versions/candidates.
  const release = JSON.parse(gh("release", "view", ...(requested ? [requested] : []), "--json", "tagName,isDraft,assets"));
  const tag: string = release.tagName;
  assert.match(tag, tagPattern);
  assert.equal(release.isDraft, false, "Publish the GitHub release first");
  const version = tag.slice(1).split("-rc.")[0]!;
  const base = `x-anti-slop-${version}-firefox`;
  const xpiName = `${base}.xpi`;
  const sumName = `${xpiName}.sha256`;
  const assets = new Set<string>(release.assets.map((asset: { name: string }) => asset.name));
  const report = async (message: string) => {
    console.log(message);
    if (process.env["GITHUB_STEP_SUMMARY"]) await appendFile(process.env["GITHUB_STEP_SUMMARY"], `${message}\n`);
  };
  if (assets.has(xpiName) && assets.has(sumName)) {
    await report(`${tag}: signed Firefox download is already attached.`);
    return;
  }
  const directory = await mkdtemp(join(tmpdir(), "xas-signed-"));
  try {
    gh("release", "download", tag, "--dir", directory, "--pattern", `${base}.zip`, "--pattern", "SHA256SUMS.txt");
    const released = await readFile(join(directory, `${base}.zip`));
    const sums = await readFile(join(directory, "SHA256SUMS.txt"), "utf8");
    assert.ok(sums.split("\n").includes(`${sha256(released)}  ${base}.zip`), "Released ZIP checksum mismatch");
    const signed = await signedFirefox(released, version);
    if (!signed) {
      await report(`${tag}: the signed Firefox version is not public on AMO yet. The next scheduled run will check again.`);
      return;
    }
    const files = new Map<string, Uint8Array>([
      [xpiName, signed], [sumName, Buffer.from(`${sha256(signed)}  ${xpiName}\n`)],
    ]);
    const missing: string[] = [];
    for (const [name, bytes] of files) {
      const path = join(directory, name);
      if (assets.has(name)) {
        gh("release", "download", tag, "--dir", directory, "--pattern", name);
        assert.equal(sha256(await readFile(path)), sha256(bytes), `Existing ${name} differs; refusing to replace it`);
      } else {
        await writeFile(path, bytes);
        missing.push(path);
      }
    }
    // No --clobber: a retry can fill missing assets, but cannot overwrite any.
    gh("release", "upload", tag, ...missing);
    await report(`${tag}: attached ${xpiName} and its SHA-256 checksum. The signed contents match the released Firefox ZIP.`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await collect();

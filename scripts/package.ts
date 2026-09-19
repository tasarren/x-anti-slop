import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { zipSync } from "fflate";
import { VERSION } from "./version.ts";

await rm("artifacts", { recursive: true, force: true });
await mkdir("artifacts", { recursive: true });
const checksums: string[] = [];
for (const target of ["chromium", "firefox", "source"]) {
  const root = target === "source" ? "." : join("dist", target);
  const files: Record<string, Uint8Array> = {};
  const paths: string[] = [];
  if (target === "source") {
    // Native Git honors .gitignore, .git/info/exclude and contributors' global excludes.
    const candidates = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--deduplicate", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
    for (const path of candidates) {
      const stat = await lstat(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined;
        throw error;
      });
      if (stat?.isFile()) paths.push(path);
    }
  } else {
    for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
      if (entry.isFile()) paths.push(join(entry.parentPath, entry.name));
    }
  }
  for (const path of paths.sort()) {
    files[relative(root, path).replaceAll("\\", "/")] = new Uint8Array(await readFile(path));
  }
  const name = `x-anti-slop-${VERSION}-${target}.zip`;
  // Fixed timestamps make a tag rebuild byte-for-byte reproducible.
  const zip = zipSync(files, { level: 9, mtime: new Date(2000, 0, 1) });
  await writeFile(`artifacts/${name}`, zip);
  checksums.push(`${createHash("sha256").update(zip).digest("hex")}  ${name}`);
  console.log(`artifacts/${name}`);
}
await writeFile("artifacts/SHA256SUMS.txt", checksums.join("\n") + "\n");

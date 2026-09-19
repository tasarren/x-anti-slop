import { readFileSync } from "node:fs";

const pkg: unknown = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
if (typeof pkg !== "object" || pkg === null || !("version" in pkg) || typeof pkg.version !== "string" ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(pkg.version) ||
    pkg.version.split(".").some(part => Number(part) > 65535) || pkg.version === "0.0.0") {
  throw new Error("package.json must contain a browser-compatible major.minor.patch version.");
}
export const VERSION = pkg.version;

export function assertReleaseTag(tag: string): void {
  const allowed = new RegExp(`^v${VERSION.replaceAll(".", "\\.")}(?:-rc\\.[1-9]\\d*)?$`);
  if (!allowed.test(tag)) throw new Error(`Release tag ${tag} must match v${VERSION} or v${VERSION}-rc.N`);
}

if (process.env["RELEASE_TAG"]) assertReleaseTag(process.env["RELEASE_TAG"]);

import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { VERSION } from "./version.ts";

const license = process.env["AMO_LICENSE"];
if (!license || !process.env["WEB_EXT_API_KEY"] || !process.env["WEB_EXT_API_SECRET"]) {
  throw new Error("Set AMO_LICENSE, AMO_JWT_ISSUER and AMO_JWT_SECRET in the firefox-store GitHub environment before submitting.");
}
const metadata = {
  summary: { "en-US": "Hide posts on X using your own regular-expression filters." },
  categories: ["other"],
  version: {
    license,
    approval_notes: "TypeScript sources and package-lock.json are included in the source archive. Use Node 24, run npm ci followed by npm run build. The submitted extension is dist/firefox. No data is collected or transmitted.",
  },
};
await writeFile("artifacts/amo-metadata.json", JSON.stringify(metadata, null, 2));
execFileSync(process.execPath, [
  "node_modules/web-ext/bin/web-ext.js", "sign", "--source-dir", "dist/firefox", "--channel", "listed",
  "--amo-metadata", "artifacts/amo-metadata.json", "--upload-source-code", `artifacts/x-anti-slop-${VERSION}-source.zip`,
  "--artifacts-dir", "artifacts/signed", "--approval-timeout", "0", "--no-input",
], { stdio: "inherit" });
console.log("Firefox submission sent. Check AMO for review status and the eventual signed download.");

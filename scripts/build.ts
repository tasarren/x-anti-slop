import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { VERSION } from "./version.ts";

await rm("dist", { recursive: true, force: true });
await mkdir("dist/chromium", { recursive: true });
await cp("public", "dist/chromium", { recursive: true });
const manifest: unknown = JSON.parse(await readFile("public/manifest.json", "utf8"));
if (typeof manifest !== "object" || manifest === null) throw new Error("Invalid manifest");
await writeFile("dist/chromium/manifest.json", JSON.stringify({ ...manifest, version: VERSION }, null, 2) + "\n");
const html = await readFile("public/options.html", "utf8");
await writeFile("dist/chromium/options.html", html.replaceAll("__VERSION__", VERSION));
await build({
  entryPoints: ["src/content.ts", "src/options.ts"],
  outdir: "dist/chromium", bundle: true, format: "iife",
  target: ["chrome109", "firefox140"], legalComments: "none",
});
await cp("dist/chromium", "dist/firefox", { recursive: true });
await writeFile("dist/firefox/manifest.json", JSON.stringify({
  ...manifest, version: VERSION,
  browser_specific_settings: { gecko_android: { strict_min_version: "142.0" }, gecko: {
    id: "x-anti-slop@tasarren.github.io", strict_min_version: "140.0",
    data_collection_permissions: { required: ["none"] },
  } },
}, null, 2) + "\n");
console.log("Built dist/chromium and dist/firefox.");

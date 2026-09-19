import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

// A local UI preview only; this storage substitute is never packaged in the extension.
const mock = `<script>window.chrome={storage:{local:{get:async()=>({}),set:async()=>{}}}};</script>`;
const allowed = new Map([
  ["/", ["options.html", "text/html"]],
  ["/options.css", ["options.css", "text/css"]],
  ["/options.js", ["options.js", "text/javascript"]],
]);
createServer((request, response) => {
  const asset = allowed.get(request.url ?? "/");
  if (!asset) { response.writeHead(404).end(); return; }
  const [file, type] = asset;
  void readFile(`dist/chromium/${file}`, "utf8").then(body => {
    response.writeHead(200, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store" });
    response.end(file === "options.html" ? body.replace("<head>", `<head>${mock}`).replace("<main>", '<main><p class="privacy">Settings preview · Changes here do not affect X.</p>') : body);
  }).catch(() => response.writeHead(500).end("Build the extension first with npm run build."));
}).listen(4173, "127.0.0.1", () => console.log("Settings preview: http://127.0.0.1:4173"));

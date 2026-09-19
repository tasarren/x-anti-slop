import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

// A local UI preview only; this storage substitute is never packaged in the extension.
const mock = `
const memory = window.parent === window ? {data:{},listeners:new Set()} : window.parent.xasPreview;
window.xasPreview = memory;
const listeners = new Set();
window.addEventListener('pagehide',()=>listeners.forEach(fn=>memory.listeners.delete(fn)));
function change(values){Object.assign(memory.data,values);const event=Object.fromEntries(Object.entries(values).map(([key,newValue])=>[key,{newValue}]));memory.listeners.forEach(fn=>fn(event,'local'));}
window.chrome={runtime:{getURL:path=>new URL(path==='options.html'?'/':path.startsWith('icons/')?'/icon.png':path,location.origin).href},storage:{onChanged:{addListener:fn=>{listeners.add(fn);memory.listeners.add(fn);}},local:{
get:async()=>structuredClone(memory.data),set:async values=>change(values),remove:async key=>change({[key]:undefined})
}}};`;
const allowed = new Map([
  ["/", ["options.html", "text/html"]],
  ["/options.css", ["options.css", "text/css"]],
  ["/options.js", ["options.js", "text/javascript"]],
  ["/content.js", ["content.js", "text/javascript"]],
  ["/content.css", ["content.css", "text/css"]],
]);
createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:4173");
  if (url.pathname === "/preview.js") {
    response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" }).end(mock);
    return;
  }
  const showcase = new Map([
    ["/showcase", ["showcase.html", "text/html"]],
    ["/showcase.css", ["showcase.css", "text/css"]],
    ["/showcase.js", ["showcase.js", "text/javascript"]],
  ]).get(url.pathname);
  if (showcase) {
    void readFile(`store-assets/${showcase[0]}`).then(body => {
      response.writeHead(200, { "Content-Type": `${showcase[1]}; charset=utf-8`, "Cache-Control": "no-store" }).end(body);
    }).catch(() => response.writeHead(404).end());
    return;
  }
  if (url.pathname === "/demo" || url.pathname === "/icon.png") {
    const demo = url.pathname === "/demo";
    void readFile(demo ? "store-assets/demo.html" : "public/icons/128.png").then(body => {
      response.writeHead(200, { "Content-Type": demo ? "text/html; charset=utf-8" : "image/png" });
      response.end(body);
    }).catch(() => response.writeHead(404).end());
    return;
  }
  const asset = allowed.get(url.pathname);
  if (!asset) { response.writeHead(404).end(); return; }
  const [file, type] = asset;
  void readFile(`dist/chromium/${file}`, "utf8").then(body => {
    response.writeHead(200, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store" });
    if (file === "options.html") {
      body = body.replace("<head>", '<head><script src="/preview.js"></script>');
      if (url.searchParams.has("screenshot")) body = body.replace("</head>", '<style>:root{color-scheme:light;font-family:"DejaVu Sans",sans-serif}body{margin:0}</style></head>');
      else if (url.searchParams.has("showcase")) body = body.replace("</head>", '<style>:root{font-family:Arial,Helvetica,sans-serif}body{margin:0}main{padding:18px 22px}.intro{margin:16px 0}h1{font-size:26px}</style></head>');
      else if (!url.searchParams.has("embedded")) body = body.replace("<main>", '<main><p class="privacy">Settings preview · Changes here do not affect X.</p>');
    }
    response.end(body);
  }).catch(() => response.writeHead(500).end("Build the extension first with npm run build."));
}).listen(4173, "127.0.0.1", () => console.log("Settings preview: http://127.0.0.1:4173"));

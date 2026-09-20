// Run through the in-app browser's CDP capability on the local /showcase page.
// Cursor positions are sampled at 60 fps and composited later to avoid browser flicker.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function createRecorder(cdp, output, screenshots) {
  await mkdir(join(output, 'captures'), { recursive: true });
  const frames = [], paths = [];
  let cursor = { x: 410, y: 185 }, captureCount = 0;
  const run = async expression => {
    const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error('Showcase action failed: ' + result.exceptionDetails.text);
    return result.result.value;
  };
  const capture = async () => {
    const bounds = await run(`(()=>{const r=document.querySelector('#artboard').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,viewportWidth:innerWidth,viewportHeight:innerHeight};})()`);
    if (bounds.y + bounds.height > bounds.viewportHeight + 1) throw new Error('Artboard exceeds viewport');
    const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const bytes = Buffer.from(result.data, 'base64');
    const ratio = bytes.readUInt32BE(16) / bounds.viewportWidth;
    const crop = { x:Math.round(bounds.x*ratio),y:Math.round(bounds.y*ratio),width:Math.round(bounds.width*ratio),height:Math.round(bounds.height*ratio) };
    if (crop.y + crop.height > bytes.readUInt32BE(20) + 1) throw new Error('Screenshot clipped the artboard');
    const path = join(output, 'captures', `${String(captureCount++).padStart(5, '0')}.png`);
    await writeFile(path, bytes);
    await writeFile(path+'.json',JSON.stringify(crop));
    frames.push({ path, ...cursor });
    return { path, bytes };
  };
  const hold = async seconds => {
    const { path } = await capture();
    for (let i = 1; i < Math.round(seconds * 60); i++) frames.push({ path, ...cursor });
  };
  const ease = t => t * t * t * (t * (t * 6 - 15) + 10);
  const move = async (point, seconds = .85) => {
    const from = cursor, count = Math.round(seconds * 60);
    const { path } = await capture();
    for (let i = 1; i <= count; i++) {
      const t = ease(i / count);
      cursor = { x: from.x + (point.x - from.x) * t, y: from.y + (point.y - from.y) * t };
      paths.push({ frame: frames.length, ...cursor });
      frames.push({ path, ...cursor });
    }
  };
  const selectorCode = (selector, inFrame) => `${inFrame ? "document.querySelector('#xas-settings-panel iframe').contentDocument" : 'document'}.querySelector(${JSON.stringify(selector)})`;
  const click = async (selector, inFrame = false) => {
    const point = await run(`(()=>{const element=${selectorCode(selector, inFrame)};if(!element)throw Error('Missing control');const r=element.getBoundingClientRect();const z=parseFloat(document.documentElement.style.zoom);const f=${inFrame ? "document.querySelector('#xas-settings-panel iframe').getBoundingClientRect()" : 'null'};return f?{x:f.left/z+r.x+r.width/2,y:f.top/z+r.y+r.height/2}:{x:(r.x+r.width/2)/z,y:(r.y+r.height/2)/z};})()`);
    if (point.y < 0 || point.y > 710) throw new Error('Scroll the target into view before clicking');
    await move(point);
    await hold(.2);
    await run(`${selectorCode(selector, inFrame)}.click(); new Promise(resolve=>setTimeout(resolve,80))`);
    const { path } = await capture();
    for (let i = 0; i < 14; i++) frames.push({ path, ...cursor, ring: i / 14 });
  };
  const scroll = async (top, seconds = .8) => {
    const from = await run("document.querySelector('#xas-settings-panel iframe').contentWindow.scrollY");
    for (let i = 1; i <= seconds * 60; i++) {
      await run(`document.querySelector('#xas-settings-panel iframe').contentWindow.scrollTo(0,${from + (top - from) * ease(i / (seconds * 60))});void 0`);
      await capture();
    }
  };
  const type = async (selector, value) => {
    for (let i = 1; i <= value.length; i++) {
      await run(`(()=>{const el=${selectorCode(selector, true)};el.value=${JSON.stringify(value.slice(0,i))};el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await hold(.07);
    }
  };
  const caption = async (step, headline) => run(`document.querySelector('#step').textContent=${JSON.stringify(step)};document.querySelector('#headline').textContent=${JSON.stringify(headline)};void 0`);
  const shot = async (name, step, headline) => {
    await caption(step, headline);
    await run("document.querySelector('#cursor').style.display='none';void 0");
    const { bytes } = await capture();
    await writeFile(join(screenshots, name), bytes);
    await writeFile(join(screenshots, name+'.crop.json'),await readFile(frames.at(-1).path+'.json'));
  };
  await run(`window.fitShowcase=()=>{document.documentElement.style.zoom=String(Math.min(innerWidth/1280,innerHeight/800))};fitShowcase();addEventListener('resize',fitShowcase);document.body.append(document.querySelector('#cursor'),document.querySelector('#click-ring'));void 0`);
  return { run, hold, move, click, scroll, type, caption, shot,
    async finish() {
      await writeFile(join(output,'frames.json'),JSON.stringify(frames));
      const metadata = { width:1280,height:800,fps:60,captureFrames:captureCount,outputFrames:frames.length,durationSeconds:frames.length/60,launcher:'Left navigation, between More and Post',source:'Fictional X mock with the production extension bundles',motion:{easing:'quintic ease-in-out',sampleRate:60,movingFrames:paths.length},framing:{fullCanvas:true} };
      await writeFile(join(output,'recording.json'),JSON.stringify(metadata,null,2)+'\n');
      await writeFile(join(output,'paths.json'),JSON.stringify(paths));
      return metadata;
    }
  };
}

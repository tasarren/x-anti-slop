# Store visuals

## Individual store screenshots

These are separate **1280×800 RGB PNGs**, ready for a store screenshot gallery. They use a local mock of X's dark timeline with fictional accounts and posts. The extension's actual content script, settings editor and storage-change flow drive the demonstrated behavior. The small caption identifies the mock; none of these images contain the owner's timeline or imply that X endorses the extension.

| Image | Feature |
| --- | --- |
| [01-compact-filtering.png](screenshots/01-compact-filtering.png) | Matching posts become compact notices |
| [02-account-whitelist.png](screenshots/02-account-whitelist.png) | A whitelisted account stays visible, with its tiny green star |
| [03-reveal-post.png](screenshots/03-reveal-post.png) | Show reveals a filtered post without removing the filter |
| [04-custom-regex.png](screenshots/04-custom-regex.png) | Add a custom expression and test sample text in the real settings UI |
| [05-complete-removal.png](screenshots/05-complete-removal.png) | Matching rows collapse completely; whitelisted accounts remain |
| [06-quote-filtering.png](screenshots/06-quote-filtering.png) | A matching quote is hidden while the citing author's comment stays visible |

Suggested gallery order is the numerical order above. Both Chrome and Mozilla recommend/support 1280×800 screenshots; use these static files for store screenshot fields.

## Animated walkthrough

- [60 fps MP4](animation/x-anti-slop-demo.mp4): **1280×800**, about **47 seconds**, the full-quality motion master.
- [60 fps animated WebP](animation/x-anti-slop-demo-60fps.webp): **1280×800**, a full-canvas looping image version with millisecond frame timing.
- [Compatibility GIF](animation/x-anti-slop-demo.gif): **960×600**, sampled at **50 fps** for GIF's 20ms timing. Use MP4 or WebP when 60 fps motion is required.

Sequence: open the real card between More and Post → enable/save filters → compact notices → reveal and whitelist an author → reveal another post → add and test a custom regex → switch to complete removal. Cursor motion and click rings are presentation overlays; the controls trigger real extension behavior. The settings and timeline use an in-memory substitute for extension storage, isolated from X and from installed extension preferences.

The GIF is a separate promotional asset, not a replacement for the stores' static screenshot fields. The MP4 is a source file for any supported promotional-video workflow; it has not been uploaded or hosted anywhere.

## Recreate captures

Run `npm run build`, then `npm run preview`, and open `http://127.0.0.1:4173/showcase`. Source files are `showcase.html`, `showcase.css` and `showcase.js`. The fictional feed reproduces X's three-column layout, post headers/actions, composer, tabs and colors. It is a visual mock, not an exported live X page.

The settings card and panel are created by the production `src/launcher.ts` implementation. All current captures show the card between **More** and **Post** on the left. The card becomes icon-only in a narrow rail. The preview substitutes local storage/resource URLs for extension APIs and reserves the bottom caption strip when positioning the real settings panel; it does not implement a separate settings launcher.

Capture the 1280×800 `#artboard`, including its caption. `#step` and `#headline` are presentation text; `#cursor` and `#click-ring` are optional recording overlays. Use the Settings button to open the real extension editor. Reloading the page clears its simulated preferences. Do not use personal X data for store images.

**Framing check:** browser zoom and display scaling can change between capture sessions. Calibrate against a fresh rendered frame instead of reusing a fixed zoom multiplier. The output being 1280×800 is not enough: the artboard and green footer must reach both bottom corners, and the complete right sidebar must be visible. Check the decoded MP4, WebP and GIF too. A quarter-sized scene surrounded by black pixels is a failed capture, even if the file dimensions and frame rate are correct.

The walkthrough uses lossless browser frames and FFmpeg. `record.mjs` drives the local showcase through the in-app browser's CDP capability and records real UI state changes and scrolling. Smooth cursor paths use quintic easing sampled at **60 fps**, with pauses before clicks. The cursor is composited separately to reduce browser flicker while recording. Static holds intentionally reuse captures; moving cursor frames have distinct positions. Temporary captures stay outside the repository.

After recording with `createRecorder(cdp, outputDirectory, screenshotDirectory)` and calling `finish()`, run `python store-assets/encode.py outputDirectory` (requires Pillow and FFmpeg). This crops each capture to the measured full artboard, normalizes it to 1280×800, verifies the caption reaches both bottom corners, and encodes the MP4. Capture helpers never access the signed-in timeline or store credentials. The WebP is encoded at 60 fps; the compatibility GIF is sampled at 50 fps because GIF cannot represent a constant 1/60-second frame delay.

The Grok navigation icon uses the SVG path observed in X's navigation, sized consistently with the surrounding icons. It is included only to reproduce X's UI, not as extension branding or an endorsement.

## Artwork and earlier overview

- `icon.svg` is the editable source for `public/icons/16.png`, `32.png`, `48.png`, and `128.png`.
- `promo.svg` is the editable source for the opaque RGB `promo-440x280.png`.
- `screenshot-1280x800.jpg` is the earlier combined overview. Prefer the individual screenshots above for the store gallery.
- `demo.html` is the local demonstration used for capture. Run `npm run build`, then `npm run preview`, and open `http://127.0.0.1:4173/demo`. Capture the 1280×800 artboard at normal rendering scale; the page is for store demonstrations only and never ships inside the extension.

The SVGs can be exported from any vector editor. With librsvg and ImageMagick installed:

```sh
for size in 16 32 48 128; do
  rsvg-convert --width "$size" --height "$size" icon.svg --output "../public/icons/$size.png"
done
rsvg-convert promo.svg | magick - PNG24:promo-440x280.png
```

Keep the 128px icon's transparent padding. The small promotional image and screenshot have no alpha channel. Review [Chrome's image requirements](https://developer.chrome.com/docs/webstore/images) before uploading. All artwork is covered by the project's MIT license.

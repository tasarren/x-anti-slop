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

Suggested gallery order is the numerical order above. Both Chrome and Mozilla recommend/support 1280×800 screenshots; use these static files for store screenshot fields.

## Animated walkthrough

- [60 fps MP4](animation/x-anti-slop-demo.mp4): **1280×800**, about **32 seconds**, the full-quality motion master.
- [60 fps animated WebP](animation/x-anti-slop-demo-60fps.webp): **1280×800**, a full-canvas looping image version with millisecond frame timing.
- [Compatibility GIF](animation/x-anti-slop-demo.gif): **960×600**, sampled at **50 fps** for GIF's 20ms timing. Use MP4 or WebP when 60 fps motion is required.

Sequence: unfiltered timeline → enable/save filters → compact notices → reveal a post → whitelist its author with the tiny star → switch to complete removal. Cursor motion and click rings are presentation overlays; the controls trigger real extension behavior. The settings and timeline use an in-memory substitute for extension storage, isolated from X and from installed extension preferences.

The GIF is a separate promotional asset, not a replacement for the stores' static screenshot fields. The MP4 is a source file for any supported promotional-video workflow; it has not been uploaded or hosted anywhere.

## Recreate captures

Run `npm run build`, then `npm run preview`, and open `http://127.0.0.1:4173/showcase`. Source files are `showcase.html`, `showcase.css` and `showcase.js`. The fictional feed reproduces X's three-column layout, post headers/actions, composer, tabs and colors. It is a visual mock, not an exported live X page.

The settings card and panel are now created by the production `src/launcher.ts` implementation. Its current location is between **More** and **Post** on the left; the card becomes icon-only in a narrow rail. Earlier captures show the former right-side placement and should be refreshed before store submission. The preview only substitutes local storage/resource URLs for extension APIs; it does not implement a separate settings launcher.

Capture the 1280×800 `#artboard`, including its caption. `#step` and `#headline` are presentation text; `#cursor` and `#click-ring` are optional recording overlays. Use the Settings button to open the real extension editor. Reloading the page clears its simulated preferences. Do not use personal X data for store images.

**Framing check:** browser zoom and display scaling can change between capture sessions. Calibrate against a fresh rendered frame instead of reusing a fixed zoom multiplier. The output being 1280×800 is not enough: the artboard and green footer must reach both bottom corners, and the complete right sidebar must be visible. Check the decoded MP4, WebP and GIF too. A quarter-sized scene surrounded by black pixels is a failed capture, even if the file dimensions and frame rate are correct.

The walkthrough was captured as lossless browser frames and encoded with FFmpeg. Cursor paths, click pulses and settings scrolling are independently sampled at **60 fps**, with pauses before clicks. The master is not a 25 fps recording repackaged with duplicate movement frames. Static holds intentionally repeat frames. No cursor repositioning jumps are used between actions. Temporary capture frames stay outside the repository; only the finished media and non-personal recording metadata are kept.

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

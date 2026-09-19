# X-Anti-Slop

A small TypeScript browser extension that hides posts on X when their text matches one of your regular expressions. Built for current Chromium browsers (Chrome, Edge, Brave, Vivaldi, Opera, etc.) and Firefox browsers with Manifest V3 support.

**Download the latest release** · CI builds · [Releases and store setup](docs/RELEASING.md) · [Privacy](docs/PRIVACY.md)

- Editable filter list with per-filter enable switches, flags, and syntax validation.
- Default: a 50px row saying **“This post is hidden by X-Anti-Slop”**, with a **Show** button.
- Optional complete row collapse with no message or reserved gap.
- Settings apply immediately to open X tabs after saving.
- Covers newly loaded and updated posts, quoted post text, line breaks, and emoji text.
- All settings and matching stay on your device. No runtime dependencies, server, analytics, or API keys.

## Install the prepared build

### Chrome, Edge, Brave, Vivaldi, and other Chromium browsers

1. Open your browser's extensions page (`chrome://extensions`, `edge://extensions`, or its equivalent).
2. Turn on **Developer mode** and select **Load unpacked**.
3. Choose the **`dist/chromium`** directory in this project. If using the ZIP, extract it first and choose the extracted directory containing `manifest.json`.
4. Reload any already-open X tabs once, then pin/open X-Anti-Slop to edit filters.

See the [official Chrome instructions](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

### Firefox and Firefox-based browsers

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on**.
3. Choose **`dist/firefox/manifest.json`**.
4. Allow access to X if prompted, reload already-open X tabs, and open the extension's toolbar button.

Temporary Firefox installations last until the browser restarts. Permanent installation on standard Firefox requires Mozilla signing. The provided ZIP is an unsigned distribution archive, not a signed installable XPI. If using the ZIP, extract it and choose the extracted `manifest.json`. See [Mozilla's temporary installation guide](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/).

The Firefox manifest targets desktop Firefox 140+ and Android Firefox 142+; Chromium output targets 109+. Browser forks must support the corresponding WebExtension APIs. Mobile Chromium browsers without extension support cannot load it. [Mozilla documents the browser-specific manifest fields here](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings).

## Filters

The default pattern preserves the exact characters from the request, including the invisible U+200E left-to-right marks. They are displayed as escapes so they are visible in the editor:

```regex
.?[\u200e—\u200e«»].?
```

The default uses the `u` flag. If you only want the three visible punctuation marks, edit it to `[—«»]`.

Enter patterns **without surrounding slashes**, and enter flags separately. A post is hidden if **any enabled filter** matches. An empty filter list hides nothing.

| Pattern | Flags | Matches |
| --- | --- | --- |
| `[—«»]` | `u` | An em dash or either guillemet |
| `\b(giveaway\|airdrop)\b` | `i` | Either word, ignoring case |
| `^sponsored` | `im` | A line beginning with “sponsored” |

**Save changes** applies the list and display mode. **Reset defaults** only edits the form; save to apply the reset. **Show** reveals a post until it is recycled, its text/identity changes, or settings are saved again. Pause filtering to restore all mounted posts.

These are personal text filters. Punctuation does not reliably identify AI authorship, and these filters can also hide human writing.

## Development

Requires Node.js 22.18+ and npm.

```sh
npm ci
npm test
npm run package
```

- `npm run typecheck`: strict TypeScript checks.
- `npm run build`: produces `dist/chromium` and `dist/firefox`.
- `npm test`: builds/packages and runs extension, release, and publishing regression checks.
- `npm run package`: checks, builds, validates Firefox, and creates versioned browser/source ZIPs and checksums in `artifacts`.
- `npm run validate:firefox`: validates the Firefox build using the pinned Mozilla tool.
- `npm run preview`: opens a local settings UI preview at `http://127.0.0.1:4173` after a build. Its storage is simulated; it does not save preferences or affect X.

After rebuilding, reload the unpacked/temporary extension and then reload X. To validate the Firefox manifest separately:

```sh
npm run validate:firefox
```

## How it works

The content script finds `article[data-testid="tweet"]` and reads descendant `[data-testid="tweetText"]` nodes. It does not match display names, handles, timestamps, or action labels. Quoted post bodies count as part of the containing post. Emoji image alt text and `<br>` line breaks are included.

For a normal timeline row, it changes the size of the containing `[data-testid="cellInnerDiv"]`. The original post stays in the DOM so X keeps ownership of its nodes and can reuse them safely. When a row contains multiple posts, the script handles individual articles. A batched MutationObserver handles scrolling, edits, client-side navigation, and recycled content. The observer is disconnected during extension DOM writes to avoid feedback loops.

`storage.local` persists settings; storage change events update each open X tab. Only the `storage` permission and content-script access to X/Twitter are used. All scripts are bundled locally.

| File | Responsibility |
| --- | --- |
| `src/settings.ts` | Validated preferences, default filter, regex matching |
| `src/content.ts` | Post discovery, row hiding, reveal, restoration, observation |
| `src/options.ts` | Settings form, validation, tester, persistence |
| `src/extension.ts` | Select Firefox's `browser` or Chromium's `chrome` API |
| `public/` | Manifest, settings HTML/CSS, injected row styles |
| `scripts/` | TypeScript build, ZIP packaging, local UI preview |
| `tests/check.ts` | Regression checks for filtering, storage, UI, and packages |

GitHub Actions creates downloadable builds for pull requests and `main`. Pushing a matching version tag such as `v0.1.0` creates a GitHub Release. The version stays **0.1.0** until the owner requests a bump; further work gets CI artifacts without replacing the release. Store submissions are a separate manual workflow. See [the release guide](docs/RELEASING.md) for credentials, first-publication steps, and version rules.

## Limits and verification

- Matches text currently rendered by X, including text loaded by **Show more** when expanded. It does not fetch full truncated posts, perform image OCR, or transcribe video/audio.
- X can change its markup. The selectors above were verified against a signed-in timeline on 2026-09-19.
- Uses native JavaScript regex semantics. Global/sticky cursors reset for every post. Invalid enabled filters block saving; corrupt stored settings pause filtering rather than hide arbitrary posts.
- Regexes execute synchronously. Very expensive backtracking patterns can stall a tab; this version is intended for personally authored filters, with no remote filter subscriptions or imported lists.
- Live Chromium timeline checks verified a 50px notice, 0px complete removal with no following gap, and restoration through **Show**. Temporary test modifications were removed afterward.
- Automated checks cover dynamic and edited posts, quote text, recycled identities, orphan cleanup, pause/removal, emoji/newlines, both API namespaces, invalid patterns, storage failures, empty lists, and the initial-storage race.
- Firefox receives a separate manifest and static validation. A full extension installation and Firefox runtime test remain manual release checks.

Not affiliated with X or any browser vendor.

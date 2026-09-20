# X-Anti-Slop

A small TypeScript browser extension that hides posts on X when their text matches one of your regular expressions. Built for current Chromium browsers (Chrome, Edge, Brave, Vivaldi, Opera, etc.) and Firefox browsers with Manifest V3 support.

Get builds from this repository's **Actions** or **Releases** pages. Report bugs under **Issues**.

[Contribute](CONTRIBUTING.md) · [Development](docs/DEVELOPMENT.md) · [Store setup](docs/STORE_SETUP.md) · [Privacy](docs/PRIVACY.md)

Version: **0.1.0** · License: **[MIT](LICENSE)**. Official store listings are not live yet. GitHub ZIPs use the developer installation steps below.

- Editable filter list with per-filter enable switches, flags, and syntax validation.
- Whitelist accounts with the small star beside their name or on a hidden-post notice; manage the list in settings.
- Default: a 50px row saying **“This post is hidden by X-Anti-Slop”**, with a **Show** button.
- Optional complete row collapse with no message or reserved gap.
- Settings apply immediately to open X tabs after saving.
- A settings card between **More** and **Post** opens the real editor over X; it becomes an icon in the narrow navigation rail.
- Filters posts and quoted posts independently, including newly loaded text, line breaks, and emoji text.
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
4. Allow access to X if prompted and reload already-open X tabs. Use **X-Anti-Slop** between **More** and **Post**, or open it from Firefox's puzzle-piece menu.

For a permanent toolbar shortcut, open Firefox's extensions menu, find X-Anti-Slop and select **Pin to Toolbar**. New installs request toolbar placement; Firefox preserves an existing installation's placement choice. See [Mozilla's toolbar guide](https://support.mozilla.org/en-US/kb/extensions-button).

Temporary Firefox installations last until the browser restarts. Permanent installation on standard Firefox requires Mozilla signing. The provided ZIP is an unsigned distribution archive, not a signed installable XPI. If using the ZIP, extract it and choose the extracted `manifest.json`. See [Mozilla's temporary installation guide](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/).

The Firefox manifest targets desktop Firefox 140+ and Android Firefox 142+; Chromium output targets 109+. Browser forks must support the corresponding WebExtension APIs. Mobile Chromium browsers without extension support cannot load it. [Mozilla documents the browser-specific manifest fields here](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings).

## Filters

Click the on-page card to open a floating settings panel without leaving X. In the narrow left navigation, click its icon; if the navigation disappears entirely, a small floating icon remains near the bottom-right corner. **Save changes** updates the timeline immediately. Close with **×** or **Escape**, or choose **Open in tab**. Reopening the panel preserves an unsaved draft until the page is reloaded.

The default matches only an em dash or either guillemet. Invisible direction and spacing marks are not included:

```regex
.?[—«»].?
```

The default uses the `u` flag. `[—«»]` is equivalent for deciding whether a post matches. If you saved the earlier prototype default, use **Reset defaults → Save changes** to replace it; custom filters are not silently rewritten.

Enter patterns **without surrounding slashes**, and enter flags separately. A post is hidden if **any enabled filter** matches. An empty filter list hides nothing.

| Pattern | Flags | Matches |
| --- | --- | --- |
| `[—«»]` | `u` | An em dash or either guillemet |
| `\b(giveaway\|airdrop)\b` | `i` | Either word, ignoring case |
| `^sponsored` | `im` | A line beginning with “sponsored” |

**Save changes** applies the list and display mode. **Reset defaults** only edits the form; save to apply the reset. **Show** reveals a post until it is recycled, its text/identity changes, or settings are saved again. Pause filtering to restore all mounted posts.

These are personal text filters. Punctuation does not reliably identify AI authorship, and these filters can also hide human writing.

## Account whitelist

Click the **small star** next to a post's author, or **Whitelist** on its hidden-post notice, to always show posts by that account. The star fills green when whitelisted; click it again to resume filtering. Hover for the account/action tooltip. In complete-removal mode, add the handle under **Account whitelist** in settings, or temporarily switch to notices to access the post.

Account changes save immediately and update open X tabs. You can add a handle with or without `@` and remove entries in settings. Handles are case-insensitive and stored locally; this does not follow, mute, or block anyone on X. The whitelist follows the current handle, not an account's permanent identity, so update it if the account renames itself.

Posts and their quotes have separate authors and separate filtering. Whitelisting the citing author keeps their own text visible; matching quotes by other authors can still be hidden. Whitelisting a quoted author exempts that quote, without exempting the citing author's own text. **Reset defaults** resets filter/display preferences and preserves the whitelist.

## Contribute and develop

Use Git, Node 24 (CI's version), and npm. Node 22.18+ is supported.

```sh
npm ci
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

See [CONTRIBUTING.md](CONTRIBUTING.md) for issues and PRs, [DEVELOPMENT.md](docs/DEVELOPMENT.md) for the workflow and ignore rules, and [SECURITY.md](SECURITY.md) for private vulnerability reports. Store registration, listing text and assets are in [STORE_SETUP.md](docs/STORE_SETUP.md).

## How it works

The content script finds `article[data-testid="tweet"]` and reads `[data-testid="tweetText"]` nodes owned by each post. Quote cards are separate filtering boundaries: a quote-only match hides the quote while preserving the citing author's comment and actions. A match in the author's own text still hides their whole post. It does not match display names, handles, timestamps, or action labels. Emoji image alt text and `<br>` line breaks are included.

In notice mode, a matching quote gets its own **Quoted post hidden by X-Anti-Slop** row with Show and, when its author is identifiable, Whitelist. In complete-removal mode, only the quote card disappears. These controls do not navigate to the quote or change who you follow on X.

For a normal timeline row, it changes the size of the containing `[data-testid="cellInnerDiv"]`. The original post stays in the DOM so X keeps ownership of its nodes and can reuse them safely. When a row contains multiple posts, the script handles individual articles. A batched MutationObserver handles scrolling, edits, client-side navigation, and recycled content. The observer is disconnected during extension DOM writes to avoid feedback loops.

`storage.local` persists settings; storage change events update each open X tab. Only the `storage` permission and content-script access to X/Twitter are used. All scripts are bundled locally.

| File | Responsibility |
| --- | --- |
| `src/settings.ts` | Validated preferences, default filter, regex matching |
| `src/content.ts` | Post discovery, row hiding, reveal, restoration, observation |
| `src/launcher.ts` | Responsive navigation launcher and floating settings editor |
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

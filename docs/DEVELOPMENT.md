# Development

Use Git, Node **24** (the CI version), and npm. The package supports Node 22.18+, but using Node 24 avoids toolchain differences.

```sh
git clone REPOSITORY_URL x-anti-slop
cd x-anti-slop
npm ci
npm run package
```

For contributions, clone your fork instead and create a feature branch. See [CONTRIBUTING.md](../CONTRIBUTING.md).

## Commands and browser testing

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Strict TypeScript validation |
| `npm run build` | Generate Chromium and Firefox extension folders |
| `npm test` | Build/package and run regression checks |
| `npm run validate:firefox` | Run Mozilla's extension validator |
| `npm run package` | All checks plus versioned ZIPs and checksums |
| `npm run preview` | Preview settings locally after building; simulated storage does not affect X |

Load `dist/chromium` as an unpacked extension, or `dist/firefox/manifest.json` as a temporary Firefox add-on. Reload both the extension and X after rebuilding. Test initial posts, scrolling, quoted text, edited/recycled posts, both hide modes, Show, pause, invalid regexes, and saved preferences. Automated DOM tests do not replace actual browser installation checks.

The default pattern is `.?[—«»].?` with the `u` flag. Invisible direction/spacing marks are deliberately excluded. Existing saved filters are personal preferences: use **Reset defaults → Save changes** to replace an older default; updating the build does not silently rewrite custom filters.

Whitelist entries use separate `whitelist:<lowercase_handle>` storage keys, so account clicks cannot overwrite filter preferences or unrelated accounts. Only canonical keys with value `true` grant an exemption. New installs and old settings without these keys start with an empty whitelist. Check account add/remove, save errors, persisted entries, header recycling, and quoted-author isolation when changing this flow.

## Code map

The real launcher follows `[data-testid="AppTabBar_More_Menu"]`, directly before X's Post button. It measures that row's layout width to switch to icon-only mode and falls back to a floating icon when the navigation is absent. Test resize, navigation replacement, repeated opening, and Escape both inside and outside the editor.

The editor is an extension-origin iframe loading `options.html?embedded=1`. Only its HTML and launcher icon are web-accessible, restricted to the declared X/Twitter sites. Frame messages only signal readiness or close; they never contain preferences. The mock uses this production launcher rather than separately authored card/popup controls.

| Path | Responsibility |
| --- | --- |
| `src/settings.ts` | Settings validation, default regex, matching |
| `src/content.ts` | X post discovery, hiding, reveal, mutation handling |
| `src/launcher.ts` | Navigation card/icon, floating editor and lifecycle |
| `src/options.ts` | Settings editor, tester, persistence |
| `src/extension.ts` | Firefox/Chromium API namespace selection |
| `public/` | Manifest template, HTML/CSS and runtime icons |
| `scripts/` | Build, packaging, preview and store submission |
| `tests/` | Filtering, UI, packaging and publishing checks |
| `store-assets/` | Store listing visuals and their editable sources |

The content script reads `article[data-testid="tweet"]` and `[data-testid="tweetText"]`, then collapses `[data-testid="cellInnerDiv"]` for whole-post matches where safe. Quoted cards (X's nested link containers, explicit quote containers, blockquotes or nested tweet articles) are separate text and author scopes. Never include a quote's text in its parent's match. Quote notices sit outside the clickable quote, and the original card stays in the DOM for restoration. X's quote headers often expose handles through avatar test IDs and spans rather than profile links. Recheck these boundaries against current markup before changing them.

## Ignored files and packages

`.gitignore` covers dependencies, builds, release downloads, logs, caches, credentials, and common OS/editor debris. `.git/info/exclude` is for personal notes, local editor folders and agent workspaces; it stays on your machine. Check a rule with `git check-ignore -v path/to/file`.

Do not hide source, tests, lockfiles, or documentation with broad ignore rules. Ignoring an already tracked file does not untrack it. Sanitized `.env.example` files are allowed, but the extension itself needs no environment secrets.

The source packager uses Git's file list and ignore rules, includes ordinary untracked source, excludes deleted files and symlinks, and requires a Git checkout. If you extract a source ZIP, `npm ci && npm run build` reproduces the extension without Git metadata. To run package tests there, first initialize a local Git repository. Browser builds copy only the intended runtime assets and the MIT license.

## Version and release discipline

`package.json` owns the version; the build generates manifest versions, the settings badge and archive names. Stay on **0.1.0** until the owner requests a bump. Local corrections do not alter an existing `v0.1.0` tag or its published archives. See [RELEASING.md](RELEASING.md).

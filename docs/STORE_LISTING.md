# Store listing copy

The text below is ready to paste after the owner approves uploading a package. Review it against the actual package and the current form before submitting. Do not claim AI detection, store approval, or testing that has not happened.

## Title

X-Anti-Slop

## Short summary

Hide posts on X with custom regex filters. Keep a compact notice or remove matching rows. All filtering stays on your device.

## Detailed description

Take control of the text you see on X with your own regular-expression filters.

X-Anti-Slop hides a post when its visible text matches any enabled filter. Add, edit, disable or remove patterns, set regex flags, and try sample text before saving.

Open the X-Anti-Slop card between More and Post to edit filters in a floating panel without leaving X. On a narrow navigation rail, use its icon. The browser's extension menu and toolbar shortcut also open settings.

Keep favorite accounts visible: click the small star beside an author, click Whitelist on a hidden-post notice, or manage account handles in settings. Whitelisted authors bypass all regex filters. Account choices save immediately and can be undone without changing who you follow on X.

Choose how matching posts appear:

- Keep a compact notice reading “This post is hidden by X-Anti-Slop,” with a Show button to reveal it.
- Collapse the post's row entirely, with no notice.

The default filter matches em dashes and guillemets: — « ». You can replace it with patterns for words, phrases or other characters. Invisible direction and spacing marks are not part of the default.

Settings are stored locally and applied to open X tabs when saved. Filtering also handles newly loaded posts and quoted posts independently: if only a quote matches, the author's comment stays visible and only the quote is hidden. Each post's whitelist exception belongs to its own author. No accounts, external services, analytics or API keys are required to use the extension.

This is a personal text filter, not a detector of AI authorship. Punctuation can occur in both human and AI writing. It filters text loaded in the page; it does not read text inside images, transcribe videos, or fetch the full text of unexpanded posts.

Free to use and MIT licensed. Not affiliated with X, Google or Mozilla.

## Category and locale

- Default language: English (en).
- Suggested Chrome category: Productivity (select the closest available category in the live dashboard).
- Firefox automated initial category: Other; review it in the dashboard.
- Price: Free. No paid features or in-extension purchases.

## Single purpose

Allow users to hide posts on X locally using a list of regular-expression text filters.

## Permission explanations

| Permission/access | Explanation |
| --- | --- |
| `storage` | Saves the user's filters, whitelisted handles, enabled state and display preference in local extension storage. |
| Content scripts on `x.com`, `www.x.com`, `twitter.com`, `www.twitter.com` | Reads rendered post text to match user filters and changes the display of matching post rows. It runs only on those declared sites. |

The extension does not request access to all websites, browsing history, bookmarks, cookies, downloads, account credentials, or private APIs. It makes no network requests of its own. This describes the extension; X continues making its normal website requests.

## Data and remote-code declarations

- Post text is processed locally and not transmitted or retained by this extension.
- Filter patterns, whitelisted account handles and display preferences remain in local extension storage.
- No analytics, tracking, advertising SDKs, data sales, third-party data sharing, or external backend.
- No remotely hosted executable code, dynamic code downloads, `eval`, or `new Function`.
- User regexes are passed to the browser's native `RegExp` API; they are not executed as JavaScript source.
- Firefox manifest declares `data_collection_permissions.required: ["none"]`.

Read each store's definitions when completing its form; distinguish local text processing from collection or transmission. The privacy statement is [PRIVACY.md](PRIVACY.md).

## Reviewer instructions

1. Install the submitted package and open an X page containing posts. Normal use needs the reviewer's own X session; the extension has no separate login.
2. Open the extension settings. Test a sample containing an em dash, and another containing ordinary text.
3. Save a regex matching text visible in a post. Confirm the post is replaced by a 50px notice and can be revealed with Show.
4. Choose complete removal, save, and confirm the matching row collapses. Pause filtering to restore posts.
5. No service/API key is needed. Do not use any developer's personal X credentials.

For source review, extract the source ZIP, use Node 24, run `npm ci` then `npm run build`. Compare `dist/firefox` or `dist/chromium` with the corresponding submitted package. Source is TypeScript bundled using the locked esbuild version. The full MIT license is included.

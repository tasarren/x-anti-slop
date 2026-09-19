# Builds, releases, and store submissions

## Version policy

The version stays **0.1.0** until the owner explicitly requests a bump. There are no automatic version increments, release bots, or date-based versions. `package.json` is the version source; the build writes it into both browser manifests, the settings badge, and package names. Keep `package-lock.json` in sync using npm.

Release tags are annotated tags named `vMAJOR.MINOR.PATCH`, starting with `v0.1.0`. A tag that differs from the package version fails the build. Once published, keep that tag and its release assets unchanged. New commits while the version is frozen get CI artifacts, not a replacement `v0.1.0` release.

## GitHub Actions

**Build and release** runs on pull requests, pushes to `main`, `v*` tag pushes, and manual dispatch. It installs locked dependencies, type-checks, builds both browsers, runs regression/package checks, validates the Firefox extension, and uploads artifacts named for the commit. Build artifacts are retained for 30 days.

Only a successful **tag push** creates a public GitHub Release with:

- `x-anti-slop-0.1.0-chromium.zip`
- `x-anti-slop-0.1.0-firefox.zip`
- `x-anti-slop-0.1.0-source.zip` (TypeScript, lockfile, build instructions, and tests)
- `SHA256SUMS.txt`

The Chromium package serves Chrome, Edge, Brave, Vivaldi, and other compatible Chromium browsers. Firefox has its own manifest. GitHub ZIP downloads are developer packages; publishing to the stores enables normal store installation and updates.

For an authorized new release, start from a clean `main` containing the requested version, verify `npm run package`, then create and push the matching tag. For the first release:

```sh
git tag -a v0.1.0 -m "X-Anti-Slop 0.1.0"
git push origin v0.1.0
```

Run this only once for a version. A failed release job can be rerun if no GitHub release was created; an existing release is never automatically overwritten. If assets were only partially uploaded, inspect the release before recovering it.

## Optional store automation

**Submit to extension stores** is manually triggered with an existing release tag and a choice of `chrome`, `firefox`, or `both`. It checks out the exact tag, rebuilds and validates it, downloads that GitHub release, verifies its checksums, and requires the rebuild to match the released bytes before submitting. The two stores run independently; a failure in one does not cancel the other. Submissions to the same store are serialized.

Configure the following GitHub environments under **Settings → Environments**. Put secrets in the environment secret fields, never in files or workflow inputs. Store credentials are available only to the protected configuration-check and submission steps, never to the pull-request build. Required reviewers can be added if you want a separate approval step.

### Chrome Web Store

Environment: **`chrome-store`**

| Type | Name | Value |
| --- | --- | --- |
| Variable | `CHROME_PUBLISHER_ID` | Publisher ID from the store dashboard |
| Variable | `CHROME_EXTENSION_ID` | Existing store item's extension ID |
| Secret | `CHROME_CLIENT_ID` | Google OAuth client ID |
| Secret | `CHROME_CLIENT_SECRET` | Google OAuth client secret |
| Secret | `CHROME_REFRESH_TOKEN` | Refresh token with the `chromewebstore` scope |

First register the developer account, create the store item, and complete its listing, screenshots/icon, privacy disclosures, distribution settings, and account verification. The API updates an existing item; it does not replace this setup. Follow [Google's API setup guide](https://developer.chrome.com/docs/webstore/using-api).

**First version:** creating the item normally involves uploading `0.1.0` manually. Submit that first uploaded version from the dashboard; do not upload the same version again with the workflow. After the owner requests a higher version, use the workflow for subsequent releases. If a workflow fails after an upload, inspect the dashboard before retrying because repeated uploads of the same version can fail.

The script uses Chrome Web Store API v2, waits for asynchronous upload completion, and submits for review. Success means the store accepted the submission; review and public availability can follow later. It does not skip store review.

### Firefox Add-ons (AMO)

Environment: **`firefox-store`**

| Type | Name | Value |
| --- | --- | --- |
| Secret | `AMO_JWT_ISSUER` | AMO API key / JWT issuer |
| Secret | `AMO_JWT_SECRET` | AMO API secret |
| Variable | `AMO_LICENSE` | The owner's chosen [AMO license slug](https://mozilla.github.io/addons-server/topics/api/licenses.html), such as `MIT` or `all-rights-reserved` |

Create/verify the AMO developer account and obtain [API credentials](https://addons.mozilla.org/developers/addon/api/key/). Choose the license deliberately; the workflow does not choose one for you. Review the summary/category in `scripts/publish-firefox.ts` before the first submission, and complete any remaining listing details in the dashboard.

The workflow uses Mozilla's pinned `web-ext` tool with `--channel listed`, sends initial listing metadata and the source archive, and can create the first AMO listing or submit an update. It stops after submission rather than waiting indefinitely for review. See [Mozilla's signing reference](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/#web-ext-sign).

The permanent add-on ID is `browser_specific_settings.gecko.id` from the generated Firefox manifest. Do not change it after the first submission. It replaces the early local prototype ID; anyone who installed that prototype should remove it before installing this build.

The unsigned Firefox GitHub ZIP does not become installable permanently merely because CI passed. Once AMO approves/signs the extension, users should install from its AMO listing. This workflow does not claim store approval or attach an unsigned ZIP disguised as an XPI.

## Store assets and privacy

Both stores still need developer accounts, listing assets/disclosures, credentials, and their normal review. The repository contains a [privacy statement](PRIVACY.md) that can be linked from listings. No extension content is sent to a server; publishing credentials are build-time secrets only.

Chrome and Firefox are the automated stores in this project. Edge/Opera-specific store accounts and publishing APIs are separate; their browsers can already use the Chromium package.

## Reproducibility and tooling

Use Node 24 and `npm ci`, then `npm run package`. ZIP entries have stable order and timestamps; the source archive excludes dependencies, generated builds, Git internals, and root environment files. The package tests verify repeat builds and SHA-256 checksums.

`web-ext` is pinned in the lockfile. Its `image-size` dependency is overridden to patched `2.0.4` because the bundled older version has image-parser denial-of-service advisories. Remove the override when the upstream dependency pin includes the fix and validation still passes.

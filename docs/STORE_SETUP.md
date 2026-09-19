# First store publication

## Prepared materials

| Material | Location |
| --- | --- |
| Chromium package | `artifacts/x-anti-slop-0.1.0-chromium.zip` |
| Firefox package | `artifacts/x-anti-slop-0.1.0-firefox.zip` |
| Mozilla review source | `artifacts/x-anti-slop-0.1.0-source.zip` |
| Checksums | `artifacts/SHA256SUMS.txt` |
| Extension/store icon | `public/icons/128.png` (also 16, 32 and 48px runtime icons) |
| Small promotional image | `store-assets/promo-440x280.png` |
| Five individual store screenshots | `store-assets/screenshots/` (1280×800 RGB PNGs) |
| Animated walkthrough (60 fps) | `store-assets/animation/x-anti-slop-demo-60fps.webp` |
| Promotional video source (60 fps) | `store-assets/animation/x-anti-slop-demo.mp4` |
| GIF compatibility preview (50 fps) | `store-assets/animation/x-anti-slop-demo.gif` |
| Copy-ready description and disclosures | [STORE_LISTING.md](STORE_LISTING.md) |
| License | [LICENSE](../LICENSE) |
| Privacy statement | [PRIVACY.md](PRIVACY.md) |

The screenshots and animation use the actual settings and filtering scripts in an X UI mock with fictional local posts, labeled as a demonstration. They contain no personal timeline data. Use the static PNGs in the stores' screenshot fields; the GIF is for sharing and the MP4 is a promotional-video source. The editable artwork and capture page are in `store-assets/`; store-only files are not bundled into the installed extension. See [the media guide](../store-assets/README.md) and [Chrome's image requirements](https://developer.chrome.com/docs/webstore/images).

## 1. Register the accounts

**Chrome:** follow [developer registration](https://developer.chrome.com/docs/webstore/register) and open the [Chrome Web Store dashboard](https://chrome.google.com/webstore/devconsole). Use the account that will own this extension. Complete Google's registration fee, account verification, developer terms and two-step verification yourself.

**Firefox:** open [Mozilla Add-ons developer registration](https://addons.mozilla.org/developers/) and follow [Mozilla's submission guide](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/). Create or sign into the intended Mozilla account, verify it, and review/accept the developer agreement yourself.

Do not paste passwords, OAuth refresh tokens, API secrets, recovery codes, payment details, or identity documents into issues, this repository, or chat. Any jurisdiction/trader-status questions require the owner's real circumstances; do not guess them.

## 2. Prepare the first draft listings

After account setup, and once the owner authorizes uploading the prepared packages:

**Chrome:** create a new item using the Chromium ZIP. Fill in the title, summary, detailed description, category, icon, promotional image and screenshot from the materials above. Complete the privacy/distribution tabs using the actual extension behavior in the listing guide. Save the assigned **extension ID** and your **publisher ID**; these are identifiers, not secrets. Leave the item as a draft until the owner approves submission.

**Firefox:** choose a public AMO listing, upload the Firefox ZIP, and supply the source ZIP when asked about generated/bundled code. Use MIT as the license and keep the manifest add-on ID `browser_specific_settings.gecko.id` from the generated Firefox manifest. Complete the summary, description, icon and screenshot. Review the declared “no data collection” settings. Draft setup in the dashboard and automatic creation with `web-ext` are alternatives: do not submit the same version using both paths.

Privacy URL: `REPOSITORY_URL/blob/main/docs/PRIVACY.md`

Support URL: `REPOSITORY_URL/issues`

Homepage: `REPOSITORY_URL`

Verify those URLs show the approved text before using them. Local documentation changes are not public until a separately authorized push.

## 3. Configure publishing credentials

Configure both GitHub environments to require review by a designated maintainer. Only workflows launched from `main` can use them; the release tag is a separate workflow input.

### Chrome environment

Use [Google's OAuth/API instructions](https://developer.chrome.com/docs/webstore/using-api) to enable the Chrome Web Store API, create an OAuth client, and obtain a refresh token for the `chromewebstore` scope. Store these directly under **GitHub Settings → Environments → chrome-store**:

| Kind | Name |
| --- | --- |
| Variable | `CHROME_PUBLISHER_ID` |
| Variable | `CHROME_EXTENSION_ID` |
| Secret | `CHROME_CLIENT_ID` |
| Secret | `CHROME_CLIENT_SECRET` |
| Secret | `CHROME_REFRESH_TOKEN` |

Use your own OAuth client in the OAuth Playground and authorize the Google account that owns the store item. Request `https://www.googleapis.com/auth/chromewebstore`. For ongoing releases, move the OAuth app out of **Testing** before generating the production refresh token: external apps left in Testing receive refresh tokens that expire after seven days for this scope. This OAuth app setting is separate from publishing the extension. See [Google's token expiration rules](https://developers.google.com/identity/protocols/oauth2#expiration).

The first Chrome upload normally happens when creating the store item. Submit that already uploaded first version from the dashboard after approval; do not re-upload `0.1.0` through the update workflow. Use automated upload-and-submit for later, explicitly approved higher extension versions.

### Firefox environment

Obtain [AMO API credentials](https://addons.mozilla.org/developers/addon/api/key/) and store them directly under **GitHub Settings → Environments → firefox-store**:

| Kind | Name |
| --- | --- |
| Secret | `AMO_JWT_ISSUER` |
| Secret | `AMO_JWT_SECRET` |

MIT is set in the submission metadata; no license secret or variable is needed. The workflow submits the bundled extension plus reviewable source and can create the first public listing.

### Store credentials with GitHub CLI

Once the credentials exist, run these commands in your own interactive terminal. Each secret command prompts for its value without putting that value into the command line. No `.env` file is needed. `gh` encrypts secret values locally before sending them to GitHub; see [the CLI reference](https://cli.github.com/manual/gh_secret_set).

```sh
gh secret set AMO_JWT_ISSUER --env firefox-store
gh secret set AMO_JWT_SECRET --env firefox-store

gh secret set CHROME_CLIENT_ID --env chrome-store
gh secret set CHROME_CLIENT_SECRET --env chrome-store
gh secret set CHROME_REFRESH_TOKEN --env chrome-store

gh variable set CHROME_PUBLISHER_ID --env chrome-store
gh variable set CHROME_EXTENSION_ID --env chrome-store
```

Confirm the configured secret names without retrieving their values:

```sh
gh secret list --env firefox-store
gh secret list --env chrome-store
gh variable list --env chrome-store
```

Setting credentials does not start a submission. The GitHub token supplied to Actions handles release downloads; it cannot authenticate to Google or Mozilla, and no additional GitHub personal access token is needed for this workflow.

## 4. Approve a specific source snapshot and submit

For an approved release, merge the reviewed source into `main` and choose an unused version tag. A candidate such as `v0.1.0-rc.1` preserves manifest version `0.1.0` and creates a GitHub prerelease. Never replace published tags or assets.

After an authorized candidate release exists, **Submit to extension stores** can verify its exact bytes and submit to AMO. Launch the workflow from `main`, enter the candidate tag, choose the intended store, and review the environment approval. For the first Chrome version, use the prepared candidate's ZIP in the dashboard flow described above.

Equivalent CLI dispatch, **only after the owner authorizes submission and that candidate release exists**:

```sh
gh workflow run publish-stores.yml --ref main \
  -f tag=v0.1.0-rc.1 -f store=firefox
```

For later approved releases, use their actual tag and choose `chrome`, `firefox`, or `both`. The run waits for the corresponding GitHub environment approval before executing. Registration, store agreements, fees where applicable, account verification, and store review remain outside Actions.

Store submission is not store approval. Resolve any store review feedback before claiming an official listing is available. Once a store accepts `0.1.0`, future binary updates need a higher version, which must be explicitly requested by the owner.

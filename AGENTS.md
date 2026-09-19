# Project instructions

- Keep the extension at version **0.1.0** until the user explicitly asks for a version bump.
- `package.json` owns the version. Generate both manifests, the settings badge, and archive names from it.
- Release tags are `v<package.json version>`. Never move or replace a published tag.
- Changes while the version is frozen ship as CI artifacts. Store updates require a new version approved by the user.
- Run `npm run package` before releasing. Store submission is a separate, manually triggered workflow.

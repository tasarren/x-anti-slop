# Project instructions

- Do not push commits or tags, create public PRs, replace release assets, or submit to stores until the user explicitly authorizes it. Preparing local changes and configuring repository security settings are allowed.
- Keep the extension at version **0.1.0** until the user explicitly asks for a version bump.
- `package.json` owns the version. Generate both manifests, the settings badge, and archive names from it.
- Release tags are `v<package.json version>` or `v<package.json version>-rc.N` for immutable candidates with the same extension version. Never move or replace a published tag.
- Changes while the version is frozen ship as CI artifacts. Store updates require a new version approved by the user.
- Run `npm run package` before releasing. Store submission is a separate, manually triggered workflow.
- The license is MIT. Preserve its notice in source and browser packages.

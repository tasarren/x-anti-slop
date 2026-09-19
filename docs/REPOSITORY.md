# Repository controls

The repository accepts public issues and fork-based pull requests. Maintainers should configure and periodically verify the following controls.

| Area | Configuration |
| --- | --- |
| `main` history | No deletion or force-push; linear history and squash merges |
| Merge checks | GitHub Actions `build` must pass against current `main`; this requirement has no bypass |
| PR review | One approval, code-owner review, stale approvals dismissed, conversations resolved |
| Maintainer access | Repository administrators may bypass review only through a PR; CI and history rules still apply |
| `v*` tags | Cannot be rewritten or deleted; no bypass |
| Fork Actions | Every external contributor needs approval before a workflow runs |
| Allowed Actions | GitHub-owned actions only, pinned to full commit SHAs |
| Workflow token | Read by default; workflows cannot approve PRs |
| Security reports | Private vulnerability reporting and dependency alerts enabled |
| Secrets | Existing secret scanning and push protection remain enabled |
| Store environments | Only workflows running from `main`; owner review required; admin bypass disabled |

For store deployments the sole owner may approve a run they initiated. A second independent reviewer is not required while the project has one maintainer. Adding maintainers is a good time to revisit that choice.

Keep `CODEOWNERS`, issue forms, the PR template, and the Dependabot schedule current as maintainers and workflows change. The wiki is disabled so contribution and development documentation stays reviewed with the code.

Ignore rules keep clutter out of the working tree and source archives; they are not a replacement for secret scanning or credential rotation. See [DEVELOPMENT.md](DEVELOPMENT.md) and [SECURITY.md](../SECURITY.md).

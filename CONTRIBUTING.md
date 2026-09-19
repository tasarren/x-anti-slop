# Contributing

Bug reports, usability feedback, documentation improvements, and focused pull requests are welcome. The project uses the [MIT license](LICENSE).

## Report a problem

Search existing issues first. Include your browser and extension versions, installation method, filter pattern/flags, hide mode, and reproducible steps. Prefer synthetic post text. Redact private messages, account details, cookies, and personal timelines from screenshots or logs.

For exploitable vulnerabilities or exposed secrets, follow [SECURITY.md](SECURITY.md) instead of filing a public issue. For larger changes, discuss the intended behavior in a feature request before starting implementation.

## Submit a change

1. Fork the repository, clone your fork, and create a focused branch.
2. Follow the [development guide](docs/DEVELOPMENT.md). Use Node 24, `npm ci`, and `npm run package`.
3. Add a small regression check when behavior changes, and document new user-visible behavior.
4. Commit source files, the lockfile when dependencies change, and relevant documentation. Keep generated packages and credentials out of Git.
5. Open a pull request against `main`, explaining why the change is needed and which browsers/checks you ran.

Keep the version at **0.1.0** until the maintainer requests a bump. Do not move release tags, publish store packages, or change the add-on ID.

External contributors' workflows wait for maintainer approval. Passing checks do not imply that a change is accepted: the maintainer reviews behavior, permissions, privacy, accessibility, and scope. New commits invalidate previous approvals. Normal merges use squash commits; you do not need to rewrite your branch history for cosmetic reasons.

Use existing browser APIs and small, readable TypeScript modules. Avoid new runtime dependencies, remote code, telemetry, or broad host permissions. Never use `pull_request_target` to run contributor code with privileged credentials.

Be respectful and specific in discussion. Critique the code and behavior; do not harass or share another person's private information. Contributions should be work you have the right to submit under this project's MIT license.

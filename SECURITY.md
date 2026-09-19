# Security

Please report exploitable vulnerabilities through GitHub's private vulnerability reporting. Do not put credentials, private timeline content, or working exploits in public issues.

Include the affected version, browser, reproduction steps using synthetic data, impact, and a minimal proof of concept when safe. Coordinate public disclosure with the maintainer. There is no guaranteed response deadline or paid bounty.

The current development line is **0.1.0**. Fixes are prepared locally first and published only after the owner authorizes them. Do not assume an unreleased fix is present in an existing GitHub ZIP or store installation.

The extension runs only on the declared X/Twitter pages and stores preferences locally. Regexes are user-authored and currently execute synchronously; extremely expensive backtracking patterns can stall a tab. See [privacy](docs/PRIVACY.md) and [repository security controls](docs/REPOSITORY.md).

If a secret is exposed, revoke or rotate it with its provider immediately. Deleting a file or adding it to `.gitignore` does not remove it from Git history or invalidate the credential.

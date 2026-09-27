# Security policy

QRetina receives data and signed programs over an optical channel. Its security model is described in
[docs/security.md](docs/security.md). Reports of weaknesses in that model are welcome.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private reporting instead:
**Security tab → Report a vulnerability** on this repository.

This is a personal project without a service-level agreement. Reports are handled on a best-effort basis, and I will try to acknowledge one within about a week.

## Supported versions

Only the latest commit on `main` is supported.

## What is in scope

- Execution of code not signed by a trusted key; circumvention of the version check or of the approval of new signers.
- Execution or active rendering of a received file.
- Escapes from the sandbox of HTML programs.
- Frames that cause excessive memory or time consumption before validation.
- Weaknesses in the signing and release tooling (`tools/`, `.github/workflows/`), such as key disclosure.

## What is out of scope (by design)

- Harmful behaviour of code signed by a trusted key; trust in the signer is the premise of the model.
- The absence of authenticity for files (only integrity is provided).

## If a signing key may be compromised

Add a new key to `TRUSTED_KEYS`, release the app, sign with the new key, and remove the old key in a
later release.

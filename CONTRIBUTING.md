# Contributing

The project is kept small and easy to audit, because it receives data and programs over an
unauthenticated channel.

## Setup

Node 20 or newer.

```bash
npm install
npm test
```

## Guidelines

- **Layout.** `protocol/` is the reference implementation, in plain JavaScript with no platform
  APIs, so that it runs in Node, in the app and in the tests alike.
- **Dependencies.** Runtime dependencies are limited to audited, dependency-free libraries
  (`@noble/*`, `fflate`). Open a discussion before adding another.
- **Protocol changes.** Any change to what is transmitted (frames, containers, the PRNG or the
  masks) is made in `parameters` of `spec/qretina.yaml`. This gives a new protocol identifier, which
  must be recorded as `PROTOCOL` in `protocol/fountain.js`, together with updated test vectors.
- **Security-sensitive code** (`protocol/containers.js`, the `Receiver`, `tools/`,
  `.github/workflows/`) needs tests that show the adverse case being refused, not only the intended
  case being accepted.
- **Keys.** Never commit private keys or `signing-key.json` (it is gitignored). Public keys are
  configured through the `TRUSTED_KEYS` variable, not in the source.
- **Style.** Match the surrounding code, keep comments short, and explain why rather than what.

## Pull requests

1. Open an issue first for anything larger than a small fix.
2. Keep the change focused, and include or update tests.
3. Make sure `npm test` passes.

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE). Please also follow the [Code of Conduct](CODE_OF_CONDUCT.md). For vulnerabilities, see [SECURITY.md](SECURITY.md) instead of opening an issue.

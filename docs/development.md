# Development

## Layout

| Path | Content |
|---|---|
| `spec/qretina.yaml` | Protocol parameters and test vectors; the protocol identifier is derived from them |
| `protocol/` | Reference implementation in plain JavaScript, used by the app, the CLI and the tests |
| `native/core/` | The transfer layer in C++, checked against the reference |
| `app/` | The Expo app (Android and iOS) |
| `tools/` | Command line, vector generator |
| `site/` | qretina.app: download page and link association files |
| `docs/` | This documentation |
| `test/` | Tests of the protocol, CLI and native core |

## Tests

```
npm install
npm test                      # protocol, CLI, native core, app logic
npm run typecheck -w @qretina/app
npm run bundle -w @qretina/app  # Metro bundles for Android and iOS
```

The native test compiles `native/core` with the system C++ compiler and runs it against
`test/vectors/streams.txt`, which `node tools/vectors.mjs` regenerates from the reference.

## Running the app

The app uses native modules, so it runs in a development build, not in Expo Go:

```
cd app
npx expo run:android    # Android SDK and a device or emulator
npx expo run:ios        # macOS with Xcode
```

Without `TRUSTED_KEYS` and `APP_KEYS`, a development build trusts no program and sends unsealed
items. Set them in the environment to test signing and sealing.

## Protocol changes

Change `parameters` in `spec/qretina.yaml`, set `PROTOCOL` in `protocol/fountain.js` and
`native/core/qretina.hpp` to the identifier the tests print, and regenerate the vectors.

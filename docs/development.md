# Development

## Layout

| Path | Content |
|---|---|
| `spec/qretina.yaml` | Protocol parameters and test vectors; the protocol identifier is derived from them |
| `protocol/` | Reference implementation in plain JavaScript: containers and keys for the app; everything for the CLI and the tests |
| `native/core/` | The transfer layer in C++, checked against the reference |
| `native/` | `@qretina/native`: the C++ layer bound to the app with Nitro modules |
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

## The native transfer layer

`native/` is a Nitro module. `src/specs/Transfer.nitro.ts` declares what JavaScript sees, `npm run
codegen -w @qretina/native` generates the bindings into `nitrogen/generated/` (committed), and
`cpp/HybridTransfer.cpp` implements them over `core/`. Expo links it into both platforms. The app
runs on it only (`app/src/lib/engine.ts`); a build without it shows an error instead of starting.
Expo Go cannot load it, so use a development build. The JavaScript reference stays for the CLI and
the tests. Settings → Diagnostics checks the native layer against the spec's vectors and times it.

Reassembly of a completed stream runs on a background thread, so the camera keeps running. After
changing the spec, run the code generator; CI fails if the generated files are out of date.

## Protocol changes

Change `parameters` in `spec/qretina.yaml`, set `PROTOCOL` in `protocol/fountain.js` and
`native/core/qretina.hpp` to the identifier the tests print, and regenerate the vectors.

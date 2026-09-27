# QRetina

QRetina moves files and signed programs between phones as a stream of QR codes: one screen shows them,
another phone's camera films them. It needs no network, pairing or radio. A rateless erasure code
lets the receiver miss any codes and start at any point; it needs about n + 2 codes for n blocks.

- App for Android and iOS (Expo), working offline: receive, broadcast, library, signed programs.
- Command line for broadcasting from a computer (looping GIFs) and for signing.
- Protocol specified in `spec/qretina.yaml`, with a reference implementation in JavaScript and the
  transfer layer in C++.

Documentation: [docs/](docs/index.md) (published on Read the Docs).

## Build and test

Node 22.18 or newer.

```
npm install
npm test
npm run typecheck -w @qretina/app
cd app && npx expo run:android      # or run:ios, on macOS
```

## Status

The protocol, command line and C++ core are tested. The app type-checks and bundles for both
platforms, but has not yet been run on a device. The C++ core is not yet connected to the app,
which uses the JavaScript implementation.

## Licence

[MIT](LICENSE). See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

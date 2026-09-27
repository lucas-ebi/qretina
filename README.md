# QRetina

QRetina moves files and signed programs between phones as a stream of QR codes: one screen shows them,
another phone's camera films them. It needs no network, pairing or radio. A rateless erasure code
lets the receiver miss any codes and start at any point; it needs about n + 2 codes for n blocks.

- App for Android and iOS (Expo), working offline: receive, broadcast, library, signed programs.
- Command line for broadcasting from a computer (looping GIFs) and for signing.
- Protocol specified in `spec/qretina.yaml`, with a reference implementation in JavaScript and the
  transfer layer in C++.

Documentation: [docs.qretina.app](https://docs.qretina.app) (sources in [docs/](docs/index.md)).

## Build and test

Node 22.18 or newer.

```
npm install
npm test
npm run typecheck -w @qretina/app
cd app && npx expo run:android      # or run:ios, on macOS
```

## Status

The protocol, command line and C++ core are tested in CI. The app runs its transfers on the C++ core;
an Android release build passes its self-test on an emulator. It has not yet been tried on real
phones or built for iOS, and files shared into the app from other apps arrive empty.

## Licence

[MIT](LICENSE). See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

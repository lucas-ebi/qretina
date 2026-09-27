# ResQR

ResQR moves files and signed programs between devices as a stream of QR codes, shown on one screen
and filmed by another device's camera. It needs no network, pairing or radio. A rateless erasure
code lets the receiver miss any frames and join at any point; it needs about n + 2 frames for n
blocks of data.

Status: the protocol and command-line tool are in place; the Android and iOS app is in progress.

## Layout

| Path | Content |
|---|---|
| `spec/resqr.yaml` | Protocol parameters and test vectors; the protocol identifier is derived from them |
| `docs/protocol.md` | Explanation of the protocol |
| `protocol/` | Reference implementation (plain JavaScript): frames, erasure code, containers, GIF output |
| `tools/resqr.mjs` | Command line: keys, signing, frames and GIFs |
| `examples/snake.html` | A small HTML program, used as a signed test payload |
| `test/` | Tests (`npm test`) |

## Use

Node 20 or newer.

```
npm install
npm test
node tools/resqr.mjs file photo.jpg --gif photo.gif
node tools/resqr.mjs keygen
node tools/resqr.mjs sign examples/snake.html --id snake --gif snake.gif
```

A GIF loops forever and starts each loop with a three-second countdown of QR codes of the link
`HTTPS://RESQR.APP/SCAN`, which opens the app. Run `node tools/resqr.mjs` for all options.

## Licence

[MIT](LICENSE). See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

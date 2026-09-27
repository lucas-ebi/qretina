# ResQR

ResQR moves files and signed programs between devices as a stream of QR codes, shown on one
screen and filmed by another device's camera. It needs no network, pairing or radio, and works
entirely offline once installed.

- **Erasure-tolerant.** Each code carries a random combination of the data. The receiver needs
  about as many codes as the data has blocks, in any order, whichever ones it missed, and can join a
  broadcast at any point.
- **Rateless.** A broadcast never runs out of new codes, and two phones showing the same item
  speed the transfer up.
- **Signed programs.** HTML programs signed by ResQR, or by a publisher it certified, can run in a
  sandbox without network access or access to the phone's data. Files are never run.
- **Sealed.** Broadcasts are unreadable to other QR readers, and can be made private to holders of
  a group key.

Throughput is set by the camera and the screen. One phone filming another manages about 700 bytes
per code at 15 codes per second, 8 to 10 KB/s: a 300 KB photo in about 35 seconds.

| Page | Content |
|---|---|
| [Using the app](app.md) | Receiving, broadcasting, the library, group keys |
| [Command line](cli.md) | Broadcasting from a computer, keys, signing |
| [Publishing programs](publishing.md) | Root keys, publisher certificates, revocation, CI |
| [Protocol](protocol.md) | Frames, erasure code and containers |
| [Security](security.md) | What is protected, and what is not |
| [Development](development.md) | Repository layout, tests, builds |

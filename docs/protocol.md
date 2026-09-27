# Protocol

The normative parameters are in [`spec/resqr.yaml`](https://github.com/lucas-ebi/qr-bootstrap/blob/main/spec/resqr.yaml).
This page explains them. The key words MUST, MUST NOT, SHOULD and MAY are used as in RFC 2119.

## Identifier

The protocol identifier is `RQR` followed by the first six hexadecimal digits, in upper case, of
SHA-256 over the canonical JSON (RFC 8785) of `parameters`. Any change to the parameters gives a new
identifier, and a receiver ignores frames that carry another one instead of misreading them. The
current identifier is `RQR6EAC80`.

## Overview

A sender holds a *container*, a byte string of at most 4 MiB. It splits the container into n
blocks of equal length b (the last one zero-padded) and emits an unbounded sequence of *symbols*.
Each symbol is the exclusive-or of a pseudo-random subset of the blocks, chosen by a 32-bit seed.
Each symbol is written as one *frame* in the QR alphanumeric character set and shown as one QR code.
A receiver that collects any n linearly independent symbols, in any order, reconstructs the
container by Gaussian elimination over GF(2). With uniformly drawn subsets this takes n + 2
symbols on average, whichever frames were lost.

```
 container ──► n blocks ──► symbol(seed) = XOR of blocks selected by mask(seed)
                                 │
                                 ▼
 frame = protocol / stream-id / n / len / seed / base45(symbol) ──► QR code ──► display
```

The channel has no return path. Throughput is the product of the bytes per code, the codes per
displayed image and the images per second, less the codes the receiver fails to decode. QR error
correction duplicates the erasure code, so senders SHOULD use level L for data frames.

## Frames

A receiver MUST reject a frame that does not match the grammar, whose protocol field differs from
its own identifier, whose numeric fields break the constraints, or whose symbol does not decode to
exactly b bytes. These checks MUST precede any allocation proportional to n or len.

Frames of one stream are interchangeable. A sender SHOULD begin at a random seed, so that two
senders showing the same container at once contribute distinct symbols. A receiver MUST ignore a
frame whose n or len disagrees with earlier frames of the same stream.

## Decoding

The receiver keeps, per stream, a matrix in row-echelon form in which row j, when present, has its
lowest set coefficient at column j. An arriving symbol is reduced against the existing rows. If a
non-zero coefficient remains at a column without a row, the reduced symbol becomes that row;
otherwise it is linearly dependent and discarded. When all n rows are present, back-substitution
gives the blocks. The receiver MUST then check that the first eight bytes of SHA-256 over the
container equal the stream identifier.

The cost is O(n²·b/32) word operations per stream, spread over the reception.

## Containers

The first byte of a container is its tag.

**Code (tag 1).** A program (`html`) or data (`json`), compressed and signed with Ed25519. The
signature covers the domain prefix `resqr code\0` and everything after the signature. It is made
either by a *root key*, which the receiver holds, or by a *publisher key*, in which case the
container embeds the publisher's certificate. The signature MUST verify before the body is
decompressed. A receiver MUST NOT run a container whose version is lower than the highest it has
accepted for the same id, and SHOULD ask the user before running an id or signer it has not seen
before. HTML programs MUST run in a sandbox without network access or access to the receiver's
storage. Since the certificate travels inside the container, any receiver can relay a program to
others, who can verify it in the same way.

**Certificate (tag 4).** A root key certifies a publisher's key under a name, for ids that begin
with a namespace (such as `org.relief.`), between two times. A receiver MUST refuse code under a
certificate whose validity does not include the receiver's clock, whose serial is revoked, or whose
namespace does not prefix the id. Receivers may have wrong clocks, so validity periods should be
long, with revocation as the means of withdrawal.

**Revocation list (tag 5).** A root key lists the serials of revoked certificates under an
increasing number. A receiver keeps the list with the highest number it has received. Lists travel
like any other container, and releases of the app include the latest one.

**File (tags 2 and 3).** Arbitrary data with a media type and a name, compressed when that makes it
smaller. Files carry no signature and MUST NOT be run or rendered as active content, whatever their
media type. A receiver MAY preview image, audio and video types.

**Sealed (tag 6).** Any container encrypted with XChaCha20-Poly1305 under a 32-byte key that sender
and receiver hold in advance. The container names the key only by an 8-byte key id. The nonce is
derived from the content, so sealing the same container under the same key always gives the same
bytes, and therefore the same stream: two senders relaying one sealed item still add up, and a
receiver can combine frames from both. The cost is that an observer can tell whether two sealed
containers are equal. A receiver that holds no matching key keeps the container *locked*: it can
still relay it, and opens it once it obtains the key. At most two layers are allowed.

The app uses two layers. Everything it sends is sealed with an *app key* built into the app, so
that frames mean nothing to other QR readers. This is not confidentiality: anyone can extract the
app key from the app. For confidentiality, the sender first seals the container with a *group key*
that the receivers already hold, made at random or derived from a passphrase with scrypt. The
passphrase must be strong, since a recording of the stream allows offline guessing. Sealing hides
content and names but not the size or the timing of a transfer, and there is no forward secrecy.

## Countdown

A sender MAY precede the data frames with a countdown of QR codes of a link that opens the
receiving app (`HTTPS://RESQR.APP/SCAN`). The link is not a frame, and receivers ignore it.

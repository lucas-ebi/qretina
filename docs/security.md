# Security

## What is protected

- **Programs run only when signed** by a root key built into the app, or by a publisher holding a
  certificate from one. The signature is checked before the program is decompressed.
- **Publishers are confined** to ids in their namespace, for the validity of their certificate, until
  revoked.
- **No rollback.** A phone refuses a version of a program older than the newest it has run.
- **First run needs approval,** for each program and signer.
- **Programs are isolated.** They run in a web view with a content policy that forbids network
  access, frames and external resources, with no storage and no bridge to the app.
- **Files are never run** or rendered as active content, whatever their type. Only images are
  previewed, and never SVG.
- **Frames are bounded.** Every frame is validated against fixed limits before any allocation that
  depends on its content.
- **Private items** are encrypted with XChaCha20-Poly1305 under group keys that only members hold.
  Tampering is detected.

## What is not

- **App sealing is not confidentiality.** It keeps broadcasts unreadable to other QR readers, but
  the app key is inside the app and can be extracted from it.
- **Files are not authenticated.** The stream identifier protects against transmission errors, not
  against a sender who lies about what a file is.
- **Size and timing** of a broadcast are visible to anyone who sees the screen.
- **Passphrase keys** are only as strong as the passphrase: a recording allows offline guessing.
- **No forward secrecy.** A group key that leaks opens every recording made under it.
- **Clocks.** Certificate validity depends on the phone's clock, which may be wrong. Revocation is
  the reliable means of withdrawal.
- **Local state.** Approvals, versions and the revocation list are kept on the phone; clearing the
  app's data resets them.

Report vulnerabilities privately, as described in `SECURITY.md`.

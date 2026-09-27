# Publishing programs

## Keys

| Key | Kind | Where it lives | Purpose |
|---|---|---|---|
| Root | Ed25519 | Secret `SIGNING_KEY`, environment `signing`; public part in variable `TRUSTED_KEYS` | Signs programs, certificates and revocation lists |
| Publisher | Ed25519 | With the publisher | Signs the publisher's programs |
| App | 32 bytes | Secret `APP_KEYS`, environment `signing` | Seals everything sent |
| Group | 32 bytes | With the members of a group | Makes items private |

Root public keys and app keys are built into the app. Changing them needs a new release.

## Setting up

```
gh api -X PUT repos/OWNER/REPO/environments/signing
node tools/qretina.mjs keygen - | gh secret set SIGNING_KEY --env signing
gh variable set TRUSTED_KEYS --body "<the printed public key>"
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))" | gh secret set APP_KEYS --env signing
```

Restrict the `signing` environment to `main`, and protect `main`: anyone able to run workflows
there can cause signatures to be made.

## Signing a program

```
gh workflow run sign.yml -f file=examples/snake.html -f id=snake
gh run download <run-id>
```

The result is a GIF that any screen can show. The version defaults to the current time, so a later
signature supersedes an earlier one.

## Certifying a publisher

A publisher, such as a relief organisation, makes its own key pair and sends only the public key:

```
node tools/qretina.mjs keygen publisher.json
```

The root certifies it for ids that begin with a namespace, for a period:

```
gh workflow run certify.yml -f action=cert -f pub=<public key> -f name="Relief Org" -f ns=org.relief. -f days=365
```

The publisher then signs its own programs, which carry the certificate with them:

```
node tools/qretina.mjs sign app.html --id org.relief.maps --cert publisher.cert --key publisher.json --gif maps.gif
```

A phone accepts such a program when the certificate was issued by a root key it holds, is valid at
the phone's clock, has not been revoked, and its namespace begins the program's id.

## Revoking a certificate

```
gh workflow run certify.yml -f action=crl -f number=2 -f revoke=<serial>
```

The result is a broadcast of a revocation list. Phones keep the list with the highest number, and
relay it like any other item. Numbers must increase; each list replaces the previous one, so it must
repeat all serials still revoked.

## Rotating keys

Add the new root key to `TRUSTED_KEYS` and release the app. Sign with the new key once enough phones
have updated, and remove the old key in a later release. For app keys, put the new key first in
`APP_KEYS`: releases open items sealed with any listed key and seal with the first.

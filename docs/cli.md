# Command line

`tools/qretina.mjs` broadcasts from a computer and signs programs. It needs Node 20 or newer and
`npm install` in the repository.

```
node tools/qretina.mjs file <file> [--name N] [--mime M] [output]
node tools/qretina.mjs sign <file> --id <id> [--type html|json] [--version N] [--cert pub.cert] [--key k.json] [output]
node tools/qretina.mjs keygen [file | -]
node tools/qretina.mjs cert --pub <public key> --name <name> --ns <id prefix> [--days 365] [--serial N] [--key k.json] --out pub.cert
node tools/qretina.mjs crl --number N [--revoke serial,serial...] [--key k.json] [output]
node tools/qretina.mjs key [--passphrase P] [--label L] --out group.qretinakey
```

Output options:

| Option | Default | Meaning |
|---|---|---|
| `--gif out.gif` | | A GIF that loops forever; any image viewer can show it |
| `--intro S` | 3 | Seconds of countdown at the start of each loop (0 to 9) |
| `--link URL` | `HTTPS://QRETINA.APP/SCAN` | What the countdown codes contain |
| `--fps F` | 10 | GIF frames per second |
| `--scale S` | 8 | Pixels per QR module |
| `--block B` | 700 | Bytes per code |
| `--frames N` | 1.5 n + 8 | Codes per loop |
| `--private k` | | Seal with a group key file first |
| `--out f` | | Write the container itself instead of codes |

Without `--gif` or `--out`, codes are printed one per line.

Keys are read from `--key`, else from `QRETINA_SIGNING_KEY`, else from `./signing-key.json`.
Output is sealed with the app key in `QRETINA_APP_KEY`, as the app seals what it sends. Without it,
the command warns, and only receivers built without app keys open the output.

Examples:

```
node tools/qretina.mjs file map.pdf --gif map.gif
node tools/qretina.mjs sign examples/snake.html --id snake --gif snake.gif
```

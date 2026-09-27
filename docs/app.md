# Using the app

The app has four tabs: Receive, Broadcast, Library and Settings. It needs the camera, to film
codes, and nothing else. It makes no network connections.

## Receive

Point the camera at a broadcast. Each stream in progress shows how many of its blocks are known and
the rate. Missed codes do not matter, and neither does where in the broadcast you start: reception
completes once enough codes have been seen. Completed items go to the library.

A broadcast usually starts with a few seconds of a code with a countdown in the middle. It is the
link `https://resqr.app/SCAN`: scanned with the phone's own camera app, it opens ResQR on this
screen, or a download page if ResQR is not installed.

## Broadcast

Choose an item from the library, or a file or photo, then start. Keep the screen facing the other
camera, 20 to 40 cm away. Tap the screen to stop. Settings:

| Setting | Default | Notes |
|---|---|---|
| Bytes per code | 700 | Larger codes need a larger or closer screen. |
| Codes per second | 15 | Above the receiver's frame rate, codes are lost. |
| Codes on screen | 1 | Two need a large screen, such as a tablet or laptop. |
| Countdown | 3 s | Repeated every few loops, for phones that start late. |
| Audience | Anyone with ResQR | Or a group key, to make the item private. |

An item received from another phone is sent exactly as it arrived. Several phones can therefore
relay one item at once, and a receiver combines their codes.

## Library

Everything received or broadcast. Files can be previewed (images), shared or saved to other apps,
broadcast again, or deleted. Programs can be run. An item marked *Locked* was sealed with a group
key this phone does not hold: it can still be relayed, and opens as soon as its key is added.

## Programs

A received HTML program runs only if it is signed by ResQR or by a publisher that ResQR certified,
and after you approve it the first time. It runs isolated: no network, no access to the library or
to other apps' data. Older versions of a program than one already run are refused. Running programs
can be turned off in Settings.

## Group keys

A private broadcast can be opened only by phones that hold its group key. Add keys in Settings
beforehand, from a passphrase agreed in person or from a key file (made with
`resqr.mjs key`). A passphrase must be long, several words: a recording of a broadcast lets anyone
try guesses at leisure.

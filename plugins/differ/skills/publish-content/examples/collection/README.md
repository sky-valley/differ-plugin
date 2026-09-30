# Our patch of sky

Publish `examples/collection/content/`: a complete photo collection using
`index.html`, `app.mjs`, `rules.html` and `data/skies.html`. Guests can watch live;
participants upload only to their own opaque-identity folder, then append one
entry bound to that identity and upload path by a server trigger. The browser
submits a real image file, never a data URL. Runtime decoding/re-encoding removes
metadata and bounds formats and dimensions. The trigger also refuses path
traversal and encoded-path tricks in image references.

Player provides own-removal and moderation. A photo and gallery entry are two
contributions: removing one does not automatically remove the other. The UI
explains how to clean up an upload when the entry write fails. This example
does not claim an atomic multi-request transaction.

Before adapting it, rehearse the real file upload and HTML payload through
`scripts/runtime.mjs`. Check anonymous live updates, valid uploads, forged
owners, references to another person's folder, forbidden cross-person writes,
metadata removal and invalid formats. Then exercise the browser file input.
`examples/collection/check.mjs` performs those checks with the real browser
file input and a generated PNG containing disposable metadata. Run it with
`PAGELIKE_BINARY` set and Playwright installed in the checking workspace (or
`PLAYWRIGHT_MODULE` pointing to its absolute `index.mjs`).

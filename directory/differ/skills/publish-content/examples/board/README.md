# The shared wall

Publish `examples/board/content/`: `index.html`, `app.mjs`, `rules.html` and
`data/notes.html`. This is intentionally collaborative: every signed-in visitor
may add, rewrite or remove anyone's note. The UI says so before participation.
Anonymous visitors watch live. App code, rules and whole-document replacement
remain outside the participant grant.

Selector-scoped PUT/DELETE is correct for this brief. It would be incorrect for
a private-contribution collection. Concurrent replacements use last accepted
write; the post does not promise merge or edit-conflict preservation. If your
brief needs those, implement and verify conditional writes deliberately.

Use `scripts/runtime.mjs` with fresh sites: Alice adds, Bob rewrites and removes
that note, an anonymous subscriber sees the changes, an anonymous write fails,
whole-document replacement fails, and authored-file writes fail. Exercise the
real browser controls as well. Platform removal/moderation remains available;
replacing a note assigns the replacement to its contributor.
`examples/board/check.mjs` exercises those controls and refused writes using
the real runtime and Chromium. Run it with `PAGELIKE_BINARY` set and Playwright
installed in the checking workspace (or `PLAYWRIGHT_MODULE` pointing to its
absolute `index.mjs`).

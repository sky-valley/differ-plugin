---
name: publish-content
description: Publish, update, diff, or prepare interactive bits on Differ/app-player. Not Git pushes or generic hosting.
---
# Publish content

Making and previewing do not imply publishing intent. When the human asks to
publish, do it without requiring an account. Ask what they want to make if no
brief was given. A bit is one piece on Differ; each upload of it is a new
version, and a published version never changes. Each bit has its own origin on
differ.page and normal browser storage and capabilities, subject to the
browser's permission prompts. Private audiences and arbitrary Node servers are
unsupported. For shared durable state, use the document runtime described in
[participation](references/participation.md).
A bit is at most 256 files and 20 MiB. Files under `data/` need a root
`rules.html`, since only live participation serves them; a bundle with them and
no `rules.html` is refused with the code data_without_rules, so put static
assets in another folder, such as `assets/`. The folders `-/`, `v/`, `uploads/`,
`__differ/` and `__dfr/` are Differ's: a bundle with files there is refused.
Guests can publish and interact locally; the bit must be claimed before
signed-in visitors can contribute shared state.

## Caption and title

Every public version carries a caption: the maker's own words shown over the
bit, 1–200 characters, at most 3 line breaks. Suggest one from what the human
said, in their voice, and let them confirm or rewrite it. In Differ the maker
confirms it again when publishing a draft or claiming a guest bit. Never write
a title. Differ names each bit itself after it has looked at it; until then
the bit has no name. Keep the bit's own `<title>` and headings whatever the piece needs.

## The feed and the open bit

A bundle has a root `index.html`, the open bit, and may have a root
`preview.html`, what the feed shows of it.

- The open bit fills the phone. Its size varies by device, so it must be
  responsive; check it at 390×693 CSS px.
- `preview.html` is a 390×520 CSS px interactive preview, laid out at exactly
  that size. Without it the feed shows `index.html` laid out at 390×693 and
  scaled into that box. It may use any file in the bundle and is checked like
  any page. A tap on it should show the piece's promise and lead into the
  open bit.
- In the preview, people only tap, hold and drag sideways: vertical swipes
  belong to the feed. Use pointer events only, never touch events. No native
  range, select or text inputs, no scrolling area, and nothing that needs
  `:hover` or `:active`. No sound, permission requests, keyboard or
  participation. Keep the top-right 48×48 px free for the player's open
  button. Keep it light: it loads while people scroll.

Differ adds its SDK to every page of a bit as the global `differ`; never
include or reference anything under `/__differ/`.

- `differ.page` is `'preview'` on `preview.html`, else `'index'`;
  `differ.inPlayer` is true inside a player; `differ.hidden` is the current
  visibility.
- On the preview, `differ.open(state)` opens the bit. `state` is any JSON
  value of at most 4096 bytes; the open bit receives it. A click on an element
  with a `data-differ-open` attribute, or inside one, calls
  `differ.open(value || null)` with that attribute's value.
- On the open bit, `differ.close()` returns to the feed.
- `differ.on('open', fn)` calls `fn(state)` when the bit opens (`null` when
  the player's own control opened it); `differ.on('show', fn)` and
  `differ.on('hide', fn)` follow visibility. Each returns a function that
  unsubscribes.
- Inside a player a page starts hidden and not opened, so start motion, sound
  and timers on `show` and pause them on `hide`, and read the open state from
  `open`. A late subscriber still gets the last show or hide and the last open
  once. Outside a player the page starts shown, the open bit counts as opened
  with `null`, and `open` and `close` do nothing.

## Choose the path

- If the human supplied a player prompt with a reserved bit and upload pass,
  follow that prompt's upload instructions. Do not create a second bit; its
  original browser owns the claim, and the upload pass cannot claim it.
- With the Differ helper (the plugin's `publish_directory` tool or its
  `differ.cjs` script), follow [helper](references/helper.md). It reads files
  from disk, so prefer it whenever it is available, except as below.
- With the Differ connector (`start_bit`, `publish_bit`,
  `publish_as_me`), follow [connector](references/connector.md).
- With both, when `get_profile` names a connected creator and the helper is
  not already connected, publish through the connector. Its sign-in belongs to
  the human's account and lasts across sessions; the helper's is saved on this
  machine, so in a cloud or disposable sandbox it is lost when the session
  ends. Do not start the helper's connection there.
- With neither, say publishing needs the Differ helper, the Differ connector or
  a prompt copied from the player's Create page. Never invent an upload URL.

To install the helper or add the connector, read [setup](references/setup.md).
Each path's reference says how to connect an account.

## On every path

1. Publish as a guest unless an account is connected. Guest publishing needs no
   setup; do not block or nag for sign-in first. Never ask for credentials in
   chat. A guest upload's caption is optional and provisional: the maker
   confirms it when claiming.
2. Return the confirmed public URL. When you hold an unclaimed bit's private
   claim link, also prominently return it with the **actual expiry deadline**:
   “Live by link. Claim it before [deadline] to keep it and add it to the
   feed.” Never publish that private link inside the content or share it as
   the public bit link.
   A connected creator's upload, new bit or update, is saved as a draft
   (`"draft": true` in its receipt): nothing public changes yet. Say so
   plainly, “Saved as a draft, not published yet. Preview it, confirm its
   caption and publish: [url]”, using the receipt's `url`. The draft keeps
   the caption you suggested. Set `publish` only when the human explicitly
   asked to publish now without previewing; it then needs the caption they
   confirmed.
3. Connecting an account makes future new bits the creator's. It never claims
   earlier guest bits; those still need their own claim links. A claimed bit
   refuses its guest upload pass; update it as its connected owner. An expired
   or revoked connection stops and asks to reconnect; never silently switch to
   guest.
4. When you build a publishing request yourself, save its request identifier
   before sending and, after an uncertain response, retry the identical
   request; the helper does this for you. On a version conflict, compare the
   current bit before deliberately continuing; never silently overwrite or
   turn an update into a new bit.
5. A diff names both its parent bit and that bit's exact version, and carries
   its own caption, never the parent's. Another person's source or public link
   grants no edit rights. Diffs start from authored files and seeds, never
   accumulated visitor data or identities. Updates preserve participation:
   change its meaning only in a diff.
6. Check the actual frames: the preview at 390×520 and the open bit at
   390×693, as the helper's preview shows them; in your own Playwright checks
   `scripts/browser.mjs` opens them with `previewer` and `viewer`. The
   player's controls sit
   outside the content. Separate committed publication, HTTP verification, and
   interaction actually observed in a browser.

Follow connection errors' recovery. Restricted networking needs normal network
permission, not new credentials: see [when Differ can't be reached](#when-differ-cant-be-reached). Do not routinely patch the publisher, edit DNS,
rebuild the player or switch hosts during content work. Preserve files and
pending identity when blocked; local readiness is not publication.

## When Differ can't be reached

Differ's own refusals are JSON with a `code` and `message`. A request that
fails before Differ answers (a proxy's 403, "Tunnel connection failed", a DNS
or connection error) was stopped by this environment's network policy, which
cloud sandboxes apply to hosts they do not know. Retrying, new credentials or
another route will not help. Tell the human once, naming the host from the
upload URL: allow it in this environment's network settings, a one-time change
(in Claude Code on the web, the environment menu in the session's title bar,
then Edit, then Network access). Keep the files and the saved request, and
retry the identical request once it is allowed. Until then, a bit small enough
for the connector's call can still publish that way, since the call travels
through the host rather than the sandbox; otherwise give the human a .zip of
the content with `index.html` at its root, which they can drop on the player's
Create page, or in a bit's Update dialog to save it as a draft.

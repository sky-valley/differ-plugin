---
name: publish-content
description: Publish, revise, diff, or prepare interactive posts on Differ/app-player. Not Git pushes or generic hosting.
---
# Publish content

Creation and preview do not imply publishing intent. When the human asks to
publish, do it without requiring an account. Ask what they want to make if no
brief was given. Each post has its own origin on differ.page and normal browser
storage and capabilities, subject to the browser's permission prompts. Private
audiences and arbitrary Node servers are unsupported. For shared durable state,
use the document runtime described in [participation](references/participation.md).
A post is at most 256 files and 20 MiB. Guests can publish and interact locally;
the post must be claimed before signed-in visitors can contribute shared state.

## Choose the path

- If the human supplied a player prompt with a reserved post and upload pass,
  follow that prompt's upload instructions. Do not create a second post; its
  original browser owns the claim, and the upload pass cannot claim it.
- With the Differ helper (the plugin's `publish_directory` tool or its
  `differ.cjs` script), follow [helper](references/helper.md). It reads files
  from disk, so prefer it whenever it is available, except as below.
- With the Differ connector (`start_creation`, `publish_creation`,
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
   chat.
2. Return the confirmed public URL. When you hold an unclaimed post's private
   claim link, also prominently return it with the **actual expiry deadline**:
   “Live by link. Claim it before [deadline] to keep it and add it to the
   feed.” Never publish that private link inside the content or share it as
   the public post link.
   A connected creator's upload, new post or update, is saved as a draft
   (`"draft": true` in its receipt): nothing public changes yet. Say so
   plainly, “Saved as a draft, not published yet. Preview it and publish:
   [url]”, using the receipt's `url`. Set `publish` only when the human
   explicitly asked to publish now without previewing.
3. Connecting an account makes future new posts the creator's. It never claims
   earlier guest posts; those still need their own claim links. A claimed post
   refuses its guest upload pass; revise it as its connected owner. An expired
   or revoked connection stops and asks to reconnect; never silently switch to
   guest.
4. When you build a publishing request yourself, save its request identifier
   before sending and, after an uncertain response, retry the identical
   request; the helper does this for you. On a revision conflict, compare the
   current post before deliberately continuing; never silently overwrite or
   turn an update into a new post.
5. A diff names both its parent post and that post's exact revision. Another
   person's source or public link grants no edit rights. Diffs start from
   authored files and seeds, never accumulated visitor data or identities.
   Updates preserve participation: change its meaning only in a diff.
6. Check the actual player frame. Its controls sit outside the content in a
   bottom lip or desktop rail. Separate committed publication, HTTP
   verification, and interaction actually observed in a browser.

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
retry the identical request once it is allowed. Until then, a post small enough
for the connector's call can still publish that way, since the call travels
through the host rather than the sandbox; otherwise give the human a .zip of
the content with `index.html` at its root, which they can drop on the player's
Create page, or in a post's Update dialog to save it as a draft.

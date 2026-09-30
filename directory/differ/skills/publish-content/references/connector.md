# Publishing with the Differ connector

The connector's tools run on Differ's server and cannot read the human's files.
If you can run code with outbound HTTPS, upload anything but a small post to an
upload URL: a guest post's comes from `start_creation`, a connected creator's
from `start_upload_as_me`. Otherwise send every finished file in the call,
base64 encoded, with `index.html` at the root: that suits a small, mostly-text
post, and a whole call must stay under 4 MiB. If an upload URL cannot be
reached, publish a small post through the call instead of starting again.

## As a guest

1. `start_creation` reserves one new post and returns its `id`, a private
   `uploadToken`, its `uploadUrl`, the private `claimUrl` and `expiresAt`. Call
   it once per new post and keep all of them for revisions.
2. Publish with a fresh `requestId` UUID saved before sending, `title`,
   `expectedRevisionId` (null first, then the last confirmed `revisionId`) and
   `files` as `{path, content}` pairs, content base64 encoded:
   - over HTTPS, POST that JSON (`Content-Type: application/json`) to
     `uploadUrl` with `Authorization: Bearer <uploadToken>`, without following
     redirects;
   - or call `publish_creation` with the same fields plus `id` and
     `uploadToken`.
3. After an uncertain response, find out before resending. Over HTTPS, GET the
   upload URL with its final `/versions` replaced by `/operations/<requestId>`,
   with the same header: a receipt means it landed; `{"state":"unknown"}` means
   resend the identical request. Through the tool, retry the identical call.
4. Return the public `url`, the private `claimUrl` and `expiresAt`.

## As the connected creator

`get_profile` names the connected creator. To connect, the human signs in
through the host's own sign-in for this connector; connecting never claims
earlier guest posts. `publish_as_me` creates a post under a fresh UUID `id`, or
revises a post the creator owns given its `id` and `expectedRevisionId`, with
the files in the call. Never fall back to guest publishing if it fails for lack
of a connection.

The creator's uploads are drafts. The post keeps showing what it showed (a new
post shows nothing) until the creator previews the draft at the receipt's
`url` and publishes it. A post holds one draft: the next upload replaces it,
naming the draft's `revisionId` as `expectedRevisionId`. The receipt's
`expiresAt` is when an unpublished draft lapses. Add `"publish": true` to the
request only when the human explicitly asked to publish now without
previewing; it then goes live at once, replacing any draft.

Anything but a small post as the creator uploads over HTTPS:

1. Build and save the publishing request as a guest would: a fresh
   `requestId`, `title`, `expectedRevisionId`, any `parentPostId` and
   `parentRevisionId`, and every file's base64 `content`.
2. Call `start_upload_as_me` with the post's `id` and the same `requestId`,
   `title`, `expectedRevisionId`, `parentPostId`, `parentRevisionId` and any
   `publish`, and `files` as `{path, sha256}` pairs: each file's path and the lowercase hex
   SHA-256 of its decoded bytes, not of the base64. It returns an `uploadUrl`,
   a private `uploadToken` and `expiresAt`, at most 30 minutes away.
3. POST the saved request (`Content-Type: application/json`) to `uploadUrl`
   with `Authorization: Bearer <uploadToken>`, without following redirects.
   The pass makes only that publication and refuses any changed file or
   detail; after a change, start a new upload with a fresh `requestId`.
   Recover an uncertain response as a guest would, with the same header. If
   the pass has expired, call `start_upload_as_me` again with the identical
   arguments and the same `requestId`: a publication that already landed
   returns its receipt through the new pass, and one that did not can be
   sent unchanged.

## Reading and remixing

`get_creation` reads a post's public state and revision identifiers; it grants
no editing or claiming rights. For a remix, add `parentPostId` and
`parentRevisionId` to the publishing request.

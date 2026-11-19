# Publishing with the Differ connector

The connector's tools run on Differ's server and cannot read the human's files.
A bit travels in the call: every finished file base64 encoded, with
`index.html` at the root, and the whole call under 4 MiB. Keep a bit light:
compress images (JPEG or WebP), prefer SVG and CSS to bitmaps, and leave out
anything it does not use. No tool answers with a credential, and none needs
one: a guest needs nothing, a connected creator's sign-in is the host's.

Every refusal is JSON with a `code` and a `message` that says what to do next;
do that, and tell the human plainly when it needs them. A call too large to
run says it is too large: make the bit lighter and retry, or give the
human a .zip of the content with `index.html` at its root for Differ's Create
page, or, on a computer, install the Differ plugin, whose helper publishes
bits up to 20 MiB from disk.

The connector's sign-in belongs to the human's account, not this machine, so
in a cloud sandbox it is usually already connected: check `get_profile` before
asking them to sign in.

## As a guest

`publish_bit` publishes a temporary bit in one call, when the human asks to
publish: a fresh `requestId` UUID saved before sending, an optional `caption`
and `files` as `{path, content}` pairs, content base64 encoded. After an
uncertain response, retry the identical call: the same `requestId` answers the
same bit. Its public `url` works for 24 hours, until `expiresAt`.

1. Give the human the public `url` and say it lasts 24 hours.
2. Offer once to keep it. If they want to, they connect their Differ account
   through the host's sign-in, you ask them for its caption in chat, and you
   publish the same files with `publish_as_me`, a fresh `id` and
   `"publish": true`. That is a permanent bit in their name, with a new link.
3. A temporary bit cannot be changed. When the human asks for a change, offer
   to connect first so the bit keeps one link from then on; if they would
   rather not, publish the change with `publish_bit` and a new `requestId`, a
   new temporary bit with a new link, and say so.
4. Past the guest limits a refusal says so: connecting lifts them.

## As the connected creator

`get_profile` names the connected creator. To connect, the human signs in
through the host's own sign-in for this connector; connecting never claims
earlier guest bits. `publish_as_me` creates a bit under a fresh UUID `id`, or
uploads a new version of a bit the creator owns given its `id` and
`expectedVersionId`, with the files in the call. Never fall back to guest
publishing if it fails for lack of a connection.

The creator's uploads are drafts. The bit keeps showing what it showed (a new
bit shows nothing) until the creator previews the draft at the receipt's
`url`, confirms its caption and publishes it. A bit holds one draft: the next
upload replaces it, naming the draft's `versionId` as `expectedVersionId`.
The draft keeps the `caption` you suggest, if any. The receipt's `expiresAt`
is when an unpublished draft lapses. Add `"publish": true` to the request only
when the human explicitly asked to publish now without previewing; it then
goes live at once, replacing any draft, and needs the `caption` they confirmed.

## The creator's place

`upload_place_as_me` uploads the connected creator's place, made as
[place](references/place.md) says, with every file base64 encoded in the call and the
whole call under 4 MiB. It is saved as the place's draft, replacing any draft
before it, and the answer's `reviewUrl` is where the creator looks at it in
their profile's frame and publishes it. When they ask you to publish the
draft, call `publish_place_as_me`. Add `"publish": true` to the upload only
when the human explicitly asked to publish the place now without looking at
it first; it then replaces their live place at once.

## Reading and diffing

`get_bit` reads a bit's public state and version identifiers; it grants
no editing or claiming rights. For a diff, add `parentBitId` and
`parentVersionId` to the publishing request, with the maker's own caption.

# Changelog

## 0.7.0

Breaking: Control now speaks of bits, versions, captions and handles (gdiffer
decision 0145), and this helper speaks only that wire. Earlier helpers stop
working against it; update the plugin and reconnect.

- A post is now a **bit** and a revision a **version**. The helper calls
  `/v1/publishing/bits/{bit}/reservation|versions|operations/{request}` and
  `/v1/publishing/bits/{bit}`, and sends `expectedVersionId`, `parentBitId` and
  `parentVersionId`. Receipts carry `bitId` and `versionId`, have no
  `revisionUrl`, and the helper shows their `url`.
- The maker's words are a **caption**, not a title: `publish --caption` and the
  `publish_directory` input `caption` (1–200 characters, at most 3 line breaks,
  checked before upload). It is optional on upload; the maker confirms it in
  Differ before the bit goes public. Differ generates the bit's title, so
  `--title`, the `title` input and the HTML `<title>` default are gone. The
  saved caption carries to the next version of the same bit; `--new` and diffs
  start without one.
- Renamed: `get-post` → `get-bit`, the tool `get_post` → `get_bit` (input
  `bitId`), `bind DIR --post` → `bind DIR --bit`, `--parent-post` /
  `--parent-revision` → `--parent-bit` / `--parent-version`, tool inputs
  `newPost`, `parentPostId`, `parentRevisionId` → `newBit`, `parentBitId`,
  `parentVersionId`, and the account's `username` → `handle` (config
  `accountHandle`, `connection-status` returns `handle`).
- `connect` asks for the scope `profile bits:write`. Every connection made
  before reconnects.
- The public binding is `differ-bit.json` `{version, publisher, bitId,
  versionId, caption}`. A leftover `differ-post.json` stops every command with
  `stale_binding` and is never uploaded; an older `.differ/state.json` stops
  with `stale_state`. Remove them (keep any claim link) and `bind` or publish
  with `--new`.
- `check` warns (`missing_preview`) when a bundle has no root `preview.html`,
  the 390×520 interactive preview the feed shows, and refuses (`reserved_path`)
  files under `__differ/`, `__dfr/`, `-/`, `v/` and `uploads/` and any
  reference to Differ's SDK at `/__differ/`.
- `preview` now serves a player page at `/__differ/` that frames `preview.html`
  at 390×520 and `index.html` at 390×693, gives every page a stand-in for the
  SDK Differ injects (`differ.open`, `differ.close`, `differ.on`,
  `data-differ-open`), follows the player protocol, forwards presses on the
  preview, and logs open and close.
- Carry 0.6.4's move of the website and connection links to
  `https://app.getdiffer.com`.
- Refresh both distributions from Control's rewritten skills (bits, captions,
  `preview.html`, the SDK), synced with `npm run sync-skills` once Control
  deploys them. Until then they carry 0.6.4's verified snapshot.

## 0.6.4

- Point the plugin's website and connection links at `https://app.getdiffer.com`;
  `player.getdiffer.com` links redirect there.
- Refresh both distributions from Control's verified public skill snapshot,
  including the interactive-content skill's guidance on ease, gestures and look.

## 0.6.3

- Update zod, body-parser, hono, fast-uri and ip-address for security advisories.

## 0.6.2

- Say in the publish-content skill and its participation reference that files
  under `data/` belong to live-participation posts: Control refuses them, with
  `data_without_rules`, in a post without `rules.html` (gdiffer decision 0126).
- Refresh both distributions from Control's verified public skill snapshot.

## 0.6.0

- Call them diffs: a post made from someone's published post is a diff, in the
  skills, the helper's messages and the docs (gdiffer decision 0109).
- The helper's problem code for a half-named parent is now `invalid_diff`
  (was `invalid_remix`).
- Refresh both distributions from Control's verified public skill snapshot.

## 0.5.1

- Teach posts to restore returning participants on open with
  `pagelike.identity()`, while keeping first-time and signed-out viewers anonymous.
- Show an existing choice in the vote example before another click, and include
  a browser check that opening the example writes no contribution.
- Refresh both distributions from Control's verified public skill snapshot.

## 0.5.0

- Extract the creator plugin into its own public, MIT-licensed repository.
- Preserve the local helper and generate a remote MCP distribution for directory
  submission from the same verified skills.
- Add host metadata, the Differ icon, dependency notices, reproducible release
  ZIPs, CI, and a skill-refresh review-branch workflow.
- Document installation, updates, data handling and current submission gates.
- Point setup guidance at this repository.
- Report Control's new connected draft receipts accurately, without attempting
  to verify a public runtime that does not exist yet.

## 0.4.0

Last release in apps-to-diff. Included complete participation examples and
explicitly distinguished static validation from verified live behavior.

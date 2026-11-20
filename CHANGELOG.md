# Changelog

## Unreleased

- Every bit needs a root `preview.html`, the 390×520 interactive preview
  Differ shows of it everywhere outside the open bit. `check` and `publish`
  now fail without one (`missing_preview`) instead of warning, as Differ
  refuses such a bit. A place needs none.

## 0.9.2

- The connector's tools no longer return any credential. The connected
  upload pass tool is gone: a connected bit travels in `publish_as_me`'s call,
  under 4 MiB, and a call over that answers a readable refusal saying how to
  recover (make it lighter, hand the human a .zip for the Create page, or use
  the local helper). A guest publishes a temporary 24-hour bit in one
  `publish_bit` call with no upload pass or claim link, and is offered to keep
  it by connecting. Every refusal carries a next step.
- Skills synced from Control to match. Review cases follow the new guest flow.

## 0.9.1

- Skills synced from Control: a bit has no title, only its caption, and a
  place's `differ.bits()` items carry `caption` instead of `title`. The place
  reference also says where Differ's back and ⋯ keys sit and how a place
  colours them.

## 0.9.0

- The task receiver runs a creator's prompt from Diff's editor with their own
  agent. An edit task names its editor session and turn; the agent changes the
  session's current files in `content/`, can open the screenshots the creator
  attached in `images/`, and the receiver posts the resulting files back to the
  editor as its next edit instead of saving a draft bit. A refused edit fails
  the task without a retry. Ordinary tasks are unchanged.
- With Claude Code, a denied tool call the agent worked around no longer holds
  back a successful turn whose final answer is ready, unless the task would
  publish at once. Edit tasks tell Claude Code that only file tools are
  available and shell commands are denied.
- Release only after Control serves the matching edit task routes.

## 0.8.20

- `connection-status` (`connection_status`) checks a saved connection with
  Differ instead of reporting the file. A connection revoked or expired on
  Differ now answers `reconnect_required`, so an agent asked to reuse a valid
  connection runs `connect` instead of saying it is connected when the app
  shows no agent.

## 0.8.19

- Sync Control's skills: publish-content gains `references/place.md`, a guide
  to making a creator's place, and names the place tools of the helper and of
  the connector (`upload_place_as_me`, `publish_place_as_me`).

## 0.8.18

- `publish --publish` (`publish: true` on `publish_directory`) puts a connected
  creator's upload live at once, with the caption they confirmed, when they
  explicitly ask to skip the draft. A draft they approved publishes the same way.
- `place APP` (`publish_place`) uploads the connected creator's place as its
  draft, and `place-publish` (`publish_place_draft`) publishes that draft;
  `place APP --publish` does both at once. Places need a connected account.

## 0.8.17

- Ship the skills' instructions only. The participation examples and rehearsal
  scripts are fetched, digest-checked, from Differ's hosted examples or over
  MCP, so the directory package carries no code files.

## 0.8.16

- Receive new-bit ideas from Create without a parent source.
- Start an empty content workspace and return a private draft for review.
- Keep the same agent chat for questions and later changes.

## 0.8.15

- Save data-task results as private drafts when requested, for review before publication.
- Keep a local binding so later agent edits update the same draft.

## 0.8.14

- The local preview's stand-in SDK says `differ.inFeed`, matching Control's SDK,
  and its host page is the feed.

## 0.8.13

- Read asset references from HTML elements. A preview can build image URLs in JavaScript.
- For a failed source download or validation, the receiver log and `task-status` show the HTTP status or validation code with the task ID.

## 0.8.12

- On explicit Continue, accept a newer completed Codex desktop result from the
  same task workspace without reopening its chat. Stale, interrupted, and
  non-final answers do not authorize publication. Content and lineage checks
  still run before publication.

## 0.8.11

- Open a released Claude Code task session in the Claude desktop app with
  `task-open TASK_ID --interface desktop`.

## 0.8.10

- Run data tasks with OpenCode, and verify every agent path.

## 0.8.9

- Run local data tasks through Pi RPC.

## 0.8.8

- Run received tasks with Claude Code or Codex, and permit Claude edits inside
  the task folder without approving other actions.

## 0.8.7

- Wait for the local Codex process to exit before reporting its result or requesting user input.

## 0.8.6

- Verify Codex execution and handle permanent failures.

## 0.8.5

- Run continuous local task delivery.

## 0.8.4

- Execute and publish tasks with exact lineage.

## 0.8.3

- Add the persistent Codex protocol adapter.

## 0.8.2

- Download the exact task source.

## 0.8.1

- Save received tasks before acknowledgement.

## 0.8.0

- Add the local `tasks [--after SEQUENCE]` command to read one page of pending
  work for the connected agent. It validates metadata, preserves empty
  continuation pages, refreshes credentials when needed, and refuses guest
  mode. It does not claim, acknowledge or execute tasks.
- Task discovery returns no instructions and gives no permission to execute.

## 0.7.6

- List Differ under OpenAI's Creativity category instead of Productivity:
  the dashboard couldn't confirm Productivity for a plugin that makes
  interactive bits.

## 0.7.5

- Copy the OpenAI review and publication metadata into the directory
  package's `.codex-plugin/plugin.json`: OpenAI's portal imports the test
  case prompts only from there.

## 0.7.4

- Declare the directory server's OpenAI authentication in `mcp.json`
  (mixed: guest tools open, account tools by OAuth with dynamic client
  registration), and add commerce and release notes to the review metadata.

## 0.7.3

- Carry the five positive and three negative review cases in the directory
  package's OpenAI metadata, so the dashboard imports them from the ZIP.

## 0.7.2

- Name the privacy policy in the Claude plugin manifest (`privacyPolicyUrl`),
  as Anthropic's directory validator asks.

## 0.7.1

- Prepare the directory listings: describe what Differ does (make, publish and
  diff bits) with no assistant named, list Diff bits as a capability, and add
  the privacy policy and terms links that OpenAI's directory requires.

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

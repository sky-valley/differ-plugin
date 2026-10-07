# Differ

Create playable posts, preview them, publish and revise. Node 24+; the bundled
local bridge needs no npm install. Start as a guest without credentials. Posts
are live by link for 24 hours; a private claim link lets the human sign in,
choose a handle and keep the same post in the feed.

## Create and publish

Ask “make an interactive post”, “preview it”, then “post it”. Shell fallback:

```sh
node plugins/differ/scripts/differ.cjs doctor
node plugins/differ/scripts/differ.cjs check my-app
node plugins/differ/scripts/differ.cjs preview my-app
node plugins/differ/scripts/differ.cjs publish my-app
node plugins/differ/scripts/differ.cjs status my-app
```

App roots resolve `content/`; explicit static directories work too. Preview
uploads nothing. Restart it after edits. Publishing requires human intent.
Guest receipts include the public URL, private claim link and real deadline;
the agent must show all three. Claiming and connecting an agent are separate.

To publish future posts as yourself, ask “connect my Differ account”, or run
`connect`, approve the browser link, then `connection-status`. No repeated claim
is needed for new account posts. Earlier guest posts still need their claim
links; once claimed, they are revised as you from their original directory.
Connected uploads are saved as drafts. The receipt has `draft: true` and a `url`
to preview and publish; the helper reports that nothing has been published yet.
This helper always keeps that preview step. A remote connector can set `publish`
when the human explicitly asks to skip it, as described in the connector skill.
`disconnect` revokes this agent and explicitly returns to guest mode.
Expired/revoked credentials stop publishing rather than silently changing identity.

Keep public `differ-post.json` with source and private `.differ/state.json` locally.
Public bindings identify posts; they grant no editing rights. Private state holds
guest proof and retry requests and must stay out of Git. Uncertain publication
is reconciled with `status`, never by deleting state. Stale revisions conflict;
compare `get-post ID`, then deliberately `bind DIR --post ID` after review.
`--new` starts a separate post only when requested. A diff keeps parent post and
revision IDs. Static assets are limited to 256 files / 20 MiB per revision.

## Installation and remote connectors

Install from the public `sky-valley/differ-plugin` marketplace in Claude Code
or Codex. See the [installation guide](https://github.com/sky-valley/differ-plugin#install),
or load a checkout with `claude --plugin-dir /absolute/path/to/plugins/differ`.
Start a new task after updates. Installation does not require account connection.
The stdio bridge needs local Node and file access.

Control publishes at `https://publish.getdiffer.com`; `DIFFER_PUBLISH_URL` points
the helper at another Control, such as a local one on loopback HTTP.

Remote MCP: `https://publish.getdiffer.com/mcp`. Guest tools work without an account;
protected account tools discover Differ OAuth, use browser consent and PKCE,
and receive scoped credentials. Host-specific connector setup can still insist
on upfront login; the copied player prompt remains a no-install guest fallback.
Mobile/cloud hosts must support creating a bundle and transferring it; package
installation alone does not grant those capabilities. See [setup](skills/publish-content/references/setup.md).

Shared-token publishing has been removed. Unsupported configurations fail closed;
connect an account or explicitly disconnect for guest mode. Never put credentials
in chat or content.

## Skills

`skills/` is a snapshot of the skills Control serves over MCP (Skills extension,
SEP-2640). Edit them in gdiffer's `services/control/internal/content/skills`,
deploy Control, then run `npm run sync-skills`: it fetches every file, verifies
it against Control's advertised digest and size, and replaces `skills/` and
`skills.lock.json`. `npm run check-skills` confirms `skills/` matches the lock
and the lock matches Control. A hand edit to `skills/` fails the tests, as does
a helper tool or command the skills name that the helper lacks.
`DIFFER_PUBLISH_URL` points either script at another Control. Maintenance
commands run from the standalone repository root; users need no npm install.

## Maintenance

`plugin.json` and `mcp.json` are portable. Codex/Claude compatibility manifests,
skills and the bundled bridge stay self-contained when relocated.
From the repository root, `npm ci && npm run build` rebuilds the bridge from
`helper/`; consumers run
no install scripts. Keep static validation and the complete manifest digest
aligned with Control.

```sh
npm test
claude plugin validate ./plugins/differ --strict
```

Optional `image-candidate FILE --output NEW.webp` and `inspect-video FILE` use
installed cwebp/ffprobe. They neither overwrite sources nor establish visual QA.
See [CLIENT.md](CLIENT.md) for wire and identity details. `test/publishing.test.mjs`
drives the bundled CLI against an in-process stand-in for Control's publishing
routes; repeat the guest, claim and connected journeys against a real local
Control after protocol changes.

The local helper includes third-party code; see `THIRD_PARTY_NOTICES.txt`.
For service destinations, credential storage and optional executable tools, see
[data handling](https://github.com/sky-valley/differ-plugin/blob/main/docs/data-handling.md).

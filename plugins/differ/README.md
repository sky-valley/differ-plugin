# Differ

Make playable bits, preview them and publish them to Differ. Node 24+; the
bundled local bridge needs no npm install. Start as a guest without credentials.
Guest bits are live by link for 24 hours; a private claim link lets the human
sign in, choose a handle, confirm the caption and keep the same bit.

## Create and publish

Ask “make an interactive bit”, “preview it”, then “publish it”. Shell fallback:

```sh
node plugins/differ/scripts/differ.cjs doctor
node plugins/differ/scripts/differ.cjs check my-app
node plugins/differ/scripts/differ.cjs preview my-app
node plugins/differ/scripts/differ.cjs publish my-app --caption "The maker's own words"
node plugins/differ/scripts/differ.cjs status my-app
```

App roots resolve `content/`; explicit static directories work too. `index.html`
is the bit as it opens, checked at 390×693 and responsive on every phone;
an optional `preview.html` is the 390×520 interactive preview the feed shows,
and `check` warns without one. Differ adds its SDK to every page; bundles never
include or reference `__differ/`, and `__dfr/`, `-/`, `v/` and `uploads/` are
reserved too. `preview` serves a player page that frames `preview.html` at
390×520 and `index.html` at 390×693 with a stand-in for the SDK, forwarding
presses on the preview and logging `differ.open` and `differ.close`. It
uploads nothing. Restart it after edits. Publishing requires human intent.

`--caption` (tool input `caption`) is the maker's own words over the bit, 1–200
characters with at most 3 line breaks: the agent suggests it and the maker
confirms it, again in Differ before the bit goes public. Differ generates the
bit's title. Guest receipts include the `url`, private claim link and real
deadline; the agent must show all three. Claiming and connecting an agent are
separate.

To publish future bits as yourself, ask “connect my Differ account”, or run
`connect`, approve the browser link, then `connection-status`. No repeated claim
is needed for new account bits. Earlier guest bits still need their claim
links; once claimed, new versions go up as you from their original directory.
Connected uploads are saved as drafts. The receipt has `draft: true` and a `url`
where the maker previews, confirms the caption and publishes; the helper reports
that nothing has been published yet.
This helper always keeps that preview step. A remote connector can set `publish`
when the human explicitly asks to skip it, as described in the connector skill.
`disconnect` revokes this agent and explicitly returns to guest mode.
Expired/revoked credentials stop publishing rather than silently changing identity.

Keep public `differ-bit.json` with source and private `.differ/state.json` locally.
Public bindings identify a bit, its version and that version's caption; they
grant no editing rights. Private state holds guest proof and retry requests and
must stay out of Git. Uncertain publication is reconciled with `status`, never
by deleting state. A stale version conflicts; compare `get-bit ID`, then
deliberately `bind DIR --bit ID` after review. `--new` starts a separate bit
only when requested. A diff names its parent with `--parent-bit` and
`--parent-version` and starts without a caption. Static assets are limited to
256 files / 20 MiB per version. A `differ-post.json` or `.differ` journal from
a helper before 0.7.0 stops every command and is never uploaded.

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

Unsupported configurations fail closed; connect an account or explicitly
disconnect for guest mode. Never put credentials in chat or content.

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

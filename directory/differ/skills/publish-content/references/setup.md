# Setup

## The Differ helper

The helper ships in the local `differ` plugin from the public repository
https://github.com/sky-valley/differ-plugin. In Claude Code, add the marketplace
with `/plugin marketplace add sky-valley/differ-plugin`, then install
`differ@differ`. In Codex, run `codex plugin marketplace add
sky-valley/differ-plugin`, then install Differ from the host's plugin browser.
Claude Code can also load a checkout with
`--plugin-dir /absolute/path/to/differ-plugin/plugins/differ`.
Start a fresh task after updates.
Node 24+ is the only local dependency; the bridge is bundled, and missing MCP
tools do not block running its script directly. `doctor` is ready as a guest
without credentials. The default publisher is Control at
https://publish.getdiffer.com.

`DIFFER_PUBLISH_URL` selects another Control over HTTPS, or loopback HTTP for a
local one: its `GDIFFER_PUBLISHING_ORIGIN`, for example `http://127.0.0.1:8080`.
`DIFFER_CONFIG` selects an isolated private config.

## The Differ connector

Add `https://publish.getdiffer.com/mcp` as a remote MCP connector. Its guest
tools need no account; its account tools use the host's browser sign-in (OAuth
with PKCE). Host behavior varies: if a host insists on signing in before
exposing any tools, use a prompt copied from the player's Create page instead.

The repository's directory distribution bundles these same skills with the
remote connector, without the local helper. Use the connector reference for
that distribution. Local and directory packages both identify as `differ`;
install one per host. A GitHub release does not imply directory approval.

The helper needs Node and file access, so installing the plugin does not make
it runnable in a mobile or cloud sandbox, and a connection it makes there is
lost with the sandbox. There, use the connector: its sign-in lasts across
sessions. It needs either the files in its calls or outbound HTTPS to upload
them. A host whose code sandbox reaches only allowed domains needs
`publish.getdiffer.com` allowed, once per environment (in Claude Code on the
web: the environment menu, then Edit, then Network access); without it, only a
post small enough to send in the calls can publish.

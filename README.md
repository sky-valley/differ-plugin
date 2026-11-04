# Differ plugin

Make, preview and publish small interactive bits for Differ with Claude Code or
Codex. Start as a guest, then claim the bit or connect your Differ account.

This is the public home of Differ's creator plugin, extracted from apps-to-diff.
The plugin is MIT licensed. The hosted publishing service remains separate.
**GitHub releases are available for manual installation. Neither official
directory listing has been submitted or approved yet.**

## Install

The marketplace installs the local helper distribution. It requires Node 24+
and a host with access to local files. No npm install is needed by users.

### Claude Code

```text
/plugin marketplace add sky-valley/differ-plugin
/plugin install differ@differ
```

Restart the session after installation. To try a checkout without installing:

```sh
git clone https://github.com/sky-valley/differ-plugin.git
claude --plugin-dir ./differ-plugin/plugins/differ
```

### Codex

```sh
codex plugin marketplace add sky-valley/differ-plugin
codex plugin add differ@differ
```

Alternatively, after adding the marketplace, open the Plugins directory in the
desktop app and install **Differ** from the **Differ** marketplace. Start a new
chat. Installation does not connect a Differ account.

### ZIP or remote connector

[Releases](https://github.com/sky-valley/differ-plugin/releases) include two ZIPs:

| Package | Use |
| --- | --- |
| `differ-local-VERSION.zip` | Local Node helper, CLI and MCP tools, plus skills and examples. |
| `differ-directory-VERSION.zip` | The same skills and examples with remote MCP; no local helper. Upload to a supported plugin host or use for directory review. |

Both identify as `differ`: choose one per host, rather than installing both.
The directory package is also committed at `directory/differ` for Anthropic's
GitHub submission process. A host may require account connection before showing
remote tools. File creation, outbound HTTPS, and browser capabilities vary by host.

You can independently connect `https://publish.getdiffer.com/mcp`. That installs
the connector only, not this plugin's bundled skill files.

## Pending tasks (local helper)

After connecting an account, `node plugins/differ/scripts/differ.cjs tasks`
reads one page of pending task offers from Control. It returns
`{tasks:[{id,version}],next}`. When `next` is nonzero, call `tasks --after NEXT`,
even if the page is empty. When `next` is zero, that polling cycle is complete;
start a later cycle without `--after`. Do not save the cursor as a durable
checkpoint: new prompts and expired claims can make earlier tasks available.

This command reads metadata only. It does not claim tasks, download prompts,
start an agent, or publish. There is no background polling process yet. Control
must have task delivery enabled. The remote directory package has no local CLI.

## Use

Ask for an interactive bit, preview it, and ask to publish when ready. Or run:

```sh
node plugins/differ/scripts/differ.cjs doctor
node plugins/differ/scripts/differ.cjs check /absolute/path/to/my-bit
node plugins/differ/scripts/differ.cjs preview /absolute/path/to/my-bit
node plugins/differ/scripts/differ.cjs publish /absolute/path/to/my-bit --caption "Stack it high, then shake."
```

A bit is `index.html`, the bit as it opens on a phone, and optionally
`preview.html`, the 390×520 interactive preview the feed shows. The caption is
the maker's own words over the bit; Differ names the bit itself. Guest bits
expire after 24 hours unless claimed. Keep the private claim link.
Connecting your account authorizes future publications; it does not claim old
guest bits. Connected helper uploads are saved as drafts: follow the returned
link to preview, confirm the caption and publish. Shared participation requires
a claimed bit and tested rules. The checker validates static files; it does not
prove live behavior.

See [local helper instructions](plugins/differ/README.md),
[participation examples](plugins/differ/skills/publish-content/references/participation.md),
[data handling](docs/data-handling.md), and [support](https://github.com/sky-valley/differ-plugin/issues).

## Update

Claude Code:

```sh
claude plugin marketplace update differ
claude plugin update differ@differ
```

Codex:

```sh
codex plugin marketplace upgrade differ
```

Refresh the installed plugin in your host and start a fresh chat. Every release
bumps the package version. An approved directory listing has a separate review
and publication lifecycle; pushing GitHub code does not approve a directory update.

## Develop and release

Node 24+ and Python 3 are needed for maintenance. From this repository's root:

```sh
npm ci
npm run check
npm run release
```

`helper/` contains readable helper source. `plugins/differ/` is the installable
local package. `npm run build` generates its bundle, dependency notices,
manifests, and the complete `directory/differ/` remote package. CI rebuilds both
and rejects drift. Release ZIPs contain only the plugin folders, never this
repository's history, development dependencies, tests, or unrelated content.

The skills remain authored in Control and are fetched from its public MCP
endpoint with digest and size verification. See [contributing](CONTRIBUTING.md),
[release maintenance](docs/releases.md), and the dated
[directory submission guide](docs/submission.md).

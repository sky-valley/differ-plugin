# Differ

Make bits: small interactive pieces people open, join in on and diff.
This plugin includes Differ's creation and publishing skills, complete shared
participation examples, and the remote Differ connector. It talks to the hosted
service at `https://publish.getdiffer.com/mcp`.

Ask your assistant to make a bit, preview it if the host supports that,
and publish when you are ready. To diff someone else's bit, ask for a diff of
its link: the new bit names the one it came from. Creation alone never authorizes publication.
Guest publication needs no Differ account. Guest bits expire after 24 hours
unless claimed; keep the private claim link the agent returns. Connect a
Differ account through the host's OAuth sign-in to publish future bits as you.
Connecting does not claim earlier guest bits. Connected uploads are drafts by
default: open the returned link to preview and publish. Immediate publication
requires an explicit request to skip that preview.

## Capabilities and limits

The connector receives explicitly supplied files; it cannot read your computer.
The host needs file creation and either small file payloads in tool calls or
outbound HTTPS to the returned upload URL. Tools accept calls below 4 MiB;
uploads allow up to 256 files and 20 MiB per revision. This package contains no
local MCP server or local publishing helper. For local file validation, preview,
and upload tools, install the local distribution from the
[source repository](https://github.com/sky-valley/differ-plugin).

Bits are public by link. Private audiences and arbitrary Node servers are
unsupported. Shared state uses the separately hosted document runtime. The
examples include authorization rules and checks; a successful publication
receipt does not verify authorization, live updates, or browser behavior.

## Data and execution

Uploading sends the selected authored files and title to Differ. Guest bits
are public by link; connected drafts become public when published.
Account tools use credentials managed through the host's OAuth
connection. Guest tools return private upload and claim capabilities: keep them
out of public content, repositories, and issue reports. Reading a public bit
does not grant permission to edit it.

Skills include optional JavaScript checks and browser/runtime rehearsal scripts.
They run only when the agent invokes them in a suitable execution environment;
installation runs no scripts. Local runtime rehearsal requires Node, a browser
test library, and pagelike. Review the example README before running its checks.

The MIT license covers this plugin's code and documentation. Differ's hosted
service is operated separately under its
[privacy policy](https://www.getdiffer.com/privacy) and
[terms](https://www.getdiffer.com/terms). See the repository's
[data-handling notes](https://github.com/sky-valley/differ-plugin/blob/main/docs/data-handling.md)
and [support](https://github.com/sky-valley/differ-plugin/issues).

## Updates

The maintainer publishes new versions from
[sky-valley/differ-plugin](https://github.com/sky-valley/differ-plugin).
Directory approval and availability are tracked separately from GitHub releases.
Installing a ZIP or this repository does not imply directory approval.

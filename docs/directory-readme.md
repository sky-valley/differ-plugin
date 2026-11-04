# Differ

Make a small interactive bit: something people can play, respond to, and share.
This plugin includes Differ's making and publishing skills, complete shared
participation examples, and the remote Differ connector. It talks to the hosted
service at `https://publish.getdiffer.com/mcp`.

Ask Claude or ChatGPT to make a bit, preview it if the host supports that,
and publish when you are ready. Making a bit never authorizes publication.
A bit is its `index.html`, which opens full screen on a phone, and optionally a
390×520 interactive `preview.html` the feed shows; its caption is the maker's
own words, which the maker confirms before the bit goes public.
Guest publication needs no Differ account. Guest bits expire after 24 hours
unless claimed; keep the private claim link the agent returns. Connect a
Differ account through the host's OAuth sign-in to publish future bits as you.
Connecting does not claim earlier guest bits. Connected uploads are drafts by
default: open the returned link to preview, confirm the caption and publish.
Immediate publication requires an explicit request to skip that preview.

## Capabilities and limits

The connector receives explicitly supplied files; it cannot read your computer.
The host needs file creation and either small file payloads in tool calls or
outbound HTTPS to the returned upload URL. Tools accept calls below 4 MiB;
uploads allow up to 256 files and 20 MiB per version. This package contains no
local MCP server or local publishing helper. For local file validation, preview,
and upload tools, install the local distribution from the
[source repository](https://github.com/sky-valley/differ-plugin).

Bits are public by link. Private audiences and arbitrary Node servers are
unsupported. Shared state uses the separately hosted document runtime. The
examples include authorization rules and checks; a successful publication
receipt does not verify authorization, live updates, or browser behavior.

## Data and execution

Uploading sends the selected authored files and any caption to Differ. Guest
bits are public by link; connected drafts become public when published.
Account tools use credentials managed through the host's OAuth
connection. Guest tools return private upload and claim capabilities: keep them
out of public content, repositories, and issue reports. Reading a public bit
does not grant permission to edit it.

Skills include optional JavaScript checks and browser/runtime rehearsal scripts.
They run only when the agent invokes them in a suitable execution environment;
installation runs no scripts. Local runtime rehearsal requires Node, a browser
test library, and pagelike. Review the example README before running its checks.

The MIT license covers this plugin's code and documentation. Differ's hosted
service is operated separately. See the repository's
[data-handling notes](https://github.com/sky-valley/differ-plugin/blob/main/docs/data-handling.md)
and [support](https://github.com/sky-valley/differ-plugin/issues).

## Updates

The maintainer publishes new versions from
[sky-valley/differ-plugin](https://github.com/sky-valley/differ-plugin).
Directory approval and availability are tracked separately from GitHub releases.
Installing a ZIP or this repository does not imply directory approval.

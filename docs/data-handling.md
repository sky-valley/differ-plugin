# Plugin data handling

These are implementation notes for this open-source plugin, not a substitute
for the hosted Differ service's privacy policy or terms.

The local helper reads the app/content directory explicitly selected by the
agent. Static checking and local preview do not upload files. Publication sends
the selected files and title to `https://publish.getdiffer.com` by default and
creates a public post served through Differ. The remote connector receives files
passed in a tool call or uploaded to an authorized URL; it has no direct access
to the user's filesystem.

The local helper stores account credentials in
`~/.config/differ/publisher.json` with restrictive permissions. Each publishing
project keeps private guest proofs, upload capabilities, claim links, saved
requests and receipts in `.differ/state.json`. Do not commit or upload this
directory. `differ-post.json` is a public post/revision binding, not a credential.
`DIFFER_CONFIG` can choose an isolated private config; `DIFFER_PUBLISH_URL` can
choose another HTTPS publisher or a loopback HTTP development instance.

Remote account access uses the host's OAuth connection to Differ. Local account
access uses browser-approved device authorization. A connection can be revoked;
the helper stops on expired or revoked credentials rather than publishing as a
different identity. Guest publishing does not require an account. Unclaimed
guest posts expire after 24 hours. This is a serving deadline, not a promise
about permanent erasure from all service storage or backups.

Installation adds skills and configures the selected MCP transport. The local
transport starts the bundled Node process when the host connects it. There are
no install hooks, automatic post publications, or added analytics in this
plugin. Optional media commands invoke local `cwebp` or `ffprobe`. Rehearsal
scripts explicitly start a disposable local pagelike instance and optionally a
browser; they must not be pointed at production posts.

Maintenance commands fetch skills from Control; dependency installation uses
npm's registry. GitHub distribution and the user's AI host have their own data
handling policies. Do not send secrets to support or include reviewer
credentials in public submission metadata.

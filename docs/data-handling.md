# Plugin data handling

These are implementation notes for this open-source plugin, not a substitute
for the hosted Differ service's privacy policy or terms.

The local helper reads the app/content directory explicitly selected by the
agent. Static checking and local preview do not upload files. Publication sends
the selected files and any caption to `https://publish.getdiffer.com` by default
and creates a public bit served through Differ. The remote connector receives files
passed in a tool call or uploaded to an authorized URL; it has no direct access
to the user's filesystem.

The local helper stores account credentials in
`~/.config/differ/publisher.json` with restrictive permissions. Each publishing
project keeps private guest proofs, upload capabilities, claim links, saved
requests and receipts in `.differ/state.json`. Do not commit or upload this
directory. `differ-bit.json` is a public bit/version binding with that version's caption,
not a credential.
`DIFFER_CONFIG` can choose an isolated private config; `DIFFER_PUBLISH_URL` can
choose another HTTPS publisher or a loopback HTTP development instance.

Remote account access uses the host's OAuth connection to Differ. Local account
access uses browser-approved device authorization. A connection can be revoked;
the helper stops on expired or revoked credentials rather than publishing as a
different identity. Guest publishing does not require an account. Unclaimed
guest bits expire after 24 hours. This is a serving deadline, not a promise
about permanent erasure from all service storage or backups.

Installation adds skills and configures the selected MCP transport. The local
transport starts the bundled Node process when the host connects it. There are
no install hooks, automatic publications, or added analytics in this
plugin. Optional media commands invoke local `cwebp` or `ffprobe`. Rehearsal
scripts explicitly start a disposable local pagelike instance and optionally a
browser; they must not be pointed at production bits. Local preview serves the selected
files on loopback only, with a stand-in SDK and feed page written by the helper;
it loads nothing from the network itself.

The local `tasks` command reads pending task IDs, versions and a pagination
cursor through the connected account. It uses the saved access token and the
existing token-refresh flow. It neither downloads prompts nor saves a local task
journal, and it does not claim, acknowledge or execute work. Task API errors use
fixed messages rather than server-provided text.

Maintenance commands fetch skills from Control; dependency installation uses
npm's registry. GitHub distribution and the user's AI host have their own data
handling policies. Do not send secrets to support or include reviewer
credentials in public submission metadata.

Task receipt uses a private `tasks/<task-id>/task.json` beside the publisher
configuration. It contains the prompt, exact parent IDs and delivery claim.
Files are mode 600 and directories mode 700. The helper flushes the journal to
disk before acknowledging receipt. It never prints the prompt. Keep this folder
for retry and recovery; deleting it after receipt loses the only local copy of
work whose prompt Control has removed. A per-task process lock prevents two
local helper invocations from receiving the same task concurrently.

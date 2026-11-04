# Local Codex task execution

The local helper uses `codex app-server --listen stdio://` with the installed
Codex login. It creates a persistent workspace-write session with on-request
approval. It sends no `--yolo` flag and does not select a different model.
A shell alias cannot change the invocation because no shell runs it.

The receiver must save the session ID before sending the first turn. If the
process stops after that point, the caller must retain the session and require
an explicit continuation, rather than start another session or repeat work.
Server permission and input requests stop unattended work. The user continues
in their own Codex interface. No private transcript is sent to Control.

`codex://threads/<id>` was verified on macOS with Codex 0.153.2. It is an installed
app integration, not a portable web API. Keep `codex resume <id>` as a fallback.
The helper never reports that a chat is visible merely because an OS accepted
an open request.

Protocol: https://learn.chatgpt.com/docs/app-server
Tests use real child processes with a protocol fixture. They do not prove a
model call or the installed desktop app's visible behavior.

## Execute a received task

`task-run ID` prepares its source and starts Codex. `task-status ID` shows the
local state, desktop link and terminal resume command. The task prompt is a
versioned JSON envelope: `{schema:1,instructions,caption,publish:true}`. Diff
constructs this only after the creator supplies a caption and selects the
button that explicitly authorizes publication. The text stays in temporary
Control storage and the private local task journal, never the event log.

A successful agent turn must return `{"status":"ready"}`. The helper then
validates the content, freezes the upload bytes and request UUID, and publishes
with `publish:true` and the received parent IDs. Upload retries use exactly
those saved bytes and IDs. It reports completion only after Control verifies
the live result's ownership and lineage. It does not copy the source caption.
Static checks and an agent's ready result are not independent quality proof.

Interrupted work and user-input requests show `needs_input`. Open the saved
session, give the agent the missing information, then select Continue in Diff.
The receiver consumes that continuation once and resumes the same session.
It does not repeat an uncertain turn automatically. Control needs the session
and continuation API changes from the linked gdiffer stack for this command.

## Start and stop delivery

After installing the **local** plugin and connecting its account, run:

```sh
node /absolute/path/to/plugins/differ/scripts/differ.cjs doctor
node /absolute/path/to/plugins/differ/scripts/differ.cjs tasks-watch
```

Keep that process running, or supervise it with your user service manager. It
polls every five seconds. Delivery continues while an agent works. One task
executes at a time; the receiver lock prevents a second watcher for this config.
Ctrl+C stops the receiver and interrupts its active turn. The task keeps its
workspace and session. Restarting does not replay an uncertain turn.

On macOS, `tasks-install` explicitly installs and starts a LaunchAgent for the
current connected account. It copies the bundled helper into a private stable
folder beside the task journals and uses the current Node binary and PATH.
It starts again at login. Run it again after updating the plugin or Node.
`tasks-uninstall` stops it and removes the LaunchAgent, retaining task files.
The release does not install or start this service automatically.

Status logs contain fixed error codes, IDs and local status only. Prompts,
transcripts and source bytes remain in private task files. The directory-only
plugin cannot run this receiver. Remote browser users must have a receiver
running on the machine whose Codex interface they intend to open.

## Verification and limits

Run `npm run check` for the hermetic suite. The explicit opt-in command
`DIFFER_LIVE_CODEX=1 node scripts/check-live-task.mjs` uses the installed Codex
login and can spend model credits. It receives a fixture task, changes one
source value, verifies the actual saved file, and checks the publication body
and lineage against a local HTTP fixture. It never publishes to Differ.
It retains the temporary workspace so the persistent Codex session can be
inspected. On 2026-11-04 this check passed with Codex CLI 0.153.2.

Permanent source removal reports `source_unavailable`. A failed model turn
reports `execution_failed`. A definite publication rejection reports
`publication_failed`. Network outages and uncertain uploads retain their
request identity for retry. Invalid local content stops for user input before
upload. The macOS installer is covered by generated-plist tests; installing an
actual login service is a separate user action, not part of package validation.

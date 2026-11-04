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

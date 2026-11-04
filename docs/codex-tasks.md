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
